const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db/db');
const { verificarToken, soloRoles } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

// Solo el superadmin puede ACCEDER a este módulo (verlo y descargarlo). Esta regla es fija en
// el código, no editable desde la matriz de permisos, y la tabla `auditoria` en sí es de solo
// inserción — ninguna ruta la modifica ni la borra, ni siquiera esta.
router.use(soloRoles('superadmin'));

const etiquetaModulo = {
  usuarios: 'Usuarios', inventario: 'Inventario', crm: 'CRM',
  configuracion: 'Configuración', permisos: 'Permisos',
};

// GET /api/auditoria?modulo=usuarios&desde=2026-08-01&hasta=2026-08-31
router.get('/', (req, res) => {
  const { modulo, desde, hasta } = req.query;
  let sql = 'SELECT * FROM auditoria WHERE 1=1';
  const params = [];
  if (modulo) { sql += ' AND modulo = ?'; params.push(modulo); }
  if (desde) { sql += ' AND date(fecha) >= ?'; params.push(desde); }
  if (hasta) { sql += ' AND date(fecha) <= ?'; params.push(hasta); }
  sql += ' ORDER BY fecha DESC LIMIT 1000';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// GET /api/auditoria/excel?modulo=&desde=&hasta=
router.get('/excel', async (req, res) => {
  const { modulo, desde, hasta } = req.query;
  let sql = 'SELECT * FROM auditoria WHERE 1=1';
  const params = [];
  if (modulo) { sql += ' AND modulo = ?'; params.push(modulo); }
  if (desde) { sql += ' AND date(fecha) >= ?'; params.push(desde); }
  if (hasta) { sql += ' AND date(fecha) <= ?'; params.push(hasta); }
  sql += ' ORDER BY fecha DESC';
  const rows = db.prepare(sql).all(...params);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Auditoría');
  ws.columns = [
    { header: 'Fecha', key: 'fecha', width: 20 },
    { header: 'Módulo', key: 'modulo', width: 16 },
    { header: 'Usuario', key: 'usuario', width: 22 },
    { header: 'Rol', key: 'rol', width: 14 },
    { header: 'Acción', key: 'accion', width: 18 },
    { header: 'Detalle', key: 'detalle', width: 50 },
  ];
  rows.forEach(r => ws.addRow({
    fecha: r.fecha, modulo: etiquetaModulo[r.modulo] || r.modulo,
    usuario: r.usuario_nombre, rol: r.usuario_rol, accion: r.accion, detalle: r.detalle
  }));
  ws.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="auditoria-${new Date().toISOString().slice(0,10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;
