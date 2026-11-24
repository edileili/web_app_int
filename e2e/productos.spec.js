const { test, expect } = require('@playwright/test');
const { ADMIN, adminToken, crearCategoriaApi, crearProductoApi, sesionRapida } = require('./helpers');

test.describe('Vista de productos', () => {
    let cat;
    let producto;

    test.beforeAll(async ({ playwright }) => {
        const request = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
        const token = await adminToken(request);
        cat = await crearCategoriaApi(request, token);
        producto = await crearProductoApi(request, token, { precio: 1200, stock: 7, categoria_id: cat.id });
        await request.dispose();
    });

    test('es pública: muestra la tabla sin iniciar sesión', async ({ page }) => {
        await page.goto('/productos.html');
        await expect(page.locator('#tabla-productos')).toBeVisible();
        await expect(page.locator('#nav-login')).toBeVisible();
        await expect(page.locator('#nav-gestion')).toHaveCount(0);
    });

    test('muestra nombre, precio, stock y categoría del producto', async ({ page }) => {
        await page.goto('/productos.html');
        const fila = page.locator(`#producto-fila-${producto.id}`);
        await expect(fila.locator('.col-nombre')).toHaveText(producto.nombre);
        await expect(fila.locator('.col-precio')).toContainText('1,200.00');
        await expect(fila.locator('.col-stock')).toHaveText('7');
        await expect(fila.locator('.col-categoria')).toHaveText(cat.nombre);
    });

    test('buscar por nombre filtra la tabla', async ({ page }) => {
        await page.goto('/productos.html');
        await page.locator('#buscar-producto').fill(producto.nombre);
        await expect(page.locator('#productos-body tr')).toHaveCount(1);
        await expect(page.locator('#productos-total')).toHaveText('Total: 1');
    });

    test('buscar algo inexistente muestra el mensaje de vacío', async ({ page }) => {
        await page.goto('/productos.html');
        await page.locator('#buscar-producto').fill('zzz-no-existe-xyz');
        await expect(page.locator('#productos-vacio')).toBeVisible();
        await expect(page.locator('#productos-total')).toHaveText('Total: 0');
    });

    test('el filtro por categoría deja solo sus productos', async ({ page }) => {
        await page.goto('/productos.html');
        await page.locator('#filtro-categoria').selectOption({ label: cat.nombre });
        await expect(page.locator('#productos-body tr')).toHaveCount(1);
        await expect(page.locator(`#producto-fila-${producto.id}`)).toBeVisible();
    });

    test('con sesión, el menú muestra la gestión de productos', async ({ page, request }) => {
        await sesionRapida(page, request, ADMIN.email, ADMIN.password);
        await page.goto('/productos.html');
        await expect(page.locator('#nav-gestion')).toBeVisible();
        await expect(page.locator('#nav-usuario')).toContainText('admin');
    });
});
