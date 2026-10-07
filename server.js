const express = require('express');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 3000;
const net = require('net');
const TCP_PORT = process.env.TCP_PORT || 6061;

const app = express();
app.use(express.json());

//const db = new Database('database.db');
const db = new Database(path.join(__dirname, 'database.db'));

db.exec(`
    CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        precio REAL NOT NULL,
        categoria_id INTEGER,
        FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE
    );
`);

const apiResponse = (res, data, statusCode = 200) => {
    return res.status(statusCode).json({
        statusCode,
        data
    });
};

// ==========================================
// ENDPOINTS
// ==========================================

// 1. GET - Todos los productos
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

// Endpoint de Ayuda / Documentación de la API (ApiHelp)
app.get('/api/help', (req, res) => {
    res.status(200).json({
        statusCode: 200,
        app: "API de Gestión de Productos y Categorías",
        version: "1.0.0",
        endpoints: {
            categorias: {
                "GET /api/categorias": "Lista todas las categorías",
                "GET /api/categorias/:id": "Obtiene una categoría por ID",
                "POST /api/categorias": "Crea una nueva categoría (Requiere { nombre })",
                "PUT /api/categorias/:id": "Actualiza una categoría",
                "DELETE /api/categorias/:id": "Elimina una categoría"
            },
            productos: {
                "GET /api/productos": "Lista todos los productos",
                "GET /api/productos/:id": "Obtiene un producto por ID",
                "POST /api/productos": "Crea un producto (Requiere { nombre, precio, categoria_id, stock })",
                "PUT /api/productos/:id": "Actualiza un producto",
                "DELETE /api/productos/:id": "Elimina un producto"
            },
            inventario: {
                "GET /api/inventario": "Consulta el inventario unificado (Productos con su respectiva categoría)"
            },
            mantenimiento: {
                "DELETE /api/mantenimiento/vaciar": "Vacía toda la base de datos (Útil para pruebas)"
            }
        }
    });
});

const tcpServer = net.createServer((socket) => {
    console.log('Cliente TCP conectado.');

    socket.on('data', (data) => {
        const mensaje = data.toString().trim();
        console.log(`Mensaje TCP recibido: ${mensaje}`);

        try {
            // 1. Protocolo INSERT: {insert:{"nombre":"Laptop","precio":1200,"categoria_id":1}}
            // O para categorías: {insert:{"nombre":"Electrónica"}}
            if (mensaje.startsWith('{insert:') && mensaje.endsWith('}')) {
                const jsonStr = mensaje.substring(8, mensaje.length - 1).trim();
                const obj = JSON.parse(jsonStr);

                if (obj.precio !== undefined && obj.categoria_id !== undefined) {
                    // Es un producto
                    const stmt = db.prepare('INSERT INTO productos (nombre, precio, categoria_id) VALUES (?, ?, ?)');
                    const info = stmt.run(obj.nombre, obj.precio, obj.categoria_id);
                    socket.write(JSON.stringify({ status: 201, insertedId: info.lastInsertRowid }) + '\n');
                } else if (obj.nombre) {
                    // Es una categoría
                    const stmt = db.prepare('INSERT INTO categorias (nombre) VALUES (?)');
                    const info = stmt.run(obj.nombre);
                    socket.write(JSON.stringify({ status: 201, insertedId: info.lastInsertRowid }) + '\n');
                } else {
                    socket.write(JSON.stringify({ error: 'Estructura de JSON inválida para insert' }) + '\n');
                }
            } 
            // 2. Protocolo GET: {get:productos} o {get:categorias}
            else if (mensaje.startsWith('{get:') && mensaje.endsWith('}')) {
                const entidad = mensaje.substring(5, mensaje.length - 1).trim();

                if (entidad === 'productos') {
                    const productos = db.prepare('SELECT * FROM productos').all();
                    socket.write(JSON.stringify({ status: 200, data: productos }) + '\n');
                } else if (entidad === 'categorias') {
                    const categorias = db.prepare('SELECT * FROM categorias').all();
                    socket.write(JSON.stringify({ status: 200, data: categorias }) + '\n');
                } else {
                    socket.write(JSON.stringify({ error: 'Entidad desconocida para get' }) + '\n');
                }
            } else {
                socket.write(JSON.stringify({ error: 'Comando no reconocido. Use {insert:...} o {get:...}' }) + '\n');
            }
        } catch (error) {
            socket.write(JSON.stringify({ error: 'Error procesando la solicitud', details: error.message }) + '\n');
        }
    });

    socket.on('end', () => {
        console.log('Cliente TCP desconectado.');
    });

    socket.on('error', (err) => {
        console.error('Error en socket TCP:', err.message);
    });
});

//TCP
tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
    console.log(`Servidor TCP en el puerto ${TCP_PORT}`);
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});