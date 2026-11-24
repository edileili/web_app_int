FROM node:20-slim
WORKDIR /app

# better-sqlite3 usa binarios precompilados; estas herramientas son el respaldo si hay que compilar
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY src ./src
COPY public ./public

ENV NODE_ENV=production \
    PORT=3000 \
    TCP_PORT=6061 \
    DB_PATH=/data/database.db

VOLUME ["/data"]
EXPOSE 3000 6061
CMD ["node", "server.js"]
