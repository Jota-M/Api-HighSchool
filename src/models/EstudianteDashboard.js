// models/EstudianteDashboard.js
import { pool } from '../db/pool.js';

/**
 * Todas las queries parten del usuario_id del JWT (req.user.id).
 * Resuelven internamente: usuario_id → estudiante → matricula → todo lo demás.
 * El estudiante NUNCA puede ver datos de otro estudiante.
 */
class EstudianteDashboard {

  // ─────────────────────────────────────────────────────────────
  // HELPER PRIVADO — resolver matrícula activa
  // Retorna: { matricula_id, paralelo_id, grado_id, periodo_academico_id, estudiante_id }
  // ─────────────────────────────────────────────────────────────
  static async _getMatriculaActiva(usuario_id) {
    const result = await pool.query(`
      SELECT
        m.id                    AS matricula_id,
        m.paralelo_id,
        p.grado_id,
        m.periodo_academico_id,
        e.id                    AS estudiante_id
      FROM estudiante e
      INNER JOIN matricula m          ON m.estudiante_id = e.id
      INNER JOIN paralelo p           ON m.paralelo_id = p.id
      INNER JOIN periodo_academico pa ON m.periodo_academico_id = pa.id
      WHERE e.usuario_id = $1
        AND m.estado    = 'activo'
        AND pa.activo   = true
        AND e.activo    = true
      ORDER BY m.created_at DESC
      LIMIT 1
    `, [usuario_id]);

    return result.rows[0] || null;
  }

  // ─────────────────────────────────────────────────────────────
  // 1. PERFIL DEL ESTUDIANTE
  // ─────────────────────────────────────────────────────────────
  static async getPerfil(usuario_id) {
    const result = await pool.query(`
      SELECT
        e.id                  AS estudiante_id,
        e.codigo              AS codigo_estudiante,
        e.nombres,
        e.apellidos,
        e.ci,
        e.fecha_nacimiento,
        e.genero,
        e.email,
        e.telefono,
        e.foto_url,
        e.tiene_discapacidad,
        e.tipo_discapacidad,
        -- Matrícula activa
        m.id                  AS matricula_id,
        m.numero_matricula,
        m.estado              AS estado_matricula,
        m.es_repitente,
        m.es_becado,
        m.porcentaje_beca,
        -- Paralelo / grado
        p.nombre              AS paralelo_nombre,
        g.nombre              AS grado_nombre,
        na.nombre             AS nivel_academico,
        t.nombre              AS turno,
        t.hora_inicio         AS turno_hora_inicio,
        t.hora_fin            AS turno_hora_fin,
        -- Periodo académico
        pa.nombre             AS periodo_academico,
        pa.fecha_inicio       AS periodo_inicio,
        pa.fecha_fin          AS periodo_fin
      FROM estudiante e
      INNER JOIN matricula m          ON m.estudiante_id = e.id
      INNER JOIN paralelo p           ON m.paralelo_id = p.id
      INNER JOIN grado g              ON p.grado_id = g.id
      INNER JOIN nivel_academico na   ON g.nivel_academico_id = na.id
      INNER JOIN turno t              ON p.turno_id = t.id
      INNER JOIN periodo_academico pa ON m.periodo_academico_id = pa.id
      WHERE e.usuario_id = $1
        AND m.estado    = 'activo'
        AND pa.activo   = true
        AND e.activo    = true
      ORDER BY m.created_at DESC
      LIMIT 1
    `, [usuario_id]);

    return result.rows[0] || null;
  }

