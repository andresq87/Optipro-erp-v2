const express = require('express');
const db = require('../db/db');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

// POST /api/historias — registrar una fórmula/historia clínica
// body: { paciente_id, diagnostico, od_esfera, od_cilindro, od_eje, oi_esfera, oi_cilindro, oi_eje, adicion, observaciones }
router.post('/', (req, res) => {
  const b = req.body;
  if (!b.paciente_id) return res.status(400).json({ error: 'paciente_id es obligatorio' });
  const info = db.prepare(`
    INSERT INTO historias_clinicas
      (paciente_id, diagnostico, od_esfera, od_cilindro, od_eje, oi_esfera, oi_cilindro, oi_eje, adicion, observaciones, optometra_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.paciente_id, b.diagnostico || null,
    b.od_esfera || null, b.od_cilindro || null, b.od_eje || null,
    b.oi_esfera || null, b.oi_cilindro || null, b.oi_eje || null,
    b.adicion || null, b.observaciones || null, req.usuario.id
  );
  const historia = db.prepare('SELECT * FROM historias_clinicas WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(historia);
});

// GET /api/historias/:id
router.get('/:id', (req, res) => {
  const historia = db.prepare('SELECT * FROM historias_clinicas WHERE id = ?').get(req.params.id);
  if (!historia) return res.status(404).json({ error: 'Historia no encontrada' });
  res.json(historia);
});

module.exports = router;
