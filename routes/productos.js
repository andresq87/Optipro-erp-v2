const express = require('express');
const db = require('../db/db');
const { verificarToken, requierePermiso } = require('../middleware/auth');
const { registrarAuditoria } = require('../db/auditoria');

const router = express.Router();
router.use(verificarToken);

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
  const categoria_id = req.body.categoria_id ?? null;
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
  const categoria_id = req.body.categoria_id ?? null;
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

module.exports = router;
