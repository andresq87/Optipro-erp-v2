const express = require('express');
const db = require('../db/db');
const { verificarToken, requierePermiso } = require('../middleware/auth');
const { registrarAuditoria: registrarAuditoriaGeneral } = require('../db/auditoria');

const router = express.Router();
router.use(verificarToken);

const ETAPAS = ['pendiente', 'contactado', 'cerrado', 'cancelado'];

function registrarAuditoria(prospectoId, usuario, accion, detalle) {
  db.prepare(
    `INSERT INTO auditoria_prospectos (prospecto_id, usuario_id, usuario_nombre, accion, detalle)
     VALUES (?, ?, ?, ?, ?)`
  ).run(prospectoId, usuario.id, usuario.nombre, accion, detalle || null);
}

// GET /api/prospectos — todos, agrupables en el front por etapa
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM prospectos ORDER BY id DESC').all();
  res.json(rows);
});

// GET /api/prospectos/:id/auditoria — historial inmutable de un prospecto
router.get('/:id/auditoria', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM auditoria_prospectos WHERE prospecto_id = ? ORDER BY fecha DESC'
  ).all(req.params.id);
  res.json(rows);
});

// POST /api/prospectos (solo roles autorizados)
// body: { nombre, valor_estimado, origen, nota, etapa }
router.post('/', requierePermiso('crm_gestionar'), (req, res) => {
  const { nombre, valor_estimado, origen, nota } = req.body;
  const etapa = ETAPAS.includes(req.body.etapa) ? req.body.etapa : 'pendiente';
  if (!nombre) return res.status(400).json({ error: 'nombre es obligatorio' });
  const info = db.prepare(
    `INSERT INTO prospectos (nombre, valor_estimado, origen, nota, etapa) VALUES (?, ?, ?, ?, ?)`
  ).run(nombre, valor_estimado || 0, origen || null, nota || null, etapa);
  registrarAuditoria(info.lastInsertRowid, req.usuario, 'creado', `Prospecto "${nombre}" creado con estado "${etapa}"`);
  registrarAuditoriaGeneral('crm', info.lastInsertRowid, req.usuario, 'creado', `Prospecto "${nombre}" creado`);
  const prospecto = db.prepare('SELECT * FROM prospectos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(prospecto);
});

// PUT /api/prospectos/:id — editar datos (solo roles autorizados)
router.put('/:id', requierePermiso('crm_gestionar'), (req, res) => {
  const nombre = req.body.nombre ?? null;
  const valor_estimado = req.body.valor_estimado ?? null;
  const origen = req.body.origen ?? null;
  const nota = req.body.nota ?? null;
  const info = db.prepare(
    `UPDATE prospectos SET
       nombre = COALESCE(?, nombre),
       valor_estimado = COALESCE(?, valor_estimado),
       origen = COALESCE(?, origen),
       nota = COALESCE(?, nota)
     WHERE id = ?`
  ).run(nombre, valor_estimado, origen, nota, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Prospecto no encontrado' });
  registrarAuditoria(req.params.id, req.usuario, 'editado', 'Datos del prospecto actualizados');
  const prospecto = db.prepare('SELECT * FROM prospectos WHERE id = ?').get(req.params.id);
  registrarAuditoriaGeneral('crm', req.params.id, req.usuario, 'editado', `Prospecto "${prospecto.nombre}" editado`);
  res.json(prospecto);
});

// PUT /api/prospectos/:id/etapa — mover tarjeta en el kanban (solo roles autorizados)
// body: { etapa }
router.put('/:id/etapa', requierePermiso('crm_gestionar'), (req, res) => {
  const { etapa } = req.body;
  if (!ETAPAS.includes(etapa)) return res.status(400).json({ error: 'Etapa inválida' });
  const prospecto = db.prepare('SELECT * FROM prospectos WHERE id = ?').get(req.params.id);
  if (!prospecto) return res.status(404).json({ error: 'Prospecto no encontrado' });
  db.prepare('UPDATE prospectos SET etapa = ? WHERE id = ?').run(etapa, req.params.id);
  registrarAuditoria(req.params.id, req.usuario, 'movido', `De "${prospecto.etapa}" a "${etapa}"`);
  registrarAuditoriaGeneral('crm', req.params.id, req.usuario, 'movido', `Prospecto "${prospecto.nombre}" movido de "${prospecto.etapa}" a "${etapa}"`);
  res.json({ actualizado: true });
});

// DELETE /api/prospectos/:id (solo roles autorizados para eliminar)
router.delete('/:id', requierePermiso('crm_eliminar'), (req, res) => {
  const prospecto = db.prepare('SELECT * FROM prospectos WHERE id = ?').get(req.params.id);
  if (!prospecto) return res.status(404).json({ error: 'Prospecto no encontrado' });
  // Se registra la auditoría ANTES de borrar, y esta bitácora nunca se modifica ni se borra.
  registrarAuditoria(req.params.id, req.usuario, 'eliminado', `Prospecto "${prospecto.nombre}" eliminado`);
  registrarAuditoriaGeneral('crm', req.params.id, req.usuario, 'eliminado', `Prospecto "${prospecto.nombre}" eliminado`);
  db.prepare('DELETE FROM prospectos WHERE id = ?').run(req.params.id);
  res.json({ eliminado: true });
});

module.exports = router;
