const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { BCRYPT_ROUNDS } = require('../config');
const { authRequired, requireRole } = require('../middleware/auth');
const { apiResponse, fail, publicUser, validarUsuario } = require('../utils');

router.use(authRequired);

const esAdminOPropio = (req) => req.user.rol === 'admin' || req.user.id === Number(req.params.id);

// GET /api/usuarios  (solo admin)
router.get('/', requireRole('admin'), (req, res) => {
    const usuarios = db.prepare('SELECT * FROM usuarios ORDER BY id').all();
    return apiResponse(res, usuarios.map(publicUser));
});

// POST /api/usuarios  (solo admin, puede definir el rol)
router.post('/', requireRole('admin'), (req, res) => {
    const { nombre, email, password, rol = 'usuario' } = req.body || {};
    const error = validarUsuario({ nombre, email, password, rol });
    if (error) return fail(res, 400, error);

    const correo = email.trim().toLowerCase();
    if (db.prepare('SELECT id FROM usuarios WHERE email = ?').get(correo)) {
        return fail(res, 409, 'Ya existe un usuario con ese email');
    }
    const info = db
        .prepare('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)')
        .run(nombre.trim(), correo, bcrypt.hashSync(password, BCRYPT_ROUNDS), rol);
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(info.lastInsertRowid);
    return apiResponse(res, publicUser(usuario), 201);
});

// GET /api/usuarios/:id  (admin o el propio usuario)
router.get('/:id', (req, res) => {
    if (!esAdminOPropio(req)) return fail(res, 403, 'No tienes permisos para esta acción');
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
    if (!usuario) return fail(res, 404, 'Usuario no encontrado');
    return apiResponse(res, publicUser(usuario));
});

// PUT /api/usuarios/:id  (admin o el propio usuario; solo admin cambia roles)
router.put('/:id', (req, res) => {
    if (!esAdminOPropio(req)) return fail(res, 403, 'No tienes permisos para esta acción');
    const actual = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
    if (!actual) return fail(res, 404, 'Usuario no encontrado');

    const { nombre, email, password, rol } = req.body || {};
    const error = validarUsuario({ nombre, email, password, rol }, true);
    if (error) return fail(res, 400, error);

    if (rol !== undefined && rol !== actual.rol) {
        if (req.user.rol !== 'admin') return fail(res, 403, 'Solo un admin puede cambiar roles');
        if (req.user.id === actual.id) return fail(res, 400, 'No puedes cambiar tu propio rol');
    }

    const nuevoEmail = email !== undefined ? email.trim().toLowerCase() : actual.email;
    if (nuevoEmail !== actual.email) {
        if (db.prepare('SELECT id FROM usuarios WHERE email = ? AND id != ?').get(nuevoEmail, actual.id)) {
            return fail(res, 409, 'Ya existe un usuario con ese email');
        }
    }
    const nuevoHash = password !== undefined ? bcrypt.hashSync(password, BCRYPT_ROUNDS) : actual.password_hash;

    db.prepare('UPDATE usuarios SET nombre = ?, email = ?, password_hash = ?, rol = ? WHERE id = ?').run(
        nombre !== undefined ? nombre.trim() : actual.nombre,
        nuevoEmail,
        nuevoHash,
        rol !== undefined ? rol : actual.rol,
        actual.id
    );
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(actual.id);
    return apiResponse(res, publicUser(usuario));
});

// DELETE /api/usuarios/:id  (solo admin, no puede borrarse a sí mismo)
router.delete('/:id', requireRole('admin'), (req, res) => {
    if (req.user.id === Number(req.params.id)) return fail(res, 400, 'No puedes eliminar tu propia cuenta');
    const info = db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return fail(res, 404, 'Usuario no encontrado');
    return res.status(200).json({ statusCode: 200, message: 'Eliminado correctamente' });
});

module.exports = router;
