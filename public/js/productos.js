(function () {
    const body = document.getElementById('productos-body');
    const vacio = document.getElementById('productos-vacio');
    const total = document.getElementById('productos-total');
    const error = document.getElementById('productos-error');
    const buscar = document.getElementById('buscar-producto');
    const filtro = document.getElementById('filtro-categoria');
    let inventario = [];

    const moneda = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    function pintar() {
        const texto = buscar.value.trim().toLowerCase();
        const cat = filtro.value;
        const lista = inventario.filter((p) =>
            p.nombre.toLowerCase().includes(texto) && (!cat || p.categoria === cat));

        body.innerHTML = lista.map((p) => `
            <tr id="producto-fila-${p.id}" data-id="${p.id}">
                <td>${p.id}</td>
                <td class="col-nombre">${escapeHtml(p.nombre)}</td>
                <td class="col-precio">${moneda(p.precio)}</td>
                <td class="col-stock">${p.stock}</td>
                <td class="col-categoria">${escapeHtml(p.categoria || 'Sin categoría')}</td>
            </tr>`).join('');
        vacio.classList.toggle('oculto', lista.length > 0);
        total.textContent = `Total: ${lista.length}`;
    }

    async function cargar() {
        ocultarMensaje(error);
        try {
            inventario = await api('/inventario');
            const categorias = [...new Set(inventario.map((p) => p.categoria).filter(Boolean))].sort();
            filtro.innerHTML = '<option value="">Todas las categorías</option>' +
                categorias.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
            pintar();
        } catch (err) {
            mostrarMensaje(error, err.message);
        }
    }

    buscar.addEventListener('input', pintar);
    filtro.addEventListener('change', pintar);
    cargar();
})();
