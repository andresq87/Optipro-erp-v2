const express = require('express');
const db = require('../db/db');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

// GET /api/crm/resumen — métricas para el dashboard/CRM
router.get('/resumen', (req, res) => {
  const totalPacientes = db.prepare('SELECT COUNT(*) AS n FROM pacientes').get().n;
  const ventasHoy = db.prepare(
    "SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total FROM ventas WHERE date(creado_en) = date('now')"
  ).get();
  const mensajesNoLeidos = db.prepare(
    "SELECT COUNT(*) AS n FROM mensajes WHERE direccion = 'entrante' AND leido = 0"
  ).get().n;
  const citasHoy = db.prepare(
    "SELECT COUNT(*) AS n FROM citas WHERE fecha = date('now')"
  ).get().n;
  res.json({ totalPacientes, ventasHoy: ventasHoy.n, montoVentasHoy: ventasHoy.total, mensajesNoLeidos, citasHoy });
});

// GET /api/crm/pacientes/:id — perfil 360: datos + historial de compras + mensajes
router.get('/pacientes/:id', (req, res) => {
  const paciente = db.prepare('SELECT * FROM pacientes WHERE id = ?').get(req.params.id);
  if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });
  paciente.compras = db.prepare('SELECT * FROM ventas WHERE paciente_id = ? ORDER BY creado_en DESC').all(req.params.id);
  paciente.citas = db.prepare('SELECT * FROM citas WHERE paciente_id = ? ORDER BY fecha DESC').all(req.params.id);
  res.json(paciente);
});

module.exports = router;
