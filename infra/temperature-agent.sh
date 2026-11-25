#!/usr/bin/env bash
# Envía la temperatura del servidor a OpenObserve (stream "host_temperature") para el dashboard.
# Lee los sensores de /sys/class/thermal y /sys/class/hwmon. Si el servidor no tiene sensores
# (lo normal en instancias EC2 virtualizadas) no envía nada y lo informa.
#
# Uso (una lectura):        bash infra/temperature-agent.sh
# Cada minuto con cron:     * * * * * bash $HOME/infra/temperature-agent.sh >> $HOME/temperature-agent.log 2>&1
# Usa OO_URL, OO_ORG, OO_USER, OO_PASSWORD de ~/backend.env (o de ENV_FILE).
set -uo pipefail

ENV_FILE="${ENV_FILE:-$HOME/backend.env}"
SYSFS_ROOT="${SYSFS_ROOT:-/sys}"
leer() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- || true; }

OO_URL="${OO_URL:-$(leer OO_URL)}"; OO_ORG="${OO_ORG:-$(leer OO_ORG)}"
OO_USER="${OO_USER:-$(leer OO_USER)}"; OO_PASSWORD="${OO_PASSWORD:-$(leer OO_PASSWORD)}"
OO_ORG="${OO_ORG:-default}"
[ -n "$OO_URL" ] && [ -n "$OO_USER" ] && [ -n "$OO_PASSWORD" ] || { echo "Faltan OO_URL/OO_USER/OO_PASSWORD (ver $ENV_FILE)"; exit 1; }

registros=""
agregar() { # $1 = sensor, $2 = milésimas de grado
  local c
  c=$(awk -v v="$2" 'BEGIN { printf "%.1f", v / 1000 }')
  registros+="${registros:+,}{\"sensor\":\"$1\",\"temp_c\":$c,\"host\":\"$(hostname)\"}"
}

for d in "$SYSFS_ROOT"/class/thermal/thermal_zone*; do
  [ -r "$d/temp" ] || continue
  tipo="$(cat "$d/type" 2>/dev/null || basename "$d")"
  agregar "thermal-${tipo}" "$(cat "$d/temp")"
done
for f in "$SYSFS_ROOT"/class/hwmon/hwmon*/temp*_input; do
  [ -r "$f" ] || continue
  dir="$(dirname "$f")"; base="${f%_input}"
  nombre="$(cat "$dir/name" 2>/dev/null || basename "$dir")"
  etiqueta="$(cat "${base}_label" 2>/dev/null || basename "$base")"
  agregar "${nombre}-${etiqueta// /_}" "$(cat "$f")"
done

if [ -z "$registros" ]; then
  echo "$(date -Is) Sin sensores de temperatura en este servidor (normal en EC2). No se envía nada."
  exit 0
fi

codigo=$(curl -s -o /dev/null -w '%{http_code}' -u "$OO_USER:$OO_PASSWORD" -H 'Content-Type: application/json' \
  -X POST "${OO_URL%/}/api/${OO_ORG}/host_temperature/_json" -d "[${registros}]")
echo "$(date -Is) Temperaturas enviadas a OpenObserve (HTTP $codigo)"
