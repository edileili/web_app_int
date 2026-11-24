(function () {
    if (!requerirLogin()) return;
    if (!Auth.esAdmin) {
        document.getElementById('acceso-denegado').classList.remove('oculto');
        return;
    }
    document.getElementById('contenido-usuarios').classList.remove('oculto');

    const form = document.getElementById('usuario-form');
    const fId = document.getElementById('usuario-id');
    const fNombre = document.getElementById('usuario-nombre');
    const fEmail = document.getElementById('usuario-email');
    const fPassword = document.getElementById('usuario-password');
    const fPasswordLabel = document.getElementById('usuario-password-label');
    const fRol = document.getElementById('usuario-rol');
    const titulo = document.getElementById('usuario-form-titulo');
    const error = document.getElementById('usuario-error');
    const exito = document.getElementById('usuario-exito');
    const body = document.getElementById('usuarios-body');
    const vacio = document.getElementById('usuarios-vacio');
    let usuarios = [];

    function resetForm() {
        form.reset();
        fId.value = '';
        fRol.disabled = false;
        fPasswordLabel.textContent = 'Contraseña (mín. 8 caracteres)';
        titulo.textContent = 'Nuevo usuario';
    }

    function pintar() {
        const yo = Auth.usuario.id;
        body.innerHTML = usuarios.map((u) => `
            <tr id="usuario-fila-${u.id}" data-id="${u.id}">
                <td>${u.id}</td>
                <td class="col-nombre">${escapeHtml(u.nombre)}</td>
                <td class="col-email">${escapeHtml(u.email)}</td>
                <td class="col-rol"><span class="insignia ${u.rol === 'admin' ? 'admin' : ''}">${escapeHtml(u.rol)}</span></td>
                <td class="acciones">
                    <button id="editar-usuario-${u.id}" class="chico secundario" data-accion="editar" data-id="${u.id}">Editar</button>
                    ${u.id !== yo ? `<button id="eliminar-usuario-${u.id}" class="chico peligro" data-accion="eliminar" data-id="${u.id}">Eliminar</button>` : ''}
                </td>
            </tr>`).join('');
        vacio.classList.toggle('oculto', usuarios.length > 0);
    }

    async function cargar() {
        try {
            usuarios = await api('/usuarios');
            pintar();
        } catch (err) {
            mostrarMensaje(error, err.message);
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        ocultarMensaje(error);
        ocultarMensaje(exito);

        const editando = !!fId.value;
        const nombre = fNombre.value.trim();
        const email = fEmail.value.trim();
        const password = fPassword.value;
        const rol = fRol.value;

        if (nombre.length < 2) return mostrarMensaje(error, 'El nombre debe tener al menos 2 caracteres');
        if (!email) return mostrarMensaje(error, 'El email es obligatorio');
        if (!editando && password.length < 8) return mostrarMensaje(error, 'La contraseña debe tener al menos 8 caracteres');
        if (editando && password && password.length < 8) return mostrarMensaje(error, 'La contraseña debe tener al menos 8 caracteres');

        const body = { nombre, email };
        if (password) body.password = password;
        // No se envía el rol al editar tu propia cuenta (el backend no lo permite)
        if (!(editando && Number(fId.value) === Auth.usuario.id)) body.rol = rol;

        try {
            await api(editando ? `/usuarios/${fId.value}` : '/usuarios', {
                method: editando ? 'PUT' : 'POST',
                body
            });
            mostrarMensaje(exito, editando ? 'Usuario actualizado' : 'Usuario creado');
            resetForm();
            await cargar();
        } catch (err) {
            mostrarMensaje(error, err.message);
        }
    });

    document.getElementById('usuario-cancelar').addEventListener('click', () => {
        ocultarMensaje(error); ocultarMensaje(exito); resetForm();
    });

    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-accion]');
        if (!btn) return;
        const id = Number(btn.dataset.id);

        if (btn.dataset.accion === 'editar') {
            const u = usuarios.find((x) => x.id === id);
            fId.value = u.id; fNombre.value = u.nombre; fEmail.value = u.email;
            fPassword.value = ''; fRol.value = u.rol;
            fRol.disabled = u.id === Auth.usuario.id;
            fPasswordLabel.textContent = 'Nueva contraseña (opcional)';
            titulo.textContent = `Editar usuario #${u.id}`;
            ocultarMensaje(error); ocultarMensaje(exito);
            fNombre.focus();
        } else if (btn.dataset.accion === 'eliminar') {
            if (!(await confirmar('¿Eliminar este usuario?'))) return;
            try {
                await api(`/usuarios/${id}`, { method: 'DELETE' });
                mostrarMensaje(exito, 'Usuario eliminado');
                await cargar();
            } catch (err) { mostrarMensaje(error, err.message); }
        }
    });

    cargar();
})();
