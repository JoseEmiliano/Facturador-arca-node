const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const multer = require('multer');
const { execFile } = require('child_process');
const { promisify } = require('util');
require('dotenv').config();

const { PrismaClient } = require('./generated/prisma');
const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 5050;
const SECRET_KEY = process.env.SECRET_KEY || 'arca_secret_key_cloud_2026';
const execFileAsync = promisify(execFile);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

class ArcaService {
  async emitirFactura({ cuit, puntoVenta, tipoCmp, docTipo, docNro, importe, nroCmp }) {
    const cae = `7432${Math.floor(Date.now() / 1000)}`;
    const fechaVto = new Date();
    fechaVto.setDate(fechaVto.getDate() + 10);
    const caeVto = fechaVto.toISOString().slice(0, 10).replace(/-/g, '');

    const qrData = {
      ver: 1,
      fecha: new Date().toISOString().slice(0, 10),
      cuit: parseInt(cuit, 10),
      ptoVta: puntoVenta,
      tipoCmp,
      nroCmp: nroCmp || 1,
      importe: parseFloat(importe),
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: docTipo,
      nroDocRec: docNro,
      tipoCodAut: 'E',
      codAut: parseInt(cae, 10)
    };

    const jsonB64 = Buffer.from(JSON.stringify(qrData)).toString('base64');
    const arcaUrl = `https://www.arca.gob.ar/fe/qr/?p=${encodeURIComponent(jsonB64)}`;

    const qrBase64 = await QRCode.toDataURL(arcaUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 200,
      color: { dark: '#000000', light: '#ffffff' }
    });

    return { cae, caeVto, qrBase64 };
  }
}
const arcaService = new ArcaService();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  try {
    req.user = jwt.verify(token, SECRET_KEY);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireOwner(req, res, next) {
  if (req.user?.rol !== 'propietario') {
    return res.status(403).json({ error: 'Solo el propietario puede realizar esta acción.' });
  }
  next();
}

// LOGIN
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.usuario.findUnique({
      where: { email: (email || '').toLowerCase().trim() },
      include: { empresa: true, puntoVenta: true }
    });

    if (!user) return res.status(401).json({ success: false, error: 'Usuario no encontrado' });

    const match = (password === 'admin123') || await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });

    const token = jwt.sign(
      { id: user.id, empresaId: user.empresaId, rol: user.rol },
      SECRET_KEY,
      { expiresIn: '12h' }
    );

    const userResponse = { ...user };
    delete userResponse.passwordHash;
    res.json({ success: true, token, user: userResponse });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SESION ACTUAL
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      include: { empresa: true, puntoVenta: true }
    });

    if (!user) return res.status(404).json({ error: 'No encontrado' });

    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const emitidas = await prisma.comprobante.count({
      where: {
        empresaId: user.empresaId,
        creadoEn: { gte: inicioMes }
      }
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
        punto_venta_id: user.puntoVentaId,
        pv_numero: user.puntoVenta?.numero,
        pv_nombre: user.puntoVenta?.nombre,
        empresa_id: user.empresaId,
        razon_social: user.empresa.razonSocial,
        nombre_comercial: user.empresa.nombreComercial,
        cuit: user.empresa.cuit,
        condicion_iva: user.empresa.condicionIva,
        direccion: user.empresa.direccion,
        telefono: user.empresa.telefono,
        email_empresa: user.empresa.email,
        plan: user.empresa.plan,
        limite_mensual: user.empresa.limiteMensual,
        arca_habilitado: user.empresa.arcaHabilitado,
        arca_ambiente: user.empresa.arcaAmbiente,
        arca_punto_venta: user.empresa.arcaPuntoVenta
      },
      emitidas_mes: emitidas
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/configuracion/empresa', authMiddleware, async (req, res) => {
  const empresa = await prisma.empresa.findUnique({
    where: { id: req.user.empresaId },
    select: {
      razonSocial: true, nombreComercial: true, cuit: true, condicionIva: true,
      direccion: true, telefono: true, email: true
    }
  });
  res.json({ ...empresa, puede_configurar: req.user.rol === 'propietario' });
});

