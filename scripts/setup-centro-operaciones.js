#!/usr/bin/env node
/**
 * Crea en OpenObserve el dashboard "Centro de operaciones" (criterio de aceptación 3):
 * en UNA sola pantalla muestra CPU, RAM, ancho de banda y temperatura del EC2, las peticiones
 * de la API, las trazas individuales y los registros de ejecución del pipeline.
 * Además crea alertas adicionales (red, temperatura y despliegue bloqueado).
 *
 * Reutiliza los paneles de scripts/setup-openobserve.js (debe existir; no se modifica).
 *
 * Variables: OO_URL, OO_USER, OO_PASSWORD (obligatorias); OO_ORG (default "default");
 *            OO_ALERT_DESTINATION (opcional: destino de alertas a usar);
 *            UMBRAL_RED_MBPS (opcional, default 100)
 * Uso: node scripts/setup-centro-operaciones.js [--solo dashboard|alertas] [--force] [--dry-run]
 */
const { dashboardApi, dashboardInfra, dashboardCicd, definicionesAlertas } = require('./setup-openobserve.js');

const { OO_URL, OO_USER, OO_PASSWORD, OO_ORG = 'default', OO_ALERT_DESTINATION } = process.env;
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY = args.includes('--dry-run');
const SOLO = args.includes('--solo') ? args[args.indexOf('--solo') + 1] : null;
const UMBRAL_RED_MBPS = Number(process.env.UMBRAL_RED_MBPS || 100);

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

const clonar = (o) => JSON.parse(JSON.stringify(o));
function buscar(lista, titulo) {
    const p = lista.find((x) => x.title === titulo);
    if (!p) throw new Error(`No se encontró el panel "${titulo}" en setup-openobserve.js`);
    return clonar(p);
}
function colocar(panel, n, x, y, w, h, titulo) {
    panel.id = `Panel_ID${2000 + n}`;
    panel.layout = { x, y, w, h, i: n };
    if (titulo) panel.title = titulo;
    return panel;
}

/** Panel de temperatura: se arma a partir de un panel SQL existente (misma estructura) */
function panelTemperatura(molde, { n, titulo, tipo, sql, x, y, w, h, conSerie }) {
    const p = clonar(molde);
    const f = p.queries[0].fields;
    p.type = tipo;
    p.description = 'Sensores del servidor (script infra/temperature-agent.sh). En EC2 normalmente no hay sensores: ver INSTRUCCIONES-ETAPA4.md';
    p.config.unit = 'custom';
    p.config.unit_custom = ' °C';
    p.queries[0].query = sql;
    f.stream = 'host_temperature';
    f.stream_type = 'logs';
    const etiqueta = (c, label) => ({ ...c, label });
    if (conSerie) {
        f.x = [etiqueta(f.x[0], 'Hora')];
        f.y = [etiqueta(f.y[0], 'Temperatura (°C)')];
        f.breakdown = [etiqueta(f.breakdown[0], 'Sensor')];
    } else {
        f.x = []; f.breakdown = [];
        f.y = [etiqueta(f.y[0], 'Temperatura máxima (°C)')];
    }
    return colocar(p, n, x, y, w, h, titulo);
}

