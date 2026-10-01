// models/Notas.js
import { pool } from '../db/pool.js';
import { parseToLocalTimestamp } from '../utils/dateUtils.js';

// =============================================
// PERIODO EVALUACION
// =============================================
class PeriodoEvaluacion {

  static async create(data) {
    const {
      periodo_academico_id, nombre, codigo, orden,
      fecha_inicio, fecha_fin, observaciones
    } = data;

    const query = `
      INSERT INTO periodo_evaluacion
        (periodo_academico_id, nombre, codigo, orden, fecha_inicio, fecha_fin, observaciones)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await pool.query(query, [
      periodo_academico_id, nombre, codigo || null, orden,
      fecha_inicio, fecha_fin, observaciones || null
    ]);
    return result.rows[0];
  }

  static async findAll(filters = {}) {
    const { periodo_academico_id, activo } = filters;
    let where = [];
    let params = [];
    let p = 1;

    if (periodo_academico_id) { where.push(`pe.periodo_academico_id = $${p++}`); params.push(periodo_academico_id); }
    if (activo !== undefined) { where.push(`pe.activo = $${p++}`); params.push(activo); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const query = `
      SELECT pe.*, pa.nombre AS periodo_academico_nombre, pa.codigo AS periodo_academico_codigo
      FROM periodo_evaluacion pe
      INNER JOIN periodo_academico pa ON pe.periodo_academico_id = pa.id
      ${whereClause}
      ORDER BY pe.periodo_academico_id, pe.orden
    `;
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(`
      SELECT pe.*, pa.nombre AS periodo_academico_nombre
      FROM periodo_evaluacion pe
      INNER JOIN periodo_academico pa ON pe.periodo_academico_id = pa.id
      WHERE pe.id = $1
    `, [id]);
    return result.rows[0];
  }

  static async update(id, data) {
    const { nombre, codigo, orden, fecha_inicio, fecha_fin, activo, observaciones } = data;
    const result = await pool.query(`
      UPDATE periodo_evaluacion
      SET nombre=$1, codigo=$2, orden=$3, fecha_inicio=$4, fecha_fin=$5,
          activo=$6, observaciones=$7, updated_at=CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `, [nombre, codigo, orden, fecha_inicio, fecha_fin, activo, observaciones || null, id]);
    return result.rows[0];
  }
}

// =============================================
// DIMENSION EVALUACION (solo lectura en app)
// =============================================
class DimensionEvaluacion {
  static async findAll() {
    const result = await pool.query(
      `SELECT * FROM dimension_evaluacion WHERE activo = true ORDER BY orden`
    );
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(`SELECT * FROM dimension_evaluacion WHERE id = $1`, [id]);
    return result.rows[0];
  }
}

// =============================================
// EVALUACION
// =============================================
class Evaluacion {

  static async create(data) {
    const {
      asignacion_docente_id, dimension_evaluacion_id, periodo_evaluacion_id,
      nombre, tipo, descripcion, fecha, fecha_limite, puntaje_maximo, peso_en_dimension,
      visible_para_padres,
      tema_id,
      modalidad, duracion_minutos,
      fecha_hora_inicio, fecha_hora_fin, intentos_permitidos, orden_aleatorio,
      permite_entrega_archivo
    } = data;

    // Validar que el puntaje máximo no supere el tope de la dimensión
    const dimRes = await pool.query(
      `SELECT id, nombre, porcentaje_ponderacion FROM dimension_evaluacion WHERE id = $1`,
      [dimension_evaluacion_id]
    );
    const dim = dimRes.rows[0];
    const maxPermitido = dim ? Number(dim.porcentaje_ponderacion) : 100;
    const finalPuntajeMax = puntaje_maximo !== undefined && puntaje_maximo !== null ? Number(puntaje_maximo) : maxPermitido;

    if (finalPuntajeMax > maxPermitido) {
      throw new Error(`El puntaje máximo (${finalPuntajeMax}) no puede superar el límite de la dimensión "${dim?.nombre || dimension_evaluacion_id}" (${maxPermitido} pts)`);
    }

    const result = await pool.query(`
      INSERT INTO evaluacion (
        asignacion_docente_id, dimension_evaluacion_id, periodo_evaluacion_id,
        nombre, tipo, descripcion, fecha, fecha_limite, puntaje_maximo, peso_en_dimension,
        visible_para_padres,
        tema_id,
        modalidad, duracion_minutos,
        fecha_hora_inicio, fecha_hora_fin, intentos_permitidos, orden_aleatorio,
        permite_entrega_archivo
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *
    `, [
      asignacion_docente_id, dimension_evaluacion_id, periodo_evaluacion_id,
      nombre, tipo || null, descripcion || null, fecha || null,
      parseToLocalTimestamp(fecha_limite),
      finalPuntajeMax, peso_en_dimension || 1.00, visible_para_padres ?? false,
      tema_id || null,
      modalidad || 'presencial', duracion_minutos || null,
      parseToLocalTimestamp(fecha_hora_inicio), parseToLocalTimestamp(fecha_hora_fin),
      intentos_permitidos || 1, orden_aleatorio ?? false,
      permite_entrega_archivo ?? false
    ]);
    return result.rows[0];
  }

  static async findAll(filters = {}) {
    const {
      page = 1, limit = 20,
      asignacion_docente_id, dimension_evaluacion_id,
      periodo_evaluacion_id, activo,
      tema_id
    } = filters;
    const offset = (page - 1) * limit;
    let where = []; let params = []; let p = 1;

    if (asignacion_docente_id) { where.push(`e.asignacion_docente_id = $${p++}`); params.push(asignacion_docente_id); }
    if (dimension_evaluacion_id) { where.push(`e.dimension_evaluacion_id = $${p++}`); params.push(dimension_evaluacion_id); }
    if (periodo_evaluacion_id) { where.push(`e.periodo_evaluacion_id = $${p++}`); params.push(periodo_evaluacion_id); }
    if (activo !== undefined) { where.push(`e.activo = $${p++}`); params.push(activo); }
    if (tema_id) { where.push(`e.tema_id = $${p++}`); params.push(tema_id); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await pool.query(`SELECT COUNT(*) FROM evaluacion e ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(`
    SELECT
      e.*,
      CAST(e.puntaje_maximo AS FLOAT8) AS puntaje_maximo,
      CAST(e.peso_en_dimension AS FLOAT8) AS peso_en_dimension,
      de.nombre AS dimension_nombre, de.codigo AS dimension_codigo, de.color AS dimension_color,
      pe.nombre AS periodo_nombre,
      mat.nombre AS materia_nombre,
      t.id     AS tema_id,
      t.titulo AS tema_titulo,
      t.numero_tema,
      u.id     AS unidad_id,
      u.titulo AS unidad_titulo,
      u.numero_unidad
    FROM evaluacion e
    INNER JOIN dimension_evaluacion de ON e.dimension_evaluacion_id = de.id
    INNER JOIN periodo_evaluacion pe   ON e.periodo_evaluacion_id = pe.id
    INNER JOIN asignacion_docente ad   ON e.asignacion_docente_id = ad.id
    INNER JOIN grado_materia gm        ON ad.grado_materia_id = gm.id
    INNER JOIN materia mat             ON gm.materia_id = mat.id
    LEFT  JOIN tema t                  ON e.tema_id = t.id
    LEFT  JOIN unidad_tematica u       ON t.unidad_tematica_id = u.id
    ${whereClause}
    ORDER BY e.fecha DESC, de.orden, e.nombre
    LIMIT $${p} OFFSET $${p + 1}
  `, [...params, limit, offset]);

    return {
      evaluaciones: result.rows,
      paginacion: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / limit) }
    };
  }

  static async findById(id) {
    const result = await pool.query(`
      SELECT
        e.*,
        de.nombre AS dimension_nombre, de.codigo AS dimension_codigo,
        de.porcentaje_ponderacion, pe.nombre AS periodo_nombre,
        mat.nombre AS materia_nombre, mat.codigo AS materia_codigo,
        -- Tema y unidad                                ← NUEVO bloque
        t.id              AS tema_id,
        t.titulo          AS tema_titulo,
        t.numero_tema,
        t.nivel_dificultad AS tema_nivel_dificultad,
        t.descripcion     AS tema_descripcion,
        u.id              AS unidad_id,
        u.titulo          AS unidad_titulo,
        u.numero_unidad
      FROM evaluacion e
      INNER JOIN dimension_evaluacion de ON e.dimension_evaluacion_id = de.id
      INNER JOIN periodo_evaluacion pe   ON e.periodo_evaluacion_id = pe.id
      INNER JOIN asignacion_docente ad   ON e.asignacion_docente_id = ad.id
      INNER JOIN grado_materia gm        ON ad.grado_materia_id = gm.id
      INNER JOIN materia mat             ON gm.materia_id = mat.id
      LEFT  JOIN tema t                  ON e.tema_id = t.id           -- ← NUEVO
      LEFT  JOIN unidad_tematica u       ON t.unidad_tematica_id = u.id -- ← NUEVO
      WHERE e.id = $1
    `, [id]);
    return result.rows[0];
  }

  static async update(id, data) {
    const {
      nombre, tipo, descripcion, instrucciones, fecha, fecha_limite,
      puntaje_maximo, peso_en_dimension, visible_para_padres, activo,
      tema_id, dimension_evaluacion_id,
      modalidad, duracion_minutos,
      fecha_hora_inicio, fecha_hora_fin,
      intentos_permitidos, orden_aleatorio,
      permite_entrega_archivo
    } = data;

    const current = await Evaluacion.findById(id);
    if (!current) return null;

    const nuevoNombre = nombre !== undefined ? nombre : current.nombre;
    const nuevoTipo = tipo !== undefined ? tipo : current.tipo;
    const nuevaDesc = descripcion !== undefined ? (descripcion || null) : current.descripcion;
    const nuevasInst = instrucciones !== undefined ? (instrucciones || null) : current.instrucciones;
    const nuevaFecha = fecha !== undefined ? (fecha || null) : current.fecha;
    const nuevaFechaLim = fecha_limite !== undefined ? parseToLocalTimestamp(fecha_limite) : current.fecha_limite;
    const nuevoPuntaje = puntaje_maximo !== undefined ? puntaje_maximo : current.puntaje_maximo;
    const nuevaDimId = dimension_evaluacion_id !== undefined ? dimension_evaluacion_id : current.dimension_evaluacion_id;

    if (puntaje_maximo !== undefined || dimension_evaluacion_id !== undefined) {
      const dimRes = await pool.query(
        `SELECT id, nombre, porcentaje_ponderacion FROM dimension_evaluacion WHERE id = $1`,
        [nuevaDimId]
      );
      const dim = dimRes.rows[0];
      const maxPermitido = dim ? Number(dim.porcentaje_ponderacion) : 100;
      if (Number(nuevoPuntaje) > maxPermitido) {
        throw new Error(`El puntaje máximo (${nuevoPuntaje}) no puede superar el límite de la dimensión "${dim?.nombre || nuevaDimId}" (${maxPermitido} pts)`);
      }
    }

    const nuevoPeso = peso_en_dimension !== undefined ? peso_en_dimension : current.peso_en_dimension;
    const nuevoVisible = visible_para_padres !== undefined ? visible_para_padres : current.visible_para_padres;
    const nuevoActivo = activo !== undefined ? activo : current.activo;
    const nuevoTemaId = tema_id !== undefined ? (tema_id || null) : current.tema_id;
    const nuevaModalidad = modalidad !== undefined ? modalidad : current.modalidad;
    const nuevaDuracion = duracion_minutos !== undefined ? (duracion_minutos || null) : current.duracion_minutos;
    const nuevoInicio = fecha_hora_inicio !== undefined ? parseToLocalTimestamp(fecha_hora_inicio) : current.fecha_hora_inicio;
    const nuevoFin = fecha_hora_fin !== undefined ? parseToLocalTimestamp(fecha_hora_fin) : current.fecha_hora_fin;
    const nuevosIntentos = intentos_permitidos !== undefined ? (intentos_permitidos || 1) : current.intentos_permitidos;
    const nuevoOrden = orden_aleatorio !== undefined ? orden_aleatorio : current.orden_aleatorio;
    const nuevoPermiteEntrega = permite_entrega_archivo !== undefined ? permite_entrega_archivo : current.permite_entrega_archivo;

    const result = await pool.query(`
      UPDATE evaluacion SET
        nombre                  = $1,
        tipo                    = $2,
        descripcion             = $3,
        instrucciones           = $4,
        fecha                   = $5,
        fecha_limite            = $6,
        puntaje_maximo          = $7,
        peso_en_dimension       = $8,
        visible_para_padres     = $9,
        activo                  = $10,
        tema_id                 = $11,
        dimension_evaluacion_id = $12,
        modalidad               = $13,
        duracion_minutos        = $14,
        fecha_hora_inicio       = $15,
        fecha_hora_fin          = $16,
        intentos_permitidos     = $17,
        orden_aleatorio         = $18,
        permite_entrega_archivo = $19,
        fecha_publicacion       = CASE WHEN $9 = true AND visible_para_padres = false THEN CURRENT_TIMESTAMP ELSE fecha_publicacion END,
        updated_at              = CURRENT_TIMESTAMP
      WHERE id = $20
      RETURNING *
    `, [
      nuevoNombre, nuevoTipo, nuevaDesc, nuevasInst, nuevaFecha, nuevaFechaLim,
      nuevoPuntaje, nuevoPeso, nuevoVisible, nuevoActivo, nuevoTemaId,
      nuevaDimId, nuevaModalidad, nuevaDuracion, nuevoInicio, nuevoFin,
      nuevosIntentos, nuevoOrden, nuevoPermiteEntrega, id
    ]);
    return result.rows[0];
  }


  static async softDelete(id) {
    const result = await pool.query(
      `UPDATE evaluacion SET activo=false, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`, [id]
    );
    return result.rows[0];
  }
  static async getTemario({ grado_materia_id, periodo_evaluacion_id }) {
    const result = await pool.query(`
      SELECT
        u.id                                AS unidad_id,
        u.numero_unidad,
        u.titulo                            AS unidad_titulo,
        u.descripcion                       AS unidad_descripcion,
        -- Tema
        t.id                               AS tema_id,
        t.numero_tema,
        t.titulo                           AS tema_titulo,
        t.nivel_dificultad,
        -- Evaluaciones del tema (agrupadas en JSON)
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id',                   e.id,
              'nombre',               e.nombre,
              'tipo',                 e.tipo,
              'fecha',                e.fecha,
              'puntaje_maximo',       e.puntaje_maximo,
              'peso_en_dimension',    e.peso_en_dimension,
              'dimension_nombre',     de.nombre,
              'dimension_codigo',     de.codigo,
              'dimension_color',      de.color,
              'visible_para_padres',  e.visible_para_padres
            ) ORDER BY de.orden, e.fecha
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'
        )                                   AS evaluaciones,
        COUNT(e.id)                         AS total_evaluaciones
      FROM unidad_tematica u
      INNER JOIN tema t ON t.unidad_tematica_id = u.id AND t.activo = true
      LEFT JOIN evaluacion e
        ON  e.tema_id = t.id
        AND e.activo  = true
        AND ($2::INTEGER IS NULL OR e.periodo_evaluacion_id = $2)
      LEFT JOIN dimension_evaluacion de ON e.dimension_evaluacion_id = de.id
      WHERE u.grado_materia_id = $1
        AND u.activo = true
      GROUP BY
        u.id, u.numero_unidad, u.titulo, u.descripcion,
        t.id, t.numero_tema, t.titulo, t.nivel_dificultad
      ORDER BY u.numero_unidad, t.numero_tema
    `, [grado_materia_id, periodo_evaluacion_id || null]);

    return result.rows;
  }


  // ──────────────────────────────────────────────────────────────
  // Materias del docente autenticado con resumen de notas
  // FIX: Se agrega gm.id AS grado_materia_id al SELECT y GROUP BY
  // ──────────────────────────────────────────────────────────────
  static async getMisMaterias({ usuario_id, periodo_evaluacion_id }) {
    const result = await pool.query(`
      SELECT
        ad.id                           AS asignacion_id,
        ad.es_titular,
        gm.id                           AS grado_materia_id,
        -- Materia
        mat.id                          AS materia_id,
        mat.nombre                      AS materia_nombre,
        mat.codigo                      AS materia_codigo,
        mat.color                       AS materia_color,
        -- Grado y nivel
        g.id                            AS grado_id,
        g.nombre                        AS grado_nombre,
        n.nombre                        AS nivel_nombre,
        n.modalidad_evaluacion,
        -- Paralelo y turno
        p.id                            AS paralelo_id,
        p.nombre                        AS paralelo_nombre,
        t.nombre                        AS turno_nombre,
        -- Período académico
        pa.id                           AS periodo_academico_id,
        pa.nombre                       AS periodo_nombre,
        -- Trimestre (null si no se filtró por periodo_evaluacion_id)
        pe.id                           AS periodo_evaluacion_id,
        pe.nombre                       AS trimestre_nombre,
        pe.orden                        AS trimestre_orden,
        -- Total estudiantes del paralelo/período
        COUNT(DISTINCT m.id)            AS total_estudiantes,
        -- Evaluaciones creadas
        COUNT(DISTINCT ev.id)           AS total_evaluaciones,
        COUNT(DISTINCT CASE WHEN ev.dimension_evaluacion_id = de_ser.id THEN ev.id END) AS evaluaciones_ser,
        COUNT(DISTINCT CASE WHEN ev.dimension_evaluacion_id = de_sab.id THEN ev.id END) AS evaluaciones_saber,
        COUNT(DISTINCT CASE WHEN ev.dimension_evaluacion_id = de_hac.id THEN ev.id END) AS evaluaciones_hacer,
        COUNT(DISTINCT CASE WHEN ev.dimension_evaluacion_id = de_aut.id THEN ev.id END) AS evaluaciones_auto,
        -- Calificaciones registradas
        COUNT(DISTINCT c.id)            AS calificaciones_registradas,
        COUNT(DISTINCT c.id)            AS total_calificaciones,
        -- Nota final
        COUNT(DISTINCT cp.matricula_id)                                                 AS estudiantes_con_nota_final,
        COUNT(DISTINCT CASE WHEN cp.aprobado = true  THEN cp.matricula_id END)          AS aprobados,
        COUNT(DISTINCT CASE WHEN cp.aprobado = false THEN cp.matricula_id END)          AS reprobados
      FROM docente d
      INNER JOIN asignacion_docente ad  ON ad.docente_id            = d.id
                                       AND ad.activo                = true
                                       AND ad.deleted_at            IS NULL
      INNER JOIN grado_materia gm       ON ad.grado_materia_id      = gm.id
      INNER JOIN materia mat            ON gm.materia_id            = mat.id
      INNER JOIN grado g                ON gm.grado_id              = g.id
      INNER JOIN nivel_academico n      ON g.nivel_academico_id     = n.id
      INNER JOIN paralelo p             ON ad.paralelo_id           = p.id
      INNER JOIN turno t                ON p.turno_id               = t.id
      INNER JOIN periodo_academico pa   ON ad.periodo_academico_id  = pa.id
      -- Trimestres del período académico (filtra si viene periodo_evaluacion_id)
      LEFT JOIN periodo_evaluacion pe   ON pe.periodo_academico_id  = pa.id
                                       AND ($2::INTEGER IS NULL OR pe.id = $2)
      -- Matrículas activas
      LEFT JOIN matricula m
        ON  COALESCE(m.paralelo_cursado_id, m.paralelo_id) = ad.paralelo_id
        AND m.periodo_academico_id = ad.periodo_academico_id
        AND m.estado               = 'activo'
        AND m.deleted_at           IS NULL
      -- Evaluaciones de esta asignación en el trimestre
      LEFT JOIN evaluacion ev
        ON  ev.asignacion_docente_id = ad.id
        AND ev.activo                = true
        AND (pe.id IS NULL OR ev.periodo_evaluacion_id = pe.id)
      -- Dimensiones para conteo individual
      LEFT JOIN dimension_evaluacion de_ser ON de_ser.codigo = 'SER'
      LEFT JOIN dimension_evaluacion de_sab ON de_sab.codigo = 'SAB'
      LEFT JOIN dimension_evaluacion de_hac ON de_hac.codigo = 'HAC'
      LEFT JOIN dimension_evaluacion de_aut ON de_aut.codigo IN ('AUTO', 'AUT')
      -- Calificaciones
      LEFT JOIN calificacion c          ON c.evaluacion_id = ev.id
      -- Nota final del trimestre
      LEFT JOIN calificacion_periodo cp
        ON  cp.grado_materia_id      = gm.id
        AND cp.periodo_evaluacion_id = pe.id
        AND cp.matricula_id          = m.id
      WHERE d.usuario_id = $1
      GROUP BY
        ad.id, ad.es_titular,
        gm.id,
        mat.id, mat.nombre, mat.codigo, mat.color,
        g.id, g.nombre, g.orden, n.nombre, n.modalidad_evaluacion, n.orden,
        p.id, p.nombre,
        t.nombre, t.hora_inicio,
        pa.id, pa.nombre,
        pe.id, pe.nombre, pe.orden
      ORDER BY n.orden ASC, g.orden ASC, p.nombre ASC, mat.nombre ASC, pe.orden ASC
    `, [usuario_id, periodo_evaluacion_id || null]);

    return result.rows;
  }

}

