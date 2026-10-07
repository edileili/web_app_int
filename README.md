# API Node.js con Express, SQLite y Despliegue Automatizado (CI/CD)

Proyecto de desarrollo backend que implementa una API REST con Node.js y Express, utilizando una base de datos embebida (`better-sqlite3`), contenedorización con Docker, pruebas automatizadas e integración continua (CI/CD) mediante GitHub Actions hacia una instancia en la nube en AWS EC2.

---

## 1. Arquitectura del Proyecto

El sistema está estructurado bajo un flujo moderno de DevOps:
1. **Desarrollo Local:** Código en Node.js + Express utilizando `better-sqlite3` para consultas rápidas y sincrónicas.
2. **Control de Versiones:** Repositorio en GitHub.
3. **Integración Continua (CI):** GitHub Actions ejecuta automáticamente la instalación de dependencias y la batería de pruebas (`npm test`) ante cada `push` o `pull request`.
4. **Empaquetado (Docker):** Se compila una imagen optimizada utilizando Alpine Linux y herramientas de compilación nativas para SQLite, la cual se sube automáticamente a **Docker Hub**.
5. **Despliegue Continuo (CD):** GitHub Actions se conecta vía SSH (`.pem`) a una instancia **AWS EC2 (Ubuntu Server)**, descarga la última versión de la imagen y la ejecuta mapeando el puerto público `80` al puerto interno `3000`.

---

## 2. Tecnologías y Herramientas Utilizadas
* **Backend:** Node.js, Express
* **Base de Datos:** `better-sqlite3`
* **Pruebas:** Jest / Supertest
* **Contenedorización:** Docker, Docker Hub, Dockerfile multi-etapa/Alpine
* **CI/CD:** GitHub Actions
* **Infraestructura Cloud:** AWS EC2 (Ubuntu Server) con reglas de Firewall (Security Groups abiertos en puertos 22 y 80)

---

## 3. Comandos Locales (Desarrollo)

Para levantar y probar el proyecto de manera local en tu máquina:

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/edileili/web_app_int.git
   cd <nombre-de-la-carpeta>

2. **Instalar dependencias:**
    npm install

3. **Ejecutar las pruebas unitarias/integración:**
    npm test

4. **Iniciar la aplicación en modo desarrollo:**
    npm start
(La aplicación correrá por defecto en el puerto http://localhost:3000)

---

## 4. Ejecución Local con Docker
Si deseas probar la compilación y ejecución del contenedor de manera local:

1. **Construir la imagen Docker:**

    docker build -t mi-webapp:latest .

2. **Ejecutar el contenedor:**

    docker run -d --name webapp-local -p 3000:3000 mi-webapp:latest

---

## 5. Configuración de Despliegue Continuo (CI/CD)
El pipeline configurado en .github/workflows/main.yml automatiza todo el proceso. Para que funcione en tu repositorio, asegúrate de configurar los siguientes GitHub Secrets (en Settings > Secrets and variables > Actions):

    DOCKER_USERNAME: Ususario de docker hub

    DOCKER_PASSWORD: Token de acceso de Docker Hub.

    EC2_HOST: La dirección IP pública o DNS de AWS EC2.

    EC2_USER: El usuario del servidor (por defecto: ubuntu).

    EC2_SSH_KEY: El contenido completo de tu llave privada .pem descargada de AWS.