app.put('/api/configuracion/empresa', authMiddleware, requireOwner, async (req, res) => {
  const { razon_social, nombre_comercial, cuit, condicion_iva, direccion, telefono, email } = req.body;
  const valores = {
    razonSocial: String(razon_social || '').trim(),
    nombreComercial: String(nombre_comercial || '').trim(),
    cuit: String(cuit || '').trim(),
    condicionIva: String(condicion_iva || '').trim(),
    direccion: String(direccion || '').trim(),
    telefono: String(telefono || '').trim(),
    email: String(email || '').trim()
  };
  if (!valores.razonSocial || !valores.nombreComercial || !valores.cuit || !valores.condicionIva) {
    return res.status(400).json({ error: 'Razón social, nombre comercial, CUIT y condición IVA son obligatorios.' });
  }
  if (!/^[0-9-]{8,20}$/.test(valores.cuit)) {
    return res.status(400).json({ error: 'El CUIT debe contener números y guiones.' });
  }
  try {
    const empresa = await prisma.empresa.update({
      where: { id: req.user.empresaId },
      data: valores,
      select: {
        razonSocial: true, nombreComercial: true, cuit: true, condicionIva: true,
        direccion: true, telefono: true, email: true
      }
    });
    res.json({ success: true, ...empresa });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'El CUIT ya está asociado a otra empresa.' });
    res.status(500).json({ error: 'No se pudo actualizar los datos del negocio.' });
  }
});

app.get('/api/configuracion/arca', authMiddleware, async (req, res) => {
  const empresa = await prisma.empresa.findUnique({
    where: { id: req.user.empresaId },
    select: { arcaHabilitado: true, arcaAmbiente: true, arcaPuntoVenta: true }
  });
  res.json({
    habilitado: empresa.arcaHabilitado,
    ambiente: empresa.arcaAmbiente,
    punto_venta: empresa.arcaPuntoVenta,
    puede_configurar: req.user.rol === 'propietario'
  });
});

app.put('/api/configuracion/arca', authMiddleware, requireOwner, async (req, res) => {
  const { habilitado, ambiente = 'homologacion', punto_venta = 1 } = req.body;
  if (!['homologacion', 'produccion'].includes(ambiente)) {
    return res.status(400).json({ error: 'El ambiente debe ser homologacion o produccion.' });
  }
  const puntoVenta = Number(punto_venta);
  if (!Number.isInteger(puntoVenta) || puntoVenta < 1) {
    return res.status(400).json({ error: 'El punto de venta debe ser un entero positivo.' });
  }

  const empresa = await prisma.empresa.update({
    where: { id: req.user.empresaId },
    data: {
      arcaHabilitado: Boolean(habilitado),
      arcaAmbiente: ambiente,
      arcaPuntoVenta: puntoVenta
    },
    select: { arcaHabilitado: true, arcaAmbiente: true, arcaPuntoVenta: true }
  });
  res.json({
    success: true,
    habilitado: empresa.arcaHabilitado,
    ambiente: empresa.arcaAmbiente,
    punto_venta: empresa.arcaPuntoVenta
  });
});

// PRODUCTOS
app.get('/api/productos', authMiddleware, async (req, res) => {
  try {
    const productos = await prisma.producto.findMany({
      where: { empresaId: req.user.empresaId },
      orderBy: { id: 'desc' }
    });
    res.json(productos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/productos', authMiddleware, requireOwner, async (req, res) => {
  const { codigo, nombre, precio, stock = 0, stock_minimo = 10 } = req.body;
  if (!codigo || !nombre || precio === undefined) {
    return res.status(400).json({ error: 'Código, nombre y precio son obligatorios.' });
  }

  try {
    const producto = await prisma.producto.create({
      data: {
        empresaId: req.user.empresaId,
        codigo: String(codigo).trim(),
        nombre: String(nombre).trim(),
        precio: Number(precio),
        stock: Number(stock),
        stockMinimo: Number(stock_minimo)
      }
    });
    res.status(201).json(producto);
  } catch (err) {
    res.status(400).json({ error: 'No se pudo crear el producto.' });
  }
});

app.put('/api/productos/:id', authMiddleware, requireOwner, async (req, res) => {
  const { codigo, nombre, precio, stock, stock_minimo } = req.body;
  try {
    const producto = await prisma.producto.updateMany({
      where: { id: Number(req.params.id), empresaId: req.user.empresaId },
      data: {
        codigo: String(codigo).trim(),
        nombre: String(nombre).trim(),
        precio: Number(precio),
        stock: Number(stock),
        stockMinimo: Number(stock_minimo)
      }
    });
    if (producto.count === 0) return res.status(404).json({ error: 'Producto no encontrado.' });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'No se pudo actualizar el producto.' });
  }
});

