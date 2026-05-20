// src/models/Notificacion.js
import { pool } from '../db/pool.js';

class NotificacionInstitucional {

  // ─── Generar código único ─────────────────────────────────────
  static async generarCodigo() {
    const result = await pool.query(
      `SELECT generar_codigo_notificacion() AS codigo`
    );
    return result.rows[0].codigo;
  }

  // ─── Crear notificación (en borrador) ─────────────────────────
  static async create(data) {
    const {
      titulo, mensaje, tipo, prioridad, audiencia,
      nivel_academico_id, grado_id, paralelo_id, periodo_academico_id,
      destinatario_usuario_id,
      enviar_whatsapp, enviar_email, enviar_interno,
      programada_para, adjunto_url, adjunto_nombre, foto_url, foto_public_id,
      creada_por
    } = data;

    const codigo = await this.generarCodigo();

    const result = await pool.query(`
  INSERT INTO notificacion_institucional (
    codigo, titulo, mensaje, tipo, prioridad, audiencia,
    nivel_academico_id, grado_id, paralelo_id, periodo_academico_id,
    destinatario_usuario_id,
    enviar_whatsapp, enviar_email, enviar_interno,
    programada_para, adjunto_url, adjunto_nombre, foto_url, foto_public_id,
    creada_por,
    estado
  ) VALUES (
    $1,$2,$3,$4,$5,$6,
    $7,$8,$9,$10,
    $11,
    $12,$13,$14,
    $15,$16,$17,$18,$19,  -- ← $18 = foto_url, $19 = foto_public_id
    $20,
    CASE WHEN $15::TIMESTAMP IS NOT NULL THEN 'programada' ELSE 'borrador' END
  )
  RETURNING *
`, [
  codigo, titulo, mensaje, tipo, prioridad || 'normal', audiencia,   // 1-6
  nivel_academico_id || null, grado_id || null, paralelo_id || null, // 7-9
  periodo_academico_id || null,                                       // 10
  destinatario_usuario_id || null,                                    // 11
  enviar_whatsapp ?? true, enviar_email ?? true, enviar_interno ?? true, // 12-14
  programada_para || null, adjunto_url || null, adjunto_nombre || null,  // 15-17
  foto_url || null, foto_public_id || null,                              // 18-19
  creada_por,                                                            // 20
]);

    return result.rows[0];
  }

