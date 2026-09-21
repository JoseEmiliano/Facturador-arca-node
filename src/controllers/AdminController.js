const db = require('../config/database');
const bcrypt = require('bcryptjs');

class AdminController {
  // Puntos de Venta
  async listarPV(req, res) {
    const { empresa_id } = req.user;
    const r = await db.query('SELECT * FROM puntos_venta WHERE empresa_id = $1 ORDER BY numero ASC', [empresa_id]);
    res.json(r.rows);
  }

  async crearPV(req, res) {
    const { empresa_id } = req.user;
    const { numero, nombre } = req.body;
    try {
      const r = await db.query(
        'INSERT INTO puntos_venta (empresa_id, numero, nombre) VALUES ($1, $2, $3) RETURNING *',
        [empresa_id, parseInt(numero, 10), nombre]
      );
      res.json({ success: true, pv: r.rows[0] });
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  }

  async eliminarPV(req, res) {
    const { empresa_id } = req.user;
    const { id } = req.params;
    await db.query('DELETE FROM puntos_venta WHERE id = $1 AND empresa_id = $2 AND numero != 1', [id, empresa_id]);
    res.json({ success: true });
  }

  // Usuarios y Roles
  async listarUsuarios(req, res) {
    const { empresa_id } = req.user;
    const r = await db.query(`
      SELECT u.id, u.email, u.nombre, u.rol, pv.numero as pv_numero, pv.nombre as pv_nombre
      FROM usuarios u
      LEFT JOIN puntos_venta pv ON u.punto_venta_id = pv.id
      WHERE u.empresa_id = $1 ORDER BY u.id ASC
    `, [empresa_id]);
    res.json(r.rows);
  }

  async crearUsuario(req, res) {
    const { empresa_id } = req.user;
    const { nombre, email, password, rol = 'vendedor', punto_venta_id } = req.body;
    try {
      const hash = await bcrypt.hash(password, 10);
      const r = await db.query(`
        INSERT INTO usuarios (empresa_id, email, password_hash, nombre, rol, punto_venta_id)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nombre, email, rol
      `, [empresa_id, email.toLowerCase().trim(), hash, nombre, rol, punto_venta_id || null]);
      res.json({ success: true, user: r.rows[0] });
    } catch (e) {
      res.status(400).json({ success: false, error: 'El email ya existe o datos incorrectos.' });
    }
  }

  // Backup Completo JSON
  async backup(req, res) {
    const { empresa_id } = req.user;
    try {
      const emp = await db.query('SELECT * FROM empresas WHERE id = $1', [empresa_id]);
      const pvs = await db.query('SELECT * FROM puntos_venta WHERE empresa_id = $1', [empresa_id]);
      const users = await db.query('SELECT id, email, nombre, rol, punto_venta_id FROM usuarios WHERE empresa_id = $1', [empresa_id]);
      const cmps = await db.query('SELECT * FROM comprobantes WHERE empresa_id = $1 ORDER BY id ASC', [empresa_id]);
      const clis = await db.query('SELECT * FROM clientes WHERE empresa_id = $1', [empresa_id]);
      const prods = await db.query('SELECT * FROM productos WHERE empresa_id = $1', [empresa_id]);

      const payload = {
        metadata: {
          sistema: 'GESTIONCLOUD ARCA NODE',
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
      res.setHeader('Content-Disposition', `attachment; filename=Backup_${emp.rows[0].cuit}_${Date.now()}.json`);
      res.send(JSON.stringify(payload, null, 2));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
}

module.exports = new AdminController();
