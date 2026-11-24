(function () {
    if (!requerirLogin()) return;

    // Elementos: productos
    const pForm = document.getElementById('producto-form');
    const pId = document.getElementById('producto-id');
    const pNombre = document.getElementById('producto-nombre');
    const pPrecio = document.getElementById('producto-precio');
    const pStock = document.getElementById('producto-stock');
    const pCat = document.getElementById('producto-categoria');
    const pTitulo = document.getElementById('producto-form-titulo');
    const pError = document.getElementById('producto-error');
    const pExito = document.getElementById('producto-exito');
    const gBody = document.getElementById('gestion-body');
    const gVacio = document.getElementById('gestion-vacio');

    // Elementos: categorías
    const cForm = document.getElementById('categoria-form');
    const cId = document.getElementById('categoria-id');
    const cNombre = document.getElementById('categoria-nombre');
    const cError = document.getElementById('categoria-error');
    const cExito = document.getElementById('categoria-exito');
    const cBody = document.getElementById('categorias-body');
    const cVacio = document.getElementById('categorias-vacio');

    let productos = [];
    let categorias = [];
    const moneda = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const nombreCategoria = (id) => (categorias.find((c) => c.id === id) || {}).nombre || 'Sin categoría';

    // ---------- Carga ----------
    async function cargar() {
        try {
            [categorias, productos] = await Promise.all([api('/categorias'), api('/productos')]);
            pintarCategorias();
            pintarProductos();
        } catch (err) {
            mostrarMensaje(pError, err.message);
        }
    }

    function pintarCategorias() {
        const seleccion = pCat.value;
        pCat.innerHTML = '<option value="">Selecciona…</option>' +
            categorias.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
        pCat.value = seleccion;

        cBody.innerHTML = categorias.map((c) => `
            <tr id="categoria-fila-${c.id}" data-id="${c.id}">
                <td>${c.id}</td>
                <td class="col-nombre">${escapeHtml(c.nombre)}</td>
                <td class="acciones">
                    <button id="editar-categoria-${c.id}" class="chico secundario" data-accion="editar-categoria" data-id="${c.id}">Editar</button>
                    ${Auth.esAdmin ? `<button id="eliminar-categoria-${c.id}" class="chico peligro" data-accion="eliminar-categoria" data-id="${c.id}">Eliminar</button>` : ''}
                </td>
            </tr>`).join('');
        cVacio.classList.toggle('oculto', categorias.length > 0);
    }

    function pintarProductos() {
        gBody.innerHTML = productos.map((p) => `
            <tr id="gestion-fila-${p.id}" data-id="${p.id}">
                <td>${p.id}</td>
                <td class="col-nombre">${escapeHtml(p.nombre)}</td>
                <td class="col-precio">${moneda(p.precio)}</td>
                <td class="col-stock">${p.stock}</td>
                <td class="col-categoria">${escapeHtml(nombreCategoria(p.categoria_id))}</td>
                <td class="acciones">
                    <button id="editar-producto-${p.id}" class="chico secundario" data-accion="editar-producto" data-id="${p.id}">Editar</button>
                    ${Auth.esAdmin ? `<button id="eliminar-producto-${p.id}" class="chico peligro" data-accion="eliminar-producto" data-id="${p.id}">Eliminar</button>` : ''}
                </td>
            </tr>`).join('');
        gVacio.classList.toggle('oculto', productos.length > 0);
    }

    // ---------- Formulario de producto ----------
    function resetProducto() {
        pForm.reset();
        pId.value = '';
        pStock.value = 0;
        pTitulo.textContent = 'Nuevo producto';
    }

    pForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        ocultarMensaje(pError);
        ocultarMensaje(pExito);

        const nombre = pNombre.value.trim();
        const precio = pPrecio.value === '' ? NaN : Number(pPrecio.value);
        const stock = pStock.value === '' ? 0 : Number(pStock.value);
        const categoria_id = pCat.value ? Number(pCat.value) : null;

        if (!nombre) return mostrarMensaje(pError, 'El nombre es obligatorio');
        if (Number.isNaN(precio) || precio < 0) return mostrarMensaje(pError, 'El precio debe ser un número mayor o igual a 0');
        if (!Number.isInteger(stock) || stock < 0) return mostrarMensaje(pError, 'El stock debe ser un entero mayor o igual a 0');
        if (!categoria_id) return mostrarMensaje(pError, 'Selecciona una categoría');

        try {
            const editando = !!pId.value;
            await api(editando ? `/productos/${pId.value}` : '/productos', {
                method: editando ? 'PUT' : 'POST',
                body: { nombre, precio, stock, categoria_id }
            });
            mostrarMensaje(pExito, editando ? 'Producto actualizado' : 'Producto creado');
            resetProducto();
            await cargar();
        } catch (err) {
            mostrarMensaje(pError, err.message);
        }
    });

    document.getElementById('producto-cancelar').addEventListener('click', () => {
        ocultarMensaje(pError); ocultarMensaje(pExito); resetProducto();
    });

    // ---------- Formulario de categoría ----------
    function resetCategoria() { cForm.reset(); cId.value = ''; }

    cForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        ocultarMensaje(cError);
        ocultarMensaje(cExito);
        const nombre = cNombre.value.trim();
        if (!nombre) return mostrarMensaje(cError, 'El nombre de la categoría es obligatorio');
        try {
            const editando = !!cId.value;
            await api(editando ? `/categorias/${cId.value}` : '/categorias', {
                method: editando ? 'PUT' : 'POST',
                body: { nombre }
            });
            mostrarMensaje(cExito, editando ? 'Categoría actualizada' : 'Categoría creada');
            resetCategoria();
            await cargar();
        } catch (err) {
            mostrarMensaje(cError, err.message);
        }
    });

    document.getElementById('categoria-cancelar').addEventListener('click', () => {
        ocultarMensaje(cError); ocultarMensaje(cExito); resetCategoria();
    });

    // ---------- Acciones de las tablas (delegación) ----------
    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-accion]');
        if (!btn) return;
        const id = Number(btn.dataset.id);

        if (btn.dataset.accion === 'editar-producto') {
            const p = productos.find((x) => x.id === id);
            pId.value = p.id; pNombre.value = p.nombre; pPrecio.value = p.precio;
            pStock.value = p.stock; pCat.value = p.categoria_id;
            pTitulo.textContent = `Editar producto #${p.id}`;
            ocultarMensaje(pError); ocultarMensaje(pExito);
            pNombre.focus();
        } else if (btn.dataset.accion === 'eliminar-producto') {
            if (!(await confirmar('¿Eliminar este producto?'))) return;
            try {
                await api(`/productos/${id}`, { method: 'DELETE' });
                mostrarMensaje(pExito, 'Producto eliminado');
                await cargar();
            } catch (err) { mostrarMensaje(pError, err.message); }
        } else if (btn.dataset.accion === 'editar-categoria') {
            const c = categorias.find((x) => x.id === id);
            cId.value = c.id; cNombre.value = c.nombre;
            ocultarMensaje(cError); ocultarMensaje(cExito);
            cNombre.focus();
        } else if (btn.dataset.accion === 'eliminar-categoria') {
            if (!(await confirmar('¿Eliminar esta categoría? También se eliminarán sus productos.'))) return;
            try {
                await api(`/categorias/${id}`, { method: 'DELETE' });
                mostrarMensaje(cExito, 'Categoría eliminada');
                await cargar();
            } catch (err) { mostrarMensaje(cError, err.message); }
        }
    });

    cargar();
})();
