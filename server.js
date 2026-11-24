const net = require('net');
const app = require('./src/app');
const db = require('./src/db');

const PORT = process.env.PORT || 3000;
const TCP_PORT = process.env.TCP_PORT || 6061;

// ==========================================
// SERVIDOR TCP
// ==========================================
const tcpServer = net.createServer((socket) => {
    console.log('Cliente TCP conectado.');

    socket.on('data', (data) => {
        const mensaje = data.toString().trim();
        console.log(`Mensaje TCP recibido: ${mensaje}`);

        try {
            // {insert:{"nombre":"Laptop","precio":1200,"categoria_id":1,"stock":5}}
            // {insert:{"nombre":"Electrónica"}}
            if (mensaje.startsWith('{insert:') && mensaje.endsWith('}')) {
                const obj = JSON.parse(mensaje.substring(8, mensaje.length - 1).trim());

                if (obj.precio !== undefined && obj.categoria_id !== undefined) {
                    const info = db
                        .prepare('INSERT INTO productos (nombre, precio, stock, categoria_id) VALUES (?, ?, ?, ?)')
                        .run(obj.nombre, obj.precio, obj.stock !== undefined ? obj.stock : 0, obj.categoria_id);
                    socket.write(JSON.stringify({ status: 201, insertedId: info.lastInsertRowid }) + '\n');
                } else if (obj.nombre) {
                    const info = db.prepare('INSERT INTO categorias (nombre) VALUES (?)').run(obj.nombre);
                    socket.write(JSON.stringify({ status: 201, insertedId: info.lastInsertRowid }) + '\n');
                } else {
                    socket.write(JSON.stringify({ error: 'Estructura de JSON inválida para insert' }) + '\n');
                }
            }
            // {get:productos} o {get:categorias}
            else if (mensaje.startsWith('{get:') && mensaje.endsWith('}')) {
                const entidad = mensaje.substring(5, mensaje.length - 1).trim();
                if (entidad === 'productos') {
                    socket.write(JSON.stringify({ status: 200, data: db.prepare('SELECT * FROM productos').all() }) + '\n');
                } else if (entidad === 'categorias') {
                    socket.write(JSON.stringify({ status: 200, data: db.prepare('SELECT * FROM categorias').all() }) + '\n');
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

    socket.on('end', () => console.log('Cliente TCP desconectado.'));
    socket.on('error', (err) => console.error('Error en socket TCP:', err.message));
});

tcpServer.listen(TCP_PORT, '0.0.0.0', () => console.log(`Servidor TCP en el puerto ${TCP_PORT}`));

app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));
