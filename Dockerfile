# 1. Usar Node 22 para cumplir con el requerimiento de better-sqlite3
FROM node:22-alpine

WORKDIR /usr/src/app

# 2. Instalar herramientas necesarias para compilar módulos nativos C++
RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]