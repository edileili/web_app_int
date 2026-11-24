'use strict';
/**
 * Instrumentación OpenTelemetry (RF-04). Se carga ANTES que la app, sin tocar server.js:
 *
 *     NODE_OPTIONS=--require /app/src/telemetry/tracing.js      (se define en ~/backend.env)
 *
 * Emite por OTLP/HTTP (protobuf) hacia OpenObserve:
 *   - Trazas:   cada petición HTTP/Express y cada consulta SQLite (spans hijos)
 *   - Métricas: latencia, volumen y errores por endpoint (http.server.request.duration),
 *               duración de consultas SQLite y métricas del proceso Node
 *   - Logs:     console.log/info/warn/error (los JSON se convierten en atributos)
 *               y un log por cada petición con método, ruta, statusCode y duración
 *
 * Variables: OO_URL, OO_USER, OO_PASSWORD (obligatorias), OO_ORG (default), OTEL_SERVICE_NAME.
 * Si faltan, la telemetría se desactiva y la app funciona igual.
 */
const util = require('util');
const { monitorEventLoopDelay } = require('perf_hooks');

const {
    OO_URL, OO_USER, OO_PASSWORD,
    OO_ORG = 'default',
    OTEL_SERVICE_NAME = 'backend-inventario',
    OTEL_METRIC_INTERVAL_MS = '15000'
} = process.env;

if (!OO_URL || !OO_USER || !OO_PASSWORD || process.env.OTEL_SDK_DISABLED === 'true') {
    console.log('[telemetry] desactivada (faltan OO_URL/OO_USER/OO_PASSWORD o OTEL_SDK_DISABLED=true)');
    module.exports = { activa: false };
    return;
}

const api = require('@opentelemetry/api');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-proto');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-proto');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');

const base = `${OO_URL.replace(/\/+$/, '')}/api/${OO_ORG}`;
const auth = `Basic ${Buffer.from(`${OO_USER}:${OO_PASSWORD}`).toString('base64')}`;
const cabeceras = (stream) => ({ Authorization: auth, 'stream-name': stream });

