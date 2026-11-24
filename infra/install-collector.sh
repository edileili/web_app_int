#!/usr/bin/env bash
# Instala o actualiza el OpenTelemetry Collector que monitorea los recursos del servidor (RF-05).
# Uso en el EC2 (por SSH), con esta carpeta "infra" copiada al servidor:
#     bash infra/install-collector.sh
# Lee OO_URL, OO_ORG, OO_USER y OO_PASSWORD de ~/backend.env (las mismas que usa la app).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$HOME/backend.env}"
VERSION="${COLLECTOR_VERSION:-0.165.0}"

[ -f "$ENV_FILE" ] || { echo "ERROR: no existe $ENV_FILE"; exit 1; }
leer() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true; }

OO_URL="$(leer OO_URL)"; OO_ORG="$(leer OO_ORG)"; OO_USER="$(leer OO_USER)"; OO_PASSWORD="$(leer OO_PASSWORD)"
OO_ORG="${OO_ORG:-default}"
if [ -z "$OO_URL" ] || [ -z "$OO_USER" ] || [ -z "$OO_PASSWORD" ]; then
  echo "ERROR: faltan OO_URL, OO_USER u OO_PASSWORD en $ENV_FILE"; exit 1
fi
OO_URL="${OO_URL%/}"
OO_AUTH="$(printf '%s:%s' "$OO_USER" "$OO_PASSWORD" | base64 -w0)"

sudo docker rm -f otel-collector >/dev/null 2>&1 || true

# --network host y --pid host: para medir la red y los procesos del SERVIDOR y no los del contenedor
# -v /:/hostfs:ro,rslave: acceso de solo lectura al sistema de archivos del servidor
sudo docker run -d --name otel-collector --restart unless-stopped \
  --network host --pid host \
  -v "$DIR/otel-collector-config.yaml:/etc/otelcol-contrib/config.yaml:ro" \
  -v /:/hostfs:ro,rslave \
  -e OO_URL="$OO_URL" -e OO_ORG="$OO_ORG" -e OO_AUTH="$OO_AUTH" -e HOST_ROOT_PATH=/hostfs \
  "otel/opentelemetry-collector-contrib:$VERSION"

sleep 6
echo "---- últimos logs del collector ----"
sudo docker logs --tail 15 otel-collector
echo "Si no hay errores, en ~1 minuto aparecen métricas system_* en OpenObserve (Metrics)."
