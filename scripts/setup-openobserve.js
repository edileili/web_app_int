#!/usr/bin/env node
/**
 * Crea en OpenObserve (por API) los dashboards y las alertas del proyecto (RF-05, RF-06).
 * Es idempotente: lo que ya existe se omite (usa --force para recrear los dashboards).
 *
 * Variables: OO_URL, OO_USER, OO_PASSWORD  (obligatorias)
 *            OO_ORG (default "default")
 *            OO_ALERT_WEBHOOK_URL (opcional: URL a la que OpenObserve enviará las alertas)
 *
 * Uso:
 *   node scripts/setup-openobserve.js                 # dashboards + alertas
 *   node scripts/setup-openobserve.js --solo dashboards
 *   node scripts/setup-openobserve.js --solo alertas
 *   node scripts/setup-openobserve.js --force         # recrea los dashboards
 *   node scripts/setup-openobserve.js --dry-run       # muestra qué haría, sin llamar a la API
 */
const { OO_URL, OO_USER, OO_PASSWORD, OO_ORG = 'default', OO_ALERT_WEBHOOK_URL } = process.env;
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY = args.includes('--dry-run');
const SOLO = args.includes('--solo') ? args[args.indexOf('--solo') + 1] : null;

if (!DRY && (!OO_URL || !OO_USER || !OO_PASSWORD)) {
    console.error('Faltan OO_URL, OO_USER y/o OO_PASSWORD.');
    process.exit(1);
}
const BASE = (OO_URL || 'http://localhost:5080').replace(/\/+$/, '');
const AUTH = 'Basic ' + Buffer.from(`${OO_USER}:${OO_PASSWORD}`).toString('base64');

async function llamar(metodo, ruta, cuerpo) {
    const res = await fetch(`${BASE}${ruta}`, {
        method: metodo,
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: AbortSignal.timeout(20000)
    });
    const texto = await res.text();
    let json = null;
    try { json = JSON.parse(texto); } catch (e) { /* no era JSON */ }
    return { ok: res.ok, status: res.status, json, texto };
}

// ===========================================================================
// DASHBOARDS
// ===========================================================================
const campoVacio = { filterType: 'group', logicalOperator: 'AND', conditions: [] };
const col = (alias, etiqueta = alias) => ({ label: etiqueta, alias, column: alias, color: null, aggregationFunction: null, isDerived: false });
let contadorPanel = 0;

function configBase(extra = {}) {
    return {
        show_legends: true, legends_position: 'bottom', decimals: 2, line_thickness: 1.5,
        step_type: 'stepAfter', top_results_others: false, axis_border_show: false,
        label_option: { rotate: 0 }, show_symbol: false, line_interpolation: 'smooth',
        legend_width: { unit: 'px' }, base_map: { type: 'osm' }, map_type: { type: 'world' },
        map_view: { zoom: 1, lat: 0, lng: 0 }, map_symbol_style: { size: 'by_value', size_by_value: { min: 1, max: 100 }, size_fixed: 2 },
        drilldown: [], mark_line: [], override_config: [], connect_nulls: false, no_value_replacement: '',
        wrap_table_cells: false, table_transpose: false, table_dynamic_columns: false,
        color: { mode: 'palette-classic-by-series', fixedColor: ['#53ca53'], seriesBy: 'last' },
        unit: null, unit_custom: null,
        // Paso fijo para PromQL: evita que la interfaz calcule un paso de 0 y devuelva "No Data"
        step_value: '30s',
        ...extra
    };
}

/** Panel con consultas PromQL. consultas: [{ q, leyenda }] */
function panelPromql({ titulo, descripcion = '', tipo = 'line', consultas, stream, unidad, unidadCustom, pos, min, max, decimales }) {
    contadorPanel += 1;
    return {
        id: `Panel_ID${1000 + contadorPanel}`, type: tipo, title: titulo, description: descripcion,
        config: configBase({ unit: unidad || null, unit_custom: unidadCustom || null, ...(decimales !== undefined ? { decimals: decimales } : {}) }),
        queryType: 'promql',
        queries: consultas.map((c) => ({
            query: c.q, customQuery: true,
            fields: { stream, stream_type: 'metrics', x: [], y: [], z: [], breakdown: [], filter: campoVacio },
            config: { promql_legend: c.leyenda || '', layer_type: 'scatter', weight_fixed: 1, limit: 0, min: min ?? null, max: max ?? null, time_shift: [] }
        })),
        layout: { ...pos, i: contadorPanel },
        htmlContent: '', markdownContent: '', customChartContent: ''
    };
}