// =============================================
// CALIFICACION
// =============================================
class Calificacion {

  static async upsert(data) {
    const { evaluacion_id, matricula_id, puntaje_obtenido, esta_ausente, observacion, registrado_por } = data;

    const evalRes = await pool.query(
      `SELECT puntaje_maximo FROM evaluacion WHERE id = $1`, [evaluacion_id]
    );
    if (!evalRes.rows[0]) throw new Error('Evaluación no encontrada');

    const puntaje = esta_ausente ? 0 : puntaje_obtenido;
    if (puntaje > evalRes.rows[0].puntaje_maximo) {
      throw new Error(`El puntaje ${puntaje} supera el máximo permitido (${evalRes.rows[0].puntaje_maximo})`);
    }

    const result = await pool.query(`
      INSERT INTO calificacion (evaluacion_id, matricula_id, puntaje_obtenido, esta_ausente, observacion, registrado_por)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (evaluacion_id, matricula_id) DO UPDATE SET
        puntaje_obtenido=$3, esta_ausente=$4, observacion=$5,
        registrado_por=$6, fecha_registro=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      RETURNING *
    `, [evaluacion_id, matricula_id, puntaje, esta_ausente ?? false, observacion || null, registrado_por]);
    return result.rows[0];
  }

  static async upsertMasivo({ evaluacion_id, registrado_por, registros }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const evalRes = await client.query(
        `SELECT ev.puntaje_maximo FROM evaluacion ev WHERE ev.id = $1 AND ev.activo = true`,
        [evaluacion_id]
      );
      if (!evalRes.rows[0]) throw new Error('Evaluación no encontrada o inactiva');
      const { puntaje_maximo } = evalRes.rows[0];

      const resultados = [];
      for (const reg of registros) {
        const puntaje = reg.esta_ausente ? 0 : reg.puntaje_obtenido;
        if (puntaje > puntaje_maximo) {
          throw new Error(`Puntaje ${puntaje} para matrícula ${reg.matricula_id} supera el máximo (${puntaje_maximo})`);
        }
        const r = await client.query(`
          INSERT INTO calificacion (evaluacion_id, matricula_id, puntaje_obtenido, esta_ausente, observacion, registrado_por)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (evaluacion_id, matricula_id) DO UPDATE SET
            puntaje_obtenido=$3, esta_ausente=$4, observacion=$5,
            registrado_por=$6, fecha_registro=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
          RETURNING *
        `, [evaluacion_id, reg.matricula_id, puntaje, reg.esta_ausente ?? false, reg.observacion || null, registrado_por]);
        resultados.push(r.rows[0]);
      }

      await client.query('COMMIT');
      return resultados;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async findByEvaluacion(evaluacion_id) {
    const result = await pool.query(`
    SELECT c.*,
           CAST(c.puntaje_obtenido AS FLOAT8) AS puntaje_obtenido,
           e.codigo AS estudiante_codigo, e.nombres AS estudiante_nombres,
           e.apellidos AS estudiante_apellidos, e.foto_url AS estudiante_foto, m.id AS matricula_id,
           (m.paralelo_cursado_id IS NOT NULL) AS es_caso_especial,
           po.nombre AS paralelo_origen_nombre,
           to_turno.nombre AS turno_origen_nombre,
           ee.id AS entrega_id,
           ee.archivo_url AS entrega_archivo_url,
           ee.archivo_nombre AS entrega_archivo_nombre,
           ee.archivo_tipo AS entrega_archivo_tipo,
           ee.archivo_tamano AS entrega_archivo_tamano,
           COALESCE(
             ee.archivos,
             CASE 
               WHEN ee.archivo_url IS NOT NULL 
               THEN jsonb_build_array(jsonb_build_object('url', ee.archivo_url, 'nombre', ee.archivo_nombre, 'tipo', ee.archivo_tipo, 'tamano', ee.archivo_tamano))
               ELSE '[]'::jsonb 
             END
           ) AS entrega_archivos,
           ee.fecha_entrega AS entrega_fecha,
           ee.comentario_estudiante AS entrega_comentario
    FROM asignacion_docente ad
    INNER JOIN matricula m
      ON  COALESCE(m.paralelo_cursado_id, m.paralelo_id) = ad.paralelo_id
      AND m.periodo_academico_id = ad.periodo_academico_id
      AND m.estado               = 'activo'
      AND m.deleted_at           IS NULL
    INNER JOIN estudiante e ON e.id = m.estudiante_id
    LEFT JOIN paralelo po ON m.paralelo_id = po.id
    LEFT JOIN turno to_turno ON po.turno_id = to_turno.id
    LEFT JOIN calificacion c ON c.matricula_id = m.id AND c.evaluacion_id = $1
    LEFT JOIN evaluacion_entrega ee ON ee.evaluacion_id = $1 AND ee.matricula_id = m.id
    WHERE ad.id = (SELECT asignacion_docente_id FROM evaluacion WHERE id = $1)
    ORDER BY e.apellidos, e.nombres
  `, [evaluacion_id]);
    return result.rows;
  }

  static async findByMatriculaPeriodo(matricula_id, periodo_evaluacion_id) {
    const result = await pool.query(`
    SELECT c.*,
           CAST(c.puntaje_obtenido AS FLOAT8) AS puntaje_obtenido,
           ev.nombre AS evaluacion_nombre, ev.tipo AS evaluacion_tipo,
           CAST(ev.puntaje_maximo AS FLOAT8) AS puntaje_maximo,
           ev.peso_en_dimension, ev.fecha AS evaluacion_fecha,
           de.nombre AS dimension_nombre, de.codigo AS dimension_codigo,
           de.porcentaje_ponderacion, de.color AS dimension_color
    FROM calificacion c
    INNER JOIN evaluacion ev           ON c.evaluacion_id = ev.id
    INNER JOIN dimension_evaluacion de ON ev.dimension_evaluacion_id = de.id
    WHERE c.matricula_id = $1
      AND ev.periodo_evaluacion_id = $2
      AND ev.activo = true
    ORDER BY de.orden, ev.fecha
  `, [matricula_id, periodo_evaluacion_id]);
    return result.rows;
  }
}

// =============================================
// NOTA DIMENSION + CALIFICACION PERIODO
// =============================================
class NotasCalculo {

