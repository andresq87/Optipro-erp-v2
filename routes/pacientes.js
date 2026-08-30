const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const db = require('../db/db');
const { verificarToken, requierePermiso } = require('../middleware/auth');
const { registrarAuditoria } = require('../db/auditoria');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
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

// GET /api/pacientes/plantilla — Excel con los títulos de columna + pacientes actuales
router.get('/plantilla', async (req, res) => {
  const pacientes = db.prepare(
    'SELECT nombres, apellidos, tipo_documento, numero_documento, fecha_nacimiento, telefono, correo, eps FROM pacientes ORDER BY nombres'
  ).all();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Pacientes');
  ws.columns = [
    { header: 'nombres', key: 'nombres', width: 20 },
    { header: 'apellidos', key: 'apellidos', width: 20 },
    { header: 'tipo_documento', key: 'tipo_documento', width: 16 },
    { header: 'numero_documento', key: 'numero_documento', width: 18 },
    { header: 'fecha_nacimiento', key: 'fecha_nacimiento', width: 16 },
    { header: 'telefono', key: 'telefono', width: 16 },
    { header: 'correo', key: 'correo', width: 24 },
    { header: 'eps', key: 'eps', width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  pacientes.forEach(p => ws.addRow(p));
  if (!pacientes.length) {
    ws.addRow({ nombres: 'Ej: María', apellidos: 'Pérez López', tipo_documento: 'CC', numero_documento: '1020304050', fecha_nacimiento: '1990-05-12', telefono: '3001234567', correo: 'maria@ejemplo.com', eps: 'Sura' });
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-pacientes.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// POST /api/pacientes/importar — carga masiva desde .xlsx o .csv
router.post('/importar', requierePermiso('pacientes_editar'), upload.single('archivo'), async (req, res) => {
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
    const nombres = (fila.nombres || '').toString().trim();
    const apellidos = (fila.apellidos || '').toString().trim();
    const numero_documento = (fila.numero_documento || '').toString().trim();
    if (!nombres || !apellidos || !numero_documento) { errores.push(`Fila ${idx + 2}: falta nombres, apellidos o número de documento`); return; }
    const tipo_documento = (fila.tipo_documento || 'CC').toString().trim();
    const fecha_nacimiento = fila.fecha_nacimiento ? String(fila.fecha_nacimiento) : null;
    const telefono = fila.telefono ? String(fila.telefono) : null;
    const correo = fila.correo ? String(fila.correo) : null;
    const eps = fila.eps ? String(fila.eps) : null;

    const existente = db.prepare('SELECT id FROM pacientes WHERE numero_documento = ?').get(numero_documento);
    if (existente) {
      db.prepare(
        `UPDATE pacientes SET nombres=?, apellidos=?, telefono=COALESCE(?,telefono), correo=COALESCE(?,correo), eps=COALESCE(?,eps) WHERE id=?`
      ).run(nombres, apellidos, telefono, correo, eps, existente.id);
      actualizados++;
    } else {
      db.prepare(
        `INSERT INTO pacientes (nombres, apellidos, tipo_documento, numero_documento, fecha_nacimiento, telefono, correo, eps) VALUES (?,?,?,?,?,?,?,?)`
      ).run(nombres, apellidos, tipo_documento, numero_documento, fecha_nacimiento, telefono, correo, eps);
      creados++;
    }
  });

  registrarAuditoria('pacientes', null, req.usuario, 'carga_masiva', `Importación masiva: ${creados} creados, ${actualizados} actualizados, ${errores.length} con error`);
  res.json({ creados, actualizados, errores });
});

// DELETE /api/pacientes — borrado múltiple. body: { ids: [1,2,3] }
router.delete('/', requierePermiso('pacientes_eliminar'), (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Debes indicar los ids a eliminar' });
  const nombres = db.prepare(`SELECT nombres, apellidos FROM pacientes WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const info = db.prepare(`DELETE FROM pacientes WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  registrarAuditoria('pacientes', null, req.usuario, 'eliminado_masivo', `${info.changes} pacientes eliminados: ${nombres.map(n => n.nombres + ' ' + n.apellidos).join(', ')}`);
  res.json({ eliminados: info.changes });
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
router.post('/', requierePermiso('pacientes_editar'), (req, res) => {
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
    registrarAuditoria('pacientes', info.lastInsertRowid, req.usuario, 'creado', `Paciente "${nombres} ${apellidos}" registrado`);
    res.status(201).json({ id: info.lastInsertRowid, ...req.body });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe un paciente con ese documento' });
    res.status(500).json({ error: 'Error al registrar paciente' });
  }
});

// PUT /api/pacientes/:id
router.put('/:id', requierePermiso('pacientes_editar'), (req, res) => {
  const nombres = req.body.nombres ?? null;
  const apellidos = req.body.apellidos ?? null;
  const telefono = req.body.telefono ?? null;
  const correo = req.body.correo ?? null;
  const eps = req.body.eps ?? null;
  const info = db.prepare(
    `UPDATE pacientes SET nombres=COALESCE(?,nombres), apellidos=COALESCE(?,apellidos), telefono=COALESCE(?,telefono), correo=COALESCE(?,correo), eps=COALESCE(?,eps) WHERE id=?`
  ).run(nombres, apellidos, telefono, correo, eps, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
  const paciente = db.prepare('SELECT * FROM pacientes WHERE id = ?').get(req.params.id);
  registrarAuditoria('pacientes', req.params.id, req.usuario, 'editado', `Paciente "${paciente.nombres} ${paciente.apellidos}" actualizado`);
  res.json({ actualizado: true });
});

// DELETE /api/pacientes/:id
router.delete('/:id', requierePermiso('pacientes_eliminar'), (req, res) => {
  const paciente = db.prepare('SELECT nombres, apellidos FROM pacientes WHERE id = ?').get(req.params.id);
  const info = db.prepare('DELETE FROM pacientes WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
  registrarAuditoria('pacientes', req.params.id, req.usuario, 'eliminado', `Paciente "${paciente ? paciente.nombres + ' ' + paciente.apellidos : req.params.id}" eliminado`);
  res.json({ eliminado: true });
});

module.exports = router;
