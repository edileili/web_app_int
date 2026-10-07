const request = require('supertest');
const express = require('express');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json());

// Base de datos en memoria para pruebas limpias
const db = new Database(':memory:');
db.pragma('foreign_keys = ON;');

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
`);

const apiResponse = (res, data, statusCode = 200) => {
    return res.status(statusCode).json({ statusCode, data });
};

// ==========================================
// ENDPOINTS DE LA API (Con validaciones de error)
// ==========================================

app.get('/api/productos', (req, res) => {
    const productos = db.prepare('SELECT * FROM productos').all();
    apiResponse(res, productos);
});

app.get('/api/productos/:id', (req, res) => {
    const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
    if (!producto) return res.status(404).json({ statusCode: 404, error: 'Producto no encontrado' });
    apiResponse(res, producto);
});

app.get('/api/categorias', (req, res) => {
    const categorias = db.prepare('SELECT * FROM categorias').all();
    apiResponse(res, categorias);
});

app.get('/api/categorias/:id', (req, res) => {
    const categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(req.params.id);
    if (!categoria) return res.status(404).json({ statusCode: 404, error: 'Categoría no encontrada' });
    apiResponse(res, categoria);
});

app.get('/api/inventario', (req, res) => {
    const inventario = db.prepare(`
        SELECT p.id, p.nombre, p.precio, p.stock, c.nombre as categoria 
        FROM productos p 
        LEFT JOIN categorias c ON p.categoria_id = c.id
    `).all();
    apiResponse(res, inventario);
});

app.post('/api/categorias', (req, res) => {
    if (!req.body || !req.body.nombre) {
        return res.status(400).json({ statusCode: 400, error: 'El nombre de la categoría es obligatorio' });
    }
    const stmt = db.prepare('INSERT INTO categorias (nombre) VALUES (?)');
    const info = stmt.run(req.body.nombre);
    res.status(201).json({ statusCode: 201, data: { id: info.lastInsertRowid, ...req.body } });
});

app.post('/api/productos', (req, res) => {
    if (!req.body.nombre || req.body.precio === undefined || !req.body.categoria_id) {
        return res.status(400).json({ statusCode: 400, error: 'Faltan campos obligatorios (nombre, precio, categoria_id)' });
    }
    const catCheck = db.prepare('SELECT id FROM categorias WHERE id = ?').get(req.body.categoria_id);
    if (!catCheck) {
        return res.status(400).json({ statusCode: 400, error: 'La categoría especificada no existe' });
    }
    const stock = req.body.stock !== undefined ? req.body.stock : 0;
    const stmt = db.prepare('INSERT INTO productos (nombre, precio, stock, categoria_id) VALUES (?, ?, ?, ?)');
    const info = stmt.run(req.body.nombre, req.body.precio, stock, req.body.categoria_id);
    res.status(201).json({ statusCode: 201, data: { id: info.lastInsertRowid, ...req.body, stock } });
});

app.put('/api/productos/:id', (req, res) => {
    const productoActual = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
    if (!productoActual) {
        return res.status(404).json({ statusCode: 404, error: 'Producto no encontrado' });
    }
    const { nombre, precio, stock, categoria_id } = req.body;
    
    if (categoria_id !== undefined) {
        const catCheck = db.prepare('SELECT id FROM categorias WHERE id = ?').get(categoria_id);
        if (!catCheck) return res.status(400).json({ statusCode: 400, error: 'La categoría no existe' });
    }

    const nuevoNombre = nombre !== undefined ? nombre : productoActual.nombre;
    const nuevoPrecio = precio !== undefined ? precio : productoActual.precio;
    const nuevoStock = stock !== undefined ? stock : productoActual.stock;
    const nuevaCat = categoria_id !== undefined ? categoria_id : productoActual.categoria_id;

    db.prepare('UPDATE productos SET nombre = ?, precio = ?, stock = ?, categoria_id = ? WHERE id = ?')
      .run(nuevoNombre, nuevoPrecio, nuevoStock, nuevaCat, req.params.id);

    apiResponse(res, { id: Number(req.params.id), nombre: nuevoNombre, precio: nuevoPrecio, stock: nuevoStock, categoria_id: nuevaCat });
});

app.put('/api/categorias/:id', (req, res) => {
    if (!req.body.nombre) {
        return res.status(400).json({ statusCode: 400, error: 'El nombre es obligatorio' });
    }
    const stmt = db.prepare('UPDATE categorias SET nombre = ? WHERE id = ?');
    const info = stmt.run(req.body.nombre, req.params.id);
    if (info.changes === 0) {
        return res.status(404).json({ statusCode: 404, error: 'Categoría no encontrada' });
    }
    apiResponse(res, { id: Number(req.params.id), nombre: req.body.nombre });
});

app.delete('/api/productos/:id', (req, res) => {
    const stmt = db.prepare('DELETE FROM productos WHERE id = ?');
    const info = stmt.run(req.params.id);
    if (info.changes === 0) {
        return res.status(404).json({ statusCode: 404, error: 'Producto no encontrado' });
    }
    res.status(200).json({ statusCode: 200, message: 'Eliminado correctamente' });
});

app.delete('/api/mantenimiento/vaciar', (req, res) => {
    db.prepare('DELETE FROM productos').run();
    db.prepare('DELETE FROM categorias').run();
    apiResponse(res, { mensaje: 'Base de datos vaciada correctamente' });
});


// ==========================================
// BATERÍA DE 20 PRUEBAS (10 Exitosas + 10 de Errores)
// ==========================================
describe('Pruebas Integrales de la API (20 Casos)', () => {

    // --- BLOQUE 1: PRUEBAS DE FLUJO EXITOSO (1 al 10) ---

    test('1. GET /api/categorias - Lista vacía inicial', async () => {
        const res = await request(app).get('/api/categorias');
        expect(res.statusCode).toEqual(200);
        expect(res.body.data).toEqual([]);
    });

    test('2. POST /api/categorias - Crear categoría exitosa', async () => {
        const res = await request(app).post('/api/categorias').send({ nombre: 'Tecnología' });
        expect(res.statusCode).toEqual(201);
        expect(res.body.data.nombre).toEqual('Tecnología');
    });

    test('3. GET /api/categorias/:id - Obtener categoría por ID', async () => {
        const res = await request(app).get('/api/categorias/1');
        expect(res.statusCode).toEqual(200);
        expect(res.body.data.nombre).toEqual('Tecnología');
    });

    test('4. PUT /api/categorias/:id - Actualizar categoría', async () => {
        const res = await request(app).put('/api/categorias/1').send({ nombre: 'Electrónica' });
        expect(res.statusCode).toEqual(200);
        expect(res.body.data.nombre).toEqual('Electrónica');
    });

    test('5. POST /api/productos - Crear producto con stock', async () => {
        const res = await request(app).post('/api/productos').send({ 
            nombre: 'Mouse', precio: 25.0, stock: 10, categoria_id: 1 
        });
        expect(res.statusCode).toEqual(201);
        expect(res.body.data.stock).toEqual(10);
    });

    test('6. GET /api/productos - Listar productos', async () => {
        const res = await request(app).get('/api/productos');
        expect(res.statusCode).toEqual(200);
        expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('7. GET /api/productos/:id - Obtener producto por ID', async () => {
        const res = await request(app).get('/api/productos/1');
        expect(res.statusCode).toEqual(200);
        expect(res.body.data.nombre).toEqual('Mouse');
    });

    test('8. GET /api/inventario - Consultar inventario unificado', async () => {
        const res = await request(app).get('/api/inventario');
        expect(res.statusCode).toEqual(200);
        expect(res.body.data[0]).toHaveProperty('stock');
    });

    test('9. PUT /api/productos/:id - Actualizar datos del producto', async () => {
        const res = await request(app).put('/api/productos/1').send({ 
            nombre: 'Mouse Gamer', precio: 45.0, stock: 15, categoria_id: 1 
        });
        expect(res.statusCode).toEqual(200);
        expect(res.body.data.precio).toEqual(45.0);
    });

    test('10. DELETE /api/productos/:id - Eliminar un producto existente', async () => {
        const res = await request(app).delete('/api/productos/1');
        expect(res.statusCode).toEqual(200);
    });


    // --- BLOQUE 2: PRUEBAS DE ESCENARIOS DE ERROR (11 al 20) ---

    test('11. (ERROR) POST /api/categorias - Cuerpo vacío sin nombre', async () => {
        const res = await request(app).post('/api/categorias').send({});
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('error');
    });

    test('12. (ERROR) PUT /api/categorias/:id - Actualizar categoría sin nombre', async () => {
        const res = await request(app).put('/api/categorias/1').send({});
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('error');
    });

    test('13. (ERROR) GET /api/categorias/:id - Categoría ID inexistente', async () => {
        const res = await request(app).get('/api/categorias/9999');
        expect(res.statusCode).toEqual(404);
        expect(res.body).toHaveProperty('error');
    });

    test('14. (ERROR) PUT /api/categorias/:id - Categoría ID inexistente a actualizar', async () => {
        const res = await request(app).put('/api/categorias/9999').send({ nombre: 'Falsa' });
        expect(res.statusCode).toEqual(404);
        expect(res.body).toHaveProperty('error');
    });

    test('15. (ERROR) POST /api/productos - Faltan campos obligatorios', async () => {
        const res = await request(app).post('/api/productos').send({ nombre: 'Incompleto' });
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('error');
    });

    test('16. (ERROR) POST /api/productos - Categoría ID que no existe (FK error)', async () => {
        const res = await request(app).post('/api/productos').send({ 
            nombre: 'Laptop', precio: 999, categoria_id: 8888 
        });
        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('error');
    });

    test('17. (ERROR) GET /api/productos/:id - Producto ID inexistente', async () => {
        const res = await request(app).get('/api/productos/9999');
        expect(res.statusCode).toEqual(404);
        expect(res.body).toHaveProperty('error');
    });

    test('18. (ERROR) PUT /api/productos/:id - Producto ID inexistente a actualizar', async () => {
        const res = await request(app).put('/api/productos/9999').send({ nombre: 'Fantasma' });
        expect(res.statusCode).toEqual(404);
        expect(res.body).toHaveProperty('error');
    });

    test('19. (ERROR) DELETE /api/productos/:id - Borrar producto con ID inexistente', async () => {
        const res = await request(app).delete('/api/productos/9999');
        expect(res.statusCode).toEqual(404);
        expect(res.body).toHaveProperty('error');
    });

    test('20. DELETE /api/mantenimiento/vaciar - Limpieza final de la BD', async () => {
        const res = await request(app).delete('/api/mantenimiento/vaciar');
        expect(res.statusCode).toEqual(200);
        expect(res.body.data.mensaje).toContain('vaciada');
    });
});

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en el puerto ${PORT}`);
    });
}

module.exports = app;