  static async calcularNotaDimension(matricula_id, grado_materia_id, periodo_evaluacion_id, dimension_evaluacion_id) {
    const result = await pool.query(
      `SELECT calcular_nota_dimension($1,$2,$3,$4) AS nota`,
      [matricula_id, grado_materia_id, periodo_evaluacion_id, dimension_evaluacion_id]
    );
    return result.rows[0]?.nota;
  }

  static async calcularCalificacionPeriodo(matricula_id, grado_materia_id, periodo_evaluacion_id) {
    const result = await pool.query(
      `SELECT calcular_calificacion_periodo($1,$2,$3) AS nota_final`,
      [matricula_id, grado_materia_id, periodo_evaluacion_id]
    );
    return result.rows[0]?.nota_final;
  }

  static async getBoletin(matricula_id, periodo_evaluacion_id) {
    const result = await pool.query(
      `SELECT * FROM boletin_notas($1,$2)`,
      [matricula_id, periodo_evaluacion_id]
    );
    return result.rows;
  }

  static async getNotasDimension(matricula_id, grado_materia_id, periodo_evaluacion_id) {
    const result = await pool.query(`
      SELECT nd.*, de.nombre AS dimension_nombre, de.codigo AS dimension_codigo,
             de.porcentaje_ponderacion, de.color AS dimension_color
      FROM nota_dimension nd
      INNER JOIN dimension_evaluacion de ON nd.dimension_evaluacion_id = de.id
      WHERE nd.matricula_id=$1 AND nd.grado_materia_id=$2 AND nd.periodo_evaluacion_id=$3
      ORDER BY de.orden
    `, [matricula_id, grado_materia_id, periodo_evaluacion_id]);
    return result.rows;
  }

