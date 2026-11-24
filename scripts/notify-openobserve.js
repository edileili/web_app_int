#!/usr/bin/env node
/**
 * Envía un evento JSON a OpenObserve (POST /api/{org}/{stream}/_json).
 * Sin dependencias (usa fetch de Node 18+). Nunca rompe el pipeline: si falla, solo avisa.
 *
 * Variables de entorno:
 *   OO_URL, OO_USER, OO_PASSWORD  (obligatorias; si falta alguna, se omite el envío)
 *   OO_ORG                        (opcional, por defecto "default")
 *   GITHUB_*                      (las define GitHub Actions: commit, rama, usuario, run...)
 *
 * Uso:
 *   node scripts/notify-openobserve.js --stream ci_test_runs --event test_run \
 *        --suite backend-jest --status success --results jest-results.json
 *   node scripts/notify-openobserve.js --stream ci_deployments --event deployment \
 *        --suite deploy-ec2 --status failure --extra image=edenlrs/webapp:abc123
 * 
 * Pruebas actuales
 */
const fs = require('fs');

function parseArgs(argv) {
    const args = { extra: {} };
    for (let i = 0; i < argv.length; i++) {
        const clave = argv[i];
        if (!clave.startsWith('--')) continue;
        const valor = argv[i + 1];
        i++;
        if (clave === '--extra') {
            const idx = valor.indexOf('=');
            if (idx > 0) args.extra[valor.slice(0, idx)] = valor.slice(idx + 1);
        } else {
            args[clave.slice(2)] = valor;
        }
    }
    return args;
}

/** Lee el resumen de Jest (--json) o de Playwright (reporter json) */
function resumirResultados(archivo) {
    if (!archivo || !fs.existsSync(archivo)) return {};
    try {
        const j = JSON.parse(fs.readFileSync(archivo, 'utf8'));
        if (j.numTotalTests !== undefined) {
            return {
                tests_total: j.numTotalTests,
                tests_passed: j.numPassedTests,
                tests_failed: j.numFailedTests,
                tests_skipped: j.numPendingTests
            };
        }
        if (j.stats) {
            const s = j.stats;
            return {
                tests_total: s.expected + s.unexpected + s.flaky + s.skipped,
                tests_passed: s.expected,
                tests_failed: s.unexpected,
                tests_flaky: s.flaky,
                tests_skipped: s.skipped,
                duration_ms: Math.round(s.duration)
            };
        }
    } catch (e) {
        console.warn(`No se pudo leer ${archivo}: ${e.message}`);
    }
    return {};
}

function construirEvento(args, env = process.env) {
    const sha = env.GITHUB_SHA || 'local';
    const estado = (args.status || 'unknown').toLowerCase();
    return {
        _timestamp: Date.now() * 1000, // microsegundos, formato que usa OpenObserve
        event_type: args.event || 'ci_event',
        suite: args.suite || 'general',
        status: estado,
        success: estado === 'success',
        commit_sha: sha,
        commit_short: sha.slice(0, 7),
        branch: env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || 'local',
        actor: env.GITHUB_ACTOR || 'local',
        triggering_actor: env.GITHUB_TRIGGERING_ACTOR || env.GITHUB_ACTOR || 'local',
        trigger: env.GITHUB_EVENT_NAME || 'manual',
        repository: env.GITHUB_REPOSITORY || 'local',
        workflow: env.GITHUB_WORKFLOW || 'local',
        run_id: env.GITHUB_RUN_ID || '0',
        run_attempt: env.GITHUB_RUN_ATTEMPT || '1',
        run_url: env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
            ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
            : '',
        ...resumirResultados(args.results),
        ...args.extra
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const { OO_URL, OO_USER, OO_PASSWORD } = process.env;
    const org = process.env.OO_ORG || 'default';

    if (!OO_URL || !OO_USER || !OO_PASSWORD) {
        console.log('OpenObserve: faltan OO_URL/OO_USER/OO_PASSWORD, se omite el envío.');
        return;
    }
    if (!args.stream) {
        console.warn('OpenObserve: falta --stream, se omite el envío.');
        return;
    }

    const evento = construirEvento(args);
    const url = `${OO_URL.replace(/\/+$/, '')}/api/${org}/${args.stream}/_json`;
    const auth = Buffer.from(`${OO_USER}:${OO_PASSWORD}`).toString('base64');

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
            body: JSON.stringify([evento]),
            signal: AbortSignal.timeout(15000)
        });
        const texto = await res.text();
        if (res.ok) console.log(`OpenObserve: evento enviado a "${args.stream}" (${res.status}).`);
        else console.warn(`OpenObserve respondió ${res.status}: ${texto.slice(0, 300)}`);
    } catch (e) {
        console.warn(`OpenObserve: no se pudo enviar el evento (${e.message}).`);
    }
}

if (require.main === module) main().then(() => process.exit(0));
module.exports = { parseArgs, resumirResultados, construirEvento };
