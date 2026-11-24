// Variables de entorno ANTES de cargar la app
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'secreto-de-pruebas';
process.env.BCRYPT_ROUNDS = '4';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'Admin12345';

const request = require('supertest');
const app = require('../src/app');

const login = async (email, password) => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    return res.body.data && res.body.data.token;
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

let adminToken;
let userToken;
let userId;

beforeAll(async () => {
    adminToken = await login('admin@test.com', 'Admin12345');
});

describe('Health', () => {
    test('GET /api/health responde 200', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.endpoints.auth).toBeDefined();
    });

    test('Ruta inexistente responde 404 en JSON', async () => {
        const res = await request(app).get('/api/nada');
        expect(res.status).toBe(404);
        expect(res.body.error).toBeDefined();
    });

    test('JSON mal formado responde 400', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .send('{mal');
        expect(res.status).toBe(400);
    });
});

describe('Auth', () => {
    test('el admin semilla puede iniciar sesión', () => {
        expect(adminToken).toBeTruthy();
    });

    test('registro válido crea usuario con rol usuario y sin hash', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ nombre: 'Eden', email: 'EDEN@test.com', password: 'Password123' });
        expect(res.status).toBe(201);
        expect(res.body.data.rol).toBe('usuario');
        expect(res.body.data.email).toBe('eden@test.com');
        expect(res.body.data.password_hash).toBeUndefined();
        userId = res.body.data.id;
    });

    test('registro no permite elegir rol admin', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ nombre: 'Hacker', email: 'hacker@test.com', password: 'Password123', rol: 'admin' });
        expect(res.status).toBe(201);
        expect(res.body.data.rol).toBe('usuario');
    });

    test('registro con email repetido responde 409', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ nombre: 'Eden', email: 'eden@test.com', password: 'Password123' });
        expect(res.status).toBe(409);
    });

    test.each([
        [{ nombre: 'E', email: 'a@b.com', password: 'Password123' }],
        [{ nombre: 'Eden', email: 'no-es-email', password: 'Password123' }],
        [{ nombre: 'Eden', email: 'x@test.com', password: 'corta' }],
        [{}]
    ])('registro inválido responde 400: %j', async (body) => {
        const res = await request(app).post('/api/auth/register').send(body);
        expect(res.status).toBe(400);
    });

    test('login correcto devuelve token', async () => {
        userToken = await login('eden@test.com', 'Password123');
        expect(userToken).toBeTruthy();
    });

    test('login con contraseña incorrecta responde 401', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'eden@test.com', password: 'incorrecta' });
        expect(res.status).toBe(401);
    });

    test('login con email inexistente responde 401', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'no@existe.com', password: 'Password123' });
        expect(res.status).toBe(401);
    });

    test('login sin datos responde 400', async () => {
        const res = await request(app).post('/api/auth/login').send({});
        expect(res.status).toBe(400);
    });

    test('GET /api/auth/me con token devuelve el usuario', async () => {
        const res = await request(app).get('/api/auth/me').set(auth(userToken));
        expect(res.status).toBe(200);
        expect(res.body.data.email).toBe('eden@test.com');
    });

    test('GET /api/auth/me sin token responde 401', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(401);
    });

    test('token manipulado responde 401', async () => {
        const res = await request(app).get('/api/auth/me').set(auth(userToken + 'x'));
        expect(res.status).toBe(401);
    });
});

describe('CRUD de usuarios y permisos', () => {
    test('usuario normal NO puede listar usuarios (403)', async () => {
        const res = await request(app).get('/api/usuarios').set(auth(userToken));
        expect(res.status).toBe(403);
    });

    test('sin token no puede listar usuarios (401)', async () => {
        const res = await request(app).get('/api/usuarios');
        expect(res.status).toBe(401);
    });

    test('admin lista usuarios sin exponer hashes', async () => {
        const res = await request(app).get('/api/usuarios').set(auth(adminToken));
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeGreaterThanOrEqual(3);
        expect(res.body.data.every((u) => u.password_hash === undefined)).toBe(true);
    });

    test('usuario puede ver su propio perfil pero no el de otro', async () => {
        const propio = await request(app).get(`/api/usuarios/${userId}`).set(auth(userToken));
        expect(propio.status).toBe(200);
        const ajeno = await request(app).get('/api/usuarios/1').set(auth(userToken));
        expect(ajeno.status).toBe(403);
    });

    test('admin crea usuario con rol admin', async () => {
        const res = await request(app)
            .post('/api/usuarios')
            .set(auth(adminToken))
            .send({ nombre: 'Otro Admin', email: 'admin2@test.com', password: 'Password123', rol: 'admin' });
        expect(res.status).toBe(201);
        expect(res.body.data.rol).toBe('admin');
    });

    test('usuario normal NO puede crear usuarios (403)', async () => {
        const res = await request(app)
            .post('/api/usuarios')
            .set(auth(userToken))
            .send({ nombre: 'X Y', email: 'xy@test.com', password: 'Password123' });
        expect(res.status).toBe(403);
    });

    test('usuario edita su nombre', async () => {
        const res = await request(app).put(`/api/usuarios/${userId}`).set(auth(userToken)).send({ nombre: 'Eden Editado' });
        expect(res.status).toBe(200);
        expect(res.body.data.nombre).toBe('Eden Editado');
    });

    test('usuario NO puede subirse a admin (403)', async () => {
        const res = await request(app).put(`/api/usuarios/${userId}`).set(auth(userToken)).send({ rol: 'admin' });
        expect(res.status).toBe(403);
    });

    test('usuario NO puede editar a otro (403)', async () => {
        const res = await request(app).put('/api/usuarios/1').set(auth(userToken)).send({ nombre: 'Nope' });
        expect(res.status).toBe(403);
    });

    test('cambiar contraseña permite login con la nueva', async () => {
        const res = await request(app).put(`/api/usuarios/${userId}`).set(auth(userToken)).send({ password: 'NuevaClave123' });
        expect(res.status).toBe(200);
        expect(await login('eden@test.com', 'NuevaClave123')).toBeTruthy();
        expect(await login('eden@test.com', 'Password123')).toBeFalsy();
    });

    test('admin cambia el rol de un usuario', async () => {
        const res = await request(app).put(`/api/usuarios/${userId}`).set(auth(adminToken)).send({ rol: 'admin' });
        expect(res.status).toBe(200);
        expect(res.body.data.rol).toBe('admin');
        await request(app).put(`/api/usuarios/${userId}`).set(auth(adminToken)).send({ rol: 'usuario' });
    });

    test('admin no puede cambiarse su propio rol (400)', async () => {
        const res = await request(app).put('/api/usuarios/1').set(auth(adminToken)).send({ rol: 'usuario' });
        expect(res.status).toBe(400);
    });

    test('email duplicado al editar responde 409', async () => {
        const res = await request(app).put(`/api/usuarios/${userId}`).set(auth(adminToken)).send({ email: 'admin@test.com' });
        expect(res.status).toBe(409);
    });

    test('usuario inexistente responde 404', async () => {
        const res = await request(app).get('/api/usuarios/9999').set(auth(adminToken));
        expect(res.status).toBe(404);
    });

    test('admin no puede eliminarse a sí mismo (400)', async () => {
        const res = await request(app).delete('/api/usuarios/1').set(auth(adminToken));
        expect(res.status).toBe(400);
    });

    test('usuario normal NO puede eliminar (403)', async () => {
        const res = await request(app).delete('/api/usuarios/1').set(auth(userToken));
        expect(res.status).toBe(403);
    });
});