/** Panel con SQL personalizado. ejeX/ejeY/breakdown: alias o { alias, label }; ejeY puede ser un arreglo.
 *  Para 'table' usar columnas: ['_timestamp', 'severity', ...] */
function panelSql({ titulo, descripcion = '', tipo = 'line', sql, stream, tipoStream = 'logs', ejeX, ejeY, breakdown, columnas, unidad, unidadCustom, pos }) {
    contadorPanel += 1;
    const campo = (v) => (typeof v === 'string' ? col(v) : col(v.alias, v.label));
    const lista = (v) => (v === undefined ? [] : (Array.isArray(v) ? v : [v]).map(campo));
    const campos = tipo === 'table'
        ? { x: columnas.map((c) => col(c)), y: [], z: [], breakdown: [] }
        : { x: lista(ejeX), y: lista(ejeY), z: [], breakdown: lista(breakdown) };
    return {
        id: `Panel_ID${1000 + contadorPanel}`, type: tipo, title: titulo, description: descripcion,
        config: configBase({ unit: unidad || null, unit_custom: unidadCustom || null }),
        queryType: 'sql',
        queries: [{
            query: sql, customQuery: true,
            fields: { stream, stream_type: tipoStream, ...campos, filter: campoVacio },
            config: { promql_legend: '', layer_type: 'scatter', weight_fixed: 1, limit: 0, min: null, max: null, time_shift: [] }
        }],
        layout: { ...pos, i: contadorPanel },
        htmlContent: '', markdownContent: '', customChartContent: ''
    };
}

function dashboard(titulo, descripcion, paneles, periodo = '30m') {
    return {
        version: 5, dashboardId: '', title: titulo, description: descripcion, role: '', owner: '',
        created: new Date().toISOString(),
        tabs: [{ tabId: 'default', name: 'General', panels: paneles }],
        variables: { list: [], showDynamicFilters: false },
        defaultDatetimeDuration: { type: 'relative', relativeTimePeriod: periodo, startTime: null, endTime: null }
    };
}

// Rejilla de dashboards versión 5: 48 columnas de ancho (mitad = 24, cuarto = 12).
// Los valores de abajo se escriben en una escala de 192 y aquí se convierten.
const G = (x, y, w, h) => ({ x: x / 4, y, w: w / 4, h });