  static async getCalificacionPeriodo(matricula_id, grado_materia_id, periodo_evaluacion_id) {
    const result = await pool.query(`
      SELECT cp.*, mat.nombre AS materia_nombre, mat.codigo AS materia_codigo,
             pe.nombre AS periodo_nombre, u.username AS cerrado_por_username
      FROM calificacion_periodo cp
      INNER JOIN grado_materia gm      ON cp.grado_materia_id = gm.id
      INNER JOIN materia mat           ON gm.materia_id = mat.id
      INNER JOIN periodo_evaluacion pe ON cp.periodo_evaluacion_id = pe.id
      LEFT JOIN  usuarios u            ON cp.cerrado_por = u.id
      WHERE cp.matricula_id=$1 AND cp.grado_materia_id=$2 AND cp.periodo_evaluacion_id=$3
    `, [matricula_id, grado_materia_id, periodo_evaluacion_id]);
    return result.rows[0];
  }

  static async cerrarPeriodo(matricula_id, grado_materia_id, periodo_evaluacion_id, cerrado_por) {
    const result = await pool.query(`
      UPDATE calificacion_periodo
      SET estado='cerrada', cerrado_por=$1, fecha_cierre=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE matricula_id=$2 AND grado_materia_id=$3 AND periodo_evaluacion_id=$4 AND estado='activa'
      RETURNING *
    `, [cerrado_por, matricula_id, grado_materia_id, periodo_evaluacion_id]);
    return result.rows[0];
  }

