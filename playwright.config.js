// Configuración de Playwright.
// - Sin BASE_URL: arranca el servidor local (BD en memoria, admin de pruebas) y prueba contra él.
// - Con BASE_URL: prueba contra esa URL (por ejemplo, el EC2) y NO arranca servidor.
const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL;
const PORT = Number(process.env.E2E_PORT || 3100);

module.exports = defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    expect: { timeout: 7_000 },
    // Una sola instancia de servidor y BD compartida: se ejecuta en serie
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    forbidOnly: !!process.env.CI,
    reporter: [
        ['list'],
        ['html', { open: 'never' }],
        ['json', { outputFile: 'playwright-results.json' }]
    ],
    use: {
        baseURL: BASE_URL || `http://localhost:${PORT}`,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: BASE_URL
        ? undefined
        : {
              command: 'node server.js',
              url: `http://localhost:${PORT}/api/health`,
              reuseExistingServer: !process.env.CI,
              timeout: 30_000,
              env: {
                  NODE_ENV: 'test',
                  PORT: String(PORT),
                  TCP_PORT: String(PORT + 1),
                  DB_PATH: ':memory:',
                  JWT_SECRET: 'secreto-e2e',
                  BCRYPT_ROUNDS: '4',
                  ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL || 'admin@test.com',
                  ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD || 'Admin12345'
              }
          }
});
