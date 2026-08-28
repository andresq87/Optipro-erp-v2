const db = require('./db');

// Registra un evento en la bitácora general del sistema. SOLO INSERT — nada en la API
// actualiza ni borra esta tabla, ni siquiera para el superadmin.
function registrarAuditoria(modulo, entidadId, usuario, accion, detalle) {
  db.prepare(
    `INSERT INTO auditoria (modulo, entidad_id, usuario_id, usuario_nombre, usuario_rol, accion, detalle)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(modulo, entidadId ?? null, usuario.id, usuario.nombre, usuario.rol, accion, detalle || null);
}

module.exports = { registrarAuditoria };
