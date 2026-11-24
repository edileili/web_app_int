// Categorías, productos, inventario y mantenimiento.
// Política: lecturas públicas; crear/editar requiere login; eliminar y vaciar solo admin.
const router = require('express').Router();
const db = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');
const { apiResponse, fail } = require('../utils');

const esNumeroValido = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const esEnteroValido = (v) => Number.isInteger(v) && v >= 0;

// ---------- CATEGORÍAS ----------
router.get('/categorias', (req, res) => {
    apiResponse(res, db.prepare('SELECT * FROM categorias').all());
});

router.get('/categorias/:id', (req, res) => {
    const categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(req.params.id);
    if (!categoria) return fail(res, 404, 'Categoría no encontrada');
    apiResponse(res, categoria);
});

router.post('/categorias', authRequired, (req, res) => {
    const nombre = req.body && req.body.nombre;
    if (typeof nombre !== 'string' || !nombre.trim()) return fail(res, 400, 'El nombre de la categoría es obligatorio');
    const info = db.prepare('INSERT INTO categorias (nombre) VALUES (?)').run(nombre.trim());
    apiResponse(res, { id: info.lastInsertRowid, nombre: nombre.trim() }, 201);
});

router.put('/categorias/:id', authRequired, (req, res) => {
    const nombre = req.body && req.body.nombre;
    if (typeof nombre !== 'string' || !nombre.trim()) return fail(res, 400, 'El nombre es obligatorio');
    const info = db.prepare('UPDATE categorias SET nombre = ? WHERE id = ?').run(nombre.trim(), req.params.id);
    if (info.changes === 0) return fail(res, 404, 'Categoría no encontrada');
    apiResponse(res, { id: Number(req.params.id), nombre: nombre.trim() });
});

// Nota: por el ON DELETE CASCADE, borrar una categoría borra también sus productos
router.delete('/categorias/:id', authRequired, requireRole('admin'), (req, res) => {
    const info = db.prepare('DELETE FROM categorias WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return fail(res, 404, 'Categoría no encontrada');
    res.status(200).json({ statusCode: 200, message: 'Eliminado correctamente' });
});

// ---------- PRODUCTOS ----------
router.get('/productos', (req, res) => {
    apiResponse(res, db.prepare('SELECT * FROM productos').all());
});

router.get('/productos/:id', (req, res) => {
    const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
    if (!producto) return fail(res, 404, 'Producto no encontrado');
    apiResponse(res, producto);
});

router.post('/productos', authRequired, (req, res) => {
    const { nombre, precio, categoria_id } = req.body || {};
    if (!nombre || precio === undefined || !categoria_id) {
        return fail(res, 400, 'Faltan campos obligatorios (nombre, precio, categoria_id)');
    }
    const stock = req.body.stock !== undefined ? req.body.stock : 0;
    if (!esNumeroValido(precio)) return fail(res, 400, 'El precio debe ser un número mayor o igual a 0');
    if (!esEnteroValido(stock)) return fail(res, 400, 'El stock debe ser un entero mayor o igual a 0');
    if (!db.prepare('SELECT id FROM categorias WHERE id = ?').get(categoria_id)) {
        return fail(res, 400, 'La categoría especificada no existe');
    }
    const info = db
        .prepare('INSERT INTO productos (nombre, precio, stock, categoria_id) VALUES (?, ?, ?, ?)')
        .run(nombre, precio, stock, categoria_id);
    apiResponse(res, { id: info.lastInsertRowid, nombre, precio, stock, categoria_id }, 201);
});

router.put('/productos/:id', authRequired, (req, res) => {
    const actual = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
    if (!actual) return fail(res, 404, 'Producto no encontrado');

    const { nombre, precio, stock, categoria_id } = req.body || {};
    if (precio !== undefined && !esNumeroValido(precio)) return fail(res, 400, 'El precio debe ser un número mayor o igual a 0');
    if (stock !== undefined && !esEnteroValido(stock)) return fail(res, 400, 'El stock debe ser un entero mayor o igual a 0');
    if (categoria_id !== undefined && !db.prepare('SELECT id FROM categorias WHERE id = ?').get(categoria_id)) {
        return fail(res, 400, 'La categoría no existe');
    }

    const nuevo = {
        nombre: nombre !== undefined ? nombre : actual.nombre,
        precio: precio !== undefined ? precio : actual.precio,
        stock: stock !== undefined ? stock : actual.stock,
        categoria_id: categoria_id !== undefined ? categoria_id : actual.categoria_id
    };
    db.prepare('UPDATE productos SET nombre = ?, precio = ?, stock = ?, categoria_id = ? WHERE id = ?').run(
        nuevo.nombre, nuevo.precio, nuevo.stock, nuevo.categoria_id, req.params.id
    );
    apiResponse(res, { id: Number(req.params.id), ...nuevo });
});

router.delete('/productos/:id', authRequired, requireRole('admin'), (req, res) => {
    const info = db.prepare('DELETE FROM productos WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return fail(res, 404, 'Producto no encontrado');
    res.status(200).json({ statusCode: 200, message: 'Eliminado correctamente' });
});

// ---------- INVENTARIO ----------
router.get('/inventario', (req, res) => {
    const inventario = db
        .prepare(`
            SELECT p.id, p.nombre, p.precio, p.stock, c.nombre AS categoria
            FROM productos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
        `)
        .all();
    apiResponse(res, inventario);
});

// ---------- MANTENIMIENTO (solo admin) ----------
router.delete('/mantenimiento/vaciar', authRequired, requireRole('admin'), (req, res) => {
    db.prepare('DELETE FROM productos').run();
    db.prepare('DELETE FROM categorias').run();
    apiResponse(res, { mensaje: 'Base de datos vaciada correctamente' });
});

module.exports = router;
