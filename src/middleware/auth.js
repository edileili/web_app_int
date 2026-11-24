const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = require('../config');
const { fail } = require('../utils');

// Exige un token Bearer válido. Vuelve a leer al usuario de la BD para que
// un usuario eliminado o con rol cambiado se refleje de inmediato.
function authRequired(req, res, next) {
    const header = req.headers.authorization || '';
    const [tipo, token] = header.split(' ');
    if (tipo !== 'Bearer' || !token) {
        return fail(res, 401, 'Token requerido (Authorization: Bearer <token>)');
    }
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const usuario = db.prepare('SELECT id, email, rol FROM usuarios WHERE id = ?').get(payload.sub);
        if (!usuario) return fail(res, 401, 'El usuario del token ya no existe');
        req.user = usuario;
        next();
    } catch (err) {
        return fail(res, 401, 'Token inválido o expirado');
    }
}

const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
        return fail(res, 403, 'No tienes permisos para esta acción');
    }
    next();
};

module.exports = { authRequired, requireRole };
