# Despliegue productivo

Guía para publicar Maxi Kiosco 24/7 en:

- Un VPS con Ubuntu.
- Una máquina virtual Ubuntu dentro de Proxmox.
- Un servidor local con salida a Internet mediante Cloudflare Tunnel.

La aplicación escucha internamente en el puerto `5050` y utiliza PostgreSQL 16.

## Arquitectura recomendada

```text
Usuarios
   │ HTTPS
   ▼
Cloudflare DNS / Tunnel
   │
   ▼
Ubuntu (VPS o VM en Proxmox)
   ├── Docker Compose
   │   ├── app: Node.js + Express, puerto interno 5050
   │   └── db: PostgreSQL 16, solo red interna
   └── Volumen persistente de PostgreSQL
```

Para una instalación local, Cloudflare Tunnel evita abrir puertos entrantes en el router. Para un VPS también se puede usar un túnel o un reverse proxy como Nginx/Caddy.

## Requisitos del servidor

Recomendado:

- Ubuntu Server 22.04 LTS o 24.04 LTS.
- 2 vCPU.
- 2 GB de RAM como mínimo; 4 GB recomendado.
- 20 GB de disco SSD como mínimo.
- IP fija o Cloudflare Tunnel.
- Usuario administrativo con `sudo`.
- Docker Engine y Docker Compose Plugin.

## 1. Preparar Ubuntu

Actualizar el sistema:

```bash
sudo apt update
sudo apt upgrade -y
```

Instalar Docker siguiendo la documentación oficial para la versión de Ubuntu elegida. Verificar:

```bash
docker --version
docker compose version
```

Agregar el usuario de despliegue al grupo Docker y volver a iniciar sesión:

```bash
sudo usermod -aG docker "$USER"
```

## 2. Descargar el proyecto

```bash
sudo mkdir -p /opt/facturador-arca
sudo chown "$USER":"$USER" /opt/facturador-arca
git clone https://github.com/USUARIO/REPOSITORIO.git /opt/facturador-arca
cd /opt/facturador-arca
```

Usar una versión etiquetada o un commit revisado, no una rama de desarrollo:

```bash
git checkout v1.0.0
```

Si todavía no hay tags, usar el commit que haya sido probado.

## 3. Preparar secretos

No usar en producción los valores que actualmente aparecen como ejemplo en `docker-compose.yml`.

Generar una clave JWT:

```bash
openssl rand -base64 48
```

Crear un archivo de variables local con permisos restringidos:

```bash
touch .env.production
chmod 600 .env.production
```

Contenido recomendado:

```dotenv
PORT=5050
DATABASE_URL=postgresql://USUARIO_DB:CONTRASENA_DB@db:5432/facturador_arca?schema=public
SECRET_KEY=PEGAR_AQUI_UNA_CLAVE_ALEATORIA_LARGA

POSTGRES_USER=arca_user
POSTGRES_PASSWORD=CONTRASENA_POSTGRES_LARGA
POSTGRES_DB=facturador_arca

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=usuario@example.com
SMTP_PASS=CONTRASENA_O_APP_PASSWORD
```

El archivo `.env.production` no debe estar versionado ni enviado a GitHub.

El archivo Compose de este proyecto lee estas variables desde `.env` o desde el archivo indicado con `--env-file`.

## 4. Ajustar Docker Compose

Antes de desplegar, revisar `docker-compose.yml` y aplicar como mínimo estas medidas:

1. Usar una contraseña PostgreSQL larga y aleatoria.
2. Usar una `SECRET_KEY` aleatoria y privada.
3. Cargar los valores desde un archivo local protegido o un gestor de secretos.
4. Quitar la publicación pública del puerto PostgreSQL:

```yaml
db:
  # No usar ports en producción.
  # La aplicación accede por el nombre de servicio "db".
```

5. Mantener publicado únicamente el puerto de la aplicación si se accede mediante reverse proxy. Con Cloudflare Tunnel se puede mantener el puerto accesible solo en `localhost`.

Ejemplo conceptual de configuración de producción:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  app:
    build: .
    environment:
      PORT: 5050
      DATABASE_URL: ${DATABASE_URL}
      SECRET_KEY: ${SECRET_KEY}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
    ports:
      - "127.0.0.1:5050:5050"
    depends_on:
      - db
    restart: unless-stopped
```

No copiar este bloque sin revisar la interpolación de variables y el nombre del archivo que se usará con Compose.

## 5. Primer arranque

```bash
cd /opt/facturador-arca
docker compose --env-file .env.production up -d --build
docker compose ps
docker compose logs --tail=100 app
```

La aplicación debe mostrar en los logs que Prisma sincronizó el esquema y que Node escucha en el puerto `5050`.

Probar desde el servidor:

```bash
curl -I http://127.0.0.1:5050
```

## 6. Datos iniciales y usuario propietario

El archivo `seed.sql` contiene datos de demostración. No ejecutarlo automáticamente en una base que ya tenga información.

Para una instalación nueva, revisar el archivo antes de usarlo:

```bash
docker compose exec -T db psql \
  -U arca_user \
  -d facturador_arca < seed.sql
