const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'opticapro.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');

// Ejecuta el esquema si las tablas aún no existen
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