  static async aplicarNotaManual(matricula_id, grado_materia_id, periodo_evaluacion_id, data = {}) {
    let mId = matricula_id;
    let gmId = grado_materia_id;
    let peId = periodo_evaluacion_id;
    let notaManual = data?.nota_manual;
    let justificacion = data?.justificacion_manual;
    let aplicadoPor = data?.aplicado_por;

    if (typeof matricula_id === 'object' && matricula_id !== null) {
      mId = matricula_id.matricula_id;
      gmId = matricula_id.grado_materia_id;
      peId = matricula_id.periodo_evaluacion_id;
      notaManual = matricula_id.nota_manual;
      justificacion = matricula_id.justificacion_manual;
      aplicadoPor = matricula_id.aplicado_por || matricula_id.usuario_id;
    }

    const notaMinima = (await pool.query(
      `SELECT nota_minima_aprobacion FROM grado_materia WHERE id = $1`, [gmId]
    )).rows[0]?.nota_minima_aprobacion || 51;

    const nota = parseFloat(Number(notaManual).toFixed(2));
    const aprobado = nota >= notaMinima;

    const result = await pool.query(`
      INSERT INTO calificacion_periodo (
        matricula_id, grado_materia_id, periodo_evaluacion_id,
        nota_final, aprobado, es_nota_manual, nota_manual,
        justificacion_manual, cerrado_por, estado, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, true, $4, $6, $7, 'activa', CURRENT_TIMESTAMP)
      ON CONFLICT (matricula_id, grado_materia_id, periodo_evaluacion_id)
      DO UPDATE SET
        nota_final = EXCLUDED.nota_final,
        aprobado = EXCLUDED.aprobado,
        es_nota_manual = true,
        nota_manual = EXCLUDED.nota_manual,
        justificacion_manual = EXCLUDED.justificacion_manual,
        cerrado_por = EXCLUDED.cerrado_por,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [mId, gmId, peId, nota, aprobado, justificacion || 'Ajuste administrativo', aplicadoPor]);
    return result.rows[0];
  }

  // ==========================================
  // CONSOLIDADO DE NOTAS POR CURSO / PARALELO
  // ==========================================
  static async getNotasCurso(paralelo_id, periodo_academico_id = null) {
    // 1. Obtener info del curso/paralelo
    const cursoRes = await pool.query(`
      SELECT p.id AS paralelo_id, p.nombre AS paralelo_nombre, p.aula,
             g.id AS grado_id, g.nombre AS grado_nombre, g.orden AS grado_orden,
             n.id AS nivel_id, n.nombre AS nivel_nombre,
             t.id AS turno_id, t.nombre AS turno_nombre
      FROM paralelo p
      INNER JOIN grado g ON p.grado_id = g.id
      INNER JOIN nivel_academico n ON g.nivel_academico_id = n.id
      INNER JOIN turno t ON p.turno_id = t.id
      WHERE p.id = $1
    `, [paralelo_id]);

    if (!cursoRes.rows[0]) {
      throw new Error(`Paralelo con ID ${paralelo_id} no encontrado`);
    }
    const curso = cursoRes.rows[0];

    // 2. Determinar periodo académico
    let periodoAcademicoId = periodo_academico_id;
    if (!periodoAcademicoId) {
      const paRes = await pool.query(`SELECT id, nombre, codigo FROM periodo_academico WHERE activo = true ORDER BY id DESC LIMIT 1`);
      if (!paRes.rows[0]) throw new Error('No se encontró un período académico activo');
      periodoAcademicoId = paRes.rows[0].id;
    }

    // 3. Obtener los períodos de evaluación (trimestres)
    const periodosRes = await pool.query(`
      SELECT id, nombre, codigo, orden, fecha_inicio, fecha_fin, activo
      FROM periodo_evaluacion
      WHERE periodo_academico_id = $1
      ORDER BY orden ASC
    `, [periodoAcademicoId]);
    const periodos = periodosRes.rows;

    // 4. Obtener las materias del grado
    const materiasRes = await pool.query(`
      SELECT gm.id AS grado_materia_id, gm.nota_minima_aprobacion, gm.peso_porcentual,
             m.id AS materia_id, m.nombre AS materia_nombre, m.codigo AS materia_codigo,
             CONCAT(d.nombres, ' ', d.apellidos) AS docente_nombre
      FROM grado_materia gm
      INNER JOIN materia m ON gm.materia_id = m.id
      LEFT JOIN asignacion_docente ad ON ad.grado_materia_id = gm.id 
                                     AND ad.paralelo_id = $1 
                                     AND ad.periodo_academico_id = $2 
                                     AND ad.activo = true
      LEFT JOIN docente d ON ad.docente_id = d.id
      WHERE gm.grado_id = $3 AND m.deleted_at IS NULL
      ORDER BY gm.orden ASC, m.nombre ASC
    `, [paralelo_id, periodoAcademicoId, curso.grado_id]);
    const materias = materiasRes.rows;

    // 5. Obtener estudiantes matriculados activos en el paralelo
    const estRes = await pool.query(`
      SELECT m.id AS matricula_id, m.numero_matricula, m.estado AS estado_matricula,
             m.paralelo_id, m.paralelo_cursado_id,
             (m.paralelo_cursado_id IS NOT NULL) AS es_caso_especial,
             po.nombre AS paralelo_origen_nombre,
             to_turno.nombre AS turno_origen_nombre,
             e.id AS estudiante_id, e.codigo AS estudiante_codigo, e.ci,
             e.nombres, e.apellido_paterno, e.apellido_materno,
             CONCAT(e.apellido_paterno, ' ', COALESCE(e.apellido_materno, ''), ' ', e.nombres) AS nombre_completo,
             e.foto_url, e.genero
      FROM matricula m
      INNER JOIN estudiante e ON m.estudiante_id = e.id
      LEFT JOIN paralelo po ON m.paralelo_id = po.id
      LEFT JOIN turno to_turno ON po.turno_id = to_turno.id
      WHERE COALESCE(m.paralelo_cursado_id, m.paralelo_id) = $1
        AND m.periodo_academico_id = $2
        AND m.estado = 'activo'
        AND m.deleted_at IS NULL
      ORDER BY e.apellido_paterno ASC, e.apellido_materno ASC, e.nombres ASC
    `, [paralelo_id, periodoAcademicoId]);
    const estudiantes = estRes.rows;

    // 6. Obtener todas las calificaciones del curso
    const califRes = await pool.query(`
      SELECT cp.id, cp.matricula_id, cp.grado_materia_id, cp.periodo_evaluacion_id,
             cp.nota_final, cp.aprobado, cp.estado,
             cp.es_nota_manual, cp.nota_manual, cp.justificacion_manual,
             MAX(CASE WHEN de.codigo = 'SER' THEN nd.nota_promedio END) AS nota_ser,
             MAX(CASE WHEN de.codigo = 'SAB' THEN nd.nota_promedio END) AS nota_saber,
             MAX(CASE WHEN de.codigo = 'HAC' THEN nd.nota_promedio END) AS nota_hacer,
             MAX(CASE WHEN de.codigo IN ('AUT', 'AUTO') THEN nd.nota_promedio END) AS nota_auto
      FROM calificacion_periodo cp
      INNER JOIN matricula m ON cp.matricula_id = m.id
      LEFT JOIN nota_dimension nd ON nd.matricula_id = cp.matricula_id
                                 AND nd.grado_materia_id = cp.grado_materia_id
                                 AND nd.periodo_evaluacion_id = cp.periodo_evaluacion_id
      LEFT JOIN dimension_evaluacion de ON nd.dimension_evaluacion_id = de.id
      WHERE COALESCE(m.paralelo_cursado_id, m.paralelo_id) = $1
        AND m.periodo_academico_id = $2
        AND m.estado = 'activo'
        AND m.deleted_at IS NULL
      GROUP BY cp.id, cp.matricula_id, cp.grado_materia_id, cp.periodo_evaluacion_id,
               cp.nota_final, cp.aprobado, cp.estado, cp.es_nota_manual, cp.nota_manual, cp.justificacion_manual
    `, [paralelo_id, periodoAcademicoId]);
    const calificaciones = califRes.rows;

    // Indexar calificaciones por matricula_id + periodo_evaluacion_id + grado_materia_id
    const califMap = new Map();
    for (const c of calificaciones) {
      const key = `${c.matricula_id}_${c.periodo_evaluacion_id}_${c.grado_materia_id}`;
      califMap.set(key, c);
    }

    // 7. Mapear estudiantes con sus notas por trimestre y consolidado anual
    const estudiantesData = estudiantes.map(est => {
      // Trimestres individuales
      const trimestres = periodos.map(p => {
        const materiasPeriodo = materias.map(mat => {
          const key = `${est.matricula_id}_${p.id}_${mat.grado_materia_id}`;
          const c = califMap.get(key);
          const notaFinal = c?.nota_final != null ? Number(c.nota_final) : null;
          const notaMinima = Number(mat.nota_minima_aprobacion || 51);
          const aprobado = notaFinal != null ? notaFinal >= notaMinima : null;

          return {
            materia_id: mat.materia_id,
            grado_materia_id: mat.grado_materia_id,
            materia_codigo: mat.materia_codigo,
            materia_nombre: mat.materia_nombre,
            nota_minima: notaMinima,
            nota_final: notaFinal,
            aprobado,
            estado: c?.estado || 'sin_registro',
            nota_ser: c?.nota_ser != null ? Number(c.nota_ser) : null,
            nota_saber: c?.nota_saber != null ? Number(c.nota_saber) : null,
            nota_hacer: c?.nota_hacer != null ? Number(c.nota_hacer) : null,
            nota_auto: c?.nota_auto != null ? Number(c.nota_auto) : null,
          };
        });

        const notasValidas = materiasPeriodo.filter(m => m.nota_final != null);
        const promedio = notasValidas.length > 0
          ? Math.round(notasValidas.reduce((sum, m) => sum + m.nota_final, 0) / notasValidas.length)
          : null;
        const aprobadas = materiasPeriodo.filter(m => m.aprobado === true).length;
        const reprobadas = materiasPeriodo.filter(m => m.aprobado === false).length;
        const sinNota = materiasPeriodo.filter(m => m.nota_final == null).length;

        return {
          periodo_id: p.id,
          periodo_nombre: p.nombre,
          periodo_orden: p.orden,
          materias: materiasPeriodo,
          promedio,
          aprobadas,
          reprobadas,
          sin_nota: sinNota,
        };
      });

      // Consolidado Anual por Materia
      const materiasAnuales = materias.map(mat => {
        const trimestresMateria = periodos.map(p => {
          const key = `${est.matricula_id}_${p.id}_${mat.grado_materia_id}`;
          const c = califMap.get(key);
          const notaFinal = c?.nota_final != null ? Number(c.nota_final) : null;
          const notaMinima = Number(mat.nota_minima_aprobacion || 51);
          const aprobado = notaFinal != null ? notaFinal >= notaMinima : null;
          return {
            periodo_id: p.id,
            periodo_nombre: p.nombre,
            periodo_orden: p.orden,
            nota_final: notaFinal,
            aprobado,
          };
        });

        const notasValidas = trimestresMateria.filter(t => t.nota_final != null);
        const promedioAnual = notasValidas.length > 0
          ? Math.round(notasValidas.reduce((sum, t) => sum + t.nota_final, 0) / notasValidas.length)
          : null;
        const notaMinima = Number(mat.nota_minima_aprobacion || 51);
        const aprobadoAnual = promedioAnual != null ? promedioAnual >= notaMinima : null;

        let nivel = 'sin_nota';
        if (promedioAnual != null) {
          if (promedioAnual >= 85) nivel = 'excelente';
          else if (promedioAnual >= 70) nivel = 'bueno';
          else if (promedioAnual >= 51) nivel = 'regular';
          else nivel = 'en_riesgo';
        }

        return {
          materia_id: mat.materia_id,
          grado_materia_id: mat.grado_materia_id,
          materia_codigo: mat.materia_codigo,
          materia_nombre: mat.materia_nombre,
          nota_minima: notaMinima,
          trimestres: trimestresMateria,
          promedio_anual: promedioAnual,
          aprobado_anual: aprobadoAnual,
          nivel,
        };
      });

      const materiasConPromedioAnual = materiasAnuales.filter(m => m.promedio_anual != null);
      const promedioGeneralAnual = materiasConPromedioAnual.length > 0
        ? Math.round(materiasConPromedioAnual.reduce((sum, m) => sum + m.promedio_anual, 0) / materiasConPromedioAnual.length)
        : null;
      const aprobadasAnual = materiasAnuales.filter(m => m.aprobado_anual === true).length;
      const reprobadasAnual = materiasAnuales.filter(m => m.aprobado_anual === false).length;
      const sinNotaAnual = materiasAnuales.filter(m => m.promedio_anual == null).length;

      let estadoGeneral = 'regular';
      if (reprobadasAnual > 1 || (promedioGeneralAnual != null && promedioGeneralAnual < 51)) {
        estadoGeneral = 'reprobado';
      } else if (reprobadasAnual === 1 || (promedioGeneralAnual != null && promedioGeneralAnual <= 60)) {
        estadoGeneral = 'en_riesgo';
      } else if (promedioGeneralAnual != null && promedioGeneralAnual >= 70) {
        estadoGeneral = 'aprobado';
      } else if (promedioGeneralAnual == null) {
        estadoGeneral = 'sin_nota';
      }

      return {
        matricula_id: est.matricula_id,
        estudiante_id: est.estudiante_id,
        codigo: est.estudiante_codigo,
        ci: est.ci,
        nombres: est.nombres,
        apellido_paterno: est.apellido_paterno,
        apellido_materno: est.apellido_materno,
        nombre_completo: est.nombre_completo,
        foto_url: est.foto_url,
        genero: est.genero,
        trimestres,
        materias_anuales: materiasAnuales,
        promedio_general_anual: promedioGeneralAnual,
        aprobadas_anual: aprobadasAnual,
        reprobadas_anual: reprobadasAnual,
        sin_nota_anual: sinNotaAnual,
        estado_general: estadoGeneral,
      };
    });

    // 8. Estadísticas globales del curso
    const totalEstudiantes = estudiantesData.length;
    const estConPromedioAnual = estudiantesData.filter(e => e.promedio_general_anual != null);
    const promedioGeneralCurso = estConPromedioAnual.length > 0
      ? Math.round(estConPromedioAnual.reduce((sum, e) => sum + e.promedio_general_anual, 0) / estConPromedioAnual.length)
      : null;

    const statsPorPeriodo = periodos.map(p => {
      const notasPeriodo = [];
      estudiantesData.forEach(e => {
        const tri = e.trimestres.find(t => t.periodo_id === p.id);
        if (tri?.promedio != null) notasPeriodo.push(tri.promedio);
      });
      return {
        periodo_id: p.id,
        periodo_nombre: p.nombre,
        promedio_curso: notasPeriodo.length > 0
          ? Math.round(notasPeriodo.reduce((a, b) => a + b, 0) / notasPeriodo.length)
          : null,
      };
    });

    // Promedios por materia a nivel de curso
    const promediosMaterias = materias.map(mat => {
      const notasMateria = [];
      estudiantesData.forEach(e => {
        const matAnual = e.materias_anuales.find(m => m.grado_materia_id === mat.grado_materia_id);
        if (matAnual?.promedio_anual != null) {
          notasMateria.push(matAnual.promedio_anual);
        }
      });
      const promMat = notasMateria.length > 0
        ? Math.round(notasMateria.reduce((a, b) => a + b, 0) / notasMateria.length)
        : null;
      const aprobadosMat = notasMateria.filter(n => n >= (mat.nota_minima_aprobacion || 51)).length;
      return {
        materia_id: mat.materia_id,
        grado_materia_id: mat.grado_materia_id,
        materia_codigo: mat.materia_codigo,
        materia_nombre: mat.materia_nombre,
        docente_nombre: mat.docente_nombre,
        promedio_curso: promMat,
        porcentaje_aprobados: notasMateria.length > 0
          ? Math.round((aprobadosMat / notasMateria.length) * 100)
          : null,
      };
    });

    return {
      curso,
      periodos,
      materias,
      estudiantes: estudiantesData,
      estadisticas: {
        total_estudiantes: totalEstudiantes,
        promedio_general_curso: promedioGeneralCurso,
        aprobados_total: estudiantesData.filter(e => e.estado_general === 'aprobado' || e.estado_general === 'regular').length,
        en_riesgo_total: estudiantesData.filter(e => e.estado_general === 'en_riesgo').length,
        reprobados_total: estudiantesData.filter(e => e.estado_general === 'reprobado').length,
        stats_por_periodo: statsPorPeriodo,
        promedios_materias: promediosMaterias,
      }
    };
  }
}

export { PeriodoEvaluacion, DimensionEvaluacion, Evaluacion, Calificacion, NotasCalculo };