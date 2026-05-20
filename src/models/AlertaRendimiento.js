// models/AlertaRendimiento.js
import { pool } from '../db/pool.js';

class AlertaRendimiento {

  // ─────────────────────────────────────────────────────────────
  // ESCRITURA — usada por el job semanal
  // ─────────────────────────────────────────────────────────────

  /**
   * Insertar o actualizar la alerta de una semana.
   * El UNIQUE (estudiante_id, asignacion_docente_id, trimestre, semana)
   * garantiza que correr el job dos veces no genera duplicados.
   */
  static async upsert(data) {
    const {
      estudiante_id,
      asignacion_docente_id,
      periodo_evaluacion_id,
      trimestre,
      semana,
      nivel_riesgo,
      nota_estimada,
      asistencia_pct,
      probabilidad_reprobar,
      racha_trims_riesgo,
      mensaje_padre,
      estado_envio,
    } = data;

    const query = `
      INSERT INTO alerta_rendimiento (
        estudiante_id, asignacion_docente_id, periodo_evaluacion_id,
        trimestre, semana,
        nivel_riesgo, nota_estimada, asistencia_pct,
        probabilidad_reprobar, racha_trims_riesgo,
        mensaje_padre, estado_envio
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (estudiante_id, asignacion_docente_id, trimestre, semana)
      DO UPDATE SET
        nivel_riesgo          = EXCLUDED.nivel_riesgo,
        nota_estimada         = EXCLUDED.nota_estimada,
        asistencia_pct        = EXCLUDED.asistencia_pct,
        probabilidad_reprobar = EXCLUDED.probabilidad_reprobar,
        racha_trims_riesgo    = EXCLUDED.racha_trims_riesgo,
        mensaje_padre         = EXCLUDED.mensaje_padre,
        estado_envio          = EXCLUDED.estado_envio,
        updated_at            = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await pool.query(query, [
      estudiante_id,
      asignacion_docente_id,
      periodo_evaluacion_id || null,
      trimestre,
      semana,
      nivel_riesgo,
      nota_estimada         ?? null,
      asistencia_pct        ?? null,
      probabilidad_reprobar ?? null,
      racha_trims_riesgo    ?? 0,
      mensaje_padre         || null,
      estado_envio          || 'pendiente',
    ]);

    return result.rows[0];
  }

  /**
   * Vincular la alerta con la notificación institucional creada.
   * Se llama justo después de crear la notificacion_institucional.
   */
  static async marcarNotificada(id, notificacion_id) {
    const query = `
      UPDATE alerta_rendimiento
      SET
        notificacion_id = $1,
        estado_envio    = 'notificada',
        updated_at      = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [notificacion_id, id]);
    return result.rows[0];
  }

  /**
   * Marcar como error si el ML service o Gemini fallan.
   */
  static async marcarError(id, detalle) {
    const query = `
      UPDATE alerta_rendimiento
      SET
        estado_envio  = 'error',
        error_detalle = $1,
        updated_at    = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [detalle || 'Error desconocido', id]);
    return result.rows[0];
  }

  // ─────────────────────────────────────────────────────────────
  // LECTURA — portal del padre
  // ─────────────────────────────────────────────────────────────

  /**
   * Todas las materias activas del hijo con su última alerta.
   * Usa la vista v_portal_padre filtrando por usuario del padre
   * para que arl.leida sea correcta por sesión.
   *
   * @param {number} estudiante_id
   * @param {number} usuario_id — ID del padre logueado (para campo 'leida')
   */
  static async getPortalPadre(estudiante_id, usuario_id) {
    const query = `
      SELECT
        vpp.*,
        -- Sobreescribir 'leida' filtrando por el usuario actual
        -- (la vista no puede parametrizarse, así que lo recalculamos aquí)
        EXISTS (
          SELECT 1 FROM alerta_rendimiento_lectura arl2
          WHERE arl2.alerta_id  = vpp.alerta_id
            AND arl2.usuario_id = $2
        ) AS leida
      FROM v_portal_padre vpp
      WHERE vpp.estudiante_id = $1
      ORDER BY
        -- Primero las materias con riesgo alto/crítico
        CASE vpp.nivel_riesgo
          WHEN 'critico' THEN 1
          WHEN 'alto'    THEN 2
          WHEN 'medio'   THEN 3
          WHEN 'bajo'    THEN 4
          ELSE 5
        END,
        vpp.materia_nombre
    `;
    const result = await pool.query(query, [estudiante_id, usuario_id]);
    return result.rows;
  }

  /**
   * Si el padre tiene varios hijos, devuelve el resumen de cada uno.
   * Una fila por hijo con el peor nivel de riesgo actual.
   *
   * @param {number[]} estudiante_ids — IDs de los hijos del padre
   * @param {number}   usuario_id
   */
  static async getResumenHijos(estudiante_ids, usuario_id) {
    if (!estudiante_ids.length) return [];

    const query = `
      SELECT
        estudiante_id,
        estudiante_nombres,
        estudiante_apellidos,
        estudiante_codigo,
        estudiante_foto,
        COUNT(*)                              AS total_materias,
        COUNT(CASE WHEN nivel_riesgo = 'critico' THEN 1 END) AS materias_critico,
        COUNT(CASE WHEN nivel_riesgo = 'alto'    THEN 1 END) AS materias_alto,
        COUNT(CASE WHEN nivel_riesgo = 'medio'   THEN 1 END) AS materias_medio,
        COUNT(CASE WHEN nivel_riesgo = 'bajo'    THEN 1 END) AS materias_bajo,
        COUNT(CASE WHEN nivel_riesgo IS NULL      THEN 1 END) AS materias_sin_datos,
        -- Peor nivel para el semáforo del resumen
        CASE
          WHEN COUNT(CASE WHEN nivel_riesgo = 'critico' THEN 1 END) > 0 THEN 'critico'
          WHEN COUNT(CASE WHEN nivel_riesgo = 'alto'    THEN 1 END) > 0 THEN 'alto'
          WHEN COUNT(CASE WHEN nivel_riesgo = 'medio'   THEN 1 END) > 0 THEN 'medio'
          ELSE 'bajo'
        END                                   AS peor_nivel_riesgo,
        -- ¿Tiene alertas sin leer?
        COUNT(
          CASE WHEN alerta_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM alerta_rendimiento_lectura arl
            WHERE arl.alerta_id  = vpp.alerta_id
              AND arl.usuario_id = $2
          ) THEN 1 END
        )                                     AS alertas_no_leidas
      FROM v_portal_padre vpp
      WHERE estudiante_id = ANY($1::int[])
      GROUP BY
        estudiante_id, estudiante_nombres, estudiante_apellidos,
        estudiante_codigo, estudiante_foto
      ORDER BY
        CASE peor_nivel_riesgo
          WHEN 'critico' THEN 1
          WHEN 'alto'    THEN 2
          WHEN 'medio'   THEN 3
          ELSE 4
        END
    `;
    const result = await pool.query(query, [estudiante_ids, usuario_id]);
    return result.rows;
  }

  /**
   * Historial de alertas de un estudiante en una materia.
   * El padre puede ver cómo evolucionó el riesgo semana a semana.
   *
   * @param {number} estudiante_id
   * @param {number} asignacion_docente_id
   * @param {number} trimestre
   */
  static async getHistorialMateria(estudiante_id, asignacion_docente_id, trimestre) {
    const query = `
      SELECT
        ar.id,
        ar.trimestre,
        ar.semana,
        ar.nivel_riesgo,
        ar.nota_estimada,
        ar.asistencia_pct,
        ar.probabilidad_reprobar,
        ar.racha_trims_riesgo,
        ar.mensaje_padre,
        ar.created_at,
        -- ¿Hay notificación vinculada?
        ni.titulo       AS notificacion_titulo,
        ni.enviada_en   AS notificacion_enviada_en
      FROM alerta_rendimiento ar
      LEFT JOIN notificacion_institucional ni ON ar.notificacion_id = ni.id
      WHERE ar.estudiante_id         = $1
        AND ar.asignacion_docente_id = $2
        AND ar.trimestre             = $3
      ORDER BY ar.semana ASC
    `;
    const result = await pool.query(query, [
      estudiante_id,
      asignacion_docente_id,
      trimestre,
    ]);
    return result.rows;
  }

  // ─────────────────────────────────────────────────────────────
  // LECTURA — panel del docente
  // ─────────────────────────────────────────────────────────────

  /**
   * El docente ve el estado actual de su clase:
   * un row por estudiante con su última alerta y si el padre la leyó.
   *
   * @param {number} asignacion_docente_id
   * @param {number} trimestre
   * @param {number} semana
   */
  static async getEstadoClase(asignacion_docente_id, trimestre, semana) {
    const query = `
      SELECT
        e.id                        AS estudiante_id,
        e.nombres                   AS estudiante_nombres,
        e.apellidos                 AS estudiante_apellidos,
        e.codigo                    AS estudiante_codigo,
        ar.nivel_riesgo,
        ar.nota_estimada,
        ar.asistencia_pct,
        ar.racha_trims_riesgo,
        ar.estado_envio,
        ar.created_at               AS alerta_generada_en,
        -- ¿El padre ya leyó?
        CASE WHEN arl.id IS NOT NULL THEN true ELSE false END AS padre_leyo,
        arl.leido_en                AS padre_leyo_en
      FROM alerta_rendimiento ar
      INNER JOIN estudiante e ON ar.estudiante_id = e.id
      -- Lectura del padre: cualquier usuario vinculado al estudiante
      LEFT JOIN alerta_rendimiento_lectura arl ON arl.alerta_id = ar.id
      WHERE ar.asignacion_docente_id = $1
        AND ar.trimestre             = $2
        AND ar.semana                = $3
      ORDER BY
        CASE ar.nivel_riesgo
          WHEN 'critico' THEN 1
          WHEN 'alto'    THEN 2
          WHEN 'medio'   THEN 3
          ELSE 4
        END,
        e.apellidos, e.nombres
    `;
    const result = await pool.query(query, [
      asignacion_docente_id,
      trimestre,
      semana,
    ]);
    return result.rows;
  }

  // ─────────────────────────────────────────────────────────────
  // LECTURA — registro de que el padre leyó la alerta
  // ─────────────────────────────────────────────────────────────

  /**
   * Registrar que el padre leyó la alerta.
   * ON CONFLICT DO NOTHING → idempotente, no importa si llama dos veces.
   */
  static async registrarLectura(alerta_id, usuario_id) {
    const query = `
      INSERT INTO alerta_rendimiento_lectura (alerta_id, usuario_id)
      VALUES ($1, $2)
      ON CONFLICT (alerta_id, usuario_id) DO NOTHING
      RETURNING *
    `;
    const result = await pool.query(query, [alerta_id, usuario_id]);
    return result.rows[0] || null;
  }

  /**
   * Contar alertas no leídas para el badge del portal.
   *
   * @param {number[]} estudiante_ids
   * @param {number}   usuario_id
   */
  static async contarNoLeidas(estudiante_ids, usuario_id) {
    if (!estudiante_ids.length) return 0;

    const query = `
      SELECT COUNT(*) AS total
      FROM alerta_rendimiento ar
      WHERE ar.estudiante_id = ANY($1::int[])
        AND ar.nivel_riesgo != 'bajo'
        AND NOT EXISTS (
          SELECT 1 FROM alerta_rendimiento_lectura arl
          WHERE arl.alerta_id  = ar.id
            AND arl.usuario_id = $2
        )
    `;
    const result = await pool.query(query, [estudiante_ids, usuario_id]);
    return parseInt(result.rows[0].total);
  }

  // ─────────────────────────────────────────────────────────────
  // HELPERS — usados por el job semanal
  // ─────────────────────────────────────────────────────────────

  /**
   * Obtener todos los estudiantes activos con sus datos para
   * armar el payload al ML service.
   * Devuelve una fila por estudiante × asignacion_docente activa.
   */
  static async getEstudiantesActivosParaJob(periodo_academico_id) {
    const query = `
      SELECT
        e.id                        AS estudiante_id,
        ad.id                       AS asignacion_docente_id,
        pe.id                       AS periodo_evaluacion_id,
        mat.nombre                  AS materia_nombre,
        mat.codigo                  AS materia_codigo,
        -- Para construir el payload al ML service
        pe.numero_trimestre         AS trimestre,
        -- Semana actual dentro del período
        GREATEST(1,
          CEIL(
            EXTRACT(DAY FROM (CURRENT_DATE - pe.fecha_inicio)) / 7.0
          )
        )::INTEGER                  AS semana_actual,
        -- Total semanas del período (para config_periodo)
        CEIL(
          EXTRACT(DAY FROM (pe.fecha_fin - pe.fecha_inicio)) / 7.0
        )::INTEGER                  AS total_semanas,
        -- Padre vinculado (para la notificación)
        pf.usuario_id               AS padre_usuario_id,
        pf.id                       AS padre_familia_id
      FROM asignacion_docente ad
      INNER JOIN grado_materia gm       ON ad.grado_materia_id    = gm.id
      INNER JOIN materia mat            ON gm.materia_id          = mat.id
      INNER JOIN periodo_academico pa   ON ad.periodo_academico_id = pa.id
      INNER JOIN periodo_evaluacion pe
        ON  pe.periodo_academico_id = pa.id
        AND pe.activo               = true
        AND CURRENT_DATE BETWEEN pe.fecha_inicio AND pe.fecha_fin
      INNER JOIN matricula m
        ON  m.paralelo_id          = ad.paralelo_id
        AND m.periodo_academico_id = pa.id
        AND m.estado               = 'activo'
        AND m.deleted_at           IS NULL
      INNER JOIN estudiante e           ON m.estudiante_id = e.id
      -- Padre vinculado al estudiante
      LEFT JOIN estudiante_padre ep     ON ep.estudiante_id = e.id
                                       AND ep.es_principal  = true
      LEFT JOIN padre_familia pf        ON pf.id            = ep.padre_familia_id
      WHERE ad.activo              = true
        AND ad.deleted_at          IS NULL
        AND ad.periodo_academico_id = $1
      ORDER BY e.id, ad.id
    `;
    const result = await pool.query(query, [periodo_academico_id]);
    return result.rows;
  }
}

export default AlertaRendimiento;