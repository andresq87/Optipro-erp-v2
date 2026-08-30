const express = require('express');
const db = require('../db/db');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

// GET /api/ventas
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM ventas ORDER BY id DESC LIMIT 100').all();
  res.json(rows);
});

// POST /api/ventas — crear venta con items (transacción atómica)
// body: { paciente_id, metodo_pago, asesor, items: [{producto_id, cantidad}] }
router.post('/', (req, res) => {
  const { paciente_id, metodo_pago, items } = req.body;
  const asesor = req.body.asesor ? String(req.body.asesor).trim() : null;
  if (!metodo_pago || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'metodo_pago e items son obligatorios' });
  }

  try {
    db.exec('BEGIN');
    let subtotal = 0;
    const detalles = [];

    for (const item of items) {
      const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(item.producto_id);
      if (!producto) throw new Error(`Producto ${item.producto_id} no existe`);
      if (producto.stock < item.cantidad) throw new Error(`Stock insuficiente para ${producto.nombre}`);
      subtotal += producto.precio * item.cantidad;
      detalles.push({ producto_id: producto.id, cantidad: item.cantidad, precio_unitario: producto.precio });
    }

    const iva = Math.round(subtotal * 0.19);
    const total = subtotal + iva;
    const numeroFactura = 'F-' + Date.now();

    // Estado inicial: efectivo se marca aprobado de una vez; pagos electrónicos quedan
    // "procesando" hasta que el webhook de la pasarela confirme (ver routes/pagos.js)
    const estadoInicial = metodo_pago === 'efectivo' ? 'aprobado' : 'procesando';

    const infoVenta = db.prepare(
      `INSERT INTO ventas (numero_factura, paciente_id, usuario_id, asesor, subtotal, iva, total, metodo_pago, estado_pago)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(numeroFactura, paciente_id || null, req.usuario.id, asesor, subtotal, iva, total, metodo_pago, estadoInicial);

    const ventaId = infoVenta.lastInsertRowid;

    for (const d of detalles) {
      db.prepare(
        'INSERT INTO venta_items (venta_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)'
      ).run(ventaId, d.producto_id, d.cantidad, d.precio_unitario);
      db.prepare('UPDATE productos SET stock = stock - ? WHERE id = ?').run(d.cantidad, d.producto_id);
    }

    db.exec('COMMIT');
    res.status(201).json({ id: ventaId, numero_factura: numeroFactura, subtotal, iva, total, estado_pago: estadoInicial, asesor });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    res.status(400).json({ error: e.message });
  }
});

// GET /api/ventas/asesores/lista — nombres únicos de asesores registrados en ventas
router.get('/asesores/lista', (req, res) => {
  const rows = db.prepare(
    "SELECT DISTINCT asesor FROM ventas WHERE asesor IS NOT NULL AND asesor != '' ORDER BY asesor"
  ).all();
  res.json(rows.map(r => r.asesor));
});

// GET /api/ventas/:id
router.get('/:id', (req, res) => {
  const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id);
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
  venta.items = db.prepare(
    `SELECT vi.*, p.nombre FROM venta_items vi JOIN productos p ON p.id = vi.producto_id WHERE vi.venta_id = ?`
  ).all(req.params.id);
  res.json(venta);
});

module.exports = router;