  // ─────────────────────────────────────────────────────────────
  // 2. MATERIAS DEL ESTUDIANTE
  // CORREGIDO: Eliminados duplicados usando subconsultas
  // ─────────────────────────────────────────────────────────────
  static async getMisMaterias(usuario_id, periodo_evaluacion_id = null) {
    const matricula = await EstudianteDashboard._getMatriculaActiva(usuario_id);
    if (!matricula) return [];

    const result = await pool.query(`
      SELECT
        ad.id                         AS asignacion_docente_id,
        gm.id                         AS grado_materia_id,
        -- Materia
        mat.id                        AS materia_id,
        mat.codigo                    AS materia_codigo,
        mat.nombre                    AS materia_nombre,
        mat.descripcion               AS materia_descripcion,
        mat.horas_semanales,
        mat.color                     AS materia_color,
        ac.nombre                     AS area_conocimiento,
        -- Docente
        d.id                          AS docente_id,
        d.nombres                     AS docente_nombres,
        d.apellidos                   AS docente_apellidos,
        d.foto_url                    AS docente_foto,
        d.email                       AS docente_email,
        -- Trimestre (si se filtra)
        pe.id                         AS periodo_evaluacion_id,
        pe.nombre                     AS trimestre_nombre,
        pe.orden                      AS trimestre_orden,
        
        -- SUBCONSULTA: Materiales publicados disponibles
        (
          SELECT COUNT(DISTINCT ma.id)
          FROM material_academico ma
          WHERE ma.asignacion_docente_id = ad.id
            AND ma.visible_para_estudiantes = true
            AND ma.fecha_publicacion IS NOT NULL
            AND ma.fecha_publicacion <= CURRENT_TIMESTAMP
            AND (ma.fecha_despublicacion IS NULL OR ma.fecha_despublicacion > CURRENT_TIMESTAMP)
            AND ma.activo = true 
            AND ma.deleted_at IS NULL
        ) AS total_materiales,
        
        -- SUBCONSULTA: Total de temas
        (
          SELECT COUNT(DISTINCT t.id)
          FROM unidad_tematica ut
          INNER JOIN tema t ON t.unidad_tematica_id = ut.id
          WHERE ut.grado_materia_id = gm.id
            AND ut.activo = true
            AND t.activo = true
        ) AS total_temas,
        
        -- SUBCONSULTA: Temas completados
        (
          SELECT COUNT(DISTINCT pe_prog.tema_id)
          FROM unidad_tematica ut
          INNER JOIN tema t ON t.unidad_tematica_id = ut.id
          INNER JOIN progreso_estudiante pe_prog ON pe_prog.tema_id = t.id
          WHERE ut.grado_materia_id = gm.id
            AND pe_prog.matricula_id = $1
            AND pe_prog.estado = 'completado'
            AND ut.activo = true
            AND t.activo = true
        ) AS temas_completados,
        
        -- SUBCONSULTA: Progreso promedio
        (
          SELECT ROUND(COALESCE(AVG(pe_prog.porcentaje_avance), 0)::NUMERIC, 2)
          FROM unidad_tematica ut
          INNER JOIN tema t ON t.unidad_tematica_id = ut.id
          INNER JOIN progreso_estudiante pe_prog ON pe_prog.tema_id = t.id
          WHERE ut.grado_materia_id = gm.id
            AND pe_prog.matricula_id = $1
            AND ut.activo = true
            AND t.activo = true
        ) AS progreso_promedio,
        
        -- Nota final del trimestre
        cp.nota_final,
        cp.aprobado,
        cp.estado                     AS estado_nota,
        
        -- SUBCONSULTA: Asistencia presentes
        (
          SELECT COUNT(DISTINCT asi.id)
          FROM asistencia asi
          WHERE asi.asignacion_docente_id = ad.id
            AND asi.matricula_id = $1
            AND asi.estado = 'presente'
        ) AS asistencias_presentes,
        
        -- SUBCONSULTA: Asistencia ausentes
        (
          SELECT COUNT(DISTINCT asi.id)
          FROM asistencia asi
          WHERE asi.asignacion_docente_id = ad.id
            AND asi.matricula_id = $1
            AND asi.estado = 'ausente'
        ) AS asistencias_ausentes,
        
        -- SUBCONSULTA: Asistencia total
        (
          SELECT COUNT(DISTINCT asi.id)
          FROM asistencia asi
          WHERE asi.asignacion_docente_id = ad.id
            AND asi.matricula_id = $1
        ) AS asistencias_total
        
      FROM asignacion_docente ad
      INNER JOIN grado_materia gm       ON ad.grado_materia_id = gm.id
      INNER JOIN materia mat            ON gm.materia_id = mat.id
      INNER JOIN area_conocimiento ac   ON mat.area_conocimiento_id = ac.id
      INNER JOIN docente d              ON ad.docente_id = d.id
      -- Trimestres del período académico
      LEFT JOIN LATERAL (
        SELECT pe.id, pe.nombre, pe.orden
        FROM periodo_evaluacion pe
        WHERE pe.periodo_academico_id = $3
          AND pe.activo = true
          AND ($4::INTEGER IS NULL OR pe.id = $4)
        ORDER BY pe.orden DESC
        LIMIT 1
      ) pe ON true

      LEFT JOIN calificacion_periodo cp
        ON cp.grado_materia_id       = gm.id
        AND cp.matricula_id          = $1
        AND cp.periodo_evaluacion_id = pe.id
      WHERE ad.paralelo_id           = $2
        AND ad.periodo_academico_id  = $3
        AND ad.activo                = true
        AND ad.deleted_at            IS NULL
        AND gm.activo                = true
      ORDER BY mat.nombre, pe.orden
    `, [
      matricula.matricula_id,
      matricula.paralelo_id,
      matricula.periodo_academico_id,
      periodo_evaluacion_id || null
    ]);

    return result.rows;
  }

