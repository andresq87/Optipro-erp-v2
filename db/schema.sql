-- ÓpticaPro ERP — Esquema de base de datos
-- SQLite (migrable a PostgreSQL cambiando tipos SERIAL/AUTOINCREMENT)

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  correo TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK(rol IN ('superadmin','optometra','vendedor','contador','lectura')),
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pacientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  tipo_documento TEXT NOT NULL,
  numero_documento TEXT UNIQUE NOT NULL,
  fecha_nacimiento TEXT,
  telefono TEXT,
  correo TEXT,
  eps TEXT,
  creado_en TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS historias_clinicas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
  fecha TEXT DEFAULT (datetime('now')),
  diagnostico TEXT,
  od_esfera REAL, od_cilindro REAL, od_eje INTEGER,
  oi_esfera REAL, oi_cilindro REAL, oi_eje INTEGER,
  adicion REAL,
  observaciones TEXT,
  optometra_id INTEGER REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS citas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id),
  fecha TEXT NOT NULL,
  hora TEXT NOT NULL,
  tipo TEXT CHECK(tipo IN ('examen','entrega','ajuste')),
  estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente','confirmada','completada','cancelada')),
  notas TEXT,
  recordatorio_modo TEXT DEFAULT 'manual' CHECK(recordatorio_modo IN ('automatico','manual','ninguno')),
  recordatorio_enviado INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categorias_producto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE  -- monturas, lentes, accesorios
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria_id INTEGER REFERENCES categorias_producto(id),
  nombre TEXT NOT NULL,
  sku TEXT UNIQUE,
  precio REAL NOT NULL,
  costo REAL,
  stock INTEGER DEFAULT 0,
  stock_minimo INTEGER DEFAULT 5,
  activo INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_factura TEXT UNIQUE,
  paciente_id INTEGER REFERENCES pacientes(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  subtotal REAL NOT NULL,
  iva REAL NOT NULL,
  total REAL NOT NULL,
  metodo_pago TEXT CHECK(metodo_pago IN ('efectivo','nequi','daviplata','pse','tarjeta')),
  estado_pago TEXT DEFAULT 'pendiente' CHECK(estado_pago IN ('pendiente','procesando','aprobado','rechazado')),
  estado_dian TEXT DEFAULT 'no_enviada' CHECK(estado_dian IN ('no_enviada','pruebas','enviada','rechazada')),
  cufe TEXT,
  creado_en TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS venta_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL,
  precio_unitario REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canal TEXT CHECK(canal IN ('whatsapp','instagram','facebook','web')),
  contacto_nombre TEXT,
  contacto_ref TEXT,
  contenido TEXT NOT NULL,
  direccion TEXT CHECK(direccion IN ('entrante','saliente')),
  leido INTEGER DEFAULT 0,
  creado_en TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prospectos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  valor_estimado REAL DEFAULT 0,
  origen TEXT,
  nota TEXT,
  etapa TEXT DEFAULT 'prospectos' CHECK(etapa IN ('prospectos','contactados','examinados','propuesta','cerrado')),
  creado_en TEXT DEFAULT (datetime('now'))
);

-- Bitácora de auditoría del CRM: SOLO INSERT, nunca se actualiza ni se borra.
-- Registra quién hizo qué y cuándo sobre cada prospecto.
CREATE TABLE IF NOT EXISTS auditoria_prospectos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prospecto_id INTEGER,
  usuario_id INTEGER REFERENCES usuarios(id),
  usuario_nombre TEXT,
  accion TEXT NOT NULL, -- 'creado' | 'editado' | 'movido' | 'eliminado'
  detalle TEXT,
  fecha TEXT DEFAULT (datetime('now'))
);

-- Bitácora GENERAL del sistema: usuarios, inventario, CRM, configuración y permisos.
-- SOLO INSERT. Ninguna ruta de la API la actualiza ni la borra — ni siquiera el superadmin
-- tiene un endpoint para modificarla, es un registro histórico permanente.
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modulo TEXT NOT NULL, -- 'usuarios' | 'inventario' | 'crm' | 'configuracion' | 'permisos'
  entidad_id INTEGER,
  usuario_id INTEGER REFERENCES usuarios(id),
  usuario_nombre TEXT,
  usuario_rol TEXT,
  accion TEXT NOT NULL,
  detalle TEXT,
  fecha TEXT DEFAULT (datetime('now'))
);

-- Configuración general de la empresa (fila única, id = 1)
CREATE TABLE IF NOT EXISTS configuracion (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  nombre_comercial TEXT,
  nit TEXT,
  telefono TEXT,
  whatsapp TEXT,
  direccion TEXT,
  correo TEXT,
  sitio_web TEXT,
  logo_base64 TEXT
);

-- Matriz de permisos por rol, editable en vivo SOLO por el superadmin.
-- 'superadmin' siempre tiene acceso total y NO se guarda aquí (regla fija en el código,
-- no en la base de datos, para que nunca se pueda quitar el propio acceso por accidente).
CREATE TABLE IF NOT EXISTS permisos (
  accion TEXT NOT NULL,
  rol TEXT NOT NULL,
  permitido INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (accion, rol)
);