function dashboardCentro() {
    const infra = dashboardInfra().tabs[0].panels;
    const api = dashboardApi().tabs[0].panels;
    const cicd = dashboardCicd().tabs[0].panels;
    const moldeSql = cicd.find((p) => p.title === 'Ejecuciones de pruebas por resultado');

    const paneles = [
        // Fila 1: indicadores
        colocar(buscar(infra, 'CPU en uso'), 1, 0, 0, 8, 10),
        colocar(buscar(infra, 'Memoria en uso'), 2, 8, 0, 8, 10, 'Memoria RAM en uso'),
        colocar(buscar(infra, 'Disco en uso (volumen más lleno)'), 3, 16, 0, 8, 10),
        panelTemperatura(moldeSql, { n: 4, titulo: 'Temperatura máxima', tipo: 'metric', conSerie: false, x: 24, y: 0, w: 8, h: 10,
            sql: 'SELECT max(temp_c) as y_axis_1 FROM "host_temperature"' }),
        colocar(buscar(api, 'Peticiones por segundo (total)'), 5, 32, 0, 8, 10),
        colocar(buscar(api, 'Tasa de errores HTTP 4xx/5xx'), 6, 40, 0, 8, 10),
        // Fila 2: CPU y RAM
        colocar(buscar(infra, 'CPU en uso (%)'), 7, 0, 10, 24, 14, 'Consumo de CPU (%)'),
        colocar(buscar(infra, 'Memoria en uso (%)'), 8, 24, 10, 24, 14, 'Memoria RAM en uso (%)'),
        // Fila 3: ancho de banda y temperatura
        colocar(buscar(infra, 'Tráfico de red'), 9, 0, 24, 24, 14, 'Ancho de banda (bytes por segundo)'),
        panelTemperatura(moldeSql, { n: 10, titulo: 'Temperatura por sensor (°C)', tipo: 'line', conSerie: true, x: 24, y: 24, w: 24, h: 14,
            sql: 'SELECT histogram(_timestamp) as x_axis_1, sensor as breakdown_1, max(temp_c) as y_axis_1 FROM "host_temperature" GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1' }),
        // Fila 4: aplicación
        colocar(buscar(api, 'Peticiones por segundo por endpoint'), 11, 0, 38, 24, 14),
        colocar(buscar(api, 'Latencia p95 por endpoint'), 12, 24, 38, 24, 14),
        // Fila 5: pipeline (registros de ejecución)
        colocar(buscar(cicd, 'Últimas ejecuciones de pruebas'), 13, 0, 52, 48, 14, 'Pipeline: últimas ejecuciones de pruebas'),
        colocar(buscar(cicd, 'Últimos despliegues en EC2'), 14, 0, 66, 24, 14, 'Pipeline: últimos despliegues y bloqueos'),
        colocar(buscar(cicd, 'Despliegues por resultado'), 15, 24, 66, 24, 14),
        // Fila 6: trazas individuales y errores
        colocar(buscar(api, 'Peticiones más lentas (trazas, duración en µs)'), 16, 0, 80, 48, 14, 'Trazas individuales de peticiones HTTP (más lentas; duración en µs)'),
        colocar(buscar(api, 'Errores y advertencias de la aplicación (logs)'), 17, 0, 94, 48, 14)
    ];
    const d = clonar(dashboardInfra());
    d.title = 'Centro de operaciones';
    d.description = 'Vista única: CPU, RAM, ancho de banda y temperatura del EC2, peticiones y trazas de la API y registros del pipeline.';
    d.tabs = [{ tabId: 'default', name: 'General', panels: paneles }];
    d.defaultDatetimeDuration = { type: 'relative', relativeTimePeriod: '6h', startTime: null, endTime: null };
    return d;
}

const tituloDe = (d) => d.title || (d.v5 && d.v5.title) || (d.v4 && d.v4.title) || '';
const idDe = (d) => d.dashboardId || (d.v5 && d.v5.dashboardId) || (d.v4 && d.v4.dashboardId) || '';

async function crearDashboard() {
    console.log('\n== Dashboard ==');
    const def = dashboardCentro();
    if (DRY) { console.log(`  (dry-run) "${def.title}": ${def.tabs[0].panels.length} paneles`); return; }
    const lista = await llamar('GET', `/api/${OO_ORG}/dashboards`);
    if (!lista.ok) { console.error(`  No se pudo listar dashboards (${lista.status}): ${lista.texto.slice(0, 200)}`); return; }
    const previo = ((lista.json && lista.json.dashboards) || []).find((d) => tituloDe(d) === def.title);
    if (previo && !FORCE) { console.log(`  = "${def.title}" ya existe (usa --force para recrearlo)`); return; }
    if (previo) await llamar('DELETE', `/api/${OO_ORG}/dashboards/${idDe(previo)}`);
    const res = await llamar('POST', `/api/${OO_ORG}/dashboards`, def);
    if (res.ok) {
        const id = idDe(res.json || {}) || (res.json && res.json.v5 && res.json.v5.dashboardId) || '';
        console.log(`  + "${def.title}" creado${id ? ` -> ${BASE}/web/dashboards/view?dashboard=${id}&folder=default&org_identifier=${OO_ORG}` : ''}`);
    } else {
        console.error(`  ! "${def.title}" falló (${res.status}): ${res.texto.slice(0, 300)}`);
    }
}

