const db = require('../config/database');

class BiController {
  async getMetricas(req, res) {
    const { empresa_id } = req.user;
    const periodo = req.query.periodo || 'mes';
    const dias = { mes: 30, trimestre: 90, anual: 365 }[periodo] || 30;

    try {
      const limite = new Date();
      limite.setDate(limite.getDate() - dias);

      const result = await db.query(`
        SELECT fecha, concepto_desc, importe, creado_en 
        FROM comprobantes 
        WHERE empresa_id = $1 AND creado_en >= $2 
        ORDER BY creado_en ASC
      `, [empresa_id, limite]);

      let total = 0;
      const ventasPorDia = {};
      const ventasPorConcepto = {};

      result.rows.forEach(r => {
        const monto = parseFloat(r.importe);
        total += monto;

        const dia = r.fecha.slice(0, 5); // dd/mm
        ventasPorDia[dia] = (ventasPorDia[dia] || 0) + monto;

        const concepto = (r.concepto_desc || 'Varios').slice(0, 20);
        ventasPorConcepto[concepto] = (ventasPorConcepto[concepto] || 0) + monto;
      });

      const cantidad = result.rows.length;
      const promedio = cantidad > 0 ? (total / cantidad) : 0;

      let mejorDia = '-';
      let maxDiaMonto = 0;
      for (const [d, m] of Object.entries(ventasPorDia)) {
        if (m > maxDiaMonto) { maxDiaMonto = m; mejorDia = d; }
      }

      const topConceptos = Object.entries(ventasPorConcepto)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      res.json({
        total: Math.round(total * 100) / 100,
        cantidad,
        promedio: Math.round(promedio * 100) / 100,
        mejor_dia: mejorDia,
        evolucion_fechas: Object.keys(ventasPorDia),
        evolucion_montos: Object.values(ventasPorDia),
        top_conceptos_nombres: topConceptos.map(t => t[0]),
        top_conceptos_montos: topConceptos.map(t => Math.round(t[1] * 100) / 100)
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new BiController();
