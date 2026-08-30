const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'opticapro.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');

// Ejecuta el esquema si las tablas aún no existen
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migraciones ligeras: agregan columnas nuevas a bases de datos que ya existían
// (por ejemplo, la que ya está corriendo en producción) sin perder los datos.
// CREATE TABLE IF NOT EXISTS no modifica una tabla que ya existe, así que las
// columnas agregadas después de que alguien ya usó el sistema deben listarse aquí.
function columnaExiste(tabla, columna) {
  const cols = db.prepare(`PRAGMA table_info(${tabla})`).all();
  return cols.some(c => c.name === columna);
}
function agregarColumnaSiFalta(tabla, columna, definicion) {
  if (!columnaExiste(tabla, columna)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  }
}
agregarColumnaSiFalta('ventas', 'asesor', 'TEXT');

// Migración de las etapas del CRM: el modelo cambió de un pipeline de 5 pasos
// (prospectos/contactados/examinados/propuesta/cerrado) a 4 estados simples
// (pendiente/contactado/cerrado/cancelado). SQLite no permite cambiar un CHECK
// con ALTER TABLE, así que reconstruimos la tabla si todavía tiene el esquema viejo.
function migrarEtapasProspectos() {
  const fila = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='prospectos'").get();
  if (!fila || !fila.sql.includes('examinados')) return; // ya está en el esquema nuevo
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE prospectos_nueva (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        valor_estimado REAL DEFAULT 0,
        origen TEXT,
        nota TEXT,
        etapa TEXT DEFAULT 'pendiente' CHECK(etapa IN ('pendiente','contactado','cerrado','cancelado')),
        creado_en TEXT DEFAULT (datetime('now','-5 hours'))
      )
    `);
    db.exec(`
      INSERT INTO prospectos_nueva (id, nombre, valor_estimado, origen, nota, etapa, creado_en)
      SELECT id, nombre, valor_estimado, origen, nota,
        CASE etapa
          WHEN 'prospectos' THEN 'pendiente'
          WHEN 'contactados' THEN 'contactado'
          WHEN 'examinados' THEN 'contactado'
          WHEN 'propuesta' THEN 'contactado'
          WHEN 'cerrado' THEN 'cerrado'
          ELSE 'pendiente'
        END,
        creado_en
      FROM prospectos
    `);
    db.exec('DROP TABLE prospectos');
    db.exec('ALTER TABLE prospectos_nueva RENAME TO prospectos');
    db.exec('COMMIT');
    console.log('✅ Migración: etapas del CRM actualizadas a pendiente/contactado/cerrado/cancelado');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('Error migrando etapas de prospectos:', e.message);
  }
}
migrarEtapasProspectos();

module.exports = db;
