const { test, expect } = require('@playwright/test');
const { ADMIN, unico, adminToken, apiLogin, sesionRapida, crearUsuarioApi } = require('./helpers');

const fila = (page, texto) => page.locator('#usuarios-body tr', { hasText: texto });

test.describe('Usuarios: control de acceso', () => {
    test('un usuario normal ve "acceso denegado"', async ({ page, request }) => {
        const u = await crearUsuarioApi(request, await adminToken(request));
        await sesionRapida(page, request, u.email, u.password);
        await page.goto('/usuarios.html');
        await expect(page.locator('#acceso-denegado')).toBeVisible();
        await expect(page.locator('#contenido-usuarios')).toBeHidden();
    });

    test('sin sesión redirige al login', async ({ page }) => {
        await page.goto('/usuarios.html');
        await page.waitForURL('**/login.html');
    });
});

test.describe('Usuarios: CRUD (admin)', () => {
    test.beforeEach(async ({ page, request }) => {
        await sesionRapida(page, request, ADMIN.email, ADMIN.password);
        await page.goto('/usuarios.html');
        await expect(page.locator('#contenido-usuarios')).toBeVisible();
    });

    test('el listado incluye al admin sin botón para eliminarse', async ({ page }) => {
        const filaAdmin = fila(page, ADMIN.email);
        await expect(filaAdmin).toBeVisible();
        await expect(filaAdmin.locator('.col-rol')).toHaveText('admin');
        await expect(filaAdmin.locator('button[data-accion="eliminar"]')).toHaveCount(0);
    });

    test('crear un usuario lo agrega al listado y puede iniciar sesión', async ({ page, request }) => {
        const nombre = unico('Nuevo');
        const email = `${unico('nuevo')}@test.com`;
        await page.locator('#usuario-nombre').fill(nombre);
        await page.locator('#usuario-email').fill(email);
        await page.locator('#usuario-password').fill('Password123');
        await page.locator('#usuario-rol').selectOption('usuario');
        await page.locator('#usuario-guardar').click();

        await expect(page.locator('#usuario-exito')).toHaveText('Usuario creado');
        await expect(fila(page, email).locator('.col-nombre')).toHaveText(nombre);
        await expect(fila(page, email).locator('.col-rol')).toHaveText('usuario');
        const sesion = await apiLogin(request, email, 'Password123');
        expect(sesion.token).toBeTruthy();
    });

    test('crear un usuario con rol admin', async ({ page }) => {
        const email = `${unico('adm')}@test.com`;
        await page.locator('#usuario-nombre').fill('Otro Admin');
        await page.locator('#usuario-email').fill(email);
        await page.locator('#usuario-password').fill('Password123');
        await page.locator('#usuario-rol').selectOption('admin');
        await page.locator('#usuario-guardar').click();
        await expect(fila(page, email).locator('.col-rol')).toHaveText('admin');
    });

    test('valida nombre y contraseña', async ({ page }) => {
        await page.locator('#usuario-nombre').fill('A');
        await page.locator('#usuario-email').fill('a@test.com');
        await page.locator('#usuario-guardar').click();
        await expect(page.locator('#usuario-error')).toContainText('nombre');

        await page.locator('#usuario-nombre').fill('Nombre Valido');
        await page.locator('#usuario-password').fill('corta');
        await page.locator('#usuario-guardar').click();
        await expect(page.locator('#usuario-error')).toContainText('al menos 8 caracteres');
    });

    test('un email repetido muestra el error del servidor', async ({ page, request }) => {
        const existente = await crearUsuarioApi(request, await adminToken(request));
        await page.reload();
        await page.locator('#usuario-nombre').fill('Duplicado');
        await page.locator('#usuario-email').fill(existente.email);
        await page.locator('#usuario-password').fill('Password123');
        await page.locator('#usuario-guardar').click();
        await expect(page.locator('#usuario-error')).toContainText('Ya existe un usuario');
    });

    test('editar el nombre no exige cambiar la contraseña', async ({ page, request }) => {
        const u = await crearUsuarioApi(request, await adminToken(request));
        await page.reload();

        await page.locator(`#editar-usuario-${u.id}`).click();
        await expect(page.locator('#usuario-form-titulo')).toContainText(`#${u.id}`);
        await expect(page.locator('#usuario-email')).toHaveValue(u.email);

        const nuevo = unico('Editado');
        await page.locator('#usuario-nombre').fill(nuevo);
        await page.locator('#usuario-guardar').click();
        await expect(page.locator('#usuario-exito')).toHaveText('Usuario actualizado');
        await expect(page.locator(`#usuario-fila-${u.id} .col-nombre`)).toHaveText(nuevo);

        // La contraseña original sigue funcionando
        expect((await apiLogin(request, u.email, u.password)).token).toBeTruthy();
    });

    test('cambiar la contraseña desde la interfaz', async ({ page, request }) => {
        const u = await crearUsuarioApi(request, await adminToken(request));
        await page.reload();
        await page.locator(`#editar-usuario-${u.id}`).click();
        await page.locator('#usuario-password').fill('NuevaClave123');
        await page.locator('#usuario-guardar').click();
        await expect(page.locator('#usuario-exito')).toHaveText('Usuario actualizado');
        expect((await apiLogin(request, u.email, 'NuevaClave123')).token).toBeTruthy();
    });

    test('cambiar el rol de un usuario a admin', async ({ page, request }) => {
        const u = await crearUsuarioApi(request, await adminToken(request));
        await page.reload();
        await page.locator(`#editar-usuario-${u.id}`).click();
        await page.locator('#usuario-rol').selectOption('admin');
        await page.locator('#usuario-guardar').click();
        await expect(page.locator(`#usuario-fila-${u.id} .col-rol`)).toHaveText('admin');
    });

    test('al editar tu propia cuenta el rol queda bloqueado', async ({ page }) => {
        await fila(page, ADMIN.email).locator('button[data-accion="editar"]').click();
        await expect(page.locator('#usuario-rol')).toBeDisabled();
    });

    test('cancelar la edición limpia el formulario', async ({ page, request }) => {
        const u = await crearUsuarioApi(request, await adminToken(request));
        await page.reload();
        await page.locator(`#editar-usuario-${u.id}`).click();
        await page.locator('#usuario-cancelar').click();
        await expect(page.locator('#usuario-nombre')).toHaveValue('');
        await expect(page.locator('#usuario-form-titulo')).toHaveText('Nuevo usuario');
    });

    test('eliminar un usuario pide confirmación y lo quita', async ({ page, request }) => {
        const u = await crearUsuarioApi(request, await adminToken(request));
        await page.reload();
        await page.locator(`#eliminar-usuario-${u.id}`).click();
        await expect(page.locator('#modal-confirmar')).toBeVisible();
        await page.locator('#modal-aceptar').click();
        await expect(page.locator('#usuario-exito')).toHaveText('Usuario eliminado');
        await expect(page.locator(`#usuario-fila-${u.id}`)).toHaveCount(0);
    });

    test('cancelar el modal conserva al usuario', async ({ page, request }) => {
        const u = await crearUsuarioApi(request, await adminToken(request));
        await page.reload();
        await page.locator(`#eliminar-usuario-${u.id}`).click();
        await page.locator('#modal-cancelar').click();
        await expect(page.locator(`#usuario-fila-${u.id}`)).toBeVisible();
    });
});
