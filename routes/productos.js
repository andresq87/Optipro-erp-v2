const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const db = require('../db/db');
const { verificarToken, requierePermiso } = require('../middleware/auth');
const { registrarAuditoria } = require('../db/auditoria');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const router = express.Router();
router.use(verificarToken);

// Busca una categoría por nombre (sin importar mayúsculas/espacios) o la crea si no existe.
// Así el campo de categoría en el front puede ser editable: si escribes un nombre nuevo,
// se crea automáticamente.
function obtenerOCrearCategoriaId(nombreCategoria) {
  if (!nombreCategoria) return null;
  const nombre = String(nombreCategoria).trim();
  if (!nombre) return null;
  const existente = db.prepare('SELECT id FROM categorias_producto WHERE lower(nombre) = lower(?)').get(nombre);
  if (existente) return existente.id;
  const info = db.prepare('INSERT INTO categorias_producto (nombre) VALUES (?)').run(nombre);
  return info.lastInsertRowid;
}

// GET /api/productos?categoria=monturas
router.get('/', (req, res) => {
  const { categoria } = req.query;
  let rows;
  if (categoria) {
    rows = db.prepare(
      `SELECT p.*, c.nombre AS categoria FROM productos p
       JOIN categorias_producto c ON c.id = p.categoria_id
       WHERE c.nombre = ? AND p.activo = 1`
    ).all(categoria);
  } else {
    rows = db.prepare(
      `SELECT p.*, c.nombre AS categoria FROM productos p
       LEFT JOIN categorias_producto c ON c.id = p.categoria_id
       WHERE p.activo = 1`
    ).all();
  }
  res.json(rows);
});

// GET /api/productos/categorias — para llenar selects en el front
router.get('/categorias', (req, res) => {
  const rows = db.prepare('SELECT * FROM categorias_producto ORDER BY nombre').all();
  res.json(rows);
});

// GET /api/productos/bajo-stock — alerta de reabastecimiento
router.get('/bajo-stock', (req, res) => {
  const rows = db.prepare('SELECT * FROM productos WHERE stock <= stock_minimo AND activo = 1').all();
  res.json(rows);
});

