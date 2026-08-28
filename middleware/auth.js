const jwt = require('jsonwebtoken');
const db = require('../db/db');
const SECRET = process.env.JWT_SECRET || 'cambia-esto-en-produccion';

function verificarToken(req, res, next) {
  const header = req.headers['authorization'];
  const token = header && header.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token no proporcionado' });

  jwt.verify(token, SECRET, (err, usuario) => {
    if (err) return res.status(403).json({ error: 'Token inválido o expirado' });
    req.usuario = usuario;
    next();
  });
}

// Uso: soloRoles('superadmin','contador') — para reglas FIJAS que no se editan desde la UI
// (ej: quién puede tocar la propia matriz de permisos).
function soloRoles(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ error: 'No autenticado' });
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}

// Lista de acciones configurables y los roles que las tienen POR DEFECTO al sembrar la base
// de datos por primera vez. 'superadmin' nunca se guarda en la tabla `permisos`: siempre
// tiene acceso total, decidido aquí en el código, no editable desde la UI.
const ACCIONES_PERMISOS = [
  'usuarios_gestionar', 'inventario_editar', 'inventario_eliminar',
  'crm_gestionar', 'crm_eliminar',
  'reportes_ventas', 'reportes_clinico', 'reportes_inventario',
  'configuracion_editar',
];
const ROLES_CONFIGURABLES = ['optometra', 'vendedor', 'contador', 'lectura'];
const PERMISOS_POR_DEFECTO = {
  usuarios_gestionar: [],
  inventario_editar: ['vendedor'],
  inventario_eliminar: [],
  crm_gestionar: ['vendedor'],
  crm_eliminar: [],
  reportes_ventas: ['contador', 'vendedor'],
  reportes_clinico: ['optometra'],
  reportes_inventario: ['contador'],
  configuracion_editar: [],
};

// Uso: requierePermiso('inventario_editar') — consulta la tabla `permisos` en cada request,
// así que un cambio que haga el superadmin en la matriz aplica de inmediato, sin reiniciar el servidor.
function requierePermiso(accion) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ error: 'No autenticado' });
    if (req.usuario.rol === 'superadmin') return next(); // acceso total, siempre
    const fila = db.prepare('SELECT permitido FROM permisos WHERE accion = ? AND rol = ?').get(accion, req.usuario.rol);
    if (!fila || !fila.permitido) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}

module.exports = { verificarToken, soloRoles, requierePermiso, SECRET, ACCIONES_PERMISOS, ROLES_CONFIGURABLES, PERMISOS_POR_DEFECTO };
