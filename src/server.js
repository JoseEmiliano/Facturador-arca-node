const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const ExcelJS = require('exceljs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5050;
const SECRET_KEY = process.env.SECRET_KEY || 'arca_secret_key_cloud_2026';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://arca_user:arca_password_secure_2026@db:5432/facturador_arca'
});

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

    // Codificación oficial ARCA y generación directa de DataURL PNG
    const jsonB64 = Buffer.from(JSON.stringify(qrData)).toString('base64');
    const arcaUrl = `https://www.arca.gob.ar/fe/qr/?p=${encodeURIComponent(jsonB64)}`;
    
    const qrBase64 = await QRCode.toDataURL(arcaUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 200,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
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

// 1. Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const r = await pool.query(`
      SELECT u.*, e.razon_social, e.cuit, e.condicion_iva, e.plan, e.limite_mensual,
             pv.numero as pv_numero, pv.nombre as pv_nombre
      FROM usuarios u
      JOIN empresas e ON u.empresa_id = e.id
      LEFT JOIN puntos_venta pv ON u.punto_venta_id = pv.id
      WHERE u.email = $1
    `, [(email || '').toLowerCase().trim()]);

    if (r.rows.length === 0) return res.status(401).json({ success: false, error: 'Usuario no encontrado' });

    const user = r.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });

    const token = jwt.sign(
      { id: user.id, empresa_id: user.empresa_id, rol: user.rol },
      SECRET_KEY,
      { expiresIn: '12h' }
    );

    delete user.password_hash;
    res.json({ success: true, token, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Perfil
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.email, u.nombre, u.rol, u.punto_venta_id,
             pv.numero as pv_numero, pv.nombre as pv_nombre,
             e.id as empresa_id, e.razon_social, e.cuit, e.condicion_iva, e.plan, e.limite_mensual
      FROM usuarios u
      JOIN empresas e ON u.empresa_id = e.id
      LEFT JOIN puntos_venta pv ON u.punto_venta_id = pv.id
      WHERE u.id = $1
    `, [req.user.id]);

    if (r.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });

    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const countRes = await pool.query(
      'SELECT COUNT(*) as emitidas FROM comprobantes WHERE empresa_id = $1 AND creado_en >= $2',
      [r.rows[0].empresa_id, inicioMes]
    );

    res.json({
      user: r.rows[0],
      emitidas_mes: parseInt(countRes.rows[0].emitidas, 10)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Emisión Fiscal con Generación de QR Garantizada
app.post('/api/facturar', authMiddleware, async (req, res) => {
  const { empresa_id, id: usuario_id } = req.user;
  const {
    punto_venta,
    tipo_comprobante = 11,
    concepto = 1,
    receptor_nombre = 'Consumidor Final',
    receptor_doc = '0',
    receptor_condicion_iva = 'Consumidor Final',
    items = []
  } = req.body;

  try {
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Debe agregar al menos un producto a la factura.' });
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

    const empRes = await pool.query('SELECT * FROM empresas WHERE id = $1', [empresa_id]);
    const empresa = empRes.rows[0];

    const pv = parseInt(punto_venta, 10) || 1;
    const tipoCmp = parseInt(tipo_comprobante, 10);

    const nroRes = await pool.query(`
      SELECT COALESCE(MAX(nro_comprobante), 0) + 1 as sig
      FROM comprobantes
      WHERE empresa_id = $1 AND punto_venta = $2 AND tipo_comprobante = $3
    `, [empresa_id, pv, tipoCmp]);
    const nroCmp = parseInt(nroRes.rows[0].sig, 10);
    const numeroFormateado = `${String(pv).padStart(4, '0')}-${String(nroCmp).padStart(8, '0')}`;

    const docNro = parseInt(receptor_doc, 10) || 0;
    const docTipo = (docNro !== 0 && String(docNro).length <= 8) ? 96 : (docNro !== 0 ? 80 : 99);

    const { cae, caeVto, qrBase64 } = await arcaService.emitirFactura({
      cuit: empresa.cuit,
      puntoVenta: pv,
      tipoCmp,
      docTipo,
      docNro,
      importe: totalCalculado,
      nroCmp
    });

    const ahora = new Date();
    const fechaHoy = ahora.toLocaleDateString('es-AR');
    const horaActual = ahora.toLocaleTimeString('es-AR', { hour12: false });
    const conceptoResumen = itemsSanitizados.map(i => `${i.cantidad}x ${i.descripcion}`).join(', ');

    await pool.query(`
      INSERT INTO comprobantes (
        empresa_id, usuario_id, punto_venta, tipo_comprobante, nro_comprobante,
        numero, fecha, cuit_emisor, receptor_nombre, receptor_doc, receptor_condicion_iva,
        concepto_desc, importe, cae, cae_vto, qr_base64, items_json, hora
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `, [
      empresa_id, usuario_id, pv, tipoCmp, nroCmp,
      numeroFormateado, fechaHoy, empresa.cuit, receptor_nombre, String(docNro), receptor_condicion_iva,
      conceptoResumen, totalCalculado, cae, caeVto, qrBase64, JSON.stringify(itemsSanitizados), horaActual
    ]);

    for (const it of itemsSanitizados) {
      if (it.codigo && it.codigo !== '-') {
        await pool.query(
          'UPDATE productos SET stock = GREATEST(0, stock - $1) WHERE empresa_id = $2 AND codigo = $3',
          [Math.round(it.cantidad), empresa_id, it.codigo]
        );
      }
    }

    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const countRes = await pool.query(
      'SELECT COUNT(*) as emitidas FROM comprobantes WHERE empresa_id = $1 AND creado_en >= $2',
      [empresa_id, inicioMes]
    );

    res.json({
      success: true,
      numero: numeroFormateado,
      fecha: fechaHoy,
      hora: horaActual,
      cuit: empresa.cuit,
      razon_social: empresa.razon_social,
      condicion_iva: empresa.condicion_iva,
      receptor_nombre,
      receptor_doc: String(docNro),
      receptor_condicion_iva,
      items: itemsSanitizados,
      importe: totalCalculado.toFixed(2),
      cae,
      cae_vto: caeVto,
      qr: qrBase64,
      emitidas_mes: parseInt(countRes.rows[0].emitidas, 10)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Histórico
app.get('/api/historico', authMiddleware, async (req, res) => {
  const { empresa_id, id: usuario_id, rol } = req.user;
  try {
    const q = (rol === 'vendedor')
      ? 'SELECT * FROM comprobantes WHERE empresa_id = $1 AND usuario_id = $2 ORDER BY id DESC'
      : 'SELECT * FROM comprobantes WHERE empresa_id = $1 ORDER BY id DESC';
    const params = (rol === 'vendedor') ? [empresa_id, usuario_id] : [empresa_id];

    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. BI 24hs
app.get('/api/bi', authMiddleware, async (req, res) => {
  const { empresa_id } = req.user;
  const periodo = req.query.periodo || 'mes';
  const diasMap = { diario: 1, semanal: 7, mes: 30, trimestre: 90, semestre: 180, anual: 365 };
  const dias = diasMap[periodo] || 30;

  try {
    const limite = new Date();
    limite.setDate(limite.getDate() - dias);

    const r = await pool.query(`
      SELECT c.*, u.nombre as vendedor_nombre, pv.nombre as pv_nombre
      FROM comprobantes c
      LEFT JOIN usuarios u ON c.usuario_id = u.id
      LEFT JOIN puntos_venta pv ON c.punto_venta = pv.numero AND pv.empresa_id = c.empresa_id
      WHERE c.empresa_id = $1 AND c.creado_en >= $2 
      ORDER BY c.creado_en ASC
    `, [empresa_id, limite]);

    let total = 0;
    const ventasPorDia = {};
    const ventasPorHora = Array(24).fill(0);
    const ventasPorTurno = { 'Mañana (06-14)': 0, 'Tarde (14-22)': 0, 'Noche/Trasnocho (22-06)': 0 };
    const ventasPorPV = {};
    const ventasPorVendedor = {};
    const ventasPorProducto = {};

    r.rows.forEach(row => {
      const monto = parseFloat(row.importe);
      total += monto;

      const dia = row.fecha ? row.fecha.slice(0, 5) : 'Hoy';
      ventasPorDia[dia] = (ventasPorDia[dia] || 0) + monto;

      const hStr = row.hora || (row.creado_en ? new Date(row.creado_en).toLocaleTimeString('es-AR', { hour12: false }) : '12:00');
      const hora = parseInt(hStr.split(':')[0], 10) || 0;
      ventasPorHora[hora] += monto;

      if (hora >= 6 && hora < 14) {
        ventasPorTurno['Mañana (06-14)'] += monto;
      } else if (hora >= 14 && hora < 22) {
        ventasPorTurno['Tarde (14-22)'] += monto;
      } else {
        ventasPorTurno['Noche/Trasnocho (22-06)'] += monto;
      }

      const pvLabel = row.pv_nombre ? `Caja ${row.punto_venta} (${row.pv_nombre.split('-')[1]?.trim() || row.pv_nombre})` : `Caja ${row.punto_venta}`;
      ventasPorPV[pvLabel] = (ventasPorPV[pvLabel] || 0) + monto;

      const vendLabel = row.vendedor_nombre || 'Caja Principal';
      ventasPorVendedor[vendLabel] = (ventasPorVendedor[vendLabel] || 0) + monto;

      const items = row.items_json || [];
      if (Array.isArray(items) && items.length > 0) {
        items.forEach(it => {
          const prodNom = (it.descripcion || 'Producto').slice(0, 24);
          ventasPorProducto[prodNom] = (ventasPorProducto[prodNom] || 0) + (parseFloat(it.subtotal) || 0);
        });
      } else {
        const c = (row.concepto_desc || 'Varios').slice(0, 24);
        ventasPorProducto[c] = (ventasPorProducto[c] || 0) + monto;
      }
    });

    const cantidad = r.rows.length;
    const promedio = cantidad > 0 ? (total / cantidad) : 0;

    let mejorDia = '-';
    let maxDiaMonto = 0;
    for (const [dia, val] of Object.entries(ventasPorDia)) {
      if (val > maxDiaMonto) { maxDiaMonto = val; mejorDia = dia; }
    }

    let horaPico = 0;
    let maxHoraMonto = 0;
    ventasPorHora.forEach((m, h) => {
      if (m > maxHoraMonto) { maxHoraMonto = m; horaPico = h; }
    });

    const topProductos = Object.entries(ventasPorProducto).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const topVendedores = Object.entries(ventasPorVendedor).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topCajas = Object.entries(ventasPorPV).sort((a, b) => b[1] - a[1]);

    res.json({
      total: Math.round(total * 100) / 100,
      cantidad,
      promedio: Math.round(promedio * 100) / 100,
      mejor_dia: mejorDia,
      hora_pico: `${String(horaPico).padStart(2, '0')}:00 hs ($${Math.round(maxHoraMonto).toLocaleString('es-AR')})`,
      turnos_labels: Object.keys(ventasPorTurno),
      turnos_montos: Object.values(ventasPorTurno).map(v => Math.round(v)),
      horas_labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}h`),
      horas_montos: ventasPorHora.map(v => Math.round(v)),
      evolucion_fechas: Object.keys(ventasPorDia),
      evolucion_montos: Object.values(ventasPorDia),
      top_productos_nombres: topProductos.map(t => t[0]),
      top_productos_montos: topProductos.map(t => Math.round(t[1] * 100) / 100),
      vendedores_ranking: topVendedores.map(v => ({ nombre: v[0], total: Math.round(v[1]) })),
      cajas_ranking: topCajas.map(c => ({ caja: c[0], total: Math.round(c[1]) }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Inventario
app.get('/api/inventario', authMiddleware, async (req, res) => {
  const { empresa_id } = req.user;
  try {
    const r = await pool.query(`
      SELECT id, codigo, nombre, precio, stock, stock_minimo, tipo,
             ROUND(stock * precio, 2) as valor_total
      FROM productos 
      WHERE empresa_id = $1 
      ORDER BY (stock <= stock_minimo) DESC, nombre ASC
    `, [empresa_id]);

    const totalArticulos = r.rows.reduce((acc, row) => acc + (parseInt(row.stock, 10) || 0), 0);
    const valorizacionTotal = r.rows.reduce((acc, row) => acc + (parseFloat(row.valor_total) || 0), 0);
    const bajoStock = r.rows.filter(row => row.stock <= row.stock_minimo).length;

    res.json({
      resumen: {
        total_articulos: totalArticulos,
        valorizacion_total: Math.round(valorizacionTotal * 100) / 100,
        articulos_bajo_stock: bajoStock
      },
      items: r.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Exportación Inventario a Excel
app.get('/api/exportar/inventario', authMiddleware, async (req, res) => {
  const { empresa_id } = req.user;
  try {
    const r = await pool.query(`
      SELECT codigo, nombre, precio, stock, stock_minimo, tipo,
             ROUND(stock * precio, 2) as valor_total
      FROM productos 
      WHERE empresa_id = $1 
      ORDER BY nombre ASC
    `, [empresa_id]);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Inventario');

    sheet.columns = [
      { header: 'Código SKU', key: 'codigo', width: 15 },
      { header: 'Descripción del Producto', key: 'nombre', width: 35 },
      { header: 'Tipo', key: 'tipo', width: 12 },
      { header: 'Stock Actual', key: 'stock', width: 14 },
      { header: 'Stock Mínimo', key: 'stock_minimo', width: 14 },
      { header: 'Precio Unit ($)', key: 'precio', width: 16 },
      { header: 'Valorización ($)', key: 'valor_total', width: 18 }
    ];

    r.rows.forEach(row => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Inventario_MaxiKiosco.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Puntos de Venta
app.get('/api/puntos-venta', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT * FROM puntos_venta WHERE empresa_id = $1 ORDER BY numero ASC', [req.user.empresa_id]);
  res.json(r.rows);
});

app.post('/api/puntos-venta', authMiddleware, async (req, res) => {
  const { numero, nombre } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO puntos_venta (empresa_id, numero, nombre) VALUES ($1, $2, $3) RETURNING *',
      [req.user.empresa_id, parseInt(numero, 10), nombre]
    );
    res.json({ success: true, pv: r.rows[0] });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/puntos-venta/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM puntos_venta WHERE id = $1 AND empresa_id = $2 AND numero != 1', [req.params.id, req.user.empresa_id]);
  res.json({ success: true });
});

// 9. Usuarios
app.get('/api/usuarios', authMiddleware, async (req, res) => {
  const r = await pool.query(`
    SELECT u.id, u.email, u.nombre, u.rol, pv.numero as pv_numero, pv.nombre as pv_nombre
    FROM usuarios u
    LEFT JOIN puntos_venta pv ON u.punto_venta_id = pv.id
    WHERE u.empresa_id = $1 ORDER BY u.id ASC
  `, [req.user.empresa_id]);
  res.json(r.rows);
});

app.post('/api/usuarios', authMiddleware, async (req, res) => {
  const { nombre, email, password, rol = 'vendedor', punto_venta_id } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(`
      INSERT INTO usuarios (empresa_id, email, password_hash, nombre, rol, punto_venta_id)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nombre, email, rol
    `, [req.user.empresa_id, (email || '').toLowerCase().trim(), hash, nombre, rol, punto_venta_id || null]);
    res.json({ success: true, user: r.rows[0] });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Email duplicado o inválido' });
  }
});

// 10. Clientes
app.get('/api/clientes', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT * FROM clientes WHERE empresa_id = $1 ORDER BY id DESC', [req.user.empresa_id]);
  res.json(r.rows);
});

app.post('/api/clientes', authMiddleware, async (req, res) => {
  const { nombre, cuit_dni, condicion_iva = 'Consumidor Final', email, telefono } = req.body;
  const r = await pool.query(
    'INSERT INTO clientes (empresa_id, nombre, cuit_dni, condicion_iva, email, telefono) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.user.empresa_id, nombre, cuit_dni, condicion_iva, email, telefono]
  );
  res.json({ success: true, cliente: r.rows[0] });
});

app.delete('/api/clientes/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM clientes WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]);
  res.json({ success: true });
});

// 11. Productos
app.get('/api/productos', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT * FROM productos WHERE empresa_id = $1 ORDER BY id DESC', [req.user.empresa_id]);
  res.json(r.rows);
});

app.post('/api/productos', authMiddleware, async (req, res) => {
  const { codigo, nombre, precio, stock = 50, stock_minimo = 10, tipo = 'producto' } = req.body;
  const r = await pool.query(
    'INSERT INTO productos (empresa_id, codigo, nombre, precio, stock, stock_minimo, tipo) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [req.user.empresa_id, codigo, nombre, parseFloat(precio) || 0, parseInt(stock, 10), parseInt(stock_minimo, 10), tipo]
  );
  res.json({ success: true, producto: r.rows[0] });
});

app.delete('/api/productos/:id', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM productos WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]);
  res.json({ success: true });
});

// 12. Backup JSON
app.get('/api/empresa/backup', authMiddleware, async (req, res) => {
  const { empresa_id } = req.user;
  try {
    const emp = await pool.query('SELECT * FROM empresas WHERE id = $1', [empresa_id]);
    const pvs = await pool.query('SELECT * FROM puntos_venta WHERE empresa_id = $1', [empresa_id]);
    const users = await pool.query('SELECT id, email, nombre, rol, punto_venta_id FROM usuarios WHERE empresa_id = $1', [empresa_id]);
    const cmps = await pool.query('SELECT * FROM comprobantes WHERE empresa_id = $1 ORDER BY id ASC', [empresa_id]);
    const clis = await pool.query('SELECT * FROM clientes WHERE empresa_id = $1', [empresa_id]);
    const prods = await pool.query('SELECT * FROM productos WHERE empresa_id = $1', [empresa_id]);

    const backup = {
      metadata: {
        sistema: 'GESTIONCLOUD MAXI KIOSCO 24/7',
        fecha: new Date().toISOString(),
        empresa: emp.rows[0].razon_social,
        cuit: emp.rows[0].cuit
      },
      empresa: emp.rows[0],
      puntos_venta: pvs.rows,
      usuarios: users.rows,
      comprobantes: cmps.rows,
      clientes: clis.rows,
      productos: prods.rows
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=Backup_Kiosco_${emp.rows[0].cuit}_${Date.now()}.json`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 13. Exportar Excel
app.get('/api/exportar/excel', authMiddleware, async (req, res) => {
  const { empresa_id } = req.user;
  try {
    const empRes = await pool.query('SELECT cuit, razon_social FROM empresas WHERE id = $1', [empresa_id]);
    const facturas = await pool.query(`
      SELECT c.*, u.nombre as vendedor_nombre, pv.nombre as pv_nombre
      FROM comprobantes c
      LEFT JOIN usuarios u ON c.usuario_id = u.id
      LEFT JOIN puntos_venta pv ON c.punto_venta = pv.numero AND pv.empresa_id = c.empresa_id
      WHERE c.empresa_id = $1 
      ORDER BY c.id DESC
    `, [empresa_id]);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Facturas Kiosco');
    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Hora', key: 'hora', width: 10 },
      { header: 'N° Comprobante', key: 'numero', width: 18 },
      { header: 'Caja / Sector', key: 'pv_nombre', width: 25 },
      { header: 'Vendedor', key: 'vendedor_nombre', width: 22 },
      { header: 'Cliente', key: 'receptor_nombre', width: 25 },
      { header: 'Detalle de Productos', key: 'concepto_desc', width: 40 },
      { header: 'Total ($)', key: 'importe', width: 15 },
      { header: 'CAE', key: 'cae', width: 18 }
    ];

    facturas.rows.forEach(r => sheet.addRow(r));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Facturas_${empRes.rows[0].cuit}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor Maxi Kiosco 24/7 activo en puerto ${PORT}`);
});
