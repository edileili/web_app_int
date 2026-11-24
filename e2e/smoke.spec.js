// Pruebas ligeras, sin credenciales. El pipeline las ejecuta contra el EC2 después de desplegar:
//   BASE_URL=http://TU_IP:3000 npx playwright test --grep @smoke
const { test, expect } = require('@playwright/test');

test('@smoke /api/health responde 200 con el listado de endpoints', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.endpoints.auth).toBeDefined();
    expect(json.version).toBeTruthy();
});

test('@smoke la raíz redirige a la vista de productos', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/productos.html');
    await expect(page.locator('#titulo-pagina')).toHaveText('Productos');
});

test('@smoke la página de login carga con sus formularios', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#register-form')).toBeVisible();
});

test('@smoke la vista de productos carga sin errores', async ({ page }) => {
    await page.goto('/productos.html');
    await expect(page.locator('#tabla-productos')).toBeVisible();
    await expect(page.locator('#productos-error')).toBeHidden();
    await expect(page.locator('#productos-total')).toContainText('Total:');
});

test('@smoke un endpoint protegido sin token responde 401', async ({ request }) => {
    const res = await request.get('/api/usuarios');
    expect(res.status()).toBe(401);
});