function dashboardApi() {
    contadorPanel = 0;
    const m = 'http_server_request_duration';
    const ruta = 'sum by (http_route)';
    return dashboard(
        'API - Rendimiento y errores',
        'Latencia, volumen de peticiones y errores por endpoint, consultas a la base de datos, logs y trazas (OpenTelemetry).',
        [
            panelPromql({ titulo: 'Peticiones por segundo (total)', tipo: 'metric', stream: `${m}_count`, unidad: 'custom', unidadCustom: ' req/s', decimales: 2,
                consultas: [{ q: `sum(rate(${m}_count[1m]))` }], pos: G(0, 0, 48, 7) }),
            panelPromql({ titulo: 'Tasa de errores HTTP 4xx/5xx', tipo: 'metric', stream: `${m}_count`, unidad: 'percent', decimales: 1,
                consultas: [{ q: `100 * sum(rate(${m}_count{http_response_status_code=~"[45].."}[1m])) / sum(rate(${m}_count[1m]))` }], pos: G(48, 0, 48, 7) }),
            panelPromql({ titulo: 'Latencia p95 (total)', tipo: 'metric', stream: `${m}_bucket`, unidad: 'seconds', decimales: 4,
                consultas: [{ q: `histogram_quantile(0.95, sum by (le) (rate(${m}_bucket[1m])))` }], pos: G(96, 0, 48, 7) }),
            panelPromql({ titulo: 'Latencia p99 (total)', tipo: 'metric', stream: `${m}_bucket`, unidad: 'seconds', decimales: 4,
                consultas: [{ q: `histogram_quantile(0.99, sum by (le) (rate(${m}_bucket[1m])))` }], pos: G(144, 0, 48, 7) }),

            panelPromql({ titulo: 'Peticiones por segundo por endpoint', stream: `${m}_count`, unidad: 'custom', unidadCustom: ' req/s',
                consultas: [{ q: `${ruta} (rate(${m}_count[1m]))`, leyenda: '{http_route}' }], pos: G(0, 7, 96, 14) }),
            panelPromql({ titulo: 'Latencia p95 por endpoint', stream: `${m}_bucket`, unidad: 'seconds', decimales: 4,
                consultas: [{ q: `histogram_quantile(0.95, sum by (le, http_route) (rate(${m}_bucket[1m])))`, leyenda: '{http_route}' }], pos: G(96, 7, 96, 14) }),

            panelPromql({ titulo: 'Latencia p50 / p95 / p99 (global)', stream: `${m}_bucket`, unidad: 'seconds', decimales: 4,
                consultas: [
                    { q: `histogram_quantile(0.50, sum by (le) (rate(${m}_bucket[1m])))`, leyenda: 'p50' },
                    { q: `histogram_quantile(0.95, sum by (le) (rate(${m}_bucket[1m])))`, leyenda: 'p95' },
                    { q: `histogram_quantile(0.99, sum by (le) (rate(${m}_bucket[1m])))`, leyenda: 'p99' }
                ], pos: G(0, 21, 96, 14) }),
            panelPromql({ titulo: 'Peticiones por statusCode', tipo: 'bar', stream: `${m}_count`, unidad: 'custom', unidadCustom: ' req/s',
                consultas: [{ q: 'sum by (http_response_status_code) (rate(http_server_request_duration_count[1m]))', leyenda: '{http_response_status_code}' }], pos: G(96, 21, 96, 14) }),

            panelPromql({ titulo: 'Errores HTTP (4xx/5xx) por endpoint', stream: `${m}_count`, unidad: 'custom', unidadCustom: ' err/s', decimales: 2,
                consultas: [{ q: `sum by (http_route) (rate(${m}_count{http_response_status_code=~"[45].."}[1m]))`, leyenda: '{http_route}' }], pos: G(0, 35, 96, 14) }),
            panelPromql({ titulo: 'Consultas SQLite: latencia p95 por operación', stream: 'db_client_operation_duration_bucket', unidad: 'seconds', decimales: 5,
                consultas: [{ q: 'histogram_quantile(0.95, sum by (le, db_operation_name) (rate(db_client_operation_duration_bucket[1m])))', leyenda: '{db_operation_name}' }], pos: G(96, 35, 96, 14) }),

            panelPromql({ titulo: 'Memoria del proceso Node (RSS y heap)', stream: 'process_memory_rss', unidad: 'bytes',
                consultas: [{ q: 'process_memory_rss', leyenda: 'RSS' }, { q: 'process_memory_heap_used', leyenda: 'Heap usado' }], pos: G(0, 49, 96, 12) }),
            panelPromql({ titulo: 'Retraso del event loop (p99)', stream: 'nodejs_eventloop_delay_p99', unidad: 'seconds', decimales: 4,
                consultas: [{ q: 'nodejs_eventloop_delay_p99', leyenda: 'p99' }], pos: G(96, 49, 96, 12) }),

            panelSql({ titulo: 'Errores y advertencias de la aplicación (logs)', tipo: 'table', stream: 'app_logs',
                sql: 'SELECT _timestamp, severity, body, http_route, http_response_status_code FROM "app_logs" WHERE severity IN (\'ERROR\', \'WARN\') ORDER BY _timestamp DESC LIMIT 50',
                columnas: ['_timestamp', 'severity', 'body', 'http_route', 'http_response_status_code'], pos: G(0, 61, 192, 16) }),
            panelSql({ titulo: 'Peticiones más lentas (trazas, duración en µs)', tipo: 'table', stream: 'default', tipoStream: 'traces',
                sql: 'SELECT _timestamp, operation_name, duration, trace_id FROM "default" WHERE span_kind = \'2\' ORDER BY duration DESC LIMIT 20',
                columnas: ['_timestamp', 'operation_name', 'duration', 'trace_id'], pos: G(0, 77, 192, 16) })
        ]
    );
}

