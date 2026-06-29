// models/SolicitudFactura.js
import { pool } from '../db/pool.js';

class SolicitudFactura {

  // ── Buscar por ID con todos los detalles ──────────────────────────
  static async findById(id) {
    const query = `
      SELECT
        sf.*,
        pm.codigo_pago,
        pm.monto_pagado,
        pm.fecha_pago,
        pm.metodo_pago,
        m.mes_correspondiente,
        m.numero_cuota,
        e.id          AS estudiante_id,
        e.nombres     AS estudiante_nombres,
        e.apellidos   AS estudiante_apellidos,
        e.codigo      AS estudiante_codigo,
        g.nombre      AS grado,
        p.nombre      AS paralelo,
        u.username    AS solicitado_por_username,
        ua.username   AS subido_por_username
      FROM solicitud_factura sf
      INNER JOIN pago_mensualidad pm ON sf.pago_mensualidad_id = pm.id
      INNER JOIN mensualidad m       ON pm.mensualidad_id      = m.id
      INNER JOIN matricula mat       ON m.matricula_id         = mat.id
      INNER JOIN estudiante e        ON mat.estudiante_id      = e.id
      INNER JOIN paralelo p          ON mat.paralelo_id        = p.id
      INNER JOIN grado g             ON p.grado_id             = g.id
      INNER JOIN usuarios u          ON sf.solicitado_por      = u.id
      LEFT  JOIN usuarios ua         ON sf.subido_por          = ua.id
      WHERE sf.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] ?? null;
  }

  // ── Buscar por pago_mensualidad_id ────────────────────────────────
  static async findByPago(pago_mensualidad_id) {
    const query = `
      SELECT sf.*,
        pm.codigo_pago,
        pm.monto_pagado,
        pm.fecha_pago,
        m.mes_correspondiente,
        m.numero_cuota,
        e.nombres  AS estudiante_nombres,
        e.apellidos AS estudiante_apellidos
      FROM solicitud_factura sf
      INNER JOIN pago_mensualidad pm ON sf.pago_mensualidad_id = pm.id
      INNER JOIN mensualidad m       ON pm.mensualidad_id      = m.id
      INNER JOIN matricula mat       ON m.matricula_id         = mat.id
      INNER JOIN estudiante e        ON mat.estudiante_id      = e.id
      WHERE sf.pago_mensualidad_id = $1
    `;
    const result = await pool.query(query, [pago_mensualidad_id]);
    return result.rows[0] ?? null;
  }

  // ── Listar solicitudes del padre ──────────────────────────────────
  static async findByPadre(usuario_id) {
    const query = `
      SELECT
        sf.*,
        pm.codigo_pago,
        pm.monto_pagado,
        pm.fecha_pago,
        m.mes_correspondiente,
        m.numero_cuota,
        e.nombres   AS estudiante_nombres,
        e.apellidos AS estudiante_apellidos,
        g.nombre    AS grado
      FROM solicitud_factura sf
      INNER JOIN pago_mensualidad pm ON sf.pago_mensualidad_id = pm.id
      INNER JOIN mensualidad m       ON pm.mensualidad_id      = m.id
      INNER JOIN matricula mat       ON m.matricula_id         = mat.id
      INNER JOIN estudiante e        ON mat.estudiante_id      = e.id
      INNER JOIN paralelo p          ON mat.paralelo_id        = p.id
      INNER JOIN grado g             ON p.grado_id             = g.id
      WHERE sf.solicitado_por = $1
      ORDER BY sf.fecha_solicitud DESC
    `;
    const result = await pool.query(query, [usuario_id]);
    return result.rows;
  }

  // ── Listar todas para el admin ────────────────────────────────────
  static async findAll(filters = {}) {
    const { estado, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];
    let i = 1;

    if (estado) {
      where.push(`sf.estado = $${i++}`);
      params.push(estado);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM solicitud_factura sf ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const query = `
      SELECT
        sf.*,
        pm.codigo_pago,
        pm.monto_pagado,
        pm.fecha_pago,
        m.mes_correspondiente,
        m.numero_cuota,
        e.nombres   AS estudiante_nombres,
        e.apellidos AS estudiante_apellidos,
        g.nombre    AS grado,
        p.nombre    AS paralelo,
        u.username  AS solicitado_por_username
      FROM solicitud_factura sf
      INNER JOIN pago_mensualidad pm ON sf.pago_mensualidad_id = pm.id
      INNER JOIN mensualidad m       ON pm.mensualidad_id      = m.id
      INNER JOIN matricula mat       ON m.matricula_id         = mat.id
      INNER JOIN estudiante e        ON mat.estudiante_id      = e.id
      INNER JOIN paralelo p          ON mat.paralelo_id        = p.id
      INNER JOIN grado g             ON p.grado_id             = g.id
      INNER JOIN usuarios u          ON sf.solicitado_por      = u.id
      ${whereClause}
      ORDER BY
        CASE sf.estado WHEN 'pendiente' THEN 0 ELSE 1 END,
        sf.fecha_solicitud DESC
      LIMIT $${i++} OFFSET $${i++}
    `;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    return {
      solicitudes: result.rows,
      paginacion: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // ── Crear solicitud ───────────────────────────────────────────────
  static async create(pago_mensualidad_id, solicitado_por) {
    const result = await pool.query(
      `INSERT INTO solicitud_factura (pago_mensualidad_id, solicitado_por)
       VALUES ($1, $2)
       RETURNING *`,
      [pago_mensualidad_id, solicitado_por]
    );
    return result.rows[0];
  }

  // ── Admin sube la factura ─────────────────────────────────────────
  static async subirFactura(id, { factura_url, factura_public_id, subido_por, observaciones }) {

    // Primero obtener el pago_mensualidad_id
    const solicitud = await pool.query(
      `SELECT pago_mensualidad_id FROM solicitud_factura WHERE id = $1`, [id]
    );
    const pago_id = solicitud.rows[0]?.pago_mensualidad_id;

    // Actualizar solicitud_factura
    const result = await pool.query(
      `UPDATE solicitud_factura
     SET estado            = 'completada',
         factura_url       = $1,
         factura_public_id = $2,
         subido_por        = $3,
         fecha_subida      = CURRENT_TIMESTAMP,
         observaciones     = COALESCE($4, observaciones),
         updated_at        = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
      [factura_url, factura_public_id, subido_por, observaciones, id]
    );

    // ✅ Actualizar pago_mensualidad — factura entregada
    if (pago_id) {
      await pool.query(
        `UPDATE pago_mensualidad
       SET entrego_factura = true,
           updated_at      = CURRENT_TIMESTAMP
       WHERE id = $1`,
        [pago_id]
      );
    }

    return result.rows[0] ?? null;
  }

  // ── Badge: conteo de pendientes ───────────────────────────────────
  static async countPendientes() {
    const result = await pool.query(
      `SELECT COUNT(*) FROM solicitud_factura WHERE estado = 'pendiente'`
    );
    return parseInt(result.rows[0].count);
  }
}

export default SolicitudFactura;