# Maxi Kiosco 24/7

Sistema POS web para kioscos y comercios pequeños, con inventario, usuarios, comprobantes, reportes y facturación ARCA configurable.

El proyecto está pensado para ejecutarse localmente con Docker Compose y puede publicarse en un VPS o en una máquina virtual de Proxmox detrás de Cloudflare.

## Funcionalidades

### Caja y ventas

- Catálogo de productos con búsqueda por nombre o código.
- Alta y edición de productos.
- Control de precio, stock, stock mínimo y tipo de unidad.
- Ticket actual con cantidades, subtotales y total.
- Descuento automático del stock al confirmar una venta.
- Atajos de teclado:
  - `F4`: cobrar y emitir.
  - `F12`: vaciar el ticket.

### Comprobantes

Cada venta permite elegir individualmente:

- **Venta interna / sin ARCA**:
  - Se guarda en el historial.
  - Se identifica con `SIN ARCA`.
  - No genera QR ni CAE.
  - Permite imprimir el comprobante.
  - Puede presentarse como ticket o comprobante comercial no fiscal.
- **Factura ARCA**:
  - Solo aparece habilitada cuando el propietario activa ARCA.
  - Genera CAE, vencimiento y QR en la respuesta del servicio ARCA.
  - Permite imprimir en formato Ticket de 80 mm o Factura A4.

La vista previa obliga a seleccionar el formato antes de habilitar el botón de impresión. La impresión se limita al documento seleccionado y no imprime la interfaz del sistema.

> Importante: el servicio ARCA incluido actualmente genera datos simulados para desarrollo y demostración. Todavía no reemplaza la integración oficial con certificados, autenticación y Web Services de ARCA.

Si un comercio aún no factura legalmente por ARCA, puede entregar un ticket o comprobante comercial impreso, siempre rotulado como `COMPROBANTE NO FISCAL` o `SIN VALIDEZ FISCAL`. No debe llamarse “Factura B” ni mostrar CAE o QR si no fue autorizado oficialmente.

### Usuarios y permisos

- Inicio de sesión con JWT.
- Rol `propietario`:
  - Administra la configuración ARCA.
  - Consulta reportes.
  - Administra usuarios y vendedores.
  - Descarga backups SQL.
  - Importa inventario desde CSV.
  - Ejecuta la limpieza administrativa de ventas e inventario.
- Rol `vendedor`:
  - Opera la caja.
  - Consulta el inventario y el historial permitido.
  - No puede activar ni desactivar ARCA.
  - No puede crear ni editar productos ni modificar datos del negocio.
  - No puede crear ni listar usuarios.
  - No puede consultar reportes, descargar backups ni ejecutar la limpieza administrativa.

Las restricciones se aplican en el backend mediante autorización por rol. Ocultar una pestaña
en el frontend no es el mecanismo de seguridad principal.

### Configuración ARCA

El propietario puede configurar:

- Facturación ARCA habilitada o deshabilitada.
- Ambiente de homologación o producción.
- Punto de venta.

La opción ARCA se controla en el backend. Aunque un usuario intente enviar una solicitud manualmente, el servidor rechaza la emisión si la empresa no tiene ARCA habilitado.

### Historial y reportes

- Historial de comprobantes emitidos.
- Reportes por período:
  - Diario.
  - Semanal.
  - Mensual.
  - Trimestral.
  - Semestral.
  - Anual.
- Filtro por vendedor.
- Descarga del resultado en CSV.

### Administración de datos

El propietario dispone de herramientas protegidas en el panel:

- Descarga de backup SQL de la base actual.
- Importación masiva de inventario desde `.csv`.
- Actualización de productos existentes por código.
- Creación de productos nuevos desde el archivo.
- Limpieza total de ventas e inventario con doble confirmación.

La limpieza conserva empresa, usuarios, vendedores, puntos de venta y configuración ARCA. Antes de ejecutarla se recomienda descargar un backup y verificar que se está trabajando sobre el cliente correcto.

Columnas aceptadas para importar inventario:

```text
codigo,nombre,precio,stock,stock_minimo
```

También se reconocen variantes habituales como `código`, `producto`, `descripción`, `price`, `existencia` y `stock mínimo`.

### Envío de comprobantes