function dashboardInfra() {
    contadorPanel = 0;
    const cpu = '100 * (1 - avg(system_cpu_utilization{state="idle"}))';
    const mem = '100 * system_memory_utilization{state="used"}';
    const disco = '100 * max(system_filesystem_utilization{state="used"})';
    return dashboard(
        'Infraestructura del servidor (EC2)',
        'CPU, memoria, disco, red y carga del servidor, recolectados con OpenTelemetry Collector (hostmetrics).',
        [
            panelPromql({ titulo: 'CPU en uso', tipo: 'gauge', stream: 'system_cpu_utilization', unidad: 'percent', min: 0, max: 100, decimales: 1,
                consultas: [{ q: cpu }], pos: G(0, 0, 48, 10) }),
            panelPromql({ titulo: 'Memoria en uso', tipo: 'gauge', stream: 'system_memory_utilization', unidad: 'percent', min: 0, max: 100, decimales: 1,
                consultas: [{ q: mem }], pos: G(48, 0, 48, 10) }),
            panelPromql({ titulo: 'Disco en uso (volumen más lleno)', tipo: 'gauge', stream: 'system_filesystem_utilization', unidad: 'percent', min: 0, max: 100, decimales: 1,
                consultas: [{ q: disco }], pos: G(96, 0, 48, 10) }),
            panelPromql({ titulo: 'Carga promedio (1 min)', tipo: 'metric', stream: 'system_cpu_load_average_1m', decimales: 2,
                consultas: [{ q: 'avg(system_cpu_load_average_1m)' }], pos: G(144, 0, 48, 10) }),

            panelPromql({ titulo: 'CPU en uso (%)', stream: 'system_cpu_utilization', unidad: 'percent', decimales: 1,
                consultas: [{ q: cpu, leyenda: 'CPU total' }], pos: G(0, 10, 96, 14) }),
            panelPromql({ titulo: 'Memoria en uso (%)', stream: 'system_memory_utilization', unidad: 'percent', decimales: 1,
                consultas: [{ q: mem, leyenda: 'Memoria usada' }], pos: G(96, 10, 96, 14) }),

            panelPromql({ titulo: 'Uso de disco por volumen (%)', stream: 'system_filesystem_utilization', unidad: 'percent', decimales: 1,
                consultas: [{ q: '100 * system_filesystem_utilization{state="used"}', leyenda: '{mountpoint}' }], pos: G(0, 24, 96, 14) }),
            panelPromql({ titulo: 'Tráfico de red', stream: 'system_network_io', unidad: 'custom', unidadCustom: ' B/s', decimales: 0,
                consultas: [{ q: 'sum by (direction) (rate(system_network_io[1m]))', leyenda: '{direction}' }], pos: G(96, 24, 96, 14) }),

            panelPromql({ titulo: 'Carga promedio (1, 5 y 15 min)', stream: 'system_cpu_load_average_1m', decimales: 2,
                consultas: [
                    { q: 'avg(system_cpu_load_average_1m)', leyenda: '1 min' },
                    { q: 'avg(system_cpu_load_average_5m)', leyenda: '5 min' },
                    { q: 'avg(system_cpu_load_average_15m)', leyenda: '15 min' }
                ], pos: G(0, 38, 96, 14) }),
            panelPromql({ titulo: 'Lectura/escritura de disco', stream: 'system_disk_io', unidad: 'custom', unidadCustom: ' B/s', decimales: 0,
                consultas: [{ q: 'sum by (direction) (rate(system_disk_io[1m]))', leyenda: '{direction}' }], pos: G(96, 38, 96, 14) }),

            panelPromql({ titulo: 'Procesos del sistema', stream: 'system_processes_count', decimales: 0,
                consultas: [{ q: 'sum by (status) (system_processes_count)', leyenda: '{status}' }], pos: G(0, 52, 96, 12) }),
            panelPromql({ titulo: 'Errores y descartes de red', stream: 'system_network_errors', decimales: 2,
                consultas: [
                    { q: 'sum(rate(system_network_errors[1m]))', leyenda: 'errores' },
                    { q: 'sum(rate(system_network_dropped[1m]))', leyenda: 'descartados' }
                ], pos: G(96, 52, 96, 12) })
        ]
    );
}

