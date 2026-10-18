# Replicar el sistema para un cliente nuevo

Esta guía explica cómo crear una instalación independiente de Maxi Kiosco 24/7 para cada nuevo kiosco, almacén o comercio.

El modelo recomendado es **una instalación y una base de datos por cliente**. Así cada negocio tiene:

- Sus propios usuarios.
- Sus propios productos y stock.
- Sus propios comprobantes.
- Sus propios reportes.
- Su propia configuración ARCA.
- Sus propios secretos y dominio.

No conviene que dos clientes compartan la misma base de datos hasta implementar un módulo multiempresa completo, aislamiento de tenants, facturación separada y administración centralizada.

## Qué se replica

Para cada nuevo cliente se replica:

```text
Código de la aplicación
Base de datos PostgreSQL vacía
Archivo de variables de entorno propio
Volumen de datos propio
Usuarios y productos del cliente
Subdominio propio, si corresponde
```

Ejemplo:

```text
Cliente A: pos-kiosco-centro.ejemplo.com
Cliente B: pos-almacen-norte.ejemplo.com
Cliente C: pos-despensa-sur.ejemplo.com
```

Cada instalación debe tener un nombre de proyecto Compose y un volumen distinto. Nunca reutilizar por error el volumen PostgreSQL de otro cliente.

## 1. Crear la copia base

Partiendo de un repositorio base limpio y probado:

```bash
git clone https://github.com/USUARIO/facturador-arca-node.git cliente-nombre
cd cliente-nombre
```

Crear una rama o tag para identificar la versión entregada:

```bash
git checkout -b cliente/nombre
```

No copiar una instalación que contenga ventas reales, usuarios reales, backups o archivos `.env`.

Si se utiliza un repositorio privado por cliente, configurar el repositorio y sus permisos antes de cargar información.

## 2. Crear secretos propios del cliente

Copiar la plantilla:

```bash
cp .env.example .env
```

Generar secretos nuevos:

```bash
openssl rand -base64 48
```

Completar `.env` con valores exclusivos para ese cliente:

```dotenv
PORT=5050
POSTGRES_USER=cliente_user
POSTGRES_PASSWORD=CLAVE_POSTGRES_EXCLUSIVA
POSTGRES_DB=facturador_cliente
DATABASE_URL=postgresql://cliente_user:CLAVE_POSTGRES_EXCLUSIVA@db:5432/facturador_cliente?schema=public
SECRET_KEY=CLAVE_JWT_EXCLUSIVA

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=cliente@example.com
SMTP_PASS=APP_PASSWORD_DEL_CLIENTE
```

No reutilizar:

- `SECRET_KEY`.
- Contraseña de PostgreSQL.
- Contraseña SMTP.
- Certificados ARCA.
- Volúmenes Docker.
- Tokens de Cloudflare.

La gestión detallada de secretos está en [README-CREDENTIALS.md](./README-CREDENTIALS.md).

## 3. Aislar el nombre del proyecto y los datos

Usar un nombre Compose distinto:

```bash
docker compose -p cliente-nombre up -d --build
```

Verificar los contenedores y el volumen:

```bash
docker compose -p cliente-nombre ps
docker volume ls
```

El nombre del proyecto evita colisiones entre instalaciones. En producción se recomienda además separar cada cliente por servidor, VM o al menos por stack y volumen claramente identificados.

Nunca ejecutar:

```bash
docker compose down -v
```

sin confirmar que se está trabajando sobre el cliente correcto. El parámetro `-v` puede eliminar la base de datos.

## 4. Inicializar la empresa

La instalación actual utiliza una empresa inicial en `seed.sql`. Para un cliente nuevo hay dos alternativas.

### Alternativa A: instalación de demostración

Usar el seed solo para una demo o prueba técnica:

```bash
docker compose -p cliente-nombre exec -T db \
  psql -U cliente_user -d facturador_cliente < seed.sql
```

Después ingresar al panel y reemplazar los datos de prueba.

### Alternativa B: instalación limpia recomendada

Para entregar a un cliente real:

1. Levantar la aplicación para que Prisma cree/sincronice las tablas.
2. Crear o modificar la empresa con los datos reales.
3. Crear el punto de venta.
4. Crear el propietario.
5. Crear vendedores desde el panel.
6. Cargar productos reales.
7. Eliminar cualquier producto, usuario o comprobante de demostración.

La creación de la empresa inicial todavía está basada en el seed y no existe un asistente completo de onboarding dentro de la aplicación. Hasta agregar ese asistente, la personalización de la empresa puede realizarse mediante un script SQL controlado o una operación administrativa sobre la base, siempre con backup previo.

Datos mínimos de la empresa:

```text
Razón social o nombre comercial
CUIT
Condición frente al IVA
Dirección comercial
Teléfono
Email comercial (opcional)
Plan
Límite mensual
```

