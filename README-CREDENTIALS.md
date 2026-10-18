# Gestión profesional de credenciales

Este proyecto usa variables de entorno para no guardar secretos dentro del código fuente. Las credenciales reales nunca deben escribirse en `README.md`, `docker-compose.yml`, `seed.sql`, capturas de pantalla ni commits de Git.

## Archivos correctos

| Archivo | ¿Se versiona? | Uso |
|---|---:|---|
| `.env.example` | Sí | Plantilla sin secretos reales |
| `.env` | No | Desarrollo local |
| `.env.production` | No | Servidor productivo |
| GitHub Actions Secrets | No | Secretos de CI/CD |
| Gestor externo de secretos | No | Recomendado para equipos y producción |

El `.gitignore` del proyecto excluye `.env` y `.env.*`, pero permite versionar `.env.example`.

## Configuración local

Desde la raíz del proyecto:

```bash
cp .env.example .env
```

Editar `.env` y cambiar como mínimo:

```dotenv
POSTGRES_PASSWORD=una_clave_larga_y_aleatoria
SECRET_KEY=otra_clave_larga_y_aleatoria
```

Generar secretos seguros:

```bash
openssl rand -base64 48
```

Levantar la aplicación:

```bash
docker compose up -d --build
```

Docker Compose carga automáticamente el archivo `.env` de la raíz. No hace falta copiarlo dentro de la imagen ni montarlo como volumen.

## Variables disponibles

```dotenv
PORT=5050
POSTGRES_USER=arca_user
POSTGRES_PASSWORD=...
POSTGRES_DB=facturador_arca
DATABASE_URL=postgresql://arca_user:...@db:5432/facturador_arca?schema=public
SECRET_KEY=...
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=usuario@example.com
SMTP_PASS=...
```

### Reglas importantes

- `SECRET_KEY` firma los tokens JWT. Si se cambia, las sesiones existentes quedan inválidas.
- `POSTGRES_PASSWORD` protege la base de datos.
- `DATABASE_URL` debe coincidir con el usuario, contraseña, base y servicio de PostgreSQL.
- Las contraseñas SMTP deben ser app passwords cuando el proveedor lo requiera.
- No usar la misma contraseña para PostgreSQL, SMTP y JWT.
- No usar valores de ejemplo en producción.

## Docker Compose y variables

La configuración debe referenciar variables, no valores secretos literales:

```yaml
services:
  db:
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}

  app:
    environment:
      PORT: ${PORT}
      DATABASE_URL: ${DATABASE_URL}
      SECRET_KEY: ${SECRET_KEY}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
```

Comprobar la configuración sin mostrar secretos:

```bash
docker compose config --quiet
```

No usar `docker compose config` sin cuidado en un entorno donde la salida pueda quedar registrada: la configuración expandida puede contener secretos.

## Producción en VPS o Proxmox

Crear el archivo únicamente en el servidor:

```bash
touch .env.production
chmod 600 .env.production
nano .env.production
```

Iniciar usando ese archivo:

```bash
docker compose --env-file .env.production up -d --build
```

No subir `.env.production` a GitHub. No enviarlo por correo ni guardarlo en tickets o chats.

En una organización, es preferible usar un gestor de secretos como:

- Docker Secrets.
- 1Password Secrets Automation.
- Bitwarden Secrets Manager.
- HashiCorp Vault.
- Infisical.
- AWS Secrets Manager, Azure Key Vault o Google Secret Manager.

Para una instalación individual, un archivo con permisos `600`, disco cifrado, acceso SSH con clave y backups protegidos es un mínimo razonable.

## GitHub: forma profesional

### Desarrollo y repositorio

1. Versionar `.env.example` sin valores reales.
2. Ignorar `.env`, `.env.production` y cualquier archivo de backup.
3. Revisar los cambios antes de cada commit:

```bash
git status
git diff -- . ':!.env*'
```

4. Activar secret scanning y push protection en:

```text
GitHub → Settings → Code security and analysis
```

5. Activar Dependabot para actualizaciones de dependencias.

### GitHub Actions

Crear secretos en:

```text
Repository → Settings → Secrets and variables → Actions → New repository secret
```

Ejemplos:

```text
PRODUCTION_HOST
PRODUCTION_SSH_PRIVATE_KEY
PRODUCTION_SSH_USER
PRODUCTION_ENV_FILE
```

La clave privada SSH debe guardarse como secret multilinea. El contenido de `.env.production` puede administrarse en un gestor externo; si se guarda como secret de GitHub, limitar el acceso al entorno `production`, exigir aprobación y nunca imprimirlo en logs.

Usar environments de GitHub:

```text
Settings → Environments → production
```

Configurar reviewers obligatorios y restringir qué ramas pueden desplegar.

Nunca hacer esto en un workflow:

```yaml
run: echo "${{ secrets.PRODUCTION_ENV_FILE }}"
```

Los secretos no deben aparecer en logs, artefactos, releases ni mensajes de error.

## Qué hacer si una credencial se filtra

Tratarla como comprometida aunque el commit haya sido borrado:

1. Revocar y regenerar `SECRET_KEY`.
2. Cambiar `POSTGRES_PASSWORD`.
3. Cambiar la contraseña o app password SMTP.
4. Invalidar sesiones JWT reiniciando el servicio después de cambiar `SECRET_KEY`.
5. Cambiar la contraseña del propietario y eliminar `admin123`.
6. Revisar logs de acceso y actividad sospechosa.
7. Eliminar el secreto del historial con una herramienta especializada como `git filter-repo` o BFG Repo-Cleaner.
8. Activar secret scanning y documentar el incidente.

Borrar el archivo en un commit nuevo no elimina el secreto de los commits anteriores.

## Contraseñas de usuarios

Las contraseñas de usuarios se almacenan mediante hash `bcrypt` en la base de datos. No guardar contraseñas en texto plano.

Antes de producción:

- Eliminar la compatibilidad de demostración con `admin123`.
- Cambiar o eliminar `demo@gestioncloud.com.ar`.
- Crear un propietario con contraseña única y fuerte.
- No compartir credenciales entre vendedores.
- Revisar permisos por rol.

## ARCA y certificados

Los certificados, claves privadas y credenciales de ARCA deben manejarse como secretos de máxima sensibilidad:

- No guardarlos en Git.
- No colocarlos en `public/`.
- No enviarlos al navegador.
- Preferir un volumen privado con permisos restrictivos o un gestor de secretos.
- Separar homologación de producción.
- Rotar certificados antes de su vencimiento.

## Lista de control

- [ ] `.env.example` no contiene secretos reales.
- [ ] `.env` y `.env.production` están ignorados por Git.
- [ ] No existen contraseñas dentro de `docker-compose.yml`.
- [ ] `SECRET_KEY` es aleatoria y privada.
- [ ] PostgreSQL no está publicado en Internet.
- [ ] Secret scanning y push protection están activos.
- [ ] GitHub Actions usa environment `production`.
- [ ] No se imprimen secretos en logs.
- [ ] Se eliminaron `admin123` y el usuario demo.
- [ ] Hay un procedimiento de rotación y recuperación.

## Importación CSV y seguridad

La importación de inventario acepta únicamente archivos `.csv`. Se procesan archivos de
texto con separador coma o punto y coma, incluyendo campos entre comillas.

- Solo el propietario autenticado puede importar archivos.
- Validar el archivo antes de cargarlo y conservar un backup previo.
- No importar archivos recibidos de fuentes desconocidas.
- Mantener el límite de tamaño configurado en el backend.
