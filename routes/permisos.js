const express = require('express');
const db = require('../db/db');
const { verificarToken, soloRoles, ACCIONES_PERMISOS, ROLES_CONFIGURABLES } = require('../middleware/auth');
const { registrarAuditoria } = require('../db/auditoria');

const router = express.Router();
router.use(verificarToken);

// GET /api/permisos — matriz completa (cualquier usuario autenticado puede verla)
// Devuelve: { acciones: [...], roles: [...], matriz: { accion: { rol: true/false } } }
router.get('/', (req, res) => {
  const filas = db.prepare('SELECT * FROM permisos').all();
  const matriz = {};
  ACCIONES_PERMISOS.forEach(accion => {
    matriz[accion] = {};
    ROLES_CONFIGURABLES.forEach(rol => { matriz[accion][rol] = false; });
  });
  filas.forEach(f => {
    if (matriz[f.accion] && f.rol in matriz[f.accion]) matriz[f.accion][f.rol] = !!f.permitido;
  });
  res.json({ acciones: ACCIONES_PERMISOS, roles: ROLES_CONFIGURABLES, matriz });
});

// PUT /api/permisos — cambiar UNA celda de la matriz. SOLO superadmin, siempre, sin excepción:
// esta regla vive fija en el código (soloRoles), no en la tabla `permisos`, para que nadie
// pueda auto-otorgarse el control de los permisos.
// body: { accion, rol, permitido: true|false }
router.put('/', soloRoles('superadmin'), (req, res) => {
  const { accion, rol, permitido } = req.body;
  if (!ACCIONES_PERMISOS.includes(accion)) return res.status(400).json({ error: 'Acción inválida' });
  if (!ROLES_CONFIGURABLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido o no configurable (superadmin siempre tiene acceso total)' });
  db.prepare(
    `INSERT INTO permisos (accion, rol, permitido) VALUES (?, ?, ?)
     ON CONFLICT(accion, rol) DO UPDATE SET permitido = excluded.permitido`
  ).run(accion, rol, permitido ? 1 : 0);
  registrarAuditoria('permisos', null, req.usuario, permitido ? 'permiso_otorgado' : 'permiso_revocado', `Acción "${accion}" ${permitido ? 'otorgada al' : 'revocada al'} rol "${rol}"`);
  res.json({ actualizado: true });
});

module.exports = router;