El propietario puede actualizar estos datos desde **Configuración**. Se utilizan en la
vista previa y en los comprobantes Ticket/A4. Los vendedores pueden visualizarlos
indirectamente en los comprobantes, pero no pueden modificarlos.

Datos mínimos del punto de venta:

```text
Número de punto de venta
Nombre de caja o local
```

## 5. Crear propietario y vendedores

### Propietario

Debe existir un usuario con rol:

```text
propietario
```

El propietario puede:

- Configurar ARCA.
- Consultar reportes.
- Administrar vendedores.
- Revisar el historial.
- Operar la caja.

Usar un email exclusivo y una contraseña fuerte. No entregar al cliente las credenciales demo.

### Vendedores

Desde **Usuarios y Vendedores**, crear uno por cada persona:

```text
Nombre
Email individual
Contraseña individual
Rol vendedor
```

No compartir una cuenta entre empleados. Esto permite identificar qué vendedor realizó cada operación y generar reportes por vendedor.

Si el cliente tiene varias cajas o locales, asignar los vendedores al punto de venta correspondiente cuando esa administración esté configurada.

## 6. Cargar productos y stock

Para cada cliente cargar:

- Código de barras o código interno.
- Nombre comercial.
- Precio.
- Stock inicial.
- Stock mínimo.
- Tipo de unidad.

Verificar antes de la entrega:

- Que no existan productos de demostración.
- Que los precios estén expresados en pesos argentinos.
- Que el stock inicial coincida con el inventario físico.
- Que los productos con stock bajo aparezcan correctamente.

## 7. Política de comprobantes del cliente

El propietario decide desde **Configuración ARCA** si habilita la opción ARCA.

### ARCA deshabilitado

El sistema permite:

- Emitir una venta interna.
- Guardarla en el historial.
- Descontar stock.
- Mostrar vista previa.
- Imprimir Ticket de 80 mm o A4.
- Enviar el documento por email si SMTP está configurado.

El documento debe identificarse como:

```text
Comprobante interno - sin ARCA
CAE: SIN ARCA
```

Esto es un comprobante operativo o ticket interno. No es una factura fiscal electrónica válida.

Este modo sirve para clientes que todavía no tienen facturación ARCA legal pero necesitan entregar un papel impreso como constancia comercial de la operación. El propietario puede definir que el documento se presente como:

```text
Ticket interno
Comprobante no fiscal
Comprobante comercial
```

El documento puede incluir productos, cantidades, precios, total, fecha, hora, nombre del negocio y vendedor. No debe incluir un CAE, QR fiscal ni una leyenda que sugiera autorización de ARCA.

### ARCA habilitado

El propietario puede activar ARCA y seleccionar:

- Homologación.
- Producción.
- Punto de venta.

Con ARCA habilitado, el operador puede elegir en cada venta entre:

- Venta interna / sin ARCA.
- Factura ARCA.

La decisión se toma por venta, según la necesidad del cliente o del comprador.

### Facturación en homologación o simulada

La aplicación actual incluye un servicio ARCA simulado para pruebas. Puede mostrar CAE y QR de demostración, pero esos datos no deben presentarse como una autorización fiscal real.

Una factura emitida en homologación o mediante el servicio simulado:

- Sirve para pruebas de interfaz y flujo.
- No debe entregarse como comprobante fiscal válido.
- No reemplaza el Web Service oficial.
- No acredita una autorización real de ARCA.

Para producción fiscal se necesita integrar los Web Services oficiales, certificados, clave privada, CUIT, ambiente correcto y manejo de errores de ARCA.

## Ticket interno y “Factura B sin facturar”

Algunos comercios pueden pedir un papel con formato parecido a una factura para entregar al cliente, aunque todavía no estén emitiendo comprobantes fiscales mediante ARCA. El sistema puede ofrecer una plantilla comercial, pero debe identificarse de forma visible como:

```text
COMPROBANTE NO FISCAL
DOCUMENTO COMERCIAL - SIN VALIDEZ FISCAL
```

No se debe imprimir ni guardar como **Factura B** si no fue autorizada por el organismo fiscal correspondiente. Tampoco se debe inventar un CAE, QR, código de autorización o numeración fiscal para aparentar una factura válida.

La alternativa segura es ofrecer dos formatos:

1. **Ticket interno**
   - Diseño de ticket.
   - `CAE: SIN ARCA`.
   - Sin QR fiscal.
   - Leyenda visible de comprobante no fiscal.
2. **Comprobante comercial tipo factura**
   - Diseño similar a una factura para facilitar la lectura.
   - Leyenda grande `NO FISCAL`.
   - No utilizar la letra `B` como tipo fiscal.
   - No mostrar CAE ni QR fiscal.

