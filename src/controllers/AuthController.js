const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const SECRET_KEY = process.env.SECRET_KEY || 'arca_node_secret_key_2026';

class AuthController {
  async login(req, res) {
    const { email, password } = req.body;
    try {
      const result = await db.query(`
        SELECT u.*, e.razon_social, e.cuit, e.condicion_iva, e.plan, e.limite_mensual,
               pv.numero as pv_numero, pv.nombre as pv_nombre
        FROM usuarios u
        JOIN empresas e ON u.empresa_id = e.id
        LEFT JOIN puntos_venta pv ON u.punto_venta_id = pv.id
        WHERE u.email = $1
      `, [email.toLowerCase().trim()]);

      if (result.rows.length === 0) {
        return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
      }

      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
      }

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
  }

  async me(req, res) {
    try {
      const result = await db.query(`
        SELECT u.id, u.email, u.nombre, u.rol, u.punto_venta_id,
               pv.numero as pv_numero, pv.nombre as pv_nombre,
               e.id as empresa_id, e.razon_social, e.cuit, e.condicion_iva, e.plan, e.limite_mensual
        FROM usuarios u
        JOIN empresas e ON u.empresa_id = e.id
        LEFT JOIN puntos_venta pv ON u.punto_venta_id = pv.id
        WHERE u.id = $1
      `, [req.user.id]);

      if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });

      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0,0,0,0);

      const countRes = await db.query(
        'SELECT COUNT(*) as emitidas FROM comprobantes WHERE empresa_id = $1 AND creado_en >= $2',
        [result.rows[0].empresa_id, inicioMes]
      );

      res.json({
        user: result.rows[0],
        emitidas_mes: parseInt(countRes.rows[0].emitidas, 10)
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new AuthController();
