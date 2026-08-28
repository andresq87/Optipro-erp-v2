// Crea el primer usuario superadmin. Ejecutar una sola vez: node seed.js
const bcrypt = require('bcryptjs');
const db = require('./db/db');

const correo = 'admin@opticapro.co';
const passwordPlano = 'Admin1234'; // cámbiala después de tu primer login

const existente = db.prepare('SELECT id FROM usuarios WHERE correo = ?').get(correo);
if (existente) {
  console.log('El usuario admin ya existe.');
} else {
  const hash = bcrypt.hashSync(passwordPlano, 10);
  db.prepare(
    'INSERT INTO usuarios (nombre, correo, password_hash, rol) VALUES (?, ?, ?, ?)'
  ).run('Administrador', correo, hash, 'superadmin');
  console.log('Usuario superadmin creado:');
  console.log('  correo:', correo);
  console.log('  password:', passwordPlano);
  console.log('⚠️  Cambia esta contraseña apenas inicies sesión.');
}

// Usuarios de ejemplo con distintos roles, para probar la matriz de permisos
const usuariosDemo = [
  ['Dra. Carolina Ramos', 'c.ramos@opticapro.co', 'Optometra1', 'optometra'],
  ['Marcela Vera', 'm.vera@opticapro.co', 'Vendedor1', 'vendedor'],
  ['Laura Mendoza', 'l.mendoza@opticapro.co', 'Contador1', 'contador'],
];
const existeUsuario = db.prepare('SELECT id FROM usuarios WHERE correo = ?');
usuariosDemo.forEach(([nombre, correo, pass, rol]) => {
  if (!existeUsuario.get(correo)) {
    db.prepare('INSERT INTO usuarios (nombre, correo, password_hash, rol) VALUES (?, ?, ?, ?)')
      .run(nombre, correo, bcrypt.hashSync(pass, 10), rol);
  }
});
console.log('Usuarios de ejemplo (optómetra/vendedor/contador) verificados.');
const categorias = ['monturas', 'lentes', 'accesorios'];
const insertCat = db.prepare('INSERT OR IGNORE INTO categorias_producto (nombre) VALUES (?)');
categorias.forEach(c => insertCat.run(c));
console.log('Categorías base verificadas:', categorias.join(', '));

// Productos base para que el POS no arranque vacío
const catId = nombre => db.prepare('SELECT id FROM categorias_producto WHERE nombre = ?').get(nombre).id;
const productosBase = [
  ['monturas', 'Ray-Ban RB3016', 420000, 12],
  ['monturas', 'Oakley Holbrook', 380000, 8],
  ['monturas', 'Silhouette Titanium', 680000, 5],
  ['monturas', 'Guess GU7843', 290000, 10],
  ['lentes', 'Monofocal CR-39', 85000, 30],
  ['lentes', 'Progresivo HD', 320000, 15],
  ['lentes', 'Transitions UV400', 180000, 20],
  ['accesorios', 'Estuche Premium', 35000, 25],
  ['accesorios', 'Solución Limpieza', 18000, 40],
];
const insertProd = db.prepare(
  'INSERT OR IGNORE INTO productos (categoria_id, nombre, precio, stock) VALUES (?, ?, ?, ?)'
);
const existeProd = db.prepare('SELECT id FROM productos WHERE nombre = ?');
productosBase.forEach(([cat, nombre, precio, stock]) => {
  if (!existeProd.get(nombre)) insertProd.run(catId(cat), nombre, precio, stock);
});
console.log('Productos base verificados:', productosBase.length);

// Conversaciones de ejemplo para el Centro de Mensajes
const existeMsg = db.prepare("SELECT id FROM mensajes WHERE contacto_ref = ?").get('carlos-ruiz');
if (!existeMsg) {
  const insertMsg = db.prepare(
    `INSERT INTO mensajes (canal, contacto_nombre, contacto_ref, contenido, direccion, leido) VALUES (?, ?, ?, ?, ?, ?)`
  );
  insertMsg.run('whatsapp', 'Carlos Ruiz', 'carlos-ruiz', 'Buenos días, ¿cuándo estará lista mi montura Ray-Ban RB3016?', 'entrante', 0);
  insertMsg.run('whatsapp', 'Carlos Ruiz', 'carlos-ruiz', 'Hola Carlos! Su montura ya está lista con los lentes instalados. Puede recogerla hoy a partir de las 2pm ✅', 'saliente', 1);
  insertMsg.run('instagram', '@sofiagomez_co', 'sofiagomez_co', '¿Tienen gafas polarizadas disponibles?', 'entrante', 0);
  insertMsg.run('facebook', 'Juan Espinoza', 'juan-espinoza', '¿Cuál es el precio de los progresivos?', 'entrante', 0);
  console.log('Conversaciones de ejemplo creadas.');
}

// Prospectos de ejemplo para el pipeline del CRM
const existeProspecto = db.prepare("SELECT id FROM prospectos WHERE nombre = ?").get('Roberto Lozano');
if (!existeProspecto) {
  const insertProspecto = db.prepare(
    `INSERT INTO prospectos (nombre, valor_estimado, origen, etapa) VALUES (?, ?, ?, ?)`
  );
  insertProspecto.run('Roberto Lozano', 480000, 'Vía Instagram', 'prospectos');
  insertProspecto.run('Camila Reyes', 320000, 'Página web', 'prospectos');
  insertProspecto.run('Felipe Castro', 750000, 'WhatsApp', 'prospectos');
  insertProspecto.run('Isabel Moreno', 290000, 'Cita agendada', 'contactados');
  insertProspecto.run('Andrés Vargas', 1200000, 'Familia progresivos', 'contactados');
  insertProspecto.run('Diana Suárez', 520000, 'Montura + lentes', 'examinados');
  insertProspecto.run('Mauricio Peña', 680000, 'Titanium + Varilux', 'examinados');
  insertProspecto.run('Patricia Luna', 420000, 'Espera confirmación', 'propuesta');
  insertProspecto.run('Luis Martínez', 505000, 'Pagado hoy', 'cerrado');
  insertProspecto.run('Ana García', 405000, 'Entrega pendiente', 'cerrado');
  console.log('Prospectos de ejemplo creados.');
}

// Matriz de permisos por defecto (superadmin siempre tiene acceso total, no se guarda aquí)
const { ACCIONES_PERMISOS, ROLES_CONFIGURABLES, PERMISOS_POR_DEFECTO } = require('./middleware/auth');
const existePermiso = db.prepare('SELECT 1 FROM permisos WHERE accion = ? AND rol = ?');
const insertPermiso = db.prepare('INSERT INTO permisos (accion, rol, permitido) VALUES (?, ?, ?)');
ACCIONES_PERMISOS.forEach(accion => {
  ROLES_CONFIGURABLES.forEach(rol => {
    if (!existePermiso.get(accion, rol)) {
      const permitido = (PERMISOS_POR_DEFECTO[accion] || []).includes(rol) ? 1 : 0;
      insertPermiso.run(accion, rol, permitido);
    }
  });
});
console.log('Matriz de permisos por defecto verificada.');