El propietario debe aprobar qué formato se entrega y asumir la responsabilidad comercial y tributaria con asesoramiento de su contador. El sistema no debe permitir que un vendedor quite la leyenda `NO FISCAL` ni seleccione una clase de comprobante fiscal no autorizada.

## 8. Aclaración comercial importante

El cliente puede decidir tener ARCA apagado y seguir usando tickets internos. También puede activar ARCA y elegir en cada operación si emite una venta interna o una factura ARCA.

Sin embargo, no se debe llamar **“factura fiscal”** a un documento que:

- No fue autorizado por ARCA.
- Está en homologación.
- Usa un CAE simulado.
- Tiene `SIN ARCA`.

Si se desea ofrecer una opción adicional de “factura no fiscal” o “factura de prueba”, debe quedar rotulada explícitamente como:

```text
Factura no fiscal
Documento de prueba
Comprobante interno
```

La etiqueta no puede inducir al cliente final a creer que el documento tiene validez fiscal.

## 9. Configurar el dominio del cliente

Para una instalación publicada con Cloudflare:

1. Crear un subdominio exclusivo.
2. Asociarlo al túnel o reverse proxy de esa instalación.
3. Enviar tráfico hacia el puerto interno `5050`.
4. No publicar PostgreSQL.
5. Activar HTTPS.
6. Usar Cloudflare Access si el sistema debe ser privado.

Ejemplo:

```text
pos.cliente.com.ar
```

La configuración del túnel debe apuntar al servicio de ese cliente, no al contenedor de otra instalación.

## 10. Pruebas de aceptación por cliente

Antes de entregar:

### Acceso

- [ ] El propietario puede iniciar sesión.
- [ ] Un vendedor puede iniciar sesión.
- [ ] Las cuentas son individuales.
- [ ] Se eliminaron credenciales demo.

### Caja

- [ ] Se puede buscar un producto.
- [ ] Se puede agregar al ticket.
- [ ] Se calcula correctamente el total.
- [ ] El stock se descuenta una sola vez.
- [ ] Se puede imprimir Ticket.
- [ ] Se puede imprimir A4.
- [ ] La impresión no incluye la interfaz del sistema.

### ARCA

- [ ] ARCA comienza deshabilitado si el cliente aún no lo autorizó.
- [ ] Un vendedor no puede cambiar la configuración.
- [ ] La venta sin ARCA sigue funcionando.
- [ ] Al activar ARCA aparece la opción correspondiente.
- [ ] El QR no aparece en una venta interna.
- [ ] El entorno de homologación está rotulado como prueba.

### Reportes

- [ ] El propietario puede generar reportes.
- [ ] Se pueden elegir todos los períodos.
- [ ] Se puede filtrar por vendedor.
- [ ] El CSV se descarga correctamente.
- [ ] Los totales coinciden con el historial.
- [ ] El propietario puede actualizar razón social, nombre comercial, CUIT, dirección y teléfono.
- [ ] Un vendedor no puede modificar datos del negocio ni crear o editar productos.

### Operación

- [ ] Se configuró backup.
- [ ] Se probó restaurar una copia.
- [ ] El subdominio apunta al cliente correcto.
- [ ] PostgreSQL no está expuesto a Internet.
- [ ] Hay un responsable de soporte.

## 11. Entrega y documentación del cliente

Entregar al propietario, por un canal seguro:

- URL del sistema.
- Usuario propietario.
- Procedimiento para crear vendedores.
- Procedimiento para activar o desactivar ARCA.
- Política de comprobantes internos.
- Frecuencia de backups.
- Canal de soporte.
- Fecha y versión instalada.

No enviar contraseñas por el mismo canal que la URL. Solicitar cambio de contraseña en el primer acceso.

## 12. Actualizaciones posteriores

Antes de actualizar una instalación:

1. Identificar inequívocamente el cliente.
2. Crear backup de su base.
3. Registrar la versión actual.
4. Probar la nueva versión en una copia.
5. Actualizar solo ese stack.
6. Verificar login, ventas, impresión, historial y reportes.
7. Registrar el resultado.

Nunca actualizar todos los clientes directamente desde una rama de desarrollo.

## Limitaciones actuales del modelo de replicación

La aplicación actual está preparada para una instalación aislada por cliente, pero todavía requiere trabajo para convertirse en una plataforma multiempresa centralizada:

- No hay un asistente visual completo para crear una nueva empresa.
- El seed contiene datos de demostración.
- La numeración de comprobantes debe revisarse para escenarios concurrentes.
- La integración ARCA real aún no está implementada.
- La creación de clientes se realiza por copia de instalación, no desde un panel SaaS central.

La réplica por cliente es segura y simple si se mantienen separados el código, la base, los secretos, los volúmenes y el dominio.
