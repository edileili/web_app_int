(function () {
    if (Auth.logueado) { window.location.href = '/productos.html'; return; }

    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const aviso = document.getElementById('login-aviso');
    const regForm = document.getElementById('register-form');
    const regError = document.getElementById('register-error');
    const regExito = document.getElementById('register-exito');

    if (new URLSearchParams(window.location.search).get('expirada')) {
        mostrarMensaje(aviso, 'Tu sesión expiró. Inicia sesión de nuevo.');
    }

    async function iniciarSesion(email, password) {
        const data = await api('/auth/login', { method: 'POST', body: { email, password } });
        Auth.guardar(data.token, data.usuario);
        window.location.href = '/productos.html';
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        ocultarMensaje(loginError);
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        if (!email || !password) return mostrarMensaje(loginError, 'Email y contraseña son obligatorios');
        try {
            await iniciarSesion(email, password);
        } catch (err) {
            mostrarMensaje(loginError, err.message);
        }
    });

    regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        ocultarMensaje(regError);
        ocultarMensaje(regExito);
        const nombre = document.getElementById('register-nombre').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        try {
            await api('/auth/register', { method: 'POST', body: { nombre, email, password } });
            mostrarMensaje(regExito, 'Cuenta creada. Iniciando sesión…');
            await iniciarSesion(email, password);
        } catch (err) {
            mostrarMensaje(regError, err.message);
        }
    });
})();