// POST /api/productos (solo roles autorizados)
router.post('/', requierePermiso('inventario_editar'), (req, res) => {
  const { nombre, precio } = req.body;
  const categoria_id = req.body.categoria_id ?? obtenerOCrearCategoriaId(req.body.categoria);
  const sku = req.body.sku ?? null;
  const costo = req.body.costo || 0;
  const stock = req.body.stock || 0;
  const stock_minimo = req.body.stock_minimo || 5;
  if (!nombre || precio == null) return res.status(400).json({ error: 'Nombre y precio son obligatorios' });
  const info = db.prepare(
    `INSERT INTO productos (categoria_id, nombre, sku, precio, costo, stock, stock_minimo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(categoria_id, nombre, sku, precio, costo, stock, stock_minimo);
  registrarAuditoria('inventario', info.lastInsertRowid, req.usuario, 'creado', `Producto "${nombre}" creado (stock inicial: ${stock})`);
  res.status(201).json({ id: info.lastInsertRowid, ...req.body });
});

// PUT /api/productos/:id — editar datos del producto (solo roles autorizados)
router.put('/:id', requierePermiso('inventario_editar'), (req, res) => {
  const nombre = req.body.nombre ?? null;
  const precio = req.body.precio ?? null;
  const costo = req.body.costo ?? null;
  const stock_minimo = req.body.stock_minimo ?? null;
  const categoria_id = req.body.categoria_id ?? (req.body.categoria ? obtenerOCrearCategoriaId(req.body.categoria) : null);
  const info = db.prepare(
    `UPDATE productos SET
       nombre = COALESCE(?, nombre),
       precio = COALESCE(?, precio),
       costo = COALESCE(?, costo),
       stock_minimo = COALESCE(?, stock_minimo),
       categoria_id = COALESCE(?, categoria_id)
     WHERE id = ?`
  ).run(nombre, precio, costo, stock_minimo, categoria_id, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
  const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  registrarAuditoria('inventario', req.params.id, req.usuario, 'editado', `Producto "${producto.nombre}" actualizado`);
  res.json(producto);
});

// DELETE /api/productos — baja lógica múltiple. body: { ids: [1,2,3] }
router.delete('/', requierePermiso('inventario_eliminar'), (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Debes indicar los ids a eliminar' });
  const nombres = db.prepare(`SELECT nombre FROM productos WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const info = db.prepare(`UPDATE productos SET activo = 0 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  registrarAuditoria('inventario', null, req.usuario, 'eliminado_masivo', `${info.changes} productos eliminados: ${nombres.map(n => n.nombre).join(', ')}`);
  res.json({ eliminados: info.changes });
});

// DELETE /api/productos/:id — baja lógica (solo roles autorizados)
router.delete('/:id', requierePermiso('inventario_eliminar'), (req, res) => {
  const producto = db.prepare('SELECT nombre FROM productos WHERE id = ?').get(req.params.id);
  const info = db.prepare('UPDATE productos SET activo = 0 WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
  registrarAuditoria('inventario', req.params.id, req.usuario, 'eliminado', `Producto "${producto ? producto.nombre : req.params.id}" eliminado`);
  res.json({ eliminado: true });
});

// PUT /api/productos/:id/stock — ajustar stock (entrada/salida manual, solo roles autorizados)
router.put('/:id/stock', requierePermiso('inventario_editar'), (req, res) => {
  const { delta } = req.body; // ej: -1 al vender, +10 al recibir mercancía
  if (typeof delta !== 'number') return res.status(400).json({ error: 'delta debe ser un número' });
  const info = db.prepare('UPDATE productos SET stock = stock + ? WHERE id = ?').run(delta, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
  const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  registrarAuditoria('inventario', req.params.id, req.usuario, 'ajuste_stock', `Stock de "${producto.nombre}" ajustado en ${delta > 0 ? '+' : ''}${delta} (nuevo stock: ${producto.stock})`);
  res.json(producto);
});

// GET /api/productos/plantilla — descarga un Excel con los mismos títulos de columna
// que usa la plataforma, más los productos actuales como referencia/ejemplo.
router.get('/plantilla', async (req, res) => {
  const productos = db.prepare(
    `SELECT p.nombre, c.nombre AS categoria, p.sku, p.precio, p.costo, p.stock, p.stock_minimo
     FROM productos p LEFT JOIN categorias_producto c ON c.id = p.categoria_id
     WHERE p.activo = 1 ORDER BY p.nombre`
  ).all();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Productos');
  ws.columns = [
    { header: 'nombre', key: 'nombre', width: 30 },
    { header: 'categoria', key: 'categoria', width: 18 },
    { header: 'sku', key: 'sku', width: 14 },
    { header: 'precio', key: 'precio', width: 12 },
    { header: 'costo', key: 'costo', width: 12 },
    { header: 'stock', key: 'stock', width: 10 },
    { header: 'stock_minimo', key: 'stock_minimo', width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  productos.forEach(p => ws.addRow(p));
  if (!productos.length) {
    ws.addRow({ nombre: 'Ej: Ray-Ban RB3016', categoria: 'monturas', sku: '', precio: 420000, costo: 250000, stock: 10, stock_minimo: 5 });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-productos.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// POST /api/productos/importar — carga masiva desde un archivo .xlsx o .csv subido.
// Mismas columnas que la plantilla: nombre, categoria, sku, precio, costo, stock, stock_minimo.
// nombre y precio son obligatorios por fila; si el producto (por nombre) ya existe, se actualiza;
// si no, se crea. Las categorías nuevas se crean automáticamente.
router.post('/importar', requierePermiso('inventario_editar'), upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Sube un archivo .xlsx o .csv' });

  let filas = [];
  try {
    if (req.file.originalname.toLowerCase().endsWith('.csv')) {
      const texto = req.file.buffer.toString('utf8');
      const lineas = texto.split(/\r?\n/).filter(l => l.trim());
      const encabezados = lineas[0].split(',').map(h => h.trim().toLowerCase());
      filas = lineas.slice(1).map(linea => {
        const valores = linea.split(',');
        const fila = {};
        encabezados.forEach((h, i) => { fila[h] = (valores[i] || '').trim(); });
        return fila;
      });
    } else {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);
      const ws = wb.worksheets[0];
      const encabezados = ws.getRow(1).values.map(v => (v || '').toString().trim().toLowerCase());
      ws.eachRow((row, num) => {
        if (num === 1) return;
        const fila = {};
        row.values.forEach((v, i) => { if (encabezados[i]) fila[encabezados[i]] = v; });
        filas.push(fila);
      });
    }
  } catch (e) {
    return res.status(400).json({ error: 'No se pudo leer el archivo. Verifica que sea un .xlsx o .csv válido.' });
  }

  let creados = 0, actualizados = 0, errores = [];
  filas.forEach((fila, idx) => {
    const nombre = (fila.nombre || '').toString().trim();
    const precio = Number(fila.precio);
    if (!nombre || !precio) { errores.push(`Fila ${idx + 2}: falta nombre o precio`); return; }
    const categoria_id = obtenerOCrearCategoriaId(fila.categoria);
    const sku = fila.sku ? String(fila.sku).trim() : null;
    const costo = Number(fila.costo) || 0;
    const stock = Number(fila.stock) || 0;
    const stock_minimo = Number(fila.stock_minimo) || 5;

    const existente = db.prepare('SELECT id FROM productos WHERE lower(nombre) = lower(?)').get(nombre);
    if (existente) {
      db.prepare(
        `UPDATE productos SET categoria_id=?, sku=COALESCE(?,sku), precio=?, costo=?, stock=?, stock_minimo=? WHERE id=?`
      ).run(categoria_id, sku, precio, costo, stock, stock_minimo, existente.id);
      actualizados++;
    } else {
      db.prepare(
        `INSERT INTO productos (categoria_id, nombre, sku, precio, costo, stock, stock_minimo) VALUES (?,?,?,?,?,?,?)`
      ).run(categoria_id, nombre, sku, precio, costo, stock, stock_minimo);
      creados++;
    }
  });

  registrarAuditoria('inventario', null, req.usuario, 'carga_masiva', `Importación masiva: ${creados} creados, ${actualizados} actualizados, ${errores.length} con error`);
  res.json({ creados, actualizados, errores });
});

module.exports = router;