function dashboardCicd() {
    contadorPanel = 0;
    return dashboard(
        'CI/CD - Pruebas y despliegues',
        'Resultado de cada ejecución del pipeline (éxito/fallo, commit, rama, usuario) y despliegues en EC2.',
        [
            panelSql({ titulo: 'Ejecuciones de pruebas por resultado', tipo: 'bar', stream: 'ci_test_runs',
                sql: 'SELECT histogram(_timestamp) as x_axis_1, status as breakdown_1, count(_timestamp) as y_axis_1 FROM "ci_test_runs" GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1',
                ejeX: { alias: 'x_axis_1', label: 'Hora' }, ejeY: { alias: 'y_axis_1', label: 'Ejecuciones' }, breakdown: { alias: 'breakdown_1', label: 'Resultado' }, pos: G(0, 0, 96, 14) }),
            panelSql({ titulo: 'Despliegues por resultado', tipo: 'bar', stream: 'ci_deployments',
                sql: 'SELECT histogram(_timestamp) as x_axis_1, status as breakdown_1, count(_timestamp) as y_axis_1 FROM "ci_deployments" GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1',
                ejeX: { alias: 'x_axis_1', label: 'Hora' }, ejeY: { alias: 'y_axis_1', label: 'Despliegues' }, breakdown: { alias: 'breakdown_1', label: 'Resultado' }, pos: G(96, 0, 96, 14) }),
            panelSql({ titulo: 'Pruebas aprobadas vs fallidas por suite', tipo: 'bar', stream: 'ci_test_runs',
                sql: 'SELECT suite as x_axis_1, sum(tests_passed) as y_axis_1, sum(tests_failed) as y_axis_2 FROM "ci_test_runs" GROUP BY x_axis_1 ORDER BY x_axis_1',
                ejeX: { alias: 'x_axis_1', label: 'Suite' }, ejeY: [{ alias: 'y_axis_1', label: 'Aprobadas' }, { alias: 'y_axis_2', label: 'Fallidas' }], pos: G(0, 14, 96, 12) }),
            panelSql({ titulo: 'Ejecuciones fallidas (total)', tipo: 'metric', stream: 'ci_test_runs',
                sql: 'SELECT count(_timestamp) as y_axis_1 FROM "ci_test_runs" WHERE status = \'failure\'',
                ejeY: { alias: 'y_axis_1', label: 'Ejecuciones fallidas' }, pos: G(96, 14, 96, 12) }),
            panelSql({ titulo: 'Últimas ejecuciones de pruebas', tipo: 'table', stream: 'ci_test_runs',
                sql: 'SELECT _timestamp, suite, status, branch, actor, commit_short, tests_total, tests_passed, tests_failed, run_url FROM "ci_test_runs" ORDER BY _timestamp DESC LIMIT 30',
                columnas: ['_timestamp', 'suite', 'status', 'branch', 'actor', 'commit_short', 'tests_total', 'tests_passed', 'tests_failed', 'run_url'], pos: G(0, 26, 192, 16) }),
            panelSql({ titulo: 'Últimos despliegues en EC2', tipo: 'table', stream: 'ci_deployments',
                sql: 'SELECT _timestamp, status, branch, actor, commit_short, image, run_url FROM "ci_deployments" ORDER BY _timestamp DESC LIMIT 30',
                columnas: ['_timestamp', 'status', 'branch', 'actor', 'commit_short', 'image', 'run_url'], pos: G(0, 42, 192, 14) })
        ],
        '7d'
    );
}

function tituloDe(d) {
    return d.title || (d.v5 && d.v5.title) || (d.v4 && d.v4.title) || (d.v3 && d.v3.title) || (d.v2 && d.v2.title) || '';
}
function idDe(d) {
    return d.dashboardId || (d.v5 && d.v5.dashboardId) || (d.v4 && d.v4.dashboardId) || (d.v3 && d.v3.dashboardId) || '';
}

async function crearDashboards() {
    console.log('\n== Dashboards ==');
    const definiciones = [dashboardApi(), dashboardInfra(), dashboardCicd()];
    if (DRY) { definiciones.forEach((d) => console.log(`  (dry-run) ${d.title}: ${d.tabs[0].panels.length} paneles`)); return; }

    const lista = await llamar('GET', `/api/${OO_ORG}/dashboards`);
    if (!lista.ok) { console.error(`  No se pudo listar dashboards (${lista.status}): ${lista.texto.slice(0, 200)}`); return; }
    const existentes = (lista.json && lista.json.dashboards) || [];

    for (const def of definiciones) {
        const previo = existentes.find((d) => tituloDe(d) === def.title);
        if (previo && !FORCE) { console.log(`  = "${def.title}" ya existe (usa --force para recrearlo)`); continue; }
        if (previo && FORCE) {
            const borrado = await llamar('DELETE', `/api/${OO_ORG}/dashboards/${idDe(previo)}`);
            console.log(`  - "${def.title}" eliminado para recrearlo (${borrado.status})`);
        }
        const res = await llamar('POST', `/api/${OO_ORG}/dashboards`, def);
        if (res.ok) {
            const id = idDe(res.json || {}) || (res.json && res.json.v5 && res.json.v5.dashboardId) || '';
            console.log(`  + "${def.title}" creado${id ? ` -> ${BASE}/web/dashboards/view?dashboard=${id}&folder=default&org_identifier=${OO_ORG}` : ''}`);
        } else {
            console.error(`  ! "${def.title}" falló (${res.status}): ${res.texto.slice(0, 300)}`);
        }
    }
}


