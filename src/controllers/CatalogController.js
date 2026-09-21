const db = require('../config/database');

class CatalogController {
  // Clientes
  async listarClientes(req, res) {
    const r = await db.query('SELECT * FROM clientes WHERE empresa_id = $1 ORDER BY id DESC', [req.user.empresa_id]);
    res.json(r.rows);
  }

  async crearCliente(req, res) {
    const { nombre, cuit_dni, condicion_iva = 'Consumidor Final', email, telefono } = req.body;
    const r = await db.query(
      'INSERT INTO clientes (empresa_id, nombre, cuit_dni, condicion_iva, email, telefono) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.user.empresa_id, nombre, cuit_dni, condicion_iva, email, telefono]
    );
    res.json({ success: true, cliente: r.rows[0] });
  }

  async eliminarCliente(req, res) {
    await db.query('DELETE FROM clientes WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]);
    res.json({ success: true });
  }

  // Productos
  async listarProductos(req, res) {
    const r = await db.query('SELECT * FROM productos WHERE empresa_id = $1 ORDER BY id DESC', [req.user.empresa_id]);
    res.json(r.rows);
  }

  async crearProducto(req, res) {
    const { codigo, nombre, precio, tipo = 'servicio' } = req.body;
    const r = await db.query(
      'INSERT INTO productos (empresa_id, codigo, nombre, precio, tipo) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.user.empresa_id, codigo, nombre, parseFloat(precio) || 0, tipo]
    );
    res.json({ success: true, producto: r.rows[0] });
  }

  async eliminarProducto(req, res) {
    await db.query('DELETE FROM productos WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]);
    res.json({ success: true });
  }
}

module.exports = new CatalogController();
