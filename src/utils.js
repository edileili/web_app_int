const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['admin', 'usuario'];

const apiResponse = (res, data, statusCode = 200) =>
    res.status(statusCode).json({ statusCode, data });

const fail = (res, statusCode, error) =>
    res.status(statusCode).json({ statusCode, error });

const publicUser = (u) => ({
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: u.rol,
    creado_en: u.creado_en
});

// Devuelve un mensaje de error o null si todo está bien.
// parcial=true -> solo valida los campos presentes (para PUT)
function validarUsuario({ nombre, email, password, rol }, parcial = false) {
    if (!parcial || nombre !== undefined) {
        if (typeof nombre !== 'string' || nombre.trim().length < 2) return 'El nombre debe tener al menos 2 caracteres';
    }
    if (!parcial || email !== undefined) {
        if (typeof email !== 'string' || !EMAIL_RE.test(email)) return 'El email no es válido';
    }
    if (!parcial || password !== undefined) {
        if (typeof password !== 'string' || password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
    }
    if (rol !== undefined && !ROLES.includes(rol)) return "El rol debe ser 'admin' o 'usuario'";
    return null;
}

module.exports = { apiResponse, fail, publicUser, validarUsuario, ROLES };
