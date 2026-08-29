// Siembra de la base de datos, dividida en dos partes:
//
// 1) sembrarEsencial() — se ejecuta AUTOMÁTICAMENTE cada vez que arranca el servidor
//    (ver server.js). Es 100% segura para producción: solo crea el superadmin si no existe
//    ninguno, y usa variables de entorno si están definidas. Nunca crea datos de ejemplo.
//
// 2) sembrarDemo() — SOLO para desarrollo/pruebas locales. Crea usuarios, productos, mensajes
//    y prospectos de ejemplo. Se ejecuta manualmente con: node seed.js
//    NO se ejecuta en producción a menos que la corras tú mismo a propósito.

const bcrypt = require('bcryptjs');
const db = require('./db/db');
const { ACCIONES_PERMISOS, ROLES_CONFIGURABLES, PERMISOS_POR_DEFECTO } = require('./middleware/auth');

function sembrarEsencial() {
  // Superadmin inicial — usa variables de entorno si las definiste (recomendado en producción),
  // si no, cae en las credenciales por defecto (cámbialas apenas inicies sesión).
  const correoAdmin = process.env.ADMIN_EMAIL || 'admin@opticapro.co';
  const passwordAdmin = process.env.ADMIN_PASSWORD || 'Admin1234';
  const totalSuperadmins = db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'superadmin'").get().n;
  if (totalSuperadmins === 0) {
    const hash = bcrypt.hashSync(passwordAdmin, 10);
    db.prepare(
      'INSERT INTO usuarios (nombre, correo, password_hash, rol) VALUES (?, ?, ?, ?)'
    ).run('Administrador', correoAdmin, hash, 'superadmin');
    console.log('✅ Usuario superadmin creado:', correoAdmin);
    if (!process.env.ADMIN_PASSWORD) {
      console.log('⚠️  Usando contraseña por defecto. Define ADMIN_PASSWORD como variable de entorno');
      console.log('   en tu plataforma de hosting, o cambia la contraseña apenas inicies sesión.');
    }
  }

  // Categorías base — estructura del negocio, no datos de ejemplo. Segura para producción.
  const categorias = ['monturas', 'lentes', 'accesorios'];
  const insertCat = db.prepare('INSERT OR IGNORE INTO categorias_producto (nombre) VALUES (?)');
  categorias.forEach(c => insertCat.run(c));

  // Matriz de permisos por defecto (superadmin siempre tiene acceso total, no se guarda aquí)
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
}

function sembrarDemo() {
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
  console.log('Productos de ejemplo verificados:', productosBase.length);

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
}

module.exports = { sembrarEsencial, sembrarDemo };

// Si se ejecuta directamente (node seed.js), siembra TODO: lo esencial + los datos de ejemplo.
if (require.main === module) {
  sembrarEsencial();
  sembrarDemo();
  console.log('✅ Base de datos lista (con datos de ejemplo para pruebas locales).');
}
