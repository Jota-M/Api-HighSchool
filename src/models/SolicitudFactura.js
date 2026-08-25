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
        ua.username   AS subido_por_username,
        COALESCE(grp.monto_total, pm.monto_pagado) AS monto_total,
        COALESCE(grp.cantidad_cuotas, 1) AS cantidad_cuotas,
        COALESCE(grp.meses_cubiertos, ARRAY[m.mes_correspondiente]) AS meses_cubiertos,
        COALESCE(grp.codigos_pago, ARRAY[pm.codigo_pago]) AS codigos_pago
      FROM solicitud_factura sf
      INNER JOIN pago_mensualidad pm ON sf.pago_mensualidad_id = pm.id
      INNER JOIN mensualidad m       ON pm.mensualidad_id      = m.id
      INNER JOIN matricula mat       ON m.matricula_id         = mat.id
      INNER JOIN estudiante e        ON mat.estudiante_id      = e.id
      INNER JOIN paralelo p          ON mat.paralelo_id        = p.id
      INNER JOIN grado g             ON p.grado_id             = g.id
      INNER JOIN usuarios u          ON sf.solicitado_por      = u.id
      LEFT  JOIN usuarios ua         ON sf.subido_por          = ua.id
      LEFT JOIN LATERAL (
        SELECT
          SUM(p_sub.monto_pagado) AS monto_total,
          COUNT(p_sub.id) AS cantidad_cuotas,
          ARRAY_AGG(m_sub.mes_correspondiente ORDER BY p_sub.id ASC) AS meses_cubiertos,
          ARRAY_AGG(p_sub.codigo_pago ORDER BY p_sub.id ASC) AS codigos_pago
        FROM pago_mensualidad p_sub
        INNER JOIN mensualidad m_sub ON p_sub.mensualidad_id = m_sub.id
        WHERE (
          (sf.pago_mensualidad_ids IS NOT NULL AND cardinality(sf.pago_mensualidad_ids) > 0 AND p_sub.id = ANY(sf.pago_mensualidad_ids))
          OR (sf.transaccion_id IS NOT NULL AND p_sub.transaccion_id = sf.transaccion_id)
          OR (p_sub.id = sf.pago_mensualidad_id)
        )
        AND p_sub.anulado = false
      ) grp ON true
      WHERE sf.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] ?? null;
  }

  // ── Buscar por pago_mensualidad_id (soporta verificación en array de pagos y transaccion_id) ────────
  static async findByPago(pago_mensualidad_id) {
    const pagoInfo = await pool.query(
      `SELECT transaccion_id FROM pago_mensualidad WHERE id = $1`,
      [pago_mensualidad_id]
    );
    const transaccion_id = pagoInfo.rows[0]?.transaccion_id;

    const query = `
      SELECT sf.*,
        pm.codigo_pago,
        pm.monto_pagado,
        pm.fecha_pago,
        m.mes_correspondiente,
        m.numero_cuota,
        e.nombres   AS estudiante_nombres,
        e.apellidos AS estudiante_apellidos,
        COALESCE(grp.monto_total, pm.monto_pagado) AS monto_total,
        COALESCE(grp.cantidad_cuotas, 1) AS cantidad_cuotas,
        COALESCE(grp.meses_cubiertos, ARRAY[m.mes_correspondiente]) AS meses_cubiertos
      FROM solicitud_factura sf
      INNER JOIN pago_mensualidad pm ON sf.pago_mensualidad_id = pm.id
      INNER JOIN mensualidad m       ON pm.mensualidad_id      = m.id
      INNER JOIN matricula mat       ON m.matricula_id         = mat.id
      INNER JOIN estudiante e        ON mat.estudiante_id      = e.id
      LEFT JOIN LATERAL (
        SELECT
          SUM(p_sub.monto_pagado) AS monto_total,
          COUNT(p_sub.id) AS cantidad_cuotas,
          ARRAY_AGG(m_sub.mes_correspondiente ORDER BY p_sub.id ASC) AS meses_cubiertos
        FROM pago_mensualidad p_sub
        INNER JOIN mensualidad m_sub ON p_sub.mensualidad_id = m_sub.id
        WHERE (
          (sf.pago_mensualidad_ids IS NOT NULL AND cardinality(sf.pago_mensualidad_ids) > 0 AND p_sub.id = ANY(sf.pago_mensualidad_ids))
          OR (sf.transaccion_id IS NOT NULL AND p_sub.transaccion_id = sf.transaccion_id)
          OR (p_sub.id = sf.pago_mensualidad_id)
        )
        AND p_sub.anulado = false
      ) grp ON true
      WHERE sf.pago_mensualidad_id = $1
         OR $1 = ANY(sf.pago_mensualidad_ids)
         OR ($2::VARCHAR IS NOT NULL AND sf.transaccion_id = $2::VARCHAR)
      LIMIT 1
    `;
    const result = await pool.query(query, [pago_mensualidad_id, transaccion_id ?? null]);
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
        g.nombre    AS grado,
        COALESCE(grp.monto_total, pm.monto_pagado) AS monto_total,
        COALESCE(grp.cantidad_cuotas, 1) AS cantidad_cuotas,
        COALESCE(grp.meses_cubiertos, ARRAY[m.mes_correspondiente]) AS meses_cubiertos,
        COALESCE(grp.codigos_pago, ARRAY[pm.codigo_pago]) AS codigos_pago
      FROM solicitud_factura sf
      INNER JOIN pago_mensualidad pm ON sf.pago_mensualidad_id = pm.id
      INNER JOIN mensualidad m       ON pm.mensualidad_id      = m.id
      INNER JOIN matricula mat       ON m.matricula_id         = mat.id
      INNER JOIN estudiante e        ON mat.estudiante_id      = e.id
      INNER JOIN paralelo p          ON mat.paralelo_id        = p.id
      INNER JOIN grado g             ON p.grado_id             = g.id
      LEFT JOIN LATERAL (
        SELECT
          SUM(p_sub.monto_pagado) AS monto_total,
          COUNT(p_sub.id) AS cantidad_cuotas,
          ARRAY_AGG(m_sub.mes_correspondiente ORDER BY p_sub.id ASC) AS meses_cubiertos,
          ARRAY_AGG(p_sub.codigo_pago ORDER BY p_sub.id ASC) AS codigos_pago
        FROM pago_mensualidad p_sub
        INNER JOIN mensualidad m_sub ON p_sub.mensualidad_id = m_sub.id
        WHERE (
          (sf.pago_mensualidad_ids IS NOT NULL AND cardinality(sf.pago_mensualidad_ids) > 0 AND p_sub.id = ANY(sf.pago_mensualidad_ids))
          OR (sf.transaccion_id IS NOT NULL AND p_sub.transaccion_id = sf.transaccion_id)
          OR (p_sub.id = sf.pago_mensualidad_id)
        )
        AND p_sub.anulado = false
      ) grp ON true
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
        u.username  AS solicitado_por_username,
        COALESCE(grp.monto_total, pm.monto_pagado) AS monto_total,
        COALESCE(grp.cantidad_cuotas, 1) AS cantidad_cuotas,
        COALESCE(grp.meses_cubiertos, ARRAY[m.mes_correspondiente]) AS meses_cubiertos,
        COALESCE(grp.codigos_pago, ARRAY[pm.codigo_pago]) AS codigos_pago
      FROM solicitud_factura sf
      INNER JOIN pago_mensualidad pm ON sf.pago_mensualidad_id = pm.id
      INNER JOIN mensualidad m       ON pm.mensualidad_id      = m.id
      INNER JOIN matricula mat       ON m.matricula_id         = mat.id
      INNER JOIN estudiante e        ON mat.estudiante_id      = e.id
      INNER JOIN paralelo p          ON mat.paralelo_id        = p.id
      INNER JOIN grado g             ON p.grado_id             = g.id
      INNER JOIN usuarios u          ON sf.solicitado_por      = u.id
      LEFT JOIN LATERAL (
        SELECT
          SUM(p_sub.monto_pagado) AS monto_total,
          COUNT(p_sub.id) AS cantidad_cuotas,
          ARRAY_AGG(m_sub.mes_correspondiente ORDER BY p_sub.id ASC) AS meses_cubiertos,
          ARRAY_AGG(p_sub.codigo_pago ORDER BY p_sub.id ASC) AS codigos_pago
        FROM pago_mensualidad p_sub
        INNER JOIN mensualidad m_sub ON p_sub.mensualidad_id = m_sub.id
        WHERE (
          (sf.pago_mensualidad_ids IS NOT NULL AND cardinality(sf.pago_mensualidad_ids) > 0 AND p_sub.id = ANY(sf.pago_mensualidad_ids))
          OR (sf.transaccion_id IS NOT NULL AND p_sub.transaccion_id = sf.transaccion_id)
          OR (p_sub.id = sf.pago_mensualidad_id)
        )
        AND p_sub.anulado = false
      ) grp ON true
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

  // ── Crear solicitud (resuelve grupo de pagos por transaccion_id) ────
  static async create(pago_mensualidad_id, solicitado_por) {
    const pagoInfo = await pool.query(
      `SELECT transaccion_id FROM pago_mensualidad WHERE id = $1`,
      [pago_mensualidad_id]
    );
    const transaccion_id = pagoInfo.rows[0]?.transaccion_id;
    let pago_mensualidad_ids = [pago_mensualidad_id];

    if (transaccion_id) {
      const hermanos = await pool.query(
        `SELECT id FROM pago_mensualidad WHERE transaccion_id = $1 AND anulado = false ORDER BY id ASC`,
        [transaccion_id]
      );
      if (hermanos.rows.length > 0) {
        pago_mensualidad_ids = hermanos.rows.map(r => r.id);
      }
    }

    const result = await pool.query(
      `INSERT INTO solicitud_factura (pago_mensualidad_id, pago_mensualidad_ids, transaccion_id, solicitado_por)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [pago_mensualidad_id, pago_mensualidad_ids, transaccion_id, solicitado_por]
    );
    return result.rows[0];
  }

  // ── Admin sube la factura (marca todos los pagos del grupo) ─────────
  static async subirFactura(id, { factura_url, factura_public_id, subido_por, observaciones }) {
    // 1. Obtener los IDs de pagos asociados
    const solRes = await pool.query(
      `SELECT pago_mensualidad_id, pago_mensualidad_ids, transaccion_id FROM solicitud_factura WHERE id = $1`,
      [id]
    );
    const sol = solRes.rows[0];
    if (!sol) return null;

    // 2. Actualizar solicitud_factura
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

    // 3. Actualizar todos los pagos del grupo a entrego_factura = true
    let idsParaActualizar = [];
    if (sol.pago_mensualidad_ids && sol.pago_mensualidad_ids.length > 0) {
      idsParaActualizar = sol.pago_mensualidad_ids;
    } else if (sol.pago_mensualidad_id) {
      idsParaActualizar = [sol.pago_mensualidad_id];
    }

    if (idsParaActualizar.length > 0) {
      await pool.query(
        `UPDATE pago_mensualidad
         SET entrego_factura = true,
             updated_at      = CURRENT_TIMESTAMP
         WHERE id = ANY($1)`,
        [idsParaActualizar]
      );
    } else if (sol.transaccion_id) {
      await pool.query(
        `UPDATE pago_mensualidad
         SET entrego_factura = true,
             updated_at      = CURRENT_TIMESTAMP
         WHERE transaccion_id = $1`,
        [sol.transaccion_id]
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