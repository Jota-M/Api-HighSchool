// models/Notas.js
import { pool } from '../db/pool.js';

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
      nombre, tipo, descripcion, fecha, puntaje_maximo, peso_en_dimension,
      visible_para_padres,
      tema_id          // ← NUEVO
    } = data;

    const result = await pool.query(`
      INSERT INTO evaluacion (
        asignacion_docente_id, dimension_evaluacion_id, periodo_evaluacion_id,
        nombre, tipo, descripcion, fecha, puntaje_maximo, peso_en_dimension,
        visible_para_padres,
        tema_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      asignacion_docente_id, dimension_evaluacion_id, periodo_evaluacion_id,
      nombre, tipo || null, descripcion || null, fecha || null,
      puntaje_maximo || 100, peso_en_dimension || 1.00, visible_para_padres ?? false,
      tema_id || null     // ← NUEVO (posición $11)
    ]);
    return result.rows[0];
  }

  static async findAll(filters = {}) {
    const {
      page = 1, limit = 20,
      asignacion_docente_id, dimension_evaluacion_id,
      periodo_evaluacion_id, activo,
      tema_id           // ← NUEVO
    } = filters;
    const offset = (page - 1) * limit;
    let where = []; let params = []; let p = 1;

    if (asignacion_docente_id)   { where.push(`e.asignacion_docente_id = $${p++}`);   params.push(asignacion_docente_id); }
    if (dimension_evaluacion_id) { where.push(`e.dimension_evaluacion_id = $${p++}`); params.push(dimension_evaluacion_id); }
    if (periodo_evaluacion_id)   { where.push(`e.periodo_evaluacion_id = $${p++}`);   params.push(periodo_evaluacion_id); }
    if (activo !== undefined)    { where.push(`e.activo = $${p++}`);                  params.push(activo); }
    if (tema_id)                 { where.push(`e.tema_id = $${p++}`);                 params.push(tema_id); }  // ← NUEVO

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await pool.query(`SELECT COUNT(*) FROM evaluacion e ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(`
      SELECT
        e.*,
        de.nombre AS dimension_nombre, de.codigo AS dimension_codigo, de.color AS dimension_color,
        pe.nombre AS periodo_nombre,
        mat.nombre AS materia_nombre,
        -- Tema y unidad (pueden ser NULL)              ← NUEVO bloque
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
      LEFT  JOIN tema t                  ON e.tema_id = t.id           -- ← NUEVO
      LEFT  JOIN unidad_tematica u       ON t.unidad_tematica_id = u.id -- ← NUEVO
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
      nombre, tipo, descripcion, fecha, puntaje_maximo,
      peso_en_dimension, visible_para_padres, activo,
      tema_id           // ← NUEVO
    } = data;
    const result = await pool.query(`
      UPDATE evaluacion SET
        nombre=$1, tipo=$2, descripcion=$3, fecha=$4, puntaje_maximo=$5,
        peso_en_dimension=$6, visible_para_padres=$7, activo=$8,
        tema_id=$9,         -- ← NUEVO ($9)
        fecha_publicacion = CASE WHEN $7=true AND visible_para_padres=false THEN CURRENT_TIMESTAMP ELSE fecha_publicacion END,
        updated_at=CURRENT_TIMESTAMP
      WHERE id = $10        -- ← era $9, ahora $10
      RETURNING *
    `, [nombre, tipo, descripcion || null, fecha, puntaje_maximo,
        peso_en_dimension, visible_para_padres, activo,
        tema_id || null,    // ← NUEVO
        id]);
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
        -- Calificaciones registradas
        COUNT(DISTINCT c.id)            AS calificaciones_registradas,
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
                                       AND pe.activo                = true
                                       AND ($2::INTEGER IS NULL OR pe.id = $2)
      -- Matrículas activas
      LEFT JOIN matricula m
        ON  m.paralelo_id          = ad.paralelo_id
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
        g.id, g.nombre, n.nombre,
        p.id, p.nombre,
        t.nombre, t.hora_inicio,
        pa.id, pa.nombre,
        pe.id, pe.nombre, pe.orden
      ORDER BY pa.nombre, t.hora_inicio, mat.nombre, pe.orden
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
      SELECT c.*, e.codigo AS estudiante_codigo, e.nombres AS estudiante_nombres,
             e.apellidos AS estudiante_apellidos, e.foto_url AS estudiante_foto, m.id AS matricula_id
      FROM asignacion_docente ad
      INNER JOIN matricula m
        ON  m.paralelo_id          = ad.paralelo_id
        AND m.periodo_academico_id = ad.periodo_academico_id
        AND m.estado               = 'activo'
        AND m.deleted_at           IS NULL
      INNER JOIN estudiante e ON e.id = m.estudiante_id
      LEFT JOIN calificacion c ON c.matricula_id = m.id AND c.evaluacion_id = $1
      WHERE ad.id = (SELECT asignacion_docente_id FROM evaluacion WHERE id = $1)
      ORDER BY e.apellidos, e.nombres
    `, [evaluacion_id]);
    return result.rows;
  }

  static async findByMatriculaPeriodo(matricula_id, periodo_evaluacion_id) {
    const result = await pool.query(`
      SELECT c.*, ev.nombre AS evaluacion_nombre, ev.tipo AS evaluacion_tipo,
             ev.puntaje_maximo, ev.peso_en_dimension, ev.fecha AS evaluacion_fecha,
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

  static async aplicarNotaManual(matricula_id, grado_materia_id, periodo_evaluacion_id, { nota_manual, justificacion_manual, aplicado_por }) {
    const notaMinima = (await pool.query(
      `SELECT nota_minima_aprobacion FROM grado_materia WHERE id = $1`, [grado_materia_id]
    )).rows[0]?.nota_minima_aprobacion || 51;

    const result = await pool.query(`
      UPDATE calificacion_periodo
      SET es_nota_manual=true, nota_manual=$1, nota_final=$1, aprobado=$1>=$2,
          justificacion_manual=$3, cerrado_por=$4, updated_at=CURRENT_TIMESTAMP
      WHERE matricula_id=$5 AND grado_materia_id=$6 AND periodo_evaluacion_id=$7
      RETURNING *
    `, [nota_manual, notaMinima, justificacion_manual, aplicado_por, matricula_id, grado_materia_id, periodo_evaluacion_id]);
    return result.rows[0];
  }
}

export { PeriodoEvaluacion, DimensionEvaluacion, Evaluacion, Calificacion, NotasCalculo };