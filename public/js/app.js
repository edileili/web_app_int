/* Utilidades compartidas por todas las páginas */
const API = '/api';

const Auth = {
    get token() { return localStorage.getItem('token'); },
    get usuario() {
        try { return JSON.parse(localStorage.getItem('usuario')); } catch (e) { return null; }
    },
    get esAdmin() { const u = this.usuario; return !!u && u.rol === 'admin'; },
    get logueado() { return !!this.token && !!this.usuario; },
    guardar(token, usuario) {
        localStorage.setItem('token', token);
        localStorage.setItem('usuario', JSON.stringify(usuario));
    },
    limpiar() {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
    }
};

/** Llama a la API. Lanza Error con el mensaje del backend si la respuesta no es 2xx. */
async function api(ruta, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (Auth.token) headers.Authorization = `Bearer ${Auth.token}`;
    const res = await fetch(API + ruta, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
    let json = {};
    try { json = await res.json(); } catch (e) { /* respuesta sin cuerpo */ }

    // Sesión expirada o usuario eliminado: volver al login
    if (res.status === 401 && Auth.token && !ruta.startsWith('/auth/login')) {
        Auth.limpiar();
        window.location.href = '/login.html?expirada=1';
        throw new Error('Sesión expirada');
    }
    if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
    return json.data !== undefined ? json.data : json;
}

function escapeHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function mostrarMensaje(elemento, texto) {
    elemento.textContent = texto;
    elemento.classList.remove('oculto');
}
function ocultarMensaje(elemento) {
    elemento.textContent = '';
    elemento.classList.add('oculto');
}

function requerirLogin() {
    if (!Auth.logueado) { window.location.href = '/login.html'; return false; }
    return true;
}

/** Modal de confirmación propio (más fácil de probar con Playwright que window.confirm) */
function confirmar(texto) {
    return new Promise((resolve) => {
        const fondo = document.createElement('div');
        fondo.className = 'modal-fondo';
        fondo.id = 'modal-confirmar';
        fondo.innerHTML = `
            <div class="modal" role="dialog" aria-modal="true">
                <p id="modal-texto">${escapeHtml(texto)}</p>
                <div class="fila-botones">
                    <button id="modal-aceptar" class="peligro">Aceptar</button>
                    <button id="modal-cancelar" class="secundario">Cancelar</button>
                </div>
            </div>`;
        document.body.appendChild(fondo);
        const cerrar = (valor) => { fondo.remove(); resolve(valor); };
        fondo.querySelector('#modal-aceptar').addEventListener('click', () => cerrar(true));
        fondo.querySelector('#modal-cancelar').addEventListener('click', () => cerrar(false));
    });
}

function renderNavbar() {
    const nav = document.getElementById('navbar');
    if (!nav) return;
    const actual = window.location.pathname;
    const link = (id, href, texto) =>
        `<a id="${id}" href="${href}" class="${actual === href ? 'activo' : ''}">${texto}</a>`;

    let html = '<span class="marca" id="nav-marca">Inventario</span>';
    html += link('nav-productos', '/productos.html', 'Productos');
    if (Auth.logueado) html += link('nav-gestion', '/gestion-productos.html', 'Gestión de productos');
    if (Auth.esAdmin) html += link('nav-usuarios', '/usuarios.html', 'Usuarios');

    if (Auth.logueado) {
        const u = Auth.usuario;
        html += `<span class="usuario-info" id="nav-usuario">${escapeHtml(u.nombre)} (<span id="nav-rol">${escapeHtml(u.rol)}</span>)</span>`;
        html += '<button id="nav-logout" class="secundario chico">Cerrar sesión</button>';
    } else {
        html += link('nav-login', '/login.html', 'Iniciar sesión');
    }
    nav.className = 'navbar';
    nav.innerHTML = html;

    const salir = document.getElementById('nav-logout');
    if (salir) salir.addEventListener('click', () => {
        Auth.limpiar();
        window.location.href = '/login.html';
    });
}

document.addEventListener('DOMContentLoaded', renderNavbar);
