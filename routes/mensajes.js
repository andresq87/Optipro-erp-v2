const express = require('express');
const db = require('../db/db');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

// GET /api/mensajes — bandeja de entrada: una fila por conversación (contacto_ref),
// con el contenido y la hora del mensaje más reciente de cada una.
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT m.*
    FROM mensajes m
    INNER JOIN (
      SELECT contacto_ref, MAX(id) AS max_id
      FROM mensajes
      GROUP BY contacto_ref
    ) ultimo ON ultimo.max_id = m.id
    ORDER BY m.id DESC
  `).all();
  res.json(rows);
});

// GET /api/mensajes/:contacto_ref — hilo completo de una conversación
router.get('/:contacto_ref', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM mensajes WHERE contacto_ref = ? ORDER BY id ASC'
  ).all(req.params.contacto_ref);
  // marcar como leídos los entrantes de esta conversación
  db.prepare(
    "UPDATE mensajes SET leido = 1 WHERE contacto_ref = ? AND direccion = 'entrante'"
  ).run(req.params.contacto_ref);
  res.json(rows);
});

// POST /api/mensajes — enviar un mensaje (saliente, desde el ERP)
// body: { canal, contacto_nombre, contacto_ref, contenido }
router.post('/', (req, res) => {
  const { canal, contacto_nombre, contacto_ref, contenido } = req.body;
  if (!canal || !contacto_ref || !contenido) {
    return res.status(400).json({ error: 'canal, contacto_ref y contenido son obligatorios' });
  }
  const info = db.prepare(
    `INSERT INTO mensajes (canal, contacto_nombre, contacto_ref, contenido, direccion, leido)
     VALUES (?, ?, ?, ?, 'saliente', 1)`
  ).run(canal, contacto_nombre || contacto_ref, contacto_ref, contenido);
  const mensaje = db.prepare('SELECT * FROM mensajes WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(mensaje);
});

// GET /api/mensajes-no-leidos/total — para el badge del menú lateral
router.get('/no-leidos/total', (req, res) => {
  const row = db.prepare(
    "SELECT COUNT(*) AS total FROM mensajes WHERE direccion = 'entrante' AND leido = 0"
  ).get();
  res.json(row);
});

module.exports = router;
