const path = require('path');
const express = require('express');
const pkg = require('../package.json');
const { ensureAdmin } = require('./seed');
const { fail } = require('./utils');

ensureAdmin();

const app = express();
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api', require('./routes/catalogo'));

app.get('/api/health', (req, res) => {
    res.status(200).json({
        statusCode: 200,
        app: 'Backend Inventario',
        version: pkg.version,
        endpoints: {
            auth: {
                'POST /api/auth/register': 'Registro público (rol usuario). Requiere { nombre, email, password }',
                'POST /api/auth/login': 'Login. Requiere { email, password }. Devuelve token JWT',
                'GET /api/auth/me': 'Datos del usuario autenticado (Bearer)'
            },
            usuarios: {
                'GET /api/usuarios': 'Lista usuarios (admin)',
                'POST /api/usuarios': 'Crea usuario con rol (admin)',
                'GET /api/usuarios/:id': 'Obtiene usuario (admin o propio)',
                'PUT /api/usuarios/:id': 'Actualiza usuario (admin o propio; rol solo admin)',
                'DELETE /api/usuarios/:id': 'Elimina usuario (admin)'
            },
            categorias: {
                'GET /api/categorias': 'Lista todas las categorías',
                'GET /api/categorias/:id': 'Obtiene una categoría por ID',
                'POST /api/categorias': 'Crea una categoría (login)',
                'PUT /api/categorias/:id': 'Actualiza una categoría (login)',
                'DELETE /api/categorias/:id': 'Elimina una categoría y sus productos (admin)'
            },
            productos: {
                'GET /api/productos': 'Lista todos los productos',
                'GET /api/productos/:id': 'Obtiene un producto por ID',
                'POST /api/productos': 'Crea un producto (login)',
                'PUT /api/productos/:id': 'Actualiza un producto (login)',
                'DELETE /api/productos/:id': 'Elimina un producto (admin)'
            },
            inventario: { 'GET /api/inventario': 'Productos con su categoría' },
            mantenimiento: { 'DELETE /api/mantenimiento/vaciar': 'Vacía productos y categorías (admin)' }
        }
    });
});

app.use(express.static(path.join(__dirname, '../public')));

// 404 para rutas desconocidas
app.use((req, res) => fail(res, 404, 'Ruta no encontrada'));

// Manejador global de errores (JSON mal formado, excepciones inesperadas)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return fail(res, 400, 'JSON mal formado');
    console.error(JSON.stringify({ level: 'error', msg: err.message, path: req.path }));
    return fail(res, 500, 'Error interno del servidor');
});

module.exports = app;