async function elegirDestino() {
    if (OO_ALERT_DESTINATION) return OO_ALERT_DESTINATION;
    const r = await llamar('GET', `/api/${OO_ORG}/alerts/destinations`);
    const lista = Array.isArray(r.json) ? r.json : (r.json && r.json.list) || [];
    const nombres = lista.map((d) => d.name);
    return ['alertas-webhook', 'alertas-panel-local'].find((n) => nombres.includes(n)) || nombres[0] || null;
}

async function crearAlertas() {
    console.log('\n== Alertas adicionales ==');
    const destino = DRY ? 'destino' : await elegirDestino();
    if (!destino) {
        console.error('  No hay destinos de alertas. Ejecuta primero: node scripts/setup-openobserve.js --solo alertas');
        return;
    }
    const defs = definicionesAlertas([destino]);
    const molde = (nombre) => clonar(defs.find((a) => a.name === nombre));

    const red = molde('infra-cpu-alta');
    red.name = 'infra-red-alta';
    red.description = `Ancho de banda del servidor por encima de ${UMBRAL_RED_MBPS} Mbps (promedio de 5 min)`;
    red.stream_name = 'system_network_io';
    red.query_condition.promql = 'sum(rate(system_network_io[5m]))';
    red.query_condition.promql_condition.value = UMBRAL_RED_MBPS * 125000; // Mbps -> bytes/s

    const bloqueo = molde('pipeline-despliegue-fallido');
    bloqueo.name = 'pipeline-despliegue-bloqueado';
    bloqueo.description = 'Se bloqueó un despliegue porque fallaron las pruebas';
    bloqueo.query_condition.conditions[0].value = 'blocked';

    const temp = molde('pipeline-despliegue-fallido');
    temp.name = 'infra-temperatura-alta';
    temp.description = 'Temperatura del servidor por encima de 80 °C';
    temp.stream_name = 'host_temperature';
    temp.trigger_condition.silence = 30;
    temp.query_condition.conditions = [{ column: 'temp_c', operator: '>=', value: '80', ignore_case: false }];

    const nuevas = [red, bloqueo, temp];
    if (DRY) { nuevas.forEach((a) => console.log(`  (dry-run) ${a.name} [${a.stream_type}/${a.stream_name}]`)); return; }

    const existentes = ((await llamar('GET', `/api/${OO_ORG}/alerts`)).json || {}).list || [];
    for (const a of nuevas) {
        const previa = existentes.find((x) => x.name === a.name);
        if (previa && !FORCE) { console.log(`  = "${a.name}" ya existe`); continue; }
        if (previa) await llamar('DELETE', `/api/${OO_ORG}/${a.stream_name}/alerts/${a.name}?type=${a.stream_type}`);
        let res = await llamar('POST', `/api/${OO_ORG}/${a.stream_name}/alerts?type=${a.stream_type}`, a);
        if (!res.ok && [404, 405, 410].includes(res.status)) res = await llamar('POST', `/api/v2/${OO_ORG}/alerts`, a);
        if (res.ok) console.log(`  + "${a.name}" creada [${a.stream_type}/${a.stream_name}]`);
        else console.error(`  ! "${a.name}" falló (${res.status}): ${res.texto.slice(0, 200)}${a.stream_name === 'host_temperature' ? ' (el stream host_temperature existe solo si el servidor tiene sensores y corre infra/temperature-agent.sh)' : ''}`);
    }
}

(async () => {
    if (!DRY && (!OO_URL || !OO_USER || !OO_PASSWORD)) { console.error('Faltan OO_URL, OO_USER y/o OO_PASSWORD.'); process.exit(1); }
    if (!SOLO || SOLO === 'dashboard') await crearDashboard();
    if (!SOLO || SOLO === 'alertas') await crearAlertas();
})().catch((e) => { console.error(e); process.exit(1); });