```

La aplicación actual incluye una compatibilidad de demostración que acepta la contraseña `admin123` para el usuario demo. Antes de publicar:

- Cambiar la contraseña del propietario.
- Eliminar esa compatibilidad del código.
- Crear un usuario propietario con una contraseña fuerte.
- Confirmar que no existen usuarios demo.

No publicar el sistema mientras la contraseña de demostración siga activa.

## 7. Publicar con Cloudflare Tunnel

### Crear el túnel

Instalar `cloudflared` en el host Ubuntu siguiendo la documentación oficial de Cloudflare y autenticarlo:

```bash
cloudflared tunnel login
cloudflared tunnel create facturador-arca
```

Crear la configuración:

```bash
sudo mkdir -p /etc/cloudflared
sudo nano /etc/cloudflared/config.yml
```

Ejemplo:

```yaml
tunnel: UUID_DEL_TUNNEL
credentials-file: /etc/cloudflared/UUID_DEL_TUNNEL.json

ingress:
  - hostname: pos.ejemplo.com
    service: http://127.0.0.1:5050
  - service: http_status:404
```

Crear el DNS del túnel:

```bash
cloudflared tunnel route dns facturador-arca pos.ejemplo.com
```

Probar y dejar el túnel como servicio:

```bash
cloudflared tunnel --config /etc/cloudflared/config.yml run facturador-arca
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

En Cloudflare:

- Usar el subdominio elegido, por ejemplo `pos.ejemplo.com`.
- Mantener SSL/TLS en modo **Full** o **Full (strict)** cuando corresponda.
- Activar protección contra bots y reglas de acceso si el POS no debe ser público.
- Restringir el acceso mediante Cloudflare Access, VPN o una lista de usuarios si es una aplicación privada.

Con Tunnel no es necesario abrir los puertos `80` o `443` del router. El puerto `5432` nunca debe publicarse a Internet.

## 8. Alternativa con Nginx en un VPS

Si se usa IP pública y reverse proxy en lugar de Tunnel:

- Abrir únicamente `80` y `443` en el firewall.
- Mantener Node escuchando en `127.0.0.1:5050`.
- No abrir `5432`.
- Emitir TLS con Certbot o usar Caddy.
- Redirigir HTTP a HTTPS.

Ejemplo conceptual:

```nginx
server {
    listen 443 ssl;
    server_name pos.ejemplo.com;

    location / {
        proxy_pass http://127.0.0.1:5050;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 9. Backups de PostgreSQL

Realizar backups diarios y conservar varias generaciones fuera del servidor.

Backup manual:

```bash
mkdir -p /opt/backups/facturador
docker compose exec -T db pg_dump \
  -U arca_user \
  -d facturador_arca \
  | gzip > /opt/backups/facturador/facturador-$(date +%F-%H%M).sql.gz
```

Verificar periódicamente que un backup pueda restaurarse en una base de prueba. Un backup que nunca fue restaurado no debe considerarse probado.

El volumen Docker no reemplaza un backup externo.

## 10. Actualizaciones

Antes de actualizar:

```bash
cd /opt/facturador-arca
docker compose exec -T db pg_dump -U arca_user -d facturador_arca \
  | gzip > /opt/backups/facturador/pre-update-$(date +%F-%H%M).sql.gz
```

Actualizar con una versión revisada:

```bash
git fetch --tags
git checkout v1.0.1
docker compose --env-file .env.production up -d --build
docker compose ps
docker compose logs --tail=100 app
```

No ejecutar `docker compose down -v` en producción: elimina el volumen y puede borrar la base de datos.

## 11. Monitoreo y operación

Comandos útiles:

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f db
docker stats
df -h
```

Configurar alertas para:

- Contenedor detenido.
- Disco con poco espacio.
- Fallos de conexión a PostgreSQL.
- Errores HTTP 5xx.
- Fallos del túnel Cloudflare.
- Backups no generados.

## 12. Lista de seguridad antes de abrir el subdominio

- [ ] Cambiar `SECRET_KEY`.
- [ ] Cambiar usuario y contraseña de PostgreSQL.
- [ ] Eliminar la contraseña demo `admin123` del código.
- [ ] Cambiar o eliminar el usuario demo.
- [ ] No publicar `5432`.
- [ ] Usar HTTPS mediante Cloudflare o reverse proxy.
- [ ] Proteger el subdominio con Cloudflare Access si corresponde.
- [ ] Configurar SMTP real y una app password.
- [ ] Configurar backups automáticos fuera del host.
- [ ] Probar restauración de un backup.
- [ ] Confirmar que ARCA esté en homologación hasta completar la integración oficial.
- [ ] Revisar límites, validación de datos, logs y control de sesiones.
- [ ] Confirmar que el almacenamiento persistente sobreviva a un reinicio.

## Limitaciones actuales

Antes de considerar el sistema fiscalmente productivo, resolver:

1. Integración real con los Web Services de ARCA.
2. Gestión segura de certificados y claves privadas ARCA.
3. Migraciones Prisma versionadas en lugar de depender únicamente de `db push`.
4. Eliminación de credenciales demo y secretos por defecto.
5. Pruebas de concurrencia para numeración de comprobantes.
6. Política formal de backup, restauración y auditoría.
7. Monitoreo y alertas.

La publicación mediante Cloudflare hace accesible la aplicación, pero no convierte por sí sola la emisión simulada en una factura fiscal válida.
