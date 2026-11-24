const Database = require('better-sqlite3');
const path = require('path');

// DB_PATH permite guardar la BD en un volumen (EC2/Docker) o usar ':memory:' en pruebas
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database.db');
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        precio REAL NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        categoria_id INTEGER,
        FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        rol TEXT NOT NULL DEFAULT 'usuario' CHECK (rol IN ('admin', 'usuario')),
        creado_en TEXT NOT NULL DEFAULT (datetime('now'))
    );
`);

// Migración: si la tabla productos ya existía sin la columna stock, se agrega
const columnas = db.prepare('PRAGMA table_info(productos)').all();
if (!columnas.some((c) => c.name === 'stock')) {
    db.exec('ALTER TABLE productos ADD COLUMN stock INTEGER NOT NULL DEFAULT 0');
}

module.exports = db;
