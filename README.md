# 🧾 Facturador Exprés ARCA (ex-AFIP)

Sistema de facturación electrónica ágil, autónomo y de código abierto orientado a monotributistas, pequeños comercios y pymes en Argentina. Diseñado para ejecutarse de forma local o self-hosted mediante Docker sin depender de intermediarios comerciales de pago ni suscripciones SaaS.

---

## 📌 Descripción del Proyecto

El **Facturador Exprés ARCA** permite emitir comprobantes fiscales electrónicos oficiales (Facturas B y C) en segundos. Integra directamente los servicios web oficiales de autenticación y facturación de ARCA mediante SOAP, resolviendo la obtención del CAE y la generación del código QR oficial para impresión térmica continua de 80 mm o exportación a PDF.

### Características Actuales
* **Conexión Directa SOAP**: Conexión nativa sobre los web services WSAA y WSFEV1 sin intermediarios.
* **Modo Demo / Simulación Automático**: Si no se detectan certificados fiscales en el servidor, opera en modo de prueba para testear flujos, cálculo de importes e impresión sin consecuencias fiscales.
* **Formatos Compatibles**: Factura C (Monotributo) y Factura B (Responsable Inscripto a Consumidor Final).
* **Soporte de Rubros**: Venta de productos (hardware, comercio) y prestación de servicios (soporte, consultoría, desarrollo por hora con períodos de facturación).
* **QR Oficial ARCA**: Generación automática del código QR en formato base64 según las especificaciones normativas vigentes.
* **Infraestructura Contenerizada**: Despliegue reproducible con Docker y Docker Compose en WSL / Linux.

---

## ⚠️ Estado Actual: ¿Qué le falta?

Para alcanzar un estado productivo completo y robusto para múltiples usuarios, restan implementar las siguientes fases:

1. **Gestión de Certificados en Producción**:
   * Cargar el certificado digital (`.crt`) y la clave privada (`.key`) generados con clave fiscal en el portal de ARCA.
   * Configurar el punto de venta habilitado para Factura Electrónica (Web Services).
2. **Optimización de Impresión Térmica**:
   * Ajustar las reglas CSS `@media print` para ocultar la interfaz web y enviar exclusivamente el comprobante en formato ticket continuo (58 mm / 80 mm).
3. **Persistencia de Comprobantes**:
   * Incorporar una base de datos ligera (SQLite o PostgreSQL) para almacenar el historial de comprobantes emitidos, números de CAE y auditoría local.
4. **Envío Automatizado**:
   * Integración de envío del PDF del comprobante por correo electrónico o enlace directo a WhatsApp Web.

---

## 🚀 Despliegue Local en WSL con Docker

Sigue estos pasos para clonar, configurar y levantar el proyecto desde cero en tu entorno de desarrollo.

### 1. Clonar el Repositorio
```bash
git clone [https://github.com/JoseEmiliano/-FacturadorExpres.git](https://github.com/JoseEmiliano/-FacturadorExpres.git)
cd -FacturadorExpres
2. Configurar Variables de Entorno
Crea el archivo .env en la raíz del proyecto:

Bash
cat << 'ENV' > .env
CUIT=20328905789
PUNTO_VENTA=1
PRODUCCION=False
CERT_PATH=certs/certificado.crt
KEY_PATH=certs/clave_privada.key
ENV
3. Preparar Directorio de Certificados
Crea la carpeta de certificados (en caso de contar con credenciales de prueba u oficiales):

Bash
mkdir -p certs
# Si tienes certificados, colócalos aquí:
# cp mi_certificado.crt certs/certificado.crt
# cp mi_clave.key certs/clave_privada.key
Nota: Si no agregas certificados, el sistema levantará automáticamente en Modo Simulación / Demo.

4. Compilar e Iniciar el Contenedor
Bash
docker compose up --build -d
5. Acceder a la Aplicación
URL estándar: http://localhost:5050

Acceso por IP interna (WSL):

Bash
docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' facturador_arca
Abre tu navegador en http://<IP_WSL>:5050.

🛠️ Comandos de Mantenimiento
Ver logs del contenedor en vivo:

Bash
docker compose logs -f
Reiniciar servicio:

Bash
docker compose restart
Detener contenedor:

Bash
docker compose down
👤 Autor y Licencia
Desarrollado por JoseEmiliano para la comunidad y plataformas autónomas de GESTIONCLOUD.COM.AR.

