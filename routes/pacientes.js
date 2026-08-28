const express = require('express');
const db = require('../db/db');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

// GET /api/pacientes?buscar=texto
router.get('/', (req, res) => {
  const { buscar } = req.query;
  let rows;
  if (buscar) {
    const like = `%${buscar}%`;
    rows = db.prepare(
      `SELECT * FROM pacientes WHERE nombres LIKE ? OR apellidos LIKE ? OR numero_documento LIKE ? ORDER BY id DESC`
    ).all(like, like, like);
  } else {
    rows = db.prepare('SELECT * FROM pacientes ORDER BY id DESC').all();
  }
  res.json(rows);
});

// GET /api/pacientes/:id (incluye historias clínicas y citas)
router.get('/:id', (req, res) => {
  const paciente = db.prepare('SELECT * FROM pacientes WHERE id = ?').get(req.params.id);
  if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });
  paciente.historias = db.prepare('SELECT * FROM historias_clinicas WHERE paciente_id = ? ORDER BY fecha DESC').all(req.params.id);
  paciente.citas = db.prepare('SELECT * FROM citas WHERE paciente_id = ? ORDER BY fecha DESC').all(req.params.id);
  res.json(paciente);
});

// POST /api/pacientes
router.post('/', (req, res) => {
  const { nombres, apellidos, tipo_documento, numero_documento } = req.body;
  const fecha_nacimiento = req.body.fecha_nacimiento ?? null;
  const telefono = req.body.telefono ?? null;
  const correo = req.body.correo ?? null;
  const eps = req.body.eps ?? null;
  if (!nombres || !apellidos || !tipo_documento || !numero_documento) {
    return res.status(400).json({ error: 'Nombres, apellidos, tipo y número de documento son obligatorios' });
  }
  try {
    const info = db.prepare(
      `INSERT INTO pacientes (nombres, apellidos, tipo_documento, numero_documento, fecha_nacimiento, telefono, correo, eps)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(nombres, apellidos, tipo_documento, numero_documento, fecha_nacimiento, telefono, correo, eps);
    res.status(201).json({ id: info.lastInsertRowid, ...req.body });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe un paciente con ese documento' });
    res.status(500).json({ error: 'Error al registrar paciente' });
  }
});

// PUT /api/pacientes/:id
router.put('/:id', (req, res) => {
  const nombres = req.body.nombres ?? null;
  const apellidos = req.body.apellidos ?? null;
  const telefono = req.body.telefono ?? null;
  const correo = req.body.correo ?? null;
  const eps = req.body.eps ?? null;
  const info = db.prepare(
    `UPDATE pacientes SET nombres=?, apellidos=?, telefono=?, correo=?, eps=? WHERE id=?`
  ).run(nombres, apellidos, telefono, correo, eps, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
  res.json({ actualizado: true });
});

// DELETE /api/pacientes/:id
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM pacientes WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
  res.json({ eliminado: true });
});

module.exports = router;
