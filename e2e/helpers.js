const { expect } = require('@playwright/test');

const ADMIN = {
    email: process.env.E2E_ADMIN_EMAIL || 'admin@test.com',
    password: process.env.E2E_ADMIN_PASSWORD || 'Admin12345'
};

/** Nombre/email único para no chocar con datos de otras pruebas */
const unico = (prefijo = 'x') => `${prefijo}-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

/** Login por la API. Devuelve { token, usuario } */
async function apiLogin(request, email, password) {
    const res = await request.post('/api/auth/login', { data: { email, password } });
    expect(res.status(), `login API de ${email}`).toBe(200);
    return (await res.json()).data;
}

async function adminToken(request) {
    return (await apiLogin(request, ADMIN.email, ADMIN.password)).token;
}

/** Login por la interfaz (usa los ids del formulario) */
async function loginUI(page, email, password) {
    await page.goto('/login.html');
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await page.locator('#login-submit').click();
    await page.waitForURL('**/productos.html');
}

/** Deja la sesión ya iniciada en el navegador sin pasar por el formulario (más rápido) */
async function sesionRapida(page, request, email, password) {
    const { token, usuario } = await apiLogin(request, email, password);
    await page.addInitScript(
        ([t, u]) => {
            localStorage.setItem('token', t);
            localStorage.setItem('usuario', JSON.stringify(u));
        },
        [token, usuario]
    );
    return { token, usuario };
}

async function crearUsuarioApi(request, token, { nombre, email, password = 'Password123', rol = 'usuario' } = {}) {
    const datos = { nombre: nombre || unico('Usr'), email: email || `${unico('u')}@test.com`, password, rol };
    const res = await request.post('/api/usuarios', { headers: bearer(token), data: datos });
    expect(res.status(), 'crear usuario por API').toBe(201);
    return { ...(await res.json()).data, password };
}

async function crearCategoriaApi(request, token, nombre = unico('Cat')) {
    const res = await request.post('/api/categorias', { headers: bearer(token), data: { nombre } });
    expect(res.status(), 'crear categoría por API').toBe(201);
    return (await res.json()).data;
}

async function crearProductoApi(request, token, { nombre = unico('Prod'), precio = 100, stock = 3, categoria_id }) {
    const res = await request.post('/api/productos', {
        headers: bearer(token),
        data: { nombre, precio, stock, categoria_id }
    });
    expect(res.status(), 'crear producto por API').toBe(201);
    return (await res.json()).data;
}

module.exports = {
    ADMIN, unico, bearer, apiLogin, adminToken, loginUI, sesionRapida,
    crearUsuarioApi, crearCategoriaApi, crearProductoApi
};
