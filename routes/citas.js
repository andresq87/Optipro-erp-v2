const express = require('express');
const db = require('../db/db');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

// Crea el mensaje de recordatorio en el módulo de Mensajes (simula el envío de WhatsApp).
// Nota: esto guarda el recordatorio dentro del propio sistema de mensajería del ERP.
// Para enviarlo de verdad por WhatsApp real, se necesitaría contratar la API de
// WhatsApp Business (Meta o un proveedor como Twilio) y conectarla aquí.
function crearRecordatorio(cita, paciente) {
  const contactoRef = 'paciente-' + paciente.id;
  const texto = `Hola ${paciente.nombres}, le recordamos su cita del ${cita.fecha} a las ${cita.hora} en ÓpticaPro.`;
  db.prepare(
    `INSERT INTO mensajes (canal, contacto_nombre, contacto_ref, contenido, direccion, leido)
     VALUES ('whatsapp', ?, ?, ?, 'saliente', 1)`
  ).run(paciente.nombres + ' ' + paciente.apellidos, contactoRef, texto);
  db.prepare('UPDATE citas SET recordatorio_enviado = 1 WHERE id = ?').run(cita.id);
}

// GET /api/citas?fecha=2026-08-27
router.get('/', (req, res) => {
  const { fecha } = req.query;
  let rows;
  if (fecha) {
    rows = db.prepare(`
      SELECT c.*, p.nombres, p.apellidos, p.telefono FROM citas c
      JOIN pacientes p ON p.id = c.paciente_id
      WHERE c.fecha = ? ORDER BY c.hora ASC
    `).all(fecha);
  } else {
    rows = db.prepare(`
      SELECT c.*, p.nombres, p.apellidos, p.telefono FROM citas c
      JOIN pacientes p ON p.id = c.paciente_id
      ORDER BY c.fecha ASC, c.hora ASC
    `).all();
  }
  res.json(rows);
});

// POST /api/citas
// body: { paciente_id, fecha, hora, tipo, notas, recordatorio_modo }
// recordatorio_modo: 'automatico' (se envía apenas se crea la cita) | 'manual' (se envía con un botón) | 'ninguno'
router.post('/', (req, res) => {
  const { paciente_id, fecha, hora, tipo, notas, recordatorio_modo } = req.body;
  if (!paciente_id || !fecha || !hora) {
    return res.status(400).json({ error: 'paciente_id, fecha y hora son obligatorios' });
  }
  const modo = ['automatico', 'manual', 'ninguno'].includes(recordatorio_modo) ? recordatorio_modo : 'manual';
  const info = db.prepare(
    `INSERT INTO citas (paciente_id, fecha, hora, tipo, notas, recordatorio_modo) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(paciente_id, fecha, hora, tipo || 'examen', notas || null, modo);

  const cita = db.prepare('SELECT * FROM citas WHERE id = ?').get(info.lastInsertRowid);

  if (modo === 'automatico') {
    const paciente = db.prepare('SELECT * FROM pacientes WHERE id = ?').get(paciente_id);
    if (paciente) crearRecordatorio(cita, paciente);
  }

  const citaFinal = db.prepare('SELECT * FROM citas WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(citaFinal);
});

// POST /api/citas/:id/recordatorio — enviar el recordatorio manualmente
router.post('/:id/recordatorio', (req, res) => {
  const cita = db.prepare('SELECT * FROM citas WHERE id = ?').get(req.params.id);
  if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });
  const paciente = db.prepare('SELECT * FROM pacientes WHERE id = ?').get(cita.paciente_id);
  if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });
  crearRecordatorio(cita, paciente);
  res.json({ enviado: true });
});

// PUT /api/citas/:id/estado — confirmar, completar o cancelar
router.put('/:id/estado', (req, res) => {
  const { estado } = req.body;
  const validos = ['pendiente', 'confirmada', 'completada', 'cancelada'];
  if (!validos.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  const info = db.prepare('UPDATE citas SET estado = ? WHERE id = ?').run(estado, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Cita no encontrada' });
  res.json({ actualizado: true });
});

module.exports = router;