const sdk = new NodeSDK({
    resource: resourceFromAttributes({
        'service.name': OTEL_SERVICE_NAME,
        'service.version': process.env.npm_package_version || require('../../package.json').version,
        'deployment.environment': process.env.NODE_ENV || 'development'
    }),
    traceExporter: new OTLPTraceExporter({ url: `${base}/v1/traces`, headers: cabeceras('default') }),
    metricReaders: [
        new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics`, headers: cabeceras('default') }),
            exportIntervalMillis: Number(OTEL_METRIC_INTERVAL_MS)
        })
    ],
    logRecordProcessors: [
        new BatchLogRecordProcessor({
            exporter: new OTLPLogExporter({ url: `${base}/v1/logs`, headers: cabeceras('app_logs') })
        })
    ],
    instrumentations: [
        new HttpInstrumentation({
            // Solo se miden las rutas de la API (no los archivos estáticos del frontend)
            ignoreIncomingRequestHook: (req) => !(req.url || '').startsWith('/api'),
            // La app no hace peticiones salientes; así tampoco se miden los envíos a OpenObserve
            disableOutgoingRequestInstrumentation: true,
            // Se ejecuta al iniciar cada petición entrante; ahí se engancha el log final
            responseHook: (span, response) => registrarPeticion(span, response)
        }),
        new ExpressInstrumentation({ ignoreLayersType: ['middleware'] })
    ]
});
sdk.start();

const logger = api.logs.getLogger(OTEL_SERVICE_NAME);
const meter = api.metrics.getMeter(OTEL_SERVICE_NAME);
const tracer = api.trace.getTracer(OTEL_SERVICE_NAME);

// ---------------------------------------------------------------------------
// LOGS: console.* -> OpenTelemetry (se sigue escribiendo también en la salida estándar)
// ---------------------------------------------------------------------------
const NIVELES = {
    debug: [5, 'DEBUG'], log: [9, 'INFO'], info: [9, 'INFO'], warn: [13, 'WARN'], error: [17, 'ERROR']
};

function emitirLog(severidad, texto, atributos = {}) {
    try {
        logger.emit({
            severityNumber: severidad[0],
            severityText: severidad[1],
            body: texto,
            attributes: atributos
        });
    } catch (e) { /* la telemetría nunca debe romper la app */ }
}

for (const [metodo, severidad] of Object.entries(NIVELES)) {
    const original = console[metodo].bind(console);
    console[metodo] = (...args) => {
        original(...args);
        const texto = util.format(...args);
        let atributos = {};
        if (texto.startsWith('{')) { // logs estructurados en JSON -> atributos
            try {
                const obj = JSON.parse(texto);
                for (const [k, v] of Object.entries(obj)) {
                    atributos[k] = typeof v === 'object' ? JSON.stringify(v) : v;
                }
            } catch (e) { atributos = {}; }
        }
        emitirLog(severidad, atributos.msg ? String(atributos.msg) : texto, atributos);
    };
}

// Un log por petición: método, ruta, statusCode y duración
function registrarPeticion(span, res) {
    const request = res && res.req;
    if (!request) return;
    const inicio = process.hrtime.bigint();
    // 'close' ocurre cuando la instrumentación ya terminó de fijar la ruta final en el span
    res.once('close', () => setImmediate(() => {
        const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
        // La ruta con parámetros (/api/productos/:id) la fija la instrumentación de Express en el span
        const ruta = (span.attributes && span.attributes['http.route']) || (request.url || '').split('?')[0];
        const codigo = res.statusCode;
        const sev = codigo >= 500 ? NIVELES.error : codigo >= 400 ? NIVELES.warn : NIVELES.info;
        const ctx = api.trace.setSpan(api.context.active(), span);
        api.context.with(ctx, () => {
            emitirLog(sev, `${request.method} ${ruta} ${codigo} ${ms.toFixed(1)}ms`, {
                evento: 'peticion_http',
                'http.request.method': request.method,
                'http.route': ruta,
                'url.path': (request.url || '').split('?')[0],
                'http.response.status_code': codigo,
                duracion_ms: Number(ms.toFixed(2))
            });
        });
    }));
}

// ---------------------------------------------------------------------------
// TRAZAS + MÉTRICA de consultas a la base de datos (better-sqlite3)
// ---------------------------------------------------------------------------
const duracionDb = meter.createHistogram('db.client.operation.duration', {
    description: 'Duración de las consultas SQLite', unit: 's',
    // Rangos en segundos pensados para consultas rápidas (100 µs a 1 s)
    advice: { explicitBucketBoundaries: [0.0001, 0.00025, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1] }
});

(function instrumentarSqlite() {
    try {
        const Database = require('better-sqlite3');
        const temporal = new Database(':memory:');
        const protoStatement = Object.getPrototypeOf(temporal.prepare('SELECT 1'));
        temporal.close();

        for (const metodo of ['run', 'get', 'all']) {
            const original = protoStatement[metodo];
            if (typeof original !== 'function') continue;
            protoStatement[metodo] = function (...args) {
                const sql = this.source || '';
                const operacion = (sql.trim().split(/\s+/)[0] || 'QUERY').toUpperCase();
                return tracer.startActiveSpan(
                    `${operacion} sqlite`,
                    {
                        kind: api.SpanKind.CLIENT,
                        attributes: {
                            'db.system': 'sqlite',
                            'db.operation.name': operacion,
                            'db.statement': sql
                        }
                    },
                    (span) => {
                        const t0 = process.hrtime.bigint();
                        try {
                            return original.apply(this, args);
                        } catch (e) {
                            span.recordException(e);
                            span.setStatus({ code: api.SpanStatusCode.ERROR, message: e.message });
                            throw e;
                        } finally {
                            span.end();
                            duracionDb.record(Number(process.hrtime.bigint() - t0) / 1e9, {
                                'db.system': 'sqlite', 'db.operation.name': operacion
                            });
                        }
                    }
                );
            };
        }
    } catch (e) {
        console.warn(`[telemetry] no se pudo instrumentar SQLite: ${e.message}`);
    }
})();

// ---------------------------------------------------------------------------
// MÉTRICAS del proceso Node
// ---------------------------------------------------------------------------
const retrasoLoop = monitorEventLoopDelay({ resolution: 20 });
retrasoLoop.enable();

meter.createObservableGauge('process.memory.rss', { unit: 'By', description: 'Memoria residente del proceso' })
    .addCallback((o) => o.observe(process.memoryUsage().rss));
meter.createObservableGauge('process.memory.heap_used', { unit: 'By', description: 'Heap usado por V8' })
    .addCallback((o) => o.observe(process.memoryUsage().heapUsed));
meter.createObservableGauge('process.uptime', { unit: 's', description: 'Tiempo activo del proceso' })
    .addCallback((o) => o.observe(process.uptime()));
meter.createObservableGauge('nodejs.eventloop.delay.p99', { unit: 's', description: 'Retraso p99 del event loop' })
    .addCallback((o) => { o.observe(retrasoLoop.percentile(99) / 1e9); retrasoLoop.reset(); });

// ---------------------------------------------------------------------------
// Cierre ordenado: vacía los buffers para no perder datos al detener el contenedor
// ---------------------------------------------------------------------------
let cerrando = false;
async function cerrar(senal) {
    if (cerrando) return;
    cerrando = true;
    try { await sdk.shutdown(); } catch (e) { /* ignorar */ }
    process.exit(senal === 'SIGINT' ? 130 : 0);
}
process.once('SIGTERM', () => cerrar('SIGTERM'));
process.once('SIGINT', () => cerrar('SIGINT'));

console.log(`[telemetry] activa: servicio "${OTEL_SERVICE_NAME}" -> ${base}`);
module.exports = { activa: true };