  // ─────────────────────────────────────────────────────────────
  // 3. DETALLE DE UNA MATERIA — temario + progreso del estudiante
  // Valida que la materia pertenezca al grado del estudiante
  // ─────────────────────────────────────────────────────────────
  static async getDetalleMateriaConTemario(usuario_id, grado_materia_id) {
    const matricula = await EstudianteDashboard._getMatriculaActiva(usuario_id);
    if (!matricula) return null;

    // Verificar que la materia pertenece al grado del estudiante
    const check = await pool.query(`
      SELECT gm.id FROM grado_materia gm
      WHERE gm.id = $1 AND gm.grado_id = $2 LIMIT 1
    `, [grado_materia_id, matricula.grado_id]);
    if (!check.rows[0]) return null;

    const result = await pool.query(`
      SELECT
        ut.id                     AS unidad_id,
        ut.numero_unidad,
        ut.titulo                 AS unidad_titulo,
        ut.descripcion            AS unidad_descripcion,
        ut.fecha_inicio_prevista,
        ut.fecha_fin_prevista,
        -- Tema
        t.id                      AS tema_id,
        t.numero_tema,
        t.titulo                  AS tema_titulo,
        t.descripcion             AS tema_descripcion,
        t.nivel_dificultad,
        t.duracion_estimada,
        t.es_obligatorio,
        t.palabras_clave,
        
        -- SUBCONSULTA: Materiales publicados en este tema
        (
          SELECT COUNT(DISTINCT ma.id)
          FROM material_tema mt
          INNER JOIN material_academico ma ON ma.id = mt.material_academico_id
          WHERE mt.tema_id = t.id
            AND ma.visible_para_estudiantes = true
            AND ma.fecha_publicacion IS NOT NULL
            AND ma.fecha_publicacion <= CURRENT_TIMESTAMP
            AND (ma.fecha_despublicacion IS NULL OR ma.fecha_despublicacion > CURRENT_TIMESTAMP)
            AND ma.activo = true 
            AND ma.deleted_at IS NULL
        ) AS materiales_disponibles,
        
        -- Progreso del estudiante en este tema
        COALESCE(pe.estado, 'no_iniciado')  AS estado_progreso,
        COALESCE(pe.porcentaje_avance, 0)   AS porcentaje_avance,
        COALESCE(pe.tiempo_dedicado, 0)     AS tiempo_dedicado,
        pe.fecha_inicio           AS progreso_fecha_inicio,
        pe.fecha_completado       AS progreso_fecha_completado
      FROM unidad_tematica ut
      LEFT JOIN tema t                  ON t.unidad_tematica_id = ut.id AND t.activo = true
      LEFT JOIN progreso_estudiante pe  ON pe.tema_id = t.id AND pe.matricula_id = $2
      WHERE ut.grado_materia_id = $1 AND ut.activo = true
      ORDER BY ut.numero_unidad, t.numero_tema
    `, [grado_materia_id, matricula.matricula_id]);

    return result.rows;
  }

