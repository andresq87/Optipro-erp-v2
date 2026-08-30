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

module.exports = db;