// ===========================================================================
// ALERTAS
// ===========================================================================
const PLANTILLA = 'plantilla-alertas-ci';
const DESTINO_WEBHOOK = 'alertas-webhook';
const DESTINO_PANEL = 'alertas-panel-local';

/** Definiciones: edita aquí umbrales y periodos (period = minutos analizados, frequency = cada cuántos minutos se evalúa) */
function definicionesAlertas(destinos) {
    const base = (nombre, descripcion, streamNombre, streamTipo, consulta, disparo) => ({
        name: nombre, stream_type: streamTipo, stream_name: streamNombre, is_real_time: false,
        query_condition: { multi_time_range: [], conditions: null, sql: null, promql: null, promql_condition: null, aggregation: null, vrl_function: null, ...consulta },
        trigger_condition: { period: 5, operator: '>=', threshold: 1, frequency: 1, cron: '', frequency_type: 'minutes', silence: 10, ...disparo },
        destinations: destinos, context_attributes: {}, row_template: '', description: descripcion, enabled: true
    });
    const condiciones = (lista) => ({ type: 'custom', conditions: lista.map((c) => ({ ignore_case: false, ...c })) });
    const promql = (q, operador, valor) => ({ type: 'promql', promql: q, promql_condition: { column: 'value', operator: operador, value: valor, ignore_case: false } });
    const m = 'http_server_request_duration_count';

    return [
        base('api-errores-5xx', 'La API respondió con errores 5xx en los últimos 5 minutos', 'app_logs', 'logs',
            condiciones([{ column: 'http_response_status_code', operator: '>=', value: '500' }]), { period: 5, threshold: 1 }),
        base('api-excepciones-sistema', 'La aplicación registró logs de nivel ERROR (excepciones)', 'app_logs', 'logs',
            condiciones([{ column: 'severity', operator: '=', value: 'ERROR' }]), { period: 5, threshold: 1 }),
        base('api-latencia-alta', 'Cinco o más peticiones tardaron 1 segundo o más en 5 minutos', 'app_logs', 'logs',
            condiciones([{ column: 'duracion_ms', operator: '>=', value: '1000' }]), { period: 5, threshold: 5 }),
        base('api-tasa-errores-alta', 'Más del 25 % de las peticiones terminaron en 4xx/5xx (promedio de 5 minutos)', m, 'metrics',
            promql(`100 * sum(rate(${m}{http_response_status_code=~"[45].."}[5m])) / sum(rate(${m}[5m]))`, '>=', 25), { period: 5, threshold: 1 }),
        base('infra-cpu-alta', 'CPU del servidor por encima del 85 %', 'system_cpu_utilization', 'metrics',
            promql('100 * (1 - avg(system_cpu_utilization{state="idle"}))', '>=', 85), { period: 5, threshold: 1 }),
        base('infra-memoria-alta', 'Memoria del servidor por encima del 85 %', 'system_memory_utilization', 'metrics',
            promql('100 * system_memory_utilization{state="used"}', '>=', 85), { period: 5, threshold: 1 }),
        base('infra-disco-lleno', 'Algún volumen del servidor por encima del 85 % de uso', 'system_filesystem_utilization', 'metrics',
            promql('100 * max(system_filesystem_utilization{state="used"})', '>=', 85), { period: 5, threshold: 1 }),
        base('pipeline-pruebas-fallidas', 'Falló una suite de pruebas en el pipeline', 'ci_test_runs', 'logs',
            condiciones([{ column: 'status', operator: '=', value: 'failure' }]), { period: 10, threshold: 1, silence: 5 }),
        base('pipeline-despliegue-fallido', 'Falló un despliegue en el EC2', 'ci_deployments', 'logs',
            condiciones([{ column: 'status', operator: '=', value: 'failure' }]), { period: 10, threshold: 1, silence: 5 })
    ];
}

