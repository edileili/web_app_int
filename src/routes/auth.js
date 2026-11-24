const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET, JWT_EXPIRES_IN, BCRYPT_ROUNDS } = require('../config');
const { authRequired } = require('../middleware/auth');
const { apiResponse, fail, publicUser, validarUsuario } = require('../utils');

// POST /api/auth/register  (público, siempre crea rol 'usuario')
router.post('/register', (req, res) => {
    const { nombre, email, password } = req.body || {};
    const error = validarUsuario({ nombre, email, password });
    if (error) return fail(res, 400, error);

    const correo = email.trim().toLowerCase();
    if (db.prepare('SELECT id FROM usuarios WHERE email = ?').get(correo)) {
        return fail(res, 409, 'Ya existe un usuario con ese email');
    }
    const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
    const info = db
        .prepare('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)')
        .run(nombre.trim(), correo, hash, 'usuario');
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(info.lastInsertRowid);
    return apiResponse(res, publicUser(usuario), 201);
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
        return fail(res, 400, 'Email y contraseña son obligatorios');
    }
    const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email.trim().toLowerCase());
    // Mensaje genérico a propósito: no revela si el email existe
    if (!usuario || !bcrypt.compareSync(password, usuario.password_hash)) {
        return fail(res, 401, 'Credenciales inválidas');
    }
    const token = jwt.sign({ sub: usuario.id, email: usuario.email, rol: usuario.rol }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN
    });
    return apiResponse(res, { token, tipo: 'Bearer', expiresIn: JWT_EXPIRES_IN, usuario: publicUser(usuario) });
});

// GET /api/auth/me
router.get('/me', authRequired, (req, res) => {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.user.id);
    return apiResponse(res, publicUser(usuario));
});

module.exports = router;
