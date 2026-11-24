const { test, expect } = require('@playwright/test');
const {
    ADMIN, unico, adminToken, sesionRapida, crearUsuarioApi, crearCategoriaApi, crearProductoApi
} = require('./helpers');

const filaProducto = (page, nombre) => page.locator('#gestion-body tr', { hasText: nombre });
const filaCategoria = (page, nombre) => page.locator('#categorias-body tr', { hasText: nombre });

test.describe('Gestión de categorías y productos (admin)', () => {
    test.beforeEach(async ({ page, request }) => {
        await sesionRapida(page, request, ADMIN.email, ADMIN.password);
        await page.goto('/gestion-productos.html');
    });

    test('crear una categoría la agrega a la lista y al selector de productos', async ({ page }) => {
        const nombre = unico('Cat');
        await page.locator('#categoria-nombre').fill(nombre);
        await page.locator('#categoria-guardar').click();
        await expect(page.locator('#categoria-exito')).toHaveText('Categoría creada');
        await expect(filaCategoria(page, nombre)).toBeVisible();
        await expect(page.locator('#producto-categoria')).toContainText(nombre);
    });

    test('una categoría sin nombre muestra error', async ({ page }) => {
        await page.locator('#categoria-guardar').click();
        await expect(page.locator('#categoria-error')).toContainText('obligatorio');
    });

    test('editar una categoría cambia su nombre', async ({ page }) => {
        const nombre = unico('Cat');
        const nuevo = unico('CatEditada');
        await page.locator('#categoria-nombre').fill(nombre);
        await page.locator('#categoria-guardar').click();
        await expect(filaCategoria(page, nombre)).toBeVisible();

        await filaCategoria(page, nombre).locator('button[data-accion="editar-categoria"]').click();
        await expect(page.locator('#categoria-nombre')).toHaveValue(nombre);
        await page.locator('#categoria-nombre').fill(nuevo);
        await page.locator('#categoria-guardar').click();
        await expect(page.locator('#categoria-exito')).toHaveText('Categoría actualizada');
        await expect(filaCategoria(page, nuevo)).toBeVisible();
        await expect(filaCategoria(page, nombre)).toHaveCount(0);
    });

    test('crear un producto lo muestra en el listado con sus datos', async ({ page, request }) => {
        const cat = await crearCategoriaApi(request, await adminToken(request));
        await page.reload();
        const nombre = unico('Prod');
        await page.locator('#producto-nombre').fill(nombre);
        await page.locator('#producto-precio').fill('349.5');
        await page.locator('#producto-stock').fill('12');
        await page.locator('#producto-categoria').selectOption({ label: cat.nombre });
        await page.locator('#producto-guardar').click();

        await expect(page.locator('#producto-exito')).toHaveText('Producto creado');
        const fila = filaProducto(page, nombre);
        await expect(fila.locator('.col-precio')).toContainText('349.50');
        await expect(fila.locator('.col-stock')).toHaveText('12');
        await expect(fila.locator('.col-categoria')).toHaveText(cat.nombre);
        await expect(page.locator('#producto-nombre')).toHaveValue('');
    });

    test('el formulario valida nombre, precio y categoría', async ({ page, request }) => {
        await crearCategoriaApi(request, await adminToken(request));
        await page.reload();

        await page.locator('#producto-guardar').click();
        await expect(page.locator('#producto-error')).toContainText('nombre es obligatorio');

        await page.locator('#producto-nombre').fill('Algo');
        await page.locator('#producto-guardar').click();
        await expect(page.locator('#producto-error')).toContainText('precio');

        await page.locator('#producto-precio').fill('10');
        await page.locator('#producto-guardar').click();
        await expect(page.locator('#producto-error')).toContainText('categoría');
    });

    test('editar un producto actualiza sus datos', async ({ page, request }) => {
        const token = await adminToken(request);
        const cat = await crearCategoriaApi(request, token);
        const prod = await crearProductoApi(request, token, { precio: 50, stock: 1, categoria_id: cat.id });
        await page.reload();

        await page.locator(`#editar-producto-${prod.id}`).click();
        await expect(page.locator('#producto-form-titulo')).toContainText(`#${prod.id}`);
        await expect(page.locator('#producto-nombre')).toHaveValue(prod.nombre);

        const nuevo = unico('Renombrado');
        await page.locator('#producto-nombre').fill(nuevo);
        await page.locator('#producto-stock').fill('99');
        await page.locator('#producto-guardar').click();

        await expect(page.locator('#producto-exito')).toHaveText('Producto actualizado');
        const fila = page.locator(`#gestion-fila-${prod.id}`);
        await expect(fila.locator('.col-nombre')).toHaveText(nuevo);
        await expect(fila.locator('.col-stock')).toHaveText('99');
        await expect(page.locator('#producto-form-titulo')).toHaveText('Nuevo producto');
    });

    test('cancelar la edición limpia el formulario', async ({ page, request }) => {
        const token = await adminToken(request);
        const cat = await crearCategoriaApi(request, token);
        const prod = await crearProductoApi(request, token, { categoria_id: cat.id });
        await page.reload();
        await page.locator(`#editar-producto-${prod.id}`).click();
        await page.locator('#producto-cancelar').click();
        await expect(page.locator('#producto-nombre')).toHaveValue('');
        await expect(page.locator('#producto-form-titulo')).toHaveText('Nuevo producto');
    });

    test('eliminar un producto pide confirmación y lo quita', async ({ page, request }) => {
        const token = await adminToken(request);
        const cat = await crearCategoriaApi(request, token);
        const prod = await crearProductoApi(request, token, { categoria_id: cat.id });
        await page.reload();

        await page.locator(`#eliminar-producto-${prod.id}`).click();
        await expect(page.locator('#modal-confirmar')).toBeVisible();
        await page.locator('#modal-aceptar').click();
        await expect(page.locator('#producto-exito')).toHaveText('Producto eliminado');
        await expect(page.locator(`#gestion-fila-${prod.id}`)).toHaveCount(0);
    });

    test('cancelar el modal conserva el producto', async ({ page, request }) => {
        const token = await adminToken(request);
        const cat = await crearCategoriaApi(request, token);
        const prod = await crearProductoApi(request, token, { categoria_id: cat.id });
        await page.reload();

        await page.locator(`#eliminar-producto-${prod.id}`).click();
        await page.locator('#modal-cancelar').click();
        await expect(page.locator('#modal-confirmar')).toHaveCount(0);
        await expect(page.locator(`#gestion-fila-${prod.id}`)).toBeVisible();
    });

    test('eliminar una categoría borra también sus productos', async ({ page, request }) => {
        const token = await adminToken(request);
        const cat = await crearCategoriaApi(request, token);
        const prod = await crearProductoApi(request, token, { categoria_id: cat.id });
        await page.reload();

        await page.locator(`#eliminar-categoria-${cat.id}`).click();
        await expect(page.locator('#modal-texto')).toContainText('productos');
        await page.locator('#modal-aceptar').click();
        await expect(page.locator('#categoria-exito')).toHaveText('Categoría eliminada');
        await expect(page.locator(`#categoria-fila-${cat.id}`)).toHaveCount(0);
        await expect(page.locator(`#gestion-fila-${prod.id}`)).toHaveCount(0);
    });
});

test.describe('Gestión de productos (usuario normal)', () => {
    test('puede crear y editar, pero no ve los botones de eliminar', async ({ page, request }) => {
        const token = await adminToken(request);
        const u = await crearUsuarioApi(request, token);
        const cat = await crearCategoriaApi(request, token);
        const prod = await crearProductoApi(request, token, { categoria_id: cat.id });
        await sesionRapida(page, request, u.email, u.password);
        await page.goto('/gestion-productos.html');

        await expect(page.locator(`#editar-producto-${prod.id}`)).toBeVisible();
        await expect(page.locator(`#eliminar-producto-${prod.id}`)).toHaveCount(0);
        await expect(page.locator(`#eliminar-categoria-${cat.id}`)).toHaveCount(0);

        const nombre = unico('Prod');
        await page.locator('#producto-nombre').fill(nombre);
        await page.locator('#producto-precio').fill('10');
        await page.locator('#producto-categoria').selectOption({ label: cat.nombre });
        await page.locator('#producto-guardar').click();
        await expect(page.locator('#producto-exito')).toHaveText('Producto creado');
        await expect(filaProducto(page, nombre)).toBeVisible();
    });
});
