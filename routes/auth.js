const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/db');
const { verificarToken, soloRoles, requierePermiso, SECRET } = require('../middleware/auth');
const { registrarAuditoria } = require('../db/auditoria');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { correo, password } = req.body;
  if (!correo || !password) return res.status(400).json({ error: 'Correo y contraseña requeridos' });

  const usuario = db.prepare('SELECT * FROM usuarios WHERE correo = ? AND activo = 1').get(correo);
  if (!usuario) return res.status(401).json({ error: 'Credenciales inválidas' });

  const valido = bcrypt.compareSync(password, usuario.password_hash);
  if (!valido) return res.status(401).json({ error: 'Credenciales inválidas' });

  const token = jwt.sign(
    { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
    SECRET,
    { expiresIn: '8h' }
  );

  res.json({ token, usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol } });
});

// PUT /api/auth/cambiar-password — cualquier usuario autenticado cambia SU PROPIA contraseña
// body: { passwordActual, passwordNueva }
router.put('/cambiar-password', verificarToken, (req, res) => {
  const { passwordActual, passwordNueva } = req.body;
  if (!passwordActual || !passwordNueva) {
    return res.status(400).json({ error: 'Debes indicar la contraseña actual y la nueva' });
  }
  if (passwordNueva.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener mínimo 8 caracteres' });
  }
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!usuario || !bcrypt.compareSync(passwordActual, usuario.password_hash)) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  }
  const hash = bcrypt.hashSync(passwordNueva, 10);
  db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(hash, req.usuario.id);
  registrarAuditoria('usuarios', usuario.id, req.usuario, 'cambio_password', 'El usuario cambió su propia contraseña');
  res.json({ actualizado: true });
});

// GET /api/auth/usuarios — listar usuarios (rol con permiso usuarios_gestionar)
router.get('/usuarios', verificarToken, requierePermiso('usuarios_gestionar'), (req, res) => {
  const usuarios = db.prepare('SELECT id, nombre, correo, rol, activo, creado_en FROM usuarios ORDER BY id ASC').all();
  res.json(usuarios);
});

// POST /api/auth/usuarios — crear usuario (rol con permiso usuarios_gestionar)
router.post('/usuarios', verificarToken, requierePermiso('usuarios_gestionar'), (req, res) => {
  const { nombre, correo, password, rol } = req.body;
  if (!nombre || !correo || !password || !rol) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }
  if (rol === 'superadmin' && req.usuario.rol !== 'superadmin') {
    return res.status(403).json({ error: 'Solo un superadmin puede crear otro superadmin' });
  }
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db.prepare(
      'INSERT INTO usuarios (nombre, correo, password_hash, rol) VALUES (?, ?, ?, ?)'
    ).run(nombre, correo, hash, rol);
    registrarAuditoria('usuarios', info.lastInsertRowid, req.usuario, 'creado', `Usuario "${nombre}" (${correo}) creado con rol ${rol}`);
    res.status(201).json({ id: info.lastInsertRowid, nombre, correo, rol });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'El correo ya está registrado' });
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// PUT /api/auth/usuarios/:id — editar usuario, incluye reseteo opcional de contraseña
// (permiso usuarios_gestionar). body: { nombre, rol, activo, password }
router.put('/usuarios/:id', verificarToken, requierePermiso('usuarios_gestionar'), (req, res) => {
  const nombre = req.body.nombre ?? null;
  const rol = req.body.rol ?? null;
  const activo = req.body.activo === undefined ? null : req.body.activo;
  if (rol === 'superadmin' && req.usuario.rol !== 'superadmin') {
    return res.status(403).json({ error: 'Solo un superadmin puede asignar el rol superadmin' });
  }
  const info = db.prepare(
    'UPDATE usuarios SET nombre = COALESCE(?, nombre), rol = COALESCE(?, rol), activo = COALESCE(?, activo) WHERE id = ?'
  ).run(nombre, rol, activo, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (req.body.password) {
    if (req.body.password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener mínimo 8 caracteres' });
    const hash = bcrypt.hashSync(req.body.password, 10);
    db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
    registrarAuditoria('usuarios', req.params.id, req.usuario, 'reseteo_password', 'Contraseña reestablecida por un administrador');
  }
  registrarAuditoria('usuarios', req.params.id, req.usuario, 'editado', `Cambios: ${JSON.stringify({nombre, rol, activo})}`);
  res.json({ actualizado: true });
});

// DELETE /api/auth/usuarios/:id — eliminar usuario (solo superadmin)
router.delete('/usuarios/:id', verificarToken, requierePermiso('usuarios_gestionar'), (req, res) => {
  if (Number(req.params.id) === req.usuario.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  }
  const objetivo = db.prepare('SELECT rol, nombre FROM usuarios WHERE id = ?').get(req.params.id);
  if (!objetivo) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (objetivo.rol === 'superadmin') {
    if (req.usuario.rol !== 'superadmin') {
      return res.status(403).json({ error: 'Solo un superadmin puede eliminar a otro superadmin' });
    }
    const totalSuperadmins = db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'superadmin' AND activo = 1").get().n;
    if (totalSuperadmins <= 1) return res.status(400).json({ error: 'Debe existir al menos un superadmin activo' });
  }
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.params.id);
  registrarAuditoria('usuarios', req.params.id, req.usuario, 'eliminado', `Usuario "${objetivo.nombre}" eliminado`);
  res.json({ eliminado: true });
});

module.exports = router;