describe('Categorías y productos', () => {
    let catId;
    let prodId;

    test('lecturas son públicas', async () => {
        expect((await request(app).get('/api/categorias')).status).toBe(200);
        expect((await request(app).get('/api/productos')).status).toBe(200);
        expect((await request(app).get('/api/inventario')).status).toBe(200);
    });

    test('crear categoría sin token responde 401', async () => {
        const res = await request(app).post('/api/categorias').send({ nombre: 'Electrónica' });
        expect(res.status).toBe(401);
    });

    test('crear categoría con login', async () => {
        const res = await request(app).post('/api/categorias').set(auth(userToken)).send({ nombre: 'Electrónica' });
        expect(res.status).toBe(201);
        catId = res.body.data.id;
    });

    test('crear categoría sin nombre responde 400', async () => {
        const res = await request(app).post('/api/categorias').set(auth(userToken)).send({});
        expect(res.status).toBe(400);
    });

    test('crear producto con login (con stock)', async () => {
        const res = await request(app)
            .post('/api/productos')
            .set(auth(userToken))
            .send({ nombre: 'Laptop', precio: 1200, stock: 5, categoria_id: catId });
        expect(res.status).toBe(201);
        expect(res.body.data.stock).toBe(5);
        prodId = res.body.data.id;
    });

    test('crear producto con categoría inexistente responde 400', async () => {
        const res = await request(app)
            .post('/api/productos')
            .set(auth(userToken))
            .send({ nombre: 'X', precio: 1, categoria_id: 9999 });
        expect(res.status).toBe(400);
    });

    test('crear producto con precio negativo responde 400', async () => {
        const res = await request(app)
            .post('/api/productos')
            .set(auth(userToken))
            .send({ nombre: 'X', precio: -5, categoria_id: catId });
        expect(res.status).toBe(400);
    });

    test('inventario muestra producto con stock y categoría', async () => {
        const res = await request(app).get('/api/inventario');
        const item = res.body.data.find((p) => p.id === prodId);
        expect(item.categoria).toBe('Electrónica');
        expect(item.stock).toBe(5);
    });

    test('actualizar producto parcialmente', async () => {
        const res = await request(app).put(`/api/productos/${prodId}`).set(auth(userToken)).send({ stock: 10 });
        expect(res.status).toBe(200);
        expect(res.body.data.stock).toBe(10);
        expect(res.body.data.nombre).toBe('Laptop');
    });

    test('usuario normal NO puede eliminar productos (403)', async () => {
        const res = await request(app).delete(`/api/productos/${prodId}`).set(auth(userToken));
        expect(res.status).toBe(403);
    });

    test('admin elimina producto y luego da 404', async () => {
        expect((await request(app).delete(`/api/productos/${prodId}`).set(auth(adminToken))).status).toBe(200);
        expect((await request(app).get(`/api/productos/${prodId}`)).status).toBe(404);
    });

    test('vaciar BD: usuario normal 403, sin token 401, admin 200', async () => {
        expect((await request(app).delete('/api/mantenimiento/vaciar')).status).toBe(401);
        expect((await request(app).delete('/api/mantenimiento/vaciar').set(auth(userToken))).status).toBe(403);
        expect((await request(app).delete('/api/mantenimiento/vaciar').set(auth(adminToken))).status).toBe(200);
    });
});

describe('Usuario eliminado pierde acceso', () => {
    test('el token de un usuario borrado deja de funcionar', async () => {
        const reg = await request(app)
            .post('/api/auth/register')
            .send({ nombre: 'Temporal', email: 'temp@test.com', password: 'Password123' });
        const token = await login('temp@test.com', 'Password123');
        expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(200);
        expect((await request(app).delete(`/api/usuarios/${reg.body.data.id}`).set(auth(adminToken))).status).toBe(200);
        expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(401);
    });
});
