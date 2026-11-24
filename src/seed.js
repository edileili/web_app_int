const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const bcrypt = require('bcryptjs');
const db = require('./db');
const { BCRYPT_ROUNDS } = require('./config');

// Crea el primer admin a partir de variables de entorno (solo si no existe ya un admin)
function ensureAdmin() {
    const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOMBRE } = process.env;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        console.warn('ADMIN_EMAIL/ADMIN_PASSWORD no definidos: no se creó un admin inicial');
        return;
    }
    if (db.prepare("SELECT id FROM usuarios WHERE rol = 'admin' LIMIT 1").get()) return;

    db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)').run(
        ADMIN_NOMBRE || 'Administrador',
        ADMIN_EMAIL.trim().toLowerCase(),
        bcrypt.hashSync(ADMIN_PASSWORD, BCRYPT_ROUNDS),
        'admin'
    );
    console.log(`Admin inicial creado: ${ADMIN_EMAIL}`);
}

module.exports = { ensureAdmin };