async function asegurarDestino() {
    const existente = process.env.OO_ALERT_DESTINATION;
    if (existente) { console.log(`  Destino existente: "${existente}"`); return [existente]; }

    const webhook = OO_ALERT_WEBHOOK_URL;
    const nombre = webhook ? DESTINO_WEBHOOK : DESTINO_PANEL;
    const url = webhook || `${BASE}/healthz`;
    if (DRY) { console.log(`  (dry-run) destino "${nombre}" -> ${url}`); return [nombre]; }

    const plantilla = await llamar('POST', `/api/${OO_ORG}/alerts/templates`, {
        name: PLANTILLA, isDefault: false, type: 'http',
        body: JSON.stringify({
            text: 'ALERTA {alert_name} ({stream_name}): {alert_count} eventos en {alert_period} min. {rows}',
            content: 'ALERTA {alert_name} ({stream_name}): {alert_count} eventos en {alert_period} min. {rows}'
        })
    });
    console.log(`  plantilla "${PLANTILLA}": ${plantilla.ok ? 'lista' : `${plantilla.status} ${plantilla.texto.slice(0, 120)}`}`);

    const destino = await llamar('POST', `/api/${OO_ORG}/alerts/destinations`, {
        name: nombre, url, method: webhook ? 'post' : 'get', skip_tls_verify: false, template: PLANTILLA, headers: {}
    });
    console.log(`  destino "${nombre}" -> ${webhook ? 'tu webhook' : 'marcador de posición (healthz de OpenObserve)'}: ${destino.ok ? 'listo' : `${destino.status} ${destino.texto.slice(0, 120)}`}`);
    if (!webhook) console.log('  ! Sin OO_ALERT_WEBHOOK_URL las alertas se evalúan y quedan registradas, pero no notifican a nadie. Cambia el destino en Alerts > Destinations.');
    return [nombre];
}

async function crearAlertas() {
    console.log('\n== Alertas ==');
    const destinos = await asegurarDestino();
    const definiciones = definicionesAlertas(destinos);
    if (DRY) { definiciones.forEach((a) => console.log(`  (dry-run) ${a.name} [${a.stream_type}/${a.stream_name}]`)); return; }

    const lista = await llamar('GET', `/api/${OO_ORG}/alerts`);
    const existentes = (lista.json && lista.json.list) || [];
    const manuales = [];

    for (const a of definiciones) {
        const previa = existentes.find((x) => x.name === a.name);
        if (previa && !FORCE) { console.log(`  = "${a.name}" ya existe (usa --force para recrearla)`); continue; }
        if (previa && FORCE) {
            await llamar('DELETE', `/api/${OO_ORG}/${a.stream_name}/alerts/${a.name}?type=${a.stream_type}`);
        }
        let res = await llamar('POST', `/api/${OO_ORG}/${a.stream_name}/alerts?type=${a.stream_type}`, a);
        // Versiones recientes de OpenObserve pueden exponer la API v2
        if (!res.ok && [404, 405, 410].includes(res.status)) res = await llamar('POST', `/api/v2/${OO_ORG}/alerts`, a);
        if (res.ok) console.log(`  + "${a.name}" creada [${a.stream_type}/${a.stream_name}]`);
        else { console.error(`  ! "${a.name}" falló (${res.status}): ${res.texto.slice(0, 200)}`); manuales.push(a); }
    }
    if (manuales.length) {
        console.log('\n  Estas alertas no se pudieron crear por API. Si el motivo es que el stream aún no existe (los de ci_* se crean con el primer evento del pipeline),');
        console.log('  ejecuta el pipeline una vez y vuelve a correr este script. Si no, créalas desde Alerts > Add Alert:');
        manuales.forEach((a) => console.log(`   - ${a.name}: ${a.stream_type}/${a.stream_name} | ${a.query_condition.type === 'promql' ? a.query_condition.promql + ' ' + a.query_condition.promql_condition.operator + ' ' + a.query_condition.promql_condition.value : JSON.stringify(a.query_condition.conditions)} | cada ${a.trigger_condition.frequency} min, ventana ${a.trigger_condition.period} min, umbral ${a.trigger_condition.operator} ${a.trigger_condition.threshold}`));
    }
}

module.exports = { dashboardApi, dashboardInfra, dashboardCicd, definicionesAlertas };
if (require.main === module) {
    (async () => {
        if (!SOLO || SOLO === 'dashboards') await crearDashboards();
        if (!SOLO || SOLO === 'alertas') await crearAlertas();
    })().catch((e) => { console.error(e); process.exit(1); });
}