  // ─────────────────────────────────────────────────────────────
  // 4. MATERIALES DE UNA MATERIA — solo publicados y visibles
  // ─────────────────────────────────────────────────────────────
  static async getMaterialesDeMateriaParaEstudiante(
    usuario_id,
    asignacion_docente_id,
    { tipo_material_id, tema_id, page = 1, limit = 20 } = {}
  ) {
    const matricula = await EstudianteDashboard._getMatriculaActiva(usuario_id);
    if (!matricula) return { materiales: [], paginacion: null };

    // Verificar que la asignación pertenece al paralelo/período del estudiante
    const check = await pool.query(`
      SELECT id FROM asignacion_docente
      WHERE id = $1 AND paralelo_id = $2 AND periodo_academico_id = $3 AND activo = true
      LIMIT 1
    `, [asignacion_docente_id, matricula.paralelo_id, matricula.periodo_academico_id]);
    if (!check.rows[0]) return { materiales: [], paginacion: null };

    const offset = (page - 1) * limit;
    let where = [
      `ma.asignacion_docente_id = $1`,
      `ma.visible_para_estudiantes = true`,
      `ma.fecha_publicacion IS NOT NULL`,
      `ma.fecha_publicacion <= CURRENT_TIMESTAMP`,
      `(ma.fecha_despublicacion IS NULL OR ma.fecha_despublicacion > CURRENT_TIMESTAMP)`,
      `ma.activo = true`,
      `ma.deleted_at IS NULL`
    ];
    let params = [asignacion_docente_id];
    let p = 2;

    if (tipo_material_id) {
      where.push(`ma.tipo_material_id = $${p++}`);
      params.push(tipo_material_id);
    }
    if (tema_id) {
      where.push(`EXISTS (SELECT 1 FROM material_tema mt WHERE mt.material_academico_id = ma.id AND mt.tema_id = $${p++})`);
      params.push(tema_id);
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM material_academico ma ${whereClause}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(`
      SELECT
        ma.id,
        ma.codigo_material,
        ma.titulo,
        ma.descripcion,
        ma.es_enlace_externo,
        ma.url_archivo,
        ma.url_externa,
        ma.nombre_archivo,
        ma.tamano_bytes,
        ma.tipo_mime,
        ma.requiere_descarga,
        ma.es_destacado,
        ma.contador_vistas,
        ma.contador_descargas,
        ma.fecha_publicacion,
        ma.version,
        -- Tipo de material
        tm.nombre               AS tipo_material_nombre,
        tm.icono                AS tipo_material_icono,
        tm.color                AS tipo_material_color,
        -- ¿Favorito del estudiante?
        EXISTS(
          SELECT 1 FROM favorito_material fm
          WHERE fm.material_academico_id = ma.id AND fm.matricula_id = $${p}
        )                       AS es_favorito,
        -- ¿Ya fue accedido?
        EXISTS(
          SELECT 1 FROM acceso_material am
          WHERE am.material_academico_id = ma.id AND am.matricula_id = $${p}
        )                       AS ya_accedido,
        
        -- SUBCONSULTA: Total comentarios
        (
          SELECT COUNT(DISTINCT cm.id)
          FROM comentario_material cm
          WHERE cm.material_academico_id = ma.id AND cm.activo = true
        ) AS total_comentarios,
        
        -- Temas vinculados
        JSON_AGG(
          DISTINCT JSONB_BUILD_OBJECT(
            'tema_id',      mt.tema_id,
            'tema_titulo',  t.titulo,
            'es_principal', mt.es_principal
          )
        ) FILTER (WHERE mt.tema_id IS NOT NULL) AS temas
      FROM material_academico ma
      INNER JOIN tipo_material tm           ON ma.tipo_material_id = tm.id
      LEFT JOIN  material_tema mt           ON mt.material_academico_id = ma.id
      LEFT JOIN  tema t                     ON t.id = mt.tema_id
      ${whereClause}
      GROUP BY ma.id, tm.nombre, tm.icono, tm.color
      ORDER BY ma.es_destacado DESC, ma.fecha_publicacion DESC
      LIMIT $${p + 1} OFFSET $${p + 2}
    `, [...params, matricula.matricula_id, limit, offset]);

    return {
      materiales: result.rows,
      paginacion: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / limit) }
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 5. DETALLE DE UN MATERIAL
  // Valida que pertenezca a una materia del estudiante
  // ─────────────────────────────────────────────────────────────
  static async getMaterialDetalle(usuario_id, material_id) {
    const matricula = await EstudianteDashboard._getMatriculaActiva(usuario_id);
    if (!matricula) return null;

    const result = await pool.query(`
      SELECT
        ma.id,
        ma.codigo_material,
        ma.titulo,
        ma.descripcion,
        ma.es_enlace_externo,
        ma.url_archivo,
        ma.url_externa,
        ma.nombre_archivo,
        ma.tamano_bytes,
        ma.tipo_mime,
        ma.requiere_descarga,
        ma.es_destacado,
        ma.contador_vistas,
        ma.contador_descargas,
        ma.fecha_publicacion,
        ma.version,
        tm.nombre               AS tipo_material_nombre,
        tm.icono                AS tipo_material_icono,
        tm.color                AS tipo_material_color,
        mat.nombre              AS materia_nombre,
        mat.color               AS materia_color,
        d.nombres               AS docente_nombres,
        d.apellidos             AS docente_apellidos,
        EXISTS(
          SELECT 1 FROM favorito_material fm
          WHERE fm.material_academico_id = ma.id AND fm.matricula_id = $2
        )                       AS es_favorito,
        EXISTS(
          SELECT 1 FROM acceso_material am
          WHERE am.material_academico_id = ma.id AND am.matricula_id = $2
        )                       AS ya_accedido
      FROM material_academico ma
      INNER JOIN tipo_material tm           ON ma.tipo_material_id = tm.id
      INNER JOIN asignacion_docente ad      ON ma.asignacion_docente_id = ad.id
      INNER JOIN docente d                  ON ad.docente_id = d.id
      INNER JOIN grado_materia gm           ON ad.grado_materia_id = gm.id
      INNER JOIN materia mat                ON gm.materia_id = mat.id
      WHERE ma.id                          = $1
        AND ad.paralelo_id                 = $3
        AND ad.periodo_academico_id        = $4
        AND ad.activo                      = true
        AND ma.visible_para_estudiantes    = true
        AND ma.fecha_publicacion IS NOT NULL
        AND ma.fecha_publicacion <= CURRENT_TIMESTAMP
        AND (ma.fecha_despublicacion IS NULL OR ma.fecha_despublicacion > CURRENT_TIMESTAMP)
        AND ma.activo = true AND ma.deleted_at IS NULL
    `, [material_id, matricula.matricula_id, matricula.paralelo_id, matricula.periodo_academico_id]);

    if (!result.rows[0]) return null;

    // Temas vinculados
    const temas = await pool.query(`
      SELECT mt.es_principal, mt.orden,
             t.id AS tema_id, t.titulo AS tema_titulo, t.numero_tema,
             ut.titulo AS unidad_titulo, ut.numero_unidad
      FROM material_tema mt
      INNER JOIN tema t             ON mt.tema_id = t.id
      INNER JOIN unidad_tematica ut ON t.unidad_tematica_id = ut.id
      WHERE mt.material_academico_id = $1
      ORDER BY ut.numero_unidad, t.numero_tema
    `, [material_id]);

    return {
      ...result.rows[0],
      temas: temas.rows,
      matricula_id: matricula.matricula_id  // necesario para registrar acceso
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 6. BÚSQUEDA FULL-TEXT — solo en las materias del estudiante
  // ─────────────────────────────────────────────────────────────
  static async buscarMateriales(usuario_id, query, { tipo_material_id } = {}) {
    const matricula = await EstudianteDashboard._getMatriculaActiva(usuario_id);
    if (!matricula) return [];

    const asignaciones = await pool.query(`
      SELECT id FROM asignacion_docente
      WHERE paralelo_id = $1 AND periodo_academico_id = $2 AND activo = true
    `, [matricula.paralelo_id, matricula.periodo_academico_id]);
    if (!asignaciones.rows.length) return [];

    const asignacionIds = asignaciones.rows.map(r => r.id);
    let params = [query, asignacionIds, matricula.matricula_id];
    let extraWhere = '';
    let p = 4;

    if (tipo_material_id) {
      extraWhere = `AND ma.tipo_material_id = $${p++}`;
      params.push(tipo_material_id);
    }

    const result = await pool.query(`
      SELECT
        ma.id,
        ma.codigo_material,
        ma.titulo,
        ma.descripcion,
        ma.es_enlace_externo,
        ma.url_archivo,
        ma.url_externa,
        ma.nombre_archivo,
        ma.tamano_bytes,
        ma.es_destacado,
        ma.fecha_publicacion,
        tm.nombre               AS tipo_material_nombre,
        tm.icono                AS tipo_material_icono,
        tm.color                AS tipo_material_color,
        mat.nombre              AS materia_nombre,
        mat.color               AS materia_color,
        EXISTS(
          SELECT 1 FROM favorito_material fm
          WHERE fm.material_academico_id = ma.id AND fm.matricula_id = $3
        )                       AS es_favorito,
        ts_rank(
          to_tsvector('spanish',
            COALESCE(ma.titulo,'') || ' ' ||
            COALESCE(ma.descripcion,'') || ' ' ||
            COALESCE(ma.nombre_archivo,'')
          ),
          plainto_tsquery('spanish', $1)
        )                       AS relevancia
      FROM material_academico ma
      INNER JOIN tipo_material tm          ON ma.tipo_material_id = tm.id
      INNER JOIN asignacion_docente ad     ON ma.asignacion_docente_id = ad.id
      INNER JOIN grado_materia gm          ON ad.grado_materia_id = gm.id
      INNER JOIN materia mat               ON gm.materia_id = mat.id
      WHERE
        to_tsvector('spanish',
          COALESCE(ma.titulo,'') || ' ' ||
          COALESCE(ma.descripcion,'') || ' ' ||
          COALESCE(ma.nombre_archivo,'')
        ) @@ plainto_tsquery('spanish', $1)
        AND ma.asignacion_docente_id = ANY($2::int[])
        AND ma.visible_para_estudiantes = true
        AND ma.fecha_publicacion IS NOT NULL
        AND ma.fecha_publicacion <= CURRENT_TIMESTAMP
        AND (ma.fecha_despublicacion IS NULL OR ma.fecha_despublicacion > CURRENT_TIMESTAMP)
        AND ma.activo = true AND ma.deleted_at IS NULL
        ${extraWhere}
      ORDER BY relevancia DESC, ma.fecha_publicacion DESC
    `, params);

    return result.rows;
  }

  // ─────────────────────────────────────────────────────────────
  // 7. NOTAS — boletín + desglose por materia
  // ─────────────────────────────────────────────────────────────

  /**
   * Boletín completo de un período (llama al stored procedure ya existente).
   */
  static async getBoletin(usuario_id, periodo_evaluacion_id) {
    const matricula = await EstudianteDashboard._getMatriculaActiva(usuario_id);
    if (!matricula) return [];

    const result = await pool.query(
      `SELECT * FROM boletin_notas($1, $2)`,
      [matricula.matricula_id, periodo_evaluacion_id]
    );
    return result.rows;
  }

  /**
   * Notas detalladas de una materia: Ser/Saber/Hacer + lista de evaluaciones.
   * Solo muestra evaluaciones con visible_para_padres = true.
   */
  static async getNotasPorMateria(usuario_id, grado_materia_id, periodo_evaluacion_id) {
    const matricula = await EstudianteDashboard._getMatriculaActiva(usuario_id);
    if (!matricula) return null;

    // Verificar que la materia es del grado del estudiante
    const check = await pool.query(`
      SELECT id FROM grado_materia WHERE id = $1 AND grado_id = $2 LIMIT 1
    `, [grado_materia_id, matricula.grado_id]);
    if (!check.rows[0]) return null;

    // Notas por dimensión
    const dimensiones = await pool.query(`
      SELECT
        nd.*,
        de.nombre                AS dimension_nombre,
        de.codigo                AS dimension_codigo,
        de.porcentaje_ponderacion,
        de.color                 AS dimension_color
      FROM nota_dimension nd
      INNER JOIN dimension_evaluacion de ON nd.dimension_evaluacion_id = de.id
      WHERE nd.matricula_id          = $1
        AND nd.grado_materia_id      = $2
        AND nd.periodo_evaluacion_id = $3
      ORDER BY de.orden
    `, [matricula.matricula_id, grado_materia_id, periodo_evaluacion_id]);

    // Evaluaciones con calificaciones (solo visible_para_padres = true)
    const evaluaciones = await pool.query(`
      SELECT
        ev.id,
        ev.nombre                AS evaluacion_nombre,
        ev.tipo,
        ev.fecha,
        ev.puntaje_maximo,
        ev.peso_en_dimension,
        ev.descripcion,
        ev.instrucciones,
        ev.fecha_limite,
        ev.foto_url,
        ev.pdf_url,
        de.nombre                AS dimension_nombre,
        de.codigo                AS dimension_codigo,
        de.color                 AS dimension_color,
        c.puntaje_obtenido,
        c.esta_ausente,
        c.observacion,
        -- Nota normalizada 0-100
        CASE
          WHEN c.puntaje_obtenido IS NOT NULL
          THEN ROUND((c.puntaje_obtenido / ev.puntaje_maximo * 100)::NUMERIC, 2)
          ELSE NULL
        END                      AS nota_sobre_100
      FROM evaluacion ev
      INNER JOIN asignacion_docente ad   ON ev.asignacion_docente_id = ad.id
      INNER JOIN dimension_evaluacion de ON ev.dimension_evaluacion_id = de.id
      LEFT JOIN  calificacion c          ON c.evaluacion_id = ev.id AND c.matricula_id = $1
      WHERE ad.grado_materia_id      = $2
        AND ev.periodo_evaluacion_id = $3
        AND ev.activo                = true
        AND ev.visible_para_padres   = true
        AND ad.paralelo_id           = $4
      ORDER BY de.orden, ev.fecha
    `, [matricula.matricula_id, grado_materia_id, periodo_evaluacion_id, matricula.paralelo_id]);

    // Nota final del período
    const notaFinal = await pool.query(`
      SELECT nota_final, aprobado, estado
      FROM calificacion_periodo
      WHERE matricula_id = $1 AND grado_materia_id = $2 AND periodo_evaluacion_id = $3
    `, [matricula.matricula_id, grado_materia_id, periodo_evaluacion_id]);

    return {
      dimensiones: dimensiones.rows,
      evaluaciones: evaluaciones.rows,
      nota_final:   notaFinal.rows[0] || null
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 8. ASISTENCIA
  // ─────────────────────────────────────────────────────────────

  /**
   * Resumen de asistencia por materia (llama al stored procedure existente).
   */
  static async getAsistenciaResumen(usuario_id, { asignacion_docente_id, fecha_inicio, fecha_fin } = {}) {
    const matricula = await EstudianteDashboard._getMatriculaActiva(usuario_id);
    if (!matricula) return [];

    const result = await pool.query(
      `SELECT * FROM reporte_asistencia_estudiante($1, $2, $3, $4)`,
      [matricula.matricula_id, asignacion_docente_id || null, fecha_inicio || null, fecha_fin || null]
    );
    return result.rows;
  }

  /**
   * Historial diario de asistencia con fechas y estados.
   */
  static async getAsistenciaDetalle(usuario_id, { asignacion_docente_id, fecha_inicio, fecha_fin } = {}) {
    const matricula = await EstudianteDashboard._getMatriculaActiva(usuario_id);
    if (!matricula) return [];

    let where = [`a.matricula_id = $1`];
    let params = [matricula.matricula_id];
    let p = 2;

    if (asignacion_docente_id) { where.push(`a.asignacion_docente_id = $${p++}`); params.push(asignacion_docente_id); }
    if (fecha_inicio)          { where.push(`a.fecha >= $${p++}`);                params.push(fecha_inicio); }
    if (fecha_fin)             { where.push(`a.fecha <= $${p++}`);                params.push(fecha_fin); }

    const result = await pool.query(`
      SELECT
        a.id,
        a.fecha,
        a.estado,
        a.hora_marcacion,
        a.justificacion,
        a.observaciones,
        mat.nombre              AS materia_nombre,
        mat.color               AS materia_color,
        sp.codigo_solicitud     AS permiso_codigo,
        sp.motivo               AS permiso_motivo
      FROM asistencia a
      INNER JOIN asignacion_docente ad ON a.asignacion_docente_id = ad.id
      INNER JOIN grado_materia gm      ON ad.grado_materia_id = gm.id
      INNER JOIN materia mat           ON gm.materia_id = mat.id
      LEFT JOIN  solicitud_permiso sp  ON a.solicitud_permiso_id = sp.id
      WHERE ${where.join(' AND ')}
      ORDER BY a.fecha DESC, mat.nombre
    `, params);

    return result.rows;
  }

  // ─────────────────────────────────────────────────────────────
  // 9. PROGRESO EN MATERIALES DE UNA MATERIA
  // Llama al stored procedure del módulo de materiales
  // ─────────────────────────────────────────────────────────────
  static async getProgreso(usuario_id, grado_materia_id) {
    const matricula = await EstudianteDashboard._getMatriculaActiva(usuario_id);
    if (!matricula) return [];

    const result = await pool.query(
      `SELECT * FROM reporte_progreso_estudiante($1, $2)`,
      [matricula.matricula_id, grado_materia_id]
    );
    return result.rows;
  }
  static async getHorario(usuario_id) {
    const matricula = await EstudianteDashboard._getMatriculaActiva(usuario_id);
    if (!matricula) return null;
 
    // Obtener horario publicado del paralelo en el período activo
    //AND h.estado IN ('publicado', 'borrador')
    const horario = await pool.query(`
      SELECT h.id AS horario_id, h.nombre, h.estado,
             h.publicado_en, h.observaciones
      FROM horario h
      WHERE h.paralelo_id          = $1
        AND h.periodo_academico_id = $2
        AND h.estado               = 'publicado'
        
        AND h.deleted_at           IS NULL
      LIMIT 1
    `, [matricula.paralelo_id, matricula.periodo_academico_id]);
 
    if (!horario.rows[0]) return null; // Horario aún no publicado
 
    const horario_id = horario.rows[0].horario_id;
 
    const celdas = await pool.query(`
      SELECT
        hd.dia_semana,
        hd.aula,
        hd.color                  AS celda_color,
        -- Bloque horario
        bh.numero                 AS bloque_numero,
        bh.nombre                 AS bloque_nombre,
        bh.hora_inicio,
        bh.hora_fin,
        bh.es_recreo,
        -- Materia
        m.id                      AS materia_id,
        m.nombre                  AS materia_nombre,
        m.color                   AS materia_color,
        m.codigo                  AS materia_codigo,
        -- Docente
        d.id                      AS docente_id,
        d.nombres                 AS docente_nombres,
        d.apellidos               AS docente_apellidos,
        d.foto_url                AS docente_foto
      FROM horario_detalle hd
      INNER JOIN bloque_horario bh      ON hd.bloque_horario_id = bh.id
      INNER JOIN grado_materia gm       ON hd.grado_materia_id  = gm.id
      INNER JOIN materia m              ON gm.materia_id         = m.id
      LEFT JOIN  asignacion_docente ad  ON hd.asignacion_docente_id = ad.id
      LEFT JOIN  docente d              ON ad.docente_id         = d.id
      WHERE hd.horario_id = $1
        AND hd.activo     = true
      ORDER BY hd.dia_semana, bh.numero
    `, [horario_id]);
 
    // Estructurar como grilla: { 1: [...celdas lunes], 2: [...celdas martes] ... }
    const DIAS = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado' };
    const grilla = {};
 
    for (const celda of celdas.rows) {
      const dia = celda.dia_semana;
      if (!grilla[dia]) {
        grilla[dia] = {
          dia_numero: dia,
          dia_nombre: DIAS[dia],
          bloques: []
        };
      }
      grilla[dia].bloques.push(celda);
    }
 
    return {
      ...horario.rows[0],
      dias: DIAS,
      grilla: Object.values(grilla),   // Array ordenado por día
      total_celdas: celdas.rows.length
    };
  }
 
  // ─────────────────────────────────────────────────────────────
  // 11. TAREAS / EVALUACIONES DEL ESTUDIANTE
  // Versión para estudiante: valida por estudiante.usuario_id
  // (el TareasController del docente valida por padre_familia)
  // ─────────────────────────────────────────────────────────────
  static async getTareas(usuario_id, { periodo_evaluacion_id, estado } = {}) {
    const matricula = await EstudianteDashboard._getMatriculaActiva(usuario_id);
    if (!matricula) return { tareas: [], resumen: {} };
 
    let filtros = '';
    const params = [matricula.matricula_id];
    let p = 2;
 
    if (periodo_evaluacion_id) {
      filtros += ` AND ev.periodo_evaluacion_id = $${p++}`;
      params.push(parseInt(periodo_evaluacion_id));
    }
 
    // Filtro de estado se aplica en la subconsulta exterior
    const estadoFiltro = estado ? `WHERE estado_calculado = $${p++}` : '';
    if (estado) params.push(estado);
 
    const query = `
      SELECT *
      FROM (
        SELECT
          ev.id                         AS evaluacion_id,
          ev.nombre                     AS evaluacion_nombre,
          ev.tipo,
          ev.descripcion,
          ev.instrucciones,
          ev.foto_url,
          ev.pdf_url,
          ev.fecha                      AS fecha_evaluacion,
          ev.fecha_limite,
          ev.puntaje_maximo,
          ev.peso_en_dimension,
          ev.publicado_en,
 
          -- Dimensión
          de.id                         AS dimension_id,
          de.nombre                     AS dimension_nombre,
          de.codigo                     AS dimension_codigo,
          de.color                      AS dimension_color,
          de.porcentaje_ponderacion,
 
          -- Materia
          mat.nombre                    AS materia_nombre,
          mat.codigo                    AS materia_codigo,
          mat.color                     AS materia_color,
 
          -- Período de evaluación (trimestre)
          pe.nombre                     AS periodo_nombre,
          pe.id                         AS periodo_evaluacion_id,
          pe.orden                      AS periodo_orden,
 
          -- Calificación del estudiante (puede ser NULL si aún no fue registrada)
          c.id                          AS calificacion_id,
          c.puntaje_obtenido,
          c.esta_ausente,
          c.observacion                 AS observacion_docente,
          c.fecha_registro,
 
          -- Nota normalizada 0–100
          CASE
            WHEN c.puntaje_obtenido IS NOT NULL AND ev.puntaje_maximo > 0
            THEN ROUND((c.puntaje_obtenido / ev.puntaje_maximo * 100)::NUMERIC, 1)
            ELSE NULL
          END                           AS nota_sobre_100,
 
          -- Estado calculado
          CASE
            WHEN c.esta_ausente = true                                             THEN 'ausente'
            WHEN c.puntaje_obtenido IS NOT NULL                                    THEN 'entregado'
            WHEN ev.fecha_limite IS NOT NULL AND ev.fecha_limite < NOW()           THEN 'atrasado'
            ELSE 'pendiente'
          END                           AS estado_calculado,
 
          -- Días restantes (negativo = ya venció)
          CASE
            WHEN ev.fecha_limite IS NOT NULL
            THEN EXTRACT(DAY FROM ev.fecha_limite - NOW())::INTEGER
            ELSE NULL
          END                           AS dias_restantes
 
        FROM matricula m
        INNER JOIN asignacion_docente ad
          ON  ad.paralelo_id          = m.paralelo_id
          AND ad.periodo_academico_id = m.periodo_academico_id
          AND ad.activo               = true
          AND ad.deleted_at           IS NULL
        INNER JOIN evaluacion ev
          ON  ev.asignacion_docente_id = ad.id
          AND ev.activo                = true
          AND ev.visible_para_padres   = true      -- reutilizamos el flag existente
        INNER JOIN dimension_evaluacion de ON ev.dimension_evaluacion_id = de.id
        INNER JOIN periodo_evaluacion pe   ON ev.periodo_evaluacion_id   = pe.id
        INNER JOIN grado_materia gm        ON ad.grado_materia_id        = gm.id
        INNER JOIN materia mat             ON gm.materia_id              = mat.id
        LEFT JOIN calificacion c
          ON  c.evaluacion_id = ev.id
          AND c.matricula_id  = m.id
        WHERE m.id = $1
          AND m.deleted_at IS NULL
          ${filtros}
      ) sub
      ${estadoFiltro}
      ORDER BY
        CASE WHEN estado_calculado = 'atrasado'  THEN 0 ELSE 1 END,
        CASE WHEN estado_calculado = 'pendiente' THEN 0 ELSE 1 END,
        dias_restantes NULLS LAST,
        fecha_registro DESC NULLS LAST,
        evaluacion_id DESC
    `;
 
    const result = await pool.query(query, params);
    const tareas = result.rows;
 
    return {
      tareas,
      resumen: {
        total:      tareas.length,
        entregados: tareas.filter(r => r.estado_calculado === 'entregado').length,
        pendientes: tareas.filter(r => r.estado_calculado === 'pendiente').length,
        atrasados:  tareas.filter(r => r.estado_calculado === 'atrasado').length,
        ausentes:   tareas.filter(r => r.estado_calculado === 'ausente').length,
      }
    };
  }
}

export default EstudianteDashboard;