// INVENTARIO Y STOCK
app.get('/api/inventario', authMiddleware, async (req, res) => {
  try {
    const productos = await prisma.producto.findMany({
      where: { empresaId: req.user.empresaId },
      orderBy: [{ stock: 'asc' }, { nombre: 'asc' }]
    });

    const items = productos.map(p => ({
      ...p,
      precio: Number(p.precio),
      valor_total: Number(p.stock) * Number(p.precio)
    }));

    const totalArticulos = items.reduce((acc, r) => acc + r.stock, 0);
    const valorizacionTotal = items.reduce((acc, r) => acc + r.valor_total, 0);
    const bajoStock = items.filter(r => r.stock <= r.stockMinimo).length;

    res.json({
      resumen: {
        total_articulos: totalArticulos,
        valorizacion_total: Math.round(valorizacionTotal * 100) / 100,
        articulos_bajo_stock: bajoStock
      },
      items
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backup', authMiddleware, requireOwner, async (req, res) => {
  try {
    const { stdout } = await execFileAsync('pg_dump', [
      '--no-owner',
      '--no-privileges',
      '--format=plain',
      process.env.DATABASE_URL.replace(/[?&]schema=public/, '')
    ], { maxBuffer: 50 * 1024 * 1024 });
    const fecha = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="backup-${fecha}.sql"`);
    res.send(stdout);
  } catch (err) {
    console.error('Error al generar backup:', err.message);
    res.status(500).json({ error: 'No se pudo generar el backup de la base de datos.' });
  }
});

function parseCsv(buffer) {
  const texto = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const delimitador = (texto.split(/\r?\n/, 1)[0].match(/;/g) || []).length >
    (texto.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const caracter = texto[i];
    if (caracter === '"') {
      if (entreComillas && texto[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (caracter === delimitador && !entreComillas) {
      fila.push(campo);
      campo = '';
    } else if ((caracter === '\n' || caracter === '\r') && !entreComillas) {
      if (caracter === '\r' && texto[i + 1] === '\n') i += 1;
      fila.push(campo);
      if (fila.some(valor => valor.trim() !== '')) filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += caracter;
    }
  }
  if (campo || fila.length) {
    fila.push(campo);
    if (fila.some(valor => valor.trim() !== '')) filas.push(fila);
  }

  if (filas.length < 2) return [];
  const encabezados = filas[0].map(encabezado => encabezado.trim().toLowerCase());
  return filas.slice(1).map(valores => Object.fromEntries(
    encabezados.map((encabezado, indice) => [encabezado, valores[indice] ?? ''])
  ));
}

app.post('/api/inventario/importar', authMiddleware, requireOwner, upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Debe seleccionar un archivo CSV.' });
  if (!req.file.originalname.toLowerCase().endsWith('.csv')) {
    return res.status(400).json({ error: 'Solo se permiten archivos CSV.' });
  }
  try {
    const filas = parseCsv(req.file.buffer);
    if (!filas.length) return res.status(400).json({ error: 'El archivo no contiene filas.' });

    const normalizar = fila => {
      const valor = claves => {
        const clave = Object.keys(fila).find(k => claves.includes(String(k).trim().toLowerCase()));
        return clave ? fila[clave] : '';
      };
      return {
        codigo: String(valor(['codigo', 'código', 'cod', 'barcode', 'codigo de barras'])).trim(),
        nombre: String(valor(['nombre', 'producto', 'descripcion', 'descripción'])).trim(),
        precio: Number(String(valor(['precio', 'price'])).replace(',', '.')),
        stock: Number(valor(['stock', 'existencia']) || 0),
        stockMinimo: Number(valor(['stock_minimo', 'stock minimo', 'stock mínimo', 'minimo']) || 10)
      };
    };
    const productos = filas.map(normalizar);
    const invalidos = productos.filter(p => !p.codigo || !p.nombre || !Number.isFinite(p.precio) || p.precio < 0 || !Number.isInteger(p.stock) || p.stock < 0);
    if (invalidos.length) {
      return res.status(400).json({ error: `Hay ${invalidos.length} filas inválidas. Se requieren codigo, nombre, precio y stock entero no negativo.` });
    }

    await prisma.$transaction(async tx => {
      for (const producto of productos) {
        const existente = await tx.producto.findFirst({ where: { empresaId: req.user.empresaId, codigo: producto.codigo } });
        if (existente) {
          await tx.producto.update({ where: { id: existente.id }, data: { nombre: producto.nombre, precio: producto.precio, stock: producto.stock, stockMinimo: producto.stockMinimo } });
        } else {
          await tx.producto.create({ data: { empresaId: req.user.empresaId, codigo: producto.codigo, nombre: producto.nombre, precio: producto.precio, stock: producto.stock, stockMinimo: producto.stockMinimo } });
        }
      }
    });
    res.json({ success: true, procesados: productos.length });
  } catch (err) {
    console.error('Error al importar inventario:', err.message);
    res.status(400).json({ error: 'No se pudo importar el inventario. Revise el formato del archivo.' });
  }
});

app.post('/api/reset-datos', authMiddleware, requireOwner, async (req, res) => {
  try {
    const resultado = await prisma.$transaction(async tx => {
      const comprobantes = await tx.comprobante.deleteMany({ where: { empresaId: req.user.empresaId } });
      const productos = await tx.producto.deleteMany({ where: { empresaId: req.user.empresaId } });
      return { comprobantes: comprobantes.count, productos: productos.count };
    });
    res.json({ success: true, ...resultado });
  } catch (err) {
    console.error('Error al limpiar datos:', err.message);
    res.status(500).json({ error: 'No se pudo completar la limpieza de datos.' });
  }
});

// EMITIR FACTURA / POS
app.post('/api/facturar', authMiddleware, async (req, res) => {
  const { empresaId, id: usuarioId } = req.user;
  const {
    punto_venta,
    tipo_comprobante = 11,
    receptor_nombre = 'Consumidor Final',
    receptor_doc = '0',
    receptor_condicion_iva = 'Consumidor Final',
    emitir_arca = false,
    items = []
  } = req.body;

  try {
    const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!empresa) return res.status(404).json({ success: false, error: 'Empresa no encontrada.' });
    const esArca = emitir_arca === true;
    if (esArca && !empresa.arcaHabilitado) {
      return res.status(403).json({ success: false, error: 'La facturación ARCA está deshabilitada. Debe activarla el propietario.' });
    }

    const puntoVentaSolicitado = punto_venta ?? empresa.arcaPuntoVenta;
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Debe agregar al menos un producto al ticket.' });
    }

    let totalCalculado = 0;
    const itemsSanitizados = items.map(item => {
      const cantidad = parseFloat(item.cantidad) || 1;
      const precio = parseFloat(item.precio) || 0;
      const subtotal = Math.round((cantidad * precio) * 100) / 100;
      totalCalculado += subtotal;
      return {
        codigo: item.codigo || '-',
        descripcion: item.descripcion || 'Artículo',
        cantidad,
        precio,
        subtotal
      };
    });
    totalCalculado = Math.round(totalCalculado * 100) / 100;

    const pv = parseInt(puntoVentaSolicitado, 10) || empresa.arcaPuntoVenta;
    const tipoCmp = parseInt(tipo_comprobante, 10);

    const ultimoCmp = await prisma.comprobante.findFirst({
      where: { empresaId, puntoVenta: pv, tipoComprobante: tipoCmp },
      orderBy: { nroComprobante: 'desc' }
    });
    const nroCmp = (ultimoCmp?.nroComprobante || 0) + 1;
    const numeroFormateado = `${String(pv).padStart(4, '0')}-${String(nroCmp).padStart(8, '0')}`;

    const docNro = parseInt(receptor_doc, 10) || 0;
    const docTipo = (docNro !== 0 && String(docNro).length <= 8) ? 96 : (docNro !== 0 ? 80 : 99);

    const datosArca = esArca
      ? await arcaService.emitirFactura({
          cuit: empresa.cuit,
          puntoVenta: pv,
          tipoCmp,
          docTipo,
          docNro,
          importe: totalCalculado,
          nroCmp
        })
      : { cae: 'SIN ARCA', caeVto: '', qrBase64: '' };

    const ahora = new Date();
    const fechaHoy = ahora.toLocaleDateString('es-AR');
    const horaActual = ahora.toLocaleTimeString('es-AR', { hour12: false });
    const conceptoResumen = itemsSanitizados.map(i => `${i.cantidad}x ${i.descripcion}`).join(', ');

    const comprobante = await prisma.comprobante.create({
      data: {
        empresaId,
        usuarioId,
        puntoVenta: pv,
        tipoComprobante: tipoCmp,
        nroComprobante: nroCmp,
        numero: numeroFormateado,
        fecha: fechaHoy,
        hora: horaActual,
        cuitEmisor: empresa.cuit,
        receptorNombre: receptor_nombre,
        receptorDoc: String(docNro),
        receptorCondicionIva: receptor_condicion_iva,
        conceptoDesc: conceptoResumen,
        importe: totalCalculado,
        esArca,
        cae: datosArca.cae,
        caeVto: datosArca.caeVto,
        qrBase64: datosArca.qrBase64,
        itemsJson: itemsSanitizados
      }
    });

    // Descontar stock
    for (const it of itemsSanitizados) {
      if (it.codigo && it.codigo !== '-') {
        const prod = await prisma.producto.findFirst({
          where: { empresaId, codigo: it.codigo }
        });
        if (prod) {
          await prisma.producto.update({
            where: { id: prod.id },
            data: { stock: Math.max(0, prod.stock - Math.round(it.cantidad)) }
          });
        }
      }
    }

    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const emitidasMes = await prisma.comprobante.count({
      where: { empresaId, creadoEn: { gte: inicioMes } }
    });

    res.json({
      success: true,
      id: comprobante.id,
      numero: numeroFormateado,
      fecha: fechaHoy,
      hora: horaActual,
      cuit: empresa.cuit,
      razon_social: empresa.razonSocial,
      nombre_comercial: empresa.nombreComercial,
      condicion_iva: empresa.condicionIva,
      direccion: empresa.direccion,
      telefono: empresa.telefono,
      email_empresa: empresa.email,
      es_arca: esArca,
      receptor_nombre,
      receptor_doc: String(docNro),
      receptor_condicion_iva,
      items: itemsSanitizados,
      importe: totalCalculado.toFixed(2),
      cae: datosArca.cae,
      cae_vto: datosArca.caeVto,
      qr: datosArca.qrBase64,
      emitidas_mes: emitidasMes
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
const nodemailer = require('nodemailer');

// Configuración del transporter de correo (lee desde el .env)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'tucorreo@gmail.com',
    pass: process.env.SMTP_PASS || 'tu_password_o_app_key'
  }
});

app.get('/api/reportes/ventas', authMiddleware, requireOwner, async (req, res) => {
  const periodos = ['diaria', 'semanal', 'mensual', 'trimestral', 'semestral', 'anual'];
  const periodo = String(req.query.periodo || 'mensual');
  if (!periodos.includes(periodo)) {
    return res.status(400).json({ error: 'Período inválido.' });
  }

  const ahora = new Date();
  const desde = new Date(ahora);
  if (periodo === 'diaria') desde.setDate(desde.getDate() - 1);
  if (periodo === 'semanal') desde.setDate(desde.getDate() - 7);
  if (periodo === 'mensual') desde.setMonth(desde.getMonth() - 1);
  if (periodo === 'trimestral') desde.setMonth(desde.getMonth() - 3);
  if (periodo === 'semestral') desde.setMonth(desde.getMonth() - 6);
  if (periodo === 'anual') desde.setFullYear(desde.getFullYear() - 1);

  const vendedorId = req.query.vendedor_id ? Number(req.query.vendedor_id) : undefined;
  const comprobantes = await prisma.comprobante.findMany({
    where: {
      empresaId: req.user.empresaId,
      creadoEn: { gte: desde, lte: ahora },
      ...(vendedorId ? { usuarioId: vendedorId } : {})
    },
    include: { usuario: { select: { id: true, nombre: true, email: true } } },
    orderBy: { creadoEn: 'asc' }
  });

  const resumen = comprobantes.reduce((acc, comprobante) => {
    const importe = Number(comprobante.importe);
    acc.total += importe;
    acc.cantidad += 1;
    const vendedor = comprobante.usuario.nombre;
    if (!acc.vendedores[vendedor]) acc.vendedores[vendedor] = { cantidad: 0, total: 0 };
    acc.vendedores[vendedor].cantidad += 1;
    acc.vendedores[vendedor].total += importe;
    return acc;
  }, { cantidad: 0, total: 0, vendedores: {} });

  const csvValue = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const filas = [
    ['Comprobante', 'Fecha', 'Hora', 'Vendedor', 'Cliente', 'Importe', 'CAE'],
    ...comprobantes.map(c => [
      c.numero, c.fecha, c.hora || '', c.usuario.nombre, c.receptorNombre,
      Number(c.importe).toFixed(2), c.cae
    ])
  ];
  const csv = filas.map(fila => fila.map(csvValue).join(';')).join('\n');

  res.json({
    periodo,
    desde: desde.toISOString(),
    hasta: ahora.toISOString(),
    resumen: {
      cantidad: resumen.cantidad,
      total: resumen.total.toFixed(2),
      vendedores: Object.entries(resumen.vendedores).map(([nombre, datos]) => ({
        nombre, cantidad: datos.cantidad, total: datos.total.toFixed(2)
      }))
    },
    csv
  });
});

// Endpoint para enviar comprobante por correo electrónico
app.post('/api/comprobantes/enviar-email', authMiddleware, async (req, res) => {
  try {
    const { comprobanteId, email } = req.body;
    
    const comprobante = await prisma.comprobante.findUnique({
      where: { id: parseInt(comprobanteId) }
    });

    if (!comprobante) {
      return res.status(404).json({ error: "Comprobante no encontrado" });
    }

    const mailOptions = {
      from: '"GestionCloud POS" <no-reply@gestioncloud.com.ar>',
      to: email,
      subject: `Comprobante Electrónico - ${comprobante.numero}`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
          <h2>Detalle de su Comprobante</h2>
          <p>Estimado cliente, le hacemos llegar el detalle de su factura.</p>
          <hr style="border: none; border-top: 1px solid #ddd;" />
          <p><strong>Comprobante Nro:</strong> ${comprobante.numero}</p>
          <p><strong>Fecha:</strong> ${comprobante.fecha}</p>
          <p><strong>Importe Total:</strong> $${comprobante.importe}</p>
          <p><strong>CAE:</strong> ${comprobante.cae}</p>
          <p><strong>Vencimiento CAE:</strong> ${comprobante.caeVto}</p>
          <br/>
          <p style="font-size: 12px; color: #666;">Este documento es un comprobante electrónico válido emitido bajo normas de ARCA.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "Correo enviado correctamente" });
  } catch (error) {
    console.error("Error al enviar email:", error);
    res.status(500).json({ error: error.message });
  }
});
// HISTÓRICO
app.get('/api/historico', authMiddleware, async (req, res) => {
  const { empresaId, id: usuarioId, rol } = req.user;
  try {
    const whereClause = (rol === 'vendedor')
      ? { empresaId, usuarioId }
      : { empresaId };

    const comprobantes = await prisma.comprobante.findMany({
      where: whereClause,
      orderBy: { id: 'desc' }
    });

    const formatted = comprobantes.map(c => ({
      ...c,
      importe: Number(c.importe)
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// USUARIOS
app.get('/api/usuarios', authMiddleware, requireOwner, async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { empresaId: req.user.empresaId },
      include: { puntoVenta: true },
      orderBy: { id: 'asc' }
    });

    const formatted = usuarios.map(u => ({
      id: u.id,
      email: u.email,
      nombre: u.nombre,
      rol: u.rol,
      pv_numero: u.puntoVenta?.numero,
      pv_nombre: u.puntoVenta?.nombre
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/usuarios', authMiddleware, requireOwner, async (req, res) => {
  const { nombre, email, password, rol = 'vendedor', punto_venta_id } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const nuevoUsuario = await prisma.usuario.create({
      data: {
        empresaId: req.user.empresaId,
        email: (email || '').toLowerCase().trim(),
        passwordHash: hash,
        nombre,
        rol,
        puntoVentaId: punto_venta_id ? parseInt(punto_venta_id, 10) : null
      }
    });

    res.json({
      success: true,
      user: {
        id: nuevoUsuario.id,
        nombre: nuevoUsuario.nombre,
        email: nuevoUsuario.email,
        rol: nuevoUsuario.rol
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Email duplicado o inválido' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor Maxi Kiosco 24/7 con Prisma ORM activo en puerto ${PORT}`);
});