El backend incluye envío por correo electrónico mediante SMTP. Puede configurarse con las variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` y `SMTP_PASS`.

## Tecnologías

- Node.js 20.
- Express 4.
- Prisma ORM.
- PostgreSQL 16.
- Docker y Docker Compose.
- HTML, CSS y JavaScript en el frontend.
- JWT para autenticación.
- bcryptjs para contraseñas.
- Nodemailer para correo.
- qrcode para generar el QR de comprobantes ARCA.

## Estructura principal

```text
.
├── public/
│   └── index.html          # Frontend POS y panel administrativo
├── src/
│   ├── server.js          # API Express y servidor web
│   └── generated/prisma/  # Cliente Prisma generado durante el build
├── prisma/
│   └── schema.prisma      # Modelo de datos
├── seed.sql                # Datos iniciales de demostración
├── Dockerfile
├── docker-compose.yml
├── README.md
├── README-CREDENTIALS.md
├── README-CLIENT-ONBOARDING.md
└── DEPLOYMENT.md
```

## Ejecución local con Docker

Requisitos:

- Docker Desktop con WSL2, o Docker Engine y Docker Compose dentro de WSL.
- Git.

Clonar y levantar:

```bash
git clone https://github.com/USUARIO/REPOSITORIO.git
cd facturador-arca-node
cp .env.example .env
# Editar .env y reemplazar todos los valores de ejemplo
docker compose up -d --build
```

Abrir:

```text
http://localhost:5050
```

En una instalación nueva, cargar los datos iniciales de demostración solo después de que PostgreSQL esté listo:

```bash
docker compose exec -T db psql \
  -U arca_user \
  -d facturador_arca < seed.sql
```

Luego actualizar la página e ingresar con el usuario inicial indicado más abajo. En una instalación real, cambiar las credenciales demo inmediatamente.

Ver estado y logs:

```bash
docker compose ps
docker compose logs -f app
```

Detener sin borrar los datos:

```bash
docker compose down
```

Los datos de PostgreSQL se guardan en el volumen Docker `postgres_data`.

## Credenciales de demostración

La instalación de ejemplo utiliza:

```text
Usuario: demo@gestioncloud.com.ar
Contraseña: admin123
Rol: propietario
```

Estas credenciales son únicamente para demostración. Deben cambiarse o eliminarse antes de cualquier instalación productiva. Consultar [DEPLOYMENT.md](./DEPLOYMENT.md).

## Variables de entorno

La aplicación utiliza:

| Variable | Uso |
|---|---|
| `PORT` | Puerto HTTP de Node, por defecto `5050` |
| `DATABASE_URL` | Conexión PostgreSQL |
| `SECRET_KEY` | Clave para firmar los JWT |
| `SMTP_HOST` | Servidor SMTP |
| `SMTP_PORT` | Puerto SMTP |
| `SMTP_USER` | Usuario SMTP |
| `SMTP_PASS` | Contraseña o app password SMTP |

En desarrollo, `docker-compose.yml` contiene valores de ejemplo. En producción deben reemplazarse por secretos reales y no deben subirse al repositorio.

Para el procedimiento recomendado de `.env`, GitHub Secrets, rotación y respuesta ante filtraciones, consultar [README-CREDENTIALS.md](./README-CREDENTIALS.md).

Para replicar la instalación para un nuevo kiosco o comercio, consultar [README-CLIENT-ONBOARDING.md](./README-CLIENT-ONBOARDING.md).

## API principal

Todas las rutas protegidas requieren:

```http
Authorization: Bearer TOKEN
```

Rutas principales:

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/login` | Iniciar sesión |
| `GET` | `/api/me` | Obtener sesión actual |
| `GET` | `/api/productos` | Listar productos |
| `POST` | `/api/productos` | Crear producto |
| `PUT` | `/api/productos/:id` | Editar producto |
| `GET` | `/api/inventario` | Consultar inventario |
| `POST` | `/api/facturar` | Emitir venta interna o ARCA |
| `GET` | `/api/historico` | Consultar historial |
| `GET` | `/api/usuarios` | Listar usuarios |
| `POST` | `/api/usuarios` | Crear vendedor |
| `GET` | `/api/configuracion/arca` | Consultar configuración ARCA |
| `PUT` | `/api/configuracion/arca` | Modificar configuración ARCA |
| `GET` | `/api/configuracion/empresa` | Consultar datos comerciales |
| `PUT` | `/api/configuracion/empresa` | Modificar datos comerciales (solo propietario) |
| `GET` | `/api/reportes/ventas` | Generar reporte CSV |
| `GET` | `/api/backup` | Descargar backup SQL (solo propietario) |
| `POST` | `/api/inventario/importar` | Importar CSV (solo propietario) |
| `POST` | `/api/reset-datos` | Limpiar ventas e inventario (solo propietario) |
| `POST` | `/api/comprobantes/enviar-email` | Enviar comprobante por email |

Las rutas de usuarios, configuración ARCA, reportes, backup, importación y limpieza requieren
rol `propietario`. Las ventas internas y la facturación ARCA (si está habilitada por el
propietario) se realizan desde `/api/facturar`.

## Estado del proyecto

El sistema está funcional para operación interna, demostración y desarrollo de la integración ARCA. Antes de usarlo como sistema fiscal en producción deben completarse la integración oficial con ARCA, la revisión de seguridad, las copias de respaldo y la política de recuperación ante fallos.

La importación acepta únicamente CSV para reducir la superficie de ataque y evitar procesar planillas binarias. Se admiten separadores coma o punto y coma, y campos entre comillas.

## Licencia

Definir la licencia del proyecto antes de publicarlo como repositorio público.
