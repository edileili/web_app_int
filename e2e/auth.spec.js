const { test, expect } = require('@playwright/test');
const { ADMIN, unico, adminToken, apiLogin, bearer, loginUI, crearUsuarioApi } = require('./helpers');

test.describe('Login', () => {
    test('credenciales inválidas muestran error y no inician sesión', async ({ page }) => {
        await page.goto('/login.html');
        await page.locator('#login-email').fill(ADMIN.email);
        await page.locator('#login-password').fill('incorrecta123');
        await page.locator('#login-submit').click();
        await expect(page.locator('#login-error')).toContainText('Credenciales inválidas');
        await expect(page).toHaveURL(/login\.html/);
        expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
    });

    test('campos vacíos muestran mensaje de validación', async ({ page }) => {
        await page.goto('/login.html');
        await page.locator('#login-submit').click();
        await expect(page.locator('#login-error')).toContainText('obligatorios');
    });

    test('el admin inicia sesión y ve el menú de administración', async ({ page }) => {
        await loginUI(page, ADMIN.email, ADMIN.password);
        await expect(page.locator('#nav-rol')).toHaveText('admin');
        await expect(page.locator('#nav-usuarios')).toBeVisible();
        await expect(page.locator('#nav-gestion')).toBeVisible();
        await expect(page.locator('#nav-login')).toHaveCount(0);
    });

    test('un usuario normal inicia sesión y NO ve el menú de usuarios', async ({ page, request }) => {
        const u = await crearUsuarioApi(request, await adminToken(request));
        await loginUI(page, u.email, u.password);
        await expect(page.locator('#nav-rol')).toHaveText('usuario');
        await expect(page.locator('#nav-usuarios')).toHaveCount(0);
        await expect(page.locator('#nav-gestion')).toBeVisible();
    });

    test('cerrar sesión limpia el token y vuelve al login', async ({ page }) => {
        await loginUI(page, ADMIN.email, ADMIN.password);
        await page.locator('#nav-logout').click();
        await page.waitForURL('**/login.html');
        expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
        await page.goto('/productos.html');
        await expect(page.locator('#nav-login')).toBeVisible();
    });

    test('con sesión iniciada, /login.html redirige a productos', async ({ page }) => {
        await loginUI(page, ADMIN.email, ADMIN.password);
        await page.goto('/login.html');
        await page.waitForURL('**/productos.html');
    });
});

test.describe('Registro', () => {
    test('un registro válido crea la cuenta e inicia sesión como usuario', async ({ page }) => {
        await page.goto('/login.html');
        await page.locator('#register-nombre').fill('Persona Nueva');
        await page.locator('#register-email').fill(`${unico('reg')}@test.com`);
        await page.locator('#register-password').fill('Password123');
        await page.locator('#register-submit').click();
        await page.waitForURL('**/productos.html');
        await expect(page.locator('#nav-rol')).toHaveText('usuario');
    });

    test('un email repetido muestra error', async ({ page, request }) => {
        const u = await crearUsuarioApi(request, await adminToken(request));
        await page.goto('/login.html');
        await page.locator('#register-nombre').fill('Repetido');
        await page.locator('#register-email').fill(u.email);
        await page.locator('#register-password').fill('Password123');
        await page.locator('#register-submit').click();
        await expect(page.locator('#register-error')).toContainText('Ya existe un usuario');
    });

    test('una contraseña corta muestra error', async ({ page }) => {
        await page.goto('/login.html');
        await page.locator('#register-nombre').fill('Clave Corta');
        await page.locator('#register-email').fill(`${unico('corta')}@test.com`);
        await page.locator('#register-password').fill('123');
        await page.locator('#register-submit').click();
        await expect(page.locator('#register-error')).toContainText('al menos 8 caracteres');
    });

    test('un email inválido muestra error', async ({ page }) => {
        await page.goto('/login.html');
        await page.locator('#register-nombre').fill('Email Malo');
        await page.locator('#register-email').fill('no-es-un-email');
        await page.locator('#register-password').fill('Password123');
        await page.locator('#register-submit').click();
        await expect(page.locator('#register-error')).toContainText('email no es válido');
    });
});

test.describe('Protección de páginas', () => {
    for (const ruta of ['/gestion-productos.html', '/usuarios.html']) {
        test(`${ruta} sin sesión redirige al login`, async ({ page }) => {
            await page.goto(ruta);
            await page.waitForURL('**/login.html');
        });
    }

    test('si el usuario fue eliminado, al guardar se vuelve al login con aviso', async ({ page, request }) => {
        const token = await adminToken(request);
        const u = await crearUsuarioApi(request, token);
        await loginUI(page, u.email, u.password);
        await page.goto('/gestion-productos.html');

        // Un admin elimina al usuario mientras su sesión sigue abierta
        const res = await request.delete(`/api/usuarios/${u.id}`, { headers: bearer(token) });
        expect(res.status()).toBe(200);

        await page.locator('#categoria-nombre').fill(unico('Cat'));
        await page.locator('#categoria-guardar').click();
        await page.waitForURL('**/login.html?expirada=1');
        await expect(page.locator('#login-aviso')).toContainText('sesión expiró');
    });
});