  // ─── Listar con filtros y paginación ─────────────────────────
  static async findAll(filters = {}) {
    const {
      page = 1, limit = 20,
      tipo, estado, audiencia, creada_por,
      fecha_inicio, fecha_fin
    } = filters;
    const offset = (page - 1) * limit;

    let where = ['ni.deleted_at IS NULL'];
    let params = [];
    let p = 1;

    if (tipo)       { where.push(`ni.tipo = $${p++}`);       params.push(tipo); }
    if (estado)     { where.push(`ni.estado = $${p++}`);     params.push(estado); }
    if (audiencia)  { where.push(`ni.audiencia = $${p++}`);  params.push(audiencia); }
    if (creada_por) { where.push(`ni.creada_por = $${p++}`); params.push(creada_por); }
    if (fecha_inicio) { where.push(`ni.created_at >= $${p++}`); params.push(fecha_inicio); }
    if (fecha_fin)    { where.push(`ni.created_at <= $${p++}`); params.push(fecha_fin); }

    const whereClause = `WHERE ${where.join(' AND ')}`;

    const total = parseInt(
      (await pool.query(`SELECT COUNT(*) FROM notificacion_institucional ni ${whereClause}`, params))
        .rows[0].count
    );

    const result = await pool.query(`
      SELECT
        ni.*,
        u.username            AS creada_por_username,
        g.nombre              AS grado_nombre,
        p.nombre              AS paralelo_nombre,
        n.nombre              AS nivel_nombre,
        -- Resumen de envíos
        COUNT(nd.id)          AS total_destinatarios,
        COUNT(CASE WHEN nd.estado_envio = 'enviado'   THEN 1 END) AS enviados,
        COUNT(CASE WHEN nd.estado_envio = 'fallido'   THEN 1 END) AS fallidos,
        COUNT(CASE WHEN nd.leido = true               THEN 1 END) AS leidos
      FROM notificacion_institucional ni
      LEFT JOIN usuarios u          ON ni.creada_por = u.id
      LEFT JOIN grado g             ON ni.grado_id = g.id
      LEFT JOIN paralelo p          ON ni.paralelo_id = p.id
      LEFT JOIN nivel_academico n   ON ni.nivel_academico_id = n.id
      LEFT JOIN notificacion_destinatario nd ON ni.id = nd.notificacion_id
      ${whereClause}
      GROUP BY ni.id, u.username, g.nombre, p.nombre, n.nombre
      ORDER BY ni.created_at DESC
      LIMIT $${p} OFFSET $${p + 1}
    `, [...params, limit, offset]);

    return {
      notificaciones: result.rows,
      paginacion: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // ─── Obtener por ID ───────────────────────────────────────────
  static async findById(id) {
    const result = await pool.query(`
      SELECT
        ni.*,
        u.username          AS creada_por_username,
        g.nombre            AS grado_nombre,
        p.nombre            AS paralelo_nombre,
        n.nombre            AS nivel_nombre,
        pa.nombre           AS periodo_nombre
      FROM notificacion_institucional ni
      LEFT JOIN usuarios u          ON ni.creada_por = u.id
      LEFT JOIN grado g             ON ni.grado_id = g.id
      LEFT JOIN paralelo p          ON ni.paralelo_id = p.id
      LEFT JOIN nivel_academico n   ON ni.nivel_academico_id = n.id
      LEFT JOIN periodo_academico pa ON ni.periodo_academico_id = pa.id
      WHERE ni.id = $1 AND ni.deleted_at IS NULL
    `, [id]);
    return result.rows[0] || null;
  }

  // ─── Actualizar (solo borradores) ─────────────────────────────
  static async update(id, data) {
  const {
    titulo, mensaje, tipo, prioridad, audiencia,
    nivel_academico_id, grado_id, paralelo_id,
    destinatario_usuario_id,
    enviar_whatsapp, enviar_email, enviar_interno,
    programada_para, adjunto_url, adjunto_nombre,
    foto_url,        // ✅ agregar
    foto_public_id   // ✅ agregar
  } = data;

  const result = await pool.query(`
    UPDATE notificacion_institucional SET
      titulo                  = COALESCE($1,  titulo),
      mensaje                 = COALESCE($2,  mensaje),
      tipo                    = COALESCE($3,  tipo),
      prioridad               = COALESCE($4,  prioridad),
      audiencia               = COALESCE($5,  audiencia),
      nivel_academico_id      = $6,
      grado_id                = $7,
      paralelo_id             = $8,
      destinatario_usuario_id = $9,
      enviar_whatsapp         = COALESCE($10, enviar_whatsapp),
      enviar_email            = COALESCE($11, enviar_email),
      enviar_interno          = COALESCE($12, enviar_interno),
      programada_para         = $13,
      adjunto_url             = $14,
      adjunto_nombre          = $15,
      foto_url                = $16,       -- ✅ agregar columna
      foto_public_id          = $17,       -- ✅ agregar columna
      updated_at              = CURRENT_TIMESTAMP
    WHERE id = $18                         -- ✅ ajustar índice
      AND estado IN ('borrador', 'programada')
      AND deleted_at IS NULL
    RETURNING *
  `, [
    titulo, mensaje, tipo, prioridad, audiencia,
    nivel_academico_id || null, grado_id || null, paralelo_id || null,
    destinatario_usuario_id || null,
    enviar_whatsapp, enviar_email, enviar_interno,
    programada_para || null, adjunto_url || null, adjunto_nombre || null,
    foto_url || null,        // ✅
    foto_public_id || null,  // ✅
    id                       // ✅ ahora es $18
  ]);
  return result.rows[0] || null;
}

  // ─── Soft delete ──────────────────────────────────────────────
  static async softDelete(id) {
    const result = await pool.query(`
      UPDATE notificacion_institucional
      SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND estado IN ('borrador', 'programada')
      RETURNING *
    `, [id]);
    return result.rows[0] || null;
  }

  // ─── Marcar como enviando / enviada ───────────────────────────
  static async marcarEstado(id, estado) {
  const result = await pool.query(`
    UPDATE notificacion_institucional
    SET
      estado     = $1::TEXT,
      enviada_en = CASE WHEN $1::TEXT = 'enviada' THEN CURRENT_TIMESTAMP ELSE enviada_en END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING *
  `, [estado, id]);
  return result.rows[0];
}

  // ─── Resolver destinatarios según audiencia/filtros ───────────
  // Devuelve array de { usuario_id, nombre, celular, email, rol }
  static async resolverDestinatarios(notificacion) {
    const {
      id, audiencia, nivel_academico_id, grado_id, paralelo_id,
      periodo_academico_id, destinatario_usuario_id
    } = notificacion;

    // Caso individual
    if (audiencia === 'individual' && destinatario_usuario_id) {
      const r = await pool.query(`
        SELECT
          u.id    AS usuario_id,
          COALESCE(
            d.nombres || ' ' || d.apellido_paterno,
            pf.nombres || ' ' || pf.apellido_paterno,
            e.nombres  || ' ' || e.apellidos,
            u.username
          )        AS nombre,
          COALESCE(d.celular, pf.celular, e.telefono)  AS celular,
          COALESCE(d.email,   pf.email,   e.email, u.email) AS email,
          CASE
            WHEN d.id  IS NOT NULL THEN 'docente'
            WHEN pf.id IS NOT NULL THEN 'padre'
            WHEN e.id  IS NOT NULL THEN 'estudiante'
            ELSE 'admin'
          END      AS rol
        FROM usuarios u
        LEFT JOIN docente      d  ON d.usuario_id  = u.id AND d.deleted_at  IS NULL
        LEFT JOIN padre_familia pf ON pf.usuario_id = u.id AND pf.deleted_at IS NULL
        LEFT JOIN estudiante   e  ON e.usuario_id  = u.id AND e.deleted_at  IS NULL
        WHERE u.id = $1 AND u.activo = true
      `, [destinatario_usuario_id]);
      return r.rows;
    }

    const partes = [];
    const params = [];
    let p = 1;

    // ── Docentes ─────────────────────────────────────────────────
    if (['todos', 'docentes'].includes(audiencia)) {
      let filtroDocente = '';
      const pDocente = [...params];
      let pd = p;

      if (grado_id || paralelo_id || nivel_academico_id) {
        filtroDocente = `
          AND d.id IN (
            SELECT DISTINCT ad.docente_id FROM asignacion_docente ad
            INNER JOIN grado_materia gm ON ad.grado_materia_id = gm.id
            INNER JOIN grado g          ON gm.grado_id = g.id
            WHERE ad.activo = true AND ad.deleted_at IS NULL
            ${paralelo_id       ? `AND ad.paralelo_id = $${pd++}`          : ''}
            ${grado_id          ? `AND gm.grado_id = $${pd++}`             : ''}
            ${nivel_academico_id ? `AND g.nivel_academico_id = $${pd++}`   : ''}
          )
        `;
        if (paralelo_id)        pDocente.push(paralelo_id);
        if (grado_id)           pDocente.push(grado_id);
        if (nivel_academico_id) pDocente.push(nivel_academico_id);
      }

      partes.push({
        sql: `
          SELECT
            u.id  AS usuario_id,
            d.nombres || ' ' || d.apellido_paterno AS nombre,
            d.celular,
            COALESCE(d.email, u.email) AS email,
            'docente' AS rol
          FROM docente d
          INNER JOIN usuarios u ON d.usuario_id = u.id
          WHERE d.activo = true AND d.deleted_at IS NULL
            AND u.activo = true AND d.celular IS NOT NULL
            ${filtroDocente}
        `,
        params: pDocente,
      });
    }

    // ── Padres de familia ─────────────────────────────────────────
    if (['todos', 'padres', 'padres_estudiantes'].includes(audiencia)) {
      let filtrosPadre = [];
      const pPadre = [];
      let pp = 1;

      if (paralelo_id || grado_id || nivel_academico_id || periodo_academico_id) {
        let subFiltro = 'WHERE m.deleted_at IS NULL AND m.estado = \'activo\'';
        if (paralelo_id)         { subFiltro += ` AND m.paralelo_id = $${pp++}`;          pPadre.push(paralelo_id); }
        if (periodo_academico_id){ subFiltro += ` AND m.periodo_academico_id = $${pp++}`; pPadre.push(periodo_academico_id); }
        if (grado_id) {
          subFiltro += ` AND EXISTS (SELECT 1 FROM paralelo par WHERE par.id = m.paralelo_id AND par.grado_id = $${pp++})`;
          pPadre.push(grado_id);
        }
        if (nivel_academico_id) {
          subFiltro += `
            AND EXISTS (
              SELECT 1 FROM paralelo par
              INNER JOIN grado g ON par.grado_id = g.id
              WHERE par.id = m.paralelo_id AND g.nivel_academico_id = $${pp++}
            )`;
          pPadre.push(nivel_academico_id);
        }

        filtrosPadre.push(`
          pf.id IN (
            SELECT DISTINCT et.padre_familia_id FROM estudiante_tutor et
            INNER JOIN matricula m ON et.estudiante_id = m.estudiante_id
            ${subFiltro}
            AND et.recibe_notificaciones = true
          )
        `);
      }

      partes.push({
        sql: `
          SELECT
            u.id  AS usuario_id,
            pf.nombres || ' ' || pf.apellido_paterno AS nombre,
            pf.celular,
            COALESCE(pf.email, u.email) AS email,
            'padre' AS rol
          FROM padre_familia pf
          INNER JOIN usuarios u ON pf.usuario_id = u.id
          WHERE pf.deleted_at IS NULL AND u.activo = true
            AND pf.celular IS NOT NULL
            ${filtrosPadre.length ? 'AND ' + filtrosPadre.join(' AND ') : ''}
        `,
        params: pPadre,
      });
    }

    // ── Estudiantes ───────────────────────────────────────────────
    if (['todos', 'estudiantes', 'padres_estudiantes'].includes(audiencia)) {
      let filtrosEst = [];
      const pEst = [];
      let pe = 1;

      if (paralelo_id || grado_id || nivel_academico_id || periodo_academico_id) {
        let subFiltro = 'WHERE m.deleted_at IS NULL AND m.estado = \'activo\'';
        if (paralelo_id)         { subFiltro += ` AND m.paralelo_id = $${pe++}`;           pEst.push(paralelo_id); }
        if (periodo_academico_id){ subFiltro += ` AND m.periodo_academico_id = $${pe++}`;  pEst.push(periodo_academico_id); }
        if (grado_id) {
          subFiltro += ` AND EXISTS (SELECT 1 FROM paralelo par WHERE par.id = m.paralelo_id AND par.grado_id = $${pe++})`;
          pEst.push(grado_id);
        }
        if (nivel_academico_id) {
          subFiltro += `
            AND EXISTS (
              SELECT 1 FROM paralelo par
              INNER JOIN grado g ON par.grado_id = g.id
              WHERE par.id = m.paralelo_id AND g.nivel_academico_id = $${pe++}
            )`;
          pEst.push(nivel_academico_id);
        }

        filtrosEst.push(`
          e.id IN (
            SELECT DISTINCT m.estudiante_id FROM matricula m ${subFiltro}
          )
        `);
      }

      partes.push({
        sql: `
          SELECT
            u.id  AS usuario_id,
            e.nombres || ' ' || e.apellidos AS nombre,
            e.telefono AS celular,
            COALESCE(e.email, u.email) AS email,
            'estudiante' AS rol
          FROM estudiante e
          INNER JOIN usuarios u ON e.usuario_id = u.id
          WHERE e.deleted_at IS NULL AND u.activo = true
            ${filtrosEst.length ? 'AND ' + filtrosEst.join(' AND ') : ''}
        `,
        params: pEst,
      });
    }

    // Ejecutar todas las queries y combinar resultados
    const todos = [];
    const vistos = new Set();

    for (const parte of partes) {
      const r = await pool.query(parte.sql, parte.params);
      for (const row of r.rows) {
        if (!vistos.has(row.usuario_id)) {
          vistos.add(row.usuario_id);
          todos.push(row);
        }
      }
    }

    return todos;
  }

  // ─── Insertar destinatarios en BD ────────────────────────────
  static async insertarDestinatarios(notificacion_id, destinatarios, canales) {
    if (destinatarios.length === 0) return [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const insertados = [];

      for (const dest of destinatarios) {
        for (const canal of canales) {
          // Omitir si no tiene el dato de contacto para ese canal
          const tieneContacto =
            (canal === 'whatsapp' && dest.celular) ||
            (canal === 'email'    && dest.email)   ||
            (canal === 'interno'  && dest.usuario_id);

          const r = await client.query(`
            INSERT INTO notificacion_destinatario (
              notificacion_id, usuario_id,
              nombre_destinatario, celular_snapshot, email_snapshot,
              rol_destinatario, canal,
              estado_envio
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (notificacion_id, usuario_id, canal) DO NOTHING
            RETURNING *
          `, [
            notificacion_id, dest.usuario_id,
            dest.nombre, dest.celular || null, dest.email || null,
            dest.rol, canal,
            tieneContacto ? 'pendiente' : 'omitido',
          ]);
          if (r.rows[0]) insertados.push(r.rows[0]);
        }
      }

      await client.query('COMMIT');
      return insertados;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Actualizar estado de un destinatario ────────────────────
  static async actualizarEstadoDestinatario(id, { estado_envio, error_mensaje }) {
    await pool.query(`
      UPDATE notificacion_destinatario
      SET
        estado_envio  = $1,
        enviado_en    = CASE WHEN $1 = 'enviado' THEN CURRENT_TIMESTAMP ELSE enviado_en END,
        error_mensaje = $2,
        updated_at    = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [estado_envio, error_mensaje || null, id]);
  }

  // ─── Marcar como leído (canal interno) ────────────────────────
  static async marcarLeido(notificacion_id, usuario_id) {
    const result = await pool.query(`
      UPDATE notificacion_destinatario
      SET leido = true, leido_en = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE notificacion_id = $1
        AND usuario_id      = $2
        AND canal           = 'interno'
        AND leido           = false
      RETURNING *
    `, [notificacion_id, usuario_id]);
    return result.rows[0] || null;
  }

  // ─── Notificaciones internas del usuario (campana) ───────────
  static async getMisNotificaciones(usuario_id, { soloNoLeidas = false, page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const filtroLeido = soloNoLeidas ? 'AND nd.leido = false' : '';

  const result = await pool.query(`
    SELECT
      nd.id               AS destinatario_id,
      nd.leido,
      nd.leido_en,
      nd.created_at       AS recibido_en,
      ni.id               AS notificacion_id,
      ni.titulo,
      ni.mensaje,
      ni.tipo,
      ni.prioridad,
      ni.adjunto_url,
      ni.adjunto_nombre,
      ni.foto_url,        
      ni.foto_public_id,  
      ni.enviada_en
    FROM notificacion_destinatario nd
      INNER JOIN notificacion_institucional ni ON nd.notificacion_id = ni.id
      WHERE nd.usuario_id = $1
        AND nd.canal      = 'interno'
        AND ni.deleted_at IS NULL
        ${filtroLeido}
      ORDER BY nd.created_at DESC
      LIMIT $2 OFFSET $3
    `, [usuario_id, limit, offset]);

    const noLeidas = parseInt(
      (await pool.query(`
        SELECT COUNT(*) FROM notificacion_destinatario nd
        INNER JOIN notificacion_institucional ni ON nd.notificacion_id = ni.id
        WHERE nd.usuario_id = $1 AND nd.canal = 'interno'
          AND nd.leido = false AND ni.deleted_at IS NULL
      `, [usuario_id])).rows[0].count
    );

    return { notificaciones: result.rows, no_leidas: noLeidas };
  }

  // ─── Resumen de envíos de una notificación ───────────────────
  static async getResumenEnvios(notificacion_id) {
    const result = await pool.query(`
      SELECT
        canal,
        COUNT(*)                                                  AS total,
        COUNT(CASE WHEN estado_envio = 'enviado'   THEN 1 END)   AS enviados,
        COUNT(CASE WHEN estado_envio = 'fallido'   THEN 1 END)   AS fallidos,
        COUNT(CASE WHEN estado_envio = 'omitido'   THEN 1 END)   AS omitidos,
        COUNT(CASE WHEN leido = true               THEN 1 END)   AS leidos
      FROM notificacion_destinatario
      WHERE notificacion_id = $1
      GROUP BY canal
    `, [notificacion_id]);
    return result.rows;
  }
}

export default NotificacionInstitucional;