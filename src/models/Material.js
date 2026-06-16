// models/Material.js
import { pool } from '../db/pool.js';

// =============================================
// UNIDAD TEMÁTICA
// =============================================
class UnidadTematica {

  static async findAll(filters = {}) {
    const {
      grado_materia_id, periodo_evaluacion_id,
      activo, page = 1, limit = 50
    } = filters;
    const offset = (page - 1) * limit;

    let where = [];
    let params = [];
    let p = 1;

    if (grado_materia_id) { where.push(`u.grado_materia_id = $${p++}`); params.push(grado_materia_id); }
    if (periodo_evaluacion_id) { where.push(`u.periodo_evaluacion_id = $${p++}`); params.push(periodo_evaluacion_id); }
    if (activo !== undefined) { where.push(`u.activo = $${p++}`); params.push(activo); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM unidad_tematica u ${whereClause}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(`
      SELECT
        u.*,
        mat.nombre          AS materia_nombre,
        mat.codigo          AS materia_codigo,
        g.nombre            AS grado_nombre,
        pe.nombre           AS periodo_evaluacion_nombre,
        COUNT(DISTINCT t.id) AS total_temas
      FROM unidad_tematica u
      INNER JOIN grado_materia gm ON u.grado_materia_id = gm.id
      INNER JOIN materia mat       ON gm.materia_id = mat.id
      INNER JOIN grado g           ON gm.grado_id = g.id
      LEFT JOIN  periodo_evaluacion pe ON u.periodo_evaluacion_id = pe.id
      LEFT JOIN  tema t            ON u.id = t.unidad_tematica_id AND t.activo = true
      ${whereClause}
      GROUP BY u.id, mat.nombre, mat.codigo, g.nombre, pe.nombre
      ORDER BY u.numero_unidad
      LIMIT $${p} OFFSET $${p + 1}
    `, [...params, limit, offset]);

    return {
      unidades: result.rows,
      paginacion: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / limit) }
    };
  }

  static async findById(id) {
    const result = await pool.query(`
      SELECT
        u.*,
        mat.nombre AS materia_nombre,
        mat.codigo AS materia_codigo,
        g.nombre   AS grado_nombre,
        pe.nombre  AS periodo_evaluacion_nombre
      FROM unidad_tematica u
      INNER JOIN grado_materia gm  ON u.grado_materia_id = gm.id
      INNER JOIN materia mat       ON gm.materia_id = mat.id
      INNER JOIN grado g           ON gm.grado_id = g.id
      LEFT JOIN  periodo_evaluacion pe ON u.periodo_evaluacion_id = pe.id
      WHERE u.id = $1
    `, [id]);
    return result.rows[0];
  }

  static async create(data) {
    const {
      grado_materia_id, periodo_evaluacion_id, numero_unidad,
      titulo, descripcion, objetivos, orden,
      fecha_inicio_prevista, fecha_fin_prevista
    } = data;

    const result = await pool.query(`
      INSERT INTO unidad_tematica (
        grado_materia_id, periodo_evaluacion_id, numero_unidad,
        titulo, descripcion, objetivos, orden,
        fecha_inicio_prevista, fecha_fin_prevista
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      grado_materia_id, periodo_evaluacion_id || null, numero_unidad,
      titulo, descripcion || null, objetivos || null, orden || 1,
      fecha_inicio_prevista || null, fecha_fin_prevista || null
    ]);
    return result.rows[0];
  }

  static async update(id, data) {
    const {
      periodo_evaluacion_id, numero_unidad, titulo,
      descripcion, objetivos, orden,
      fecha_inicio_prevista, fecha_fin_prevista, activo
    } = data;

    const result = await pool.query(`
      UPDATE unidad_tematica SET
        periodo_evaluacion_id = COALESCE($1, periodo_evaluacion_id),
        numero_unidad         = COALESCE($2, numero_unidad),
        titulo                = COALESCE($3, titulo),
        descripcion           = $4,
        objetivos             = $5,
        orden                 = COALESCE($6, orden),
        fecha_inicio_prevista = $7,
        fecha_fin_prevista    = $8,
        activo                = COALESCE($9, activo),
        updated_at            = CURRENT_TIMESTAMP
      WHERE id = $10
      RETURNING *
    `, [
      periodo_evaluacion_id || null, numero_unidad || null, titulo || null,
      descripcion || null, objetivos || null, orden || null,
      fecha_inicio_prevista || null, fecha_fin_prevista || null,
      activo !== undefined ? activo : null,
      id
    ]);
    return result.rows[0];
  }

  static async softDelete(id) {
    const result = await pool.query(`
      UPDATE unidad_tematica SET activo = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING *
    `, [id]);
    return result.rows[0];
  }

  // Retorna el temario completo (unidades + temas) usando el stored procedure
  static async getTemario(grado_materia_id, periodo_evaluacion_id = null) {
    const result = await pool.query(
      `SELECT * FROM obtener_temario_materia($1, $2)`,
      [grado_materia_id, periodo_evaluacion_id]
    );
    return result.rows;
  }
}

// =============================================
// TEMA
// =============================================
class Tema {

  static async findAll(filters = {}) {
    const { unidad_tematica_id, activo, nivel_dificultad, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;

    let where = [];
    let params = [];
    let p = 1;

    if (unidad_tematica_id) { where.push(`t.unidad_tematica_id = $${p++}`); params.push(unidad_tematica_id); }
    if (activo !== undefined) { where.push(`t.activo = $${p++}`); params.push(activo); }
    if (nivel_dificultad) { where.push(`t.nivel_dificultad = $${p++}`); params.push(nivel_dificultad); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM tema t ${whereClause}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(`
      SELECT
        t.*,
        u.titulo            AS unidad_titulo,
        u.numero_unidad,
        COUNT(DISTINCT mt.material_academico_id) AS total_materiales
      FROM tema t
      INNER JOIN unidad_tematica u ON t.unidad_tematica_id = u.id
      LEFT JOIN  material_tema mt  ON t.id = mt.tema_id
      ${whereClause}
      GROUP BY t.id, u.titulo, u.numero_unidad
      ORDER BY t.orden, t.numero_tema
      LIMIT $${p} OFFSET $${p + 1}
    `, [...params, limit, offset]);

    return {
      temas: result.rows,
      paginacion: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / limit) }
    };
  }

  static async findById(id) {
    const result = await pool.query(`
      SELECT
        t.*,
        u.titulo       AS unidad_titulo,
        u.numero_unidad,
        COUNT(DISTINCT mt.material_academico_id) AS total_materiales
      FROM tema t
      INNER JOIN unidad_tematica u ON t.unidad_tematica_id = u.id
      LEFT JOIN  material_tema mt  ON t.id = mt.tema_id
      WHERE t.id = $1
      GROUP BY t.id, u.titulo, u.numero_unidad
    `, [id]);
    return result.rows[0];
  }

  static async create(data) {
    const {
      unidad_tematica_id, numero_tema, titulo, descripcion,
      contenido, palabras_clave, duracion_estimada,
      es_obligatorio, orden, nivel_dificultad
    } = data;

    const result = await pool.query(`
      INSERT INTO tema (
        unidad_tematica_id, numero_tema, titulo, descripcion,
        contenido, palabras_clave, duracion_estimada,
        es_obligatorio, orden, nivel_dificultad
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      unidad_tematica_id, numero_tema, titulo,
      descripcion || null, contenido || null,
      palabras_clave ? `{${palabras_clave.map(k => `"${k}"`).join(',')}}` : null,
      duracion_estimada || null, es_obligatorio ?? true,
      orden || 1, nivel_dificultad || null
    ]);
    return result.rows[0];
  }

  static async update(id, data) {
    const {
      numero_tema, titulo, descripcion, contenido,
      palabras_clave, duracion_estimada, es_obligatorio,
      orden, nivel_dificultad, activo
    } = data;

    const result = await pool.query(`
      UPDATE tema SET
        numero_tema       = COALESCE($1, numero_tema),
        titulo            = COALESCE($2, titulo),
        descripcion       = $3,
        contenido         = $4,
        palabras_clave    = COALESCE($5, palabras_clave),
        duracion_estimada = $6,
        es_obligatorio    = COALESCE($7, es_obligatorio),
        orden             = COALESCE($8, orden),
        nivel_dificultad  = $9,
        activo            = COALESCE($10, activo),
        updated_at        = CURRENT_TIMESTAMP
      WHERE id = $11
      RETURNING *
    `, [
      numero_tema || null, titulo || null,
      descripcion || null, contenido || null,
      palabras_clave ? `{${palabras_clave.map(k => `"${k}"`).join(',')}}` : null,
      duracion_estimada || null,
      es_obligatorio !== undefined ? es_obligatorio : null,
      orden || null, nivel_dificultad || null,
      activo !== undefined ? activo : null,
      id
    ]);
    return result.rows[0];
  }

  static async softDelete(id) {
    const result = await pool.query(`
      UPDATE tema SET activo = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING *
    `, [id]);
    return result.rows[0];
  }
}

// =============================================
// TIPO MATERIAL (solo lectura, son datos semilla)
// =============================================
class TipoMaterial {
  static async findAll() {
    const result = await pool.query(`
      SELECT * FROM tipo_material WHERE activo = true ORDER BY orden
    `);
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(`SELECT * FROM tipo_material WHERE id = $1`, [id]);
    return result.rows[0];
  }
}

// =============================================
// MATERIAL ACADÉMICO
// =============================================
class MaterialAcademico {

  static async findAll(filters = {}) {
    const {
      page = 1, limit = 10,
      asignacion_docente_id, tipo_material_id,
      visible_para_estudiantes, es_destacado,
      solo_publicados, tema_id
    } = filters;
    const offset = (page - 1) * limit;

    let where = [`m.activo = true`, `m.deleted_at IS NULL`];
    let params = [];
    let p = 1;

    if (asignacion_docente_id) { where.push(`m.asignacion_docente_id = $${p++}`); params.push(asignacion_docente_id); }
    if (tipo_material_id) { where.push(`m.tipo_material_id = $${p++}`); params.push(tipo_material_id); }
    if (visible_para_estudiantes !== undefined) { where.push(`m.visible_para_estudiantes = $${p++}`); params.push(visible_para_estudiantes); }
    if (es_destacado !== undefined) { where.push(`m.es_destacado = $${p++}`); params.push(es_destacado); }
    if (solo_publicados) {
      where.push(`m.fecha_publicacion IS NOT NULL`);
      where.push(`m.fecha_publicacion <= CURRENT_TIMESTAMP`);
      where.push(`(m.fecha_despublicacion IS NULL OR m.fecha_despublicacion > CURRENT_TIMESTAMP)`);
    }
    if (tema_id) {
      where.push(`EXISTS (SELECT 1 FROM material_tema mt WHERE mt.material_academico_id = m.id AND mt.tema_id = $${p++})`);
      params.push(tema_id);
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM material_academico m ${whereClause}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(`
      SELECT
        m.*,
        tm.nombre   AS tipo_material_nombre,
        tm.icono    AS tipo_material_icono,
        tm.color    AS tipo_material_color,
        mat.nombre  AS materia_nombre,
        mat.codigo  AS materia_codigo,
        d.nombres   AS docente_nombres,
        d.apellidos AS docente_apellidos,
        COUNT(DISTINCT cm.id) AS total_comentarios,
        COUNT(DISTINCT fm.id) AS total_favoritos
      FROM material_academico m
      INNER JOIN tipo_material tm      ON m.tipo_material_id = tm.id
      INNER JOIN asignacion_docente ad ON m.asignacion_docente_id = ad.id
      INNER JOIN grado_materia gm      ON ad.grado_materia_id = gm.id
      INNER JOIN materia mat           ON gm.materia_id = mat.id
      INNER JOIN docente d             ON ad.docente_id = d.id
      LEFT JOIN  comentario_material cm ON m.id = cm.material_academico_id AND cm.activo = true
      LEFT JOIN  favorito_material fm   ON m.id = fm.material_academico_id
      ${whereClause}
      GROUP BY m.id, tm.nombre, tm.icono, tm.color, mat.nombre, mat.codigo, d.nombres, d.apellidos
      ORDER BY m.created_at DESC
      LIMIT $${p} OFFSET $${p + 1}
    `, [...params, limit, offset]);

    return {
      materiales: result.rows,
      paginacion: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / limit) }
    };
  }

  static async findById(id) {
    const result = await pool.query(`
      SELECT
        m.*,
        tm.nombre   AS tipo_material_nombre,
        tm.icono    AS tipo_material_icono,
        tm.color    AS tipo_material_color,
        mat.nombre  AS materia_nombre,
        mat.codigo  AS materia_codigo,
        g.nombre    AS grado_nombre,
        d.nombres   AS docente_nombres,
        d.apellidos AS docente_apellidos,
        u.username  AS subido_por_username,
        COUNT(DISTINCT cm.id) AS total_comentarios,
        COUNT(DISTINCT fm.id) AS total_favoritos
      FROM material_academico m
      INNER JOIN tipo_material tm      ON m.tipo_material_id = tm.id
      INNER JOIN asignacion_docente ad ON m.asignacion_docente_id = ad.id
      INNER JOIN grado_materia gm      ON ad.grado_materia_id = gm.id
      INNER JOIN materia mat           ON gm.materia_id = mat.id
      INNER JOIN grado g               ON gm.grado_id = g.id
      INNER JOIN docente d             ON ad.docente_id = d.id
      INNER JOIN usuarios u            ON m.subido_por = u.id
      LEFT JOIN  comentario_material cm ON m.id = cm.material_academico_id AND cm.activo = true
      LEFT JOIN  favorito_material fm   ON m.id = fm.material_academico_id
      WHERE m.id = $1 AND m.activo = true AND m.deleted_at IS NULL
      GROUP BY m.id, tm.nombre, tm.icono, tm.color, mat.nombre, mat.codigo,
               g.nombre, d.nombres, d.apellidos, u.username
    `, [id]);
    return result.rows[0];
  }

  static async create(data) {
    const {
      asignacion_docente_id, tipo_material_id, titulo, descripcion,
      es_enlace_externo, url_archivo, url_externa, nombre_archivo,
      tamano_bytes, tipo_mime, subido_por,
      visible_para_estudiantes, fecha_publicacion, fecha_despublicacion,
      requiere_descarga, es_destacado
    } = data;

    const result = await pool.query(`
      INSERT INTO material_academico (
        asignacion_docente_id, tipo_material_id, titulo, descripcion,
        es_enlace_externo, url_archivo, url_externa, nombre_archivo,
        tamano_bytes, tipo_mime, subido_por,
        visible_para_estudiantes, fecha_publicacion, fecha_despublicacion,
        requiere_descarga, es_destacado
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [
      asignacion_docente_id, tipo_material_id, titulo, descripcion || null,
      es_enlace_externo ?? false, url_archivo || null, url_externa || null,
      nombre_archivo || null, tamano_bytes || null, tipo_mime || null,
      subido_por,
      visible_para_estudiantes ?? true,
      fecha_publicacion || null, fecha_despublicacion || null,
      requiere_descarga ?? false, es_destacado ?? false
    ]);
    return result.rows[0];
  }

  static async update(id, data) {
    const {
      tipo_material_id, titulo, descripcion,
      url_archivo, url_externa, nombre_archivo, tamano_bytes, tipo_mime,
      visible_para_estudiantes, fecha_publicacion, fecha_despublicacion,
      requiere_descarga, es_destacado
    } = data;

    const result = await pool.query(`
      UPDATE material_academico SET
        tipo_material_id         = COALESCE($1,  tipo_material_id),
        titulo                   = COALESCE($2,  titulo),
        descripcion              = $3,
        url_archivo              = COALESCE($4,  url_archivo),
        url_externa              = $5,
        nombre_archivo           = COALESCE($6,  nombre_archivo),
        tamano_bytes             = COALESCE($7,  tamano_bytes),
        tipo_mime                = COALESCE($8,  tipo_mime),
        visible_para_estudiantes = COALESCE($9,  visible_para_estudiantes),
        fecha_publicacion        = $10,
        fecha_despublicacion     = $11,
        requiere_descarga        = COALESCE($12, requiere_descarga),
        es_destacado             = COALESCE($13, es_destacado),
        updated_at               = CURRENT_TIMESTAMP
      WHERE id = $14 AND activo = true AND deleted_at IS NULL
      RETURNING *
    `, [
      tipo_material_id || null, titulo || null, descripcion || null,
      url_archivo || null, url_externa || null,
      nombre_archivo || null, tamano_bytes || null, tipo_mime || null,
      visible_para_estudiantes !== undefined ? visible_para_estudiantes : null,
      fecha_publicacion || null, fecha_despublicacion || null,
      requiere_descarga !== undefined ? requiere_descarga : null,
      es_destacado !== undefined ? es_destacado : null,
      id
    ]);
    return result.rows[0];
  }

  // Soft delete
  static async softDelete(id) {
    const result = await pool.query(`
      UPDATE material_academico
      SET activo = false, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING *
    `, [id]);
    return result.rows[0];
  }

  // Publicar / despublicar
  static async publicar(id, fecha_publicacion, fecha_despublicacion = null) {
    const result = await pool.query(`
      UPDATE material_academico SET
        fecha_publicacion    = $1,
        fecha_despublicacion = $2,
        updated_at           = CURRENT_TIMESTAMP
      WHERE id = $3 AND activo = true
      RETURNING *
    `, [fecha_publicacion, fecha_despublicacion, id]);
    return result.rows[0];
  }

  // Buscar full-text
  static async buscar(query, asignacion_docente_id = null, tipo_material_id = null, solo_visibles = true) {
    const result = await pool.query(
      `SELECT * FROM buscar_materiales($1, $2, $3, $4)`,
      [query, asignacion_docente_id, tipo_material_id, solo_visibles]
    );
    return result.rows;
  }

  // Estadísticas de un material
  static async getEstadisticas(material_id, fecha_inicio = null, fecha_fin = null) {
    const result = await pool.query(
      `SELECT * FROM estadisticas_material($1, $2, $3)`,
      [material_id, fecha_inicio, fecha_fin]
    );
    return result.rows[0];
  }

  // Materiales destacados
  static async getDestacados(asignacion_docente_id, limite = 5) {
    const result = await pool.query(
      `SELECT * FROM materiales_destacados_materia($1, $2)`,
      [asignacion_docente_id, limite]
    );
    return result.rows;
  }

  // Vincular / desvincular temas
  static async vincularTema(material_academico_id, tema_id, es_principal = false, orden = 1) {
    const result = await pool.query(`
      INSERT INTO material_tema (material_academico_id, tema_id, es_principal, orden)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (material_academico_id, tema_id) DO UPDATE SET
        es_principal = EXCLUDED.es_principal,
        orden        = EXCLUDED.orden
      RETURNING *
    `, [material_academico_id, tema_id, es_principal, orden]);
    return result.rows[0];
  }

  static async desvincularTema(material_academico_id, tema_id) {
    const result = await pool.query(`
      DELETE FROM material_tema
      WHERE material_academico_id = $1 AND tema_id = $2
      RETURNING *
    `, [material_academico_id, tema_id]);
    return result.rows[0];
  }

  static async getTemas(material_academico_id) {
    const result = await pool.query(`
      SELECT
        mt.*,
        t.titulo          AS tema_titulo,
        t.numero_tema,
        u.titulo          AS unidad_titulo,
        u.numero_unidad
      FROM material_tema mt
      INNER JOIN tema t             ON mt.tema_id = t.id
      INNER JOIN unidad_tematica u  ON t.unidad_tematica_id = u.id
      WHERE mt.material_academico_id = $1
      ORDER BY u.numero_unidad, t.numero_tema
    `, [material_academico_id]);
    return result.rows;
  }
}

// =============================================
// ACCESO MATERIAL (log)
// =============================================
class AccesoMaterial {

  static async registrar(data) {
    const {
      material_academico_id, matricula_id, usuario_id,
      tipo_accion, ip_address, user_agent,
      dispositivo, duracion_segundos, completado
    } = data;

    const result = await pool.query(`
      INSERT INTO acceso_material (
        material_academico_id, matricula_id, usuario_id,
        tipo_accion, ip_address, user_agent,
        dispositivo, duracion_segundos, completado
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      material_academico_id, matricula_id || null, usuario_id,
      tipo_accion, ip_address || null, user_agent || null,
      dispositivo || 'web', duracion_segundos || null, completado ?? false
    ]);
    return result.rows[0];
  }

  static async findByMaterial(material_academico_id, limit = 50) {
    const result = await pool.query(`
      SELECT
        am.*,
        e.nombres   AS estudiante_nombres,
        e.apellidos AS estudiante_apellidos
      FROM acceso_material am
      LEFT JOIN matricula m   ON am.matricula_id = m.id
      LEFT JOIN estudiante e  ON m.estudiante_id = e.id
      WHERE am.material_academico_id = $1
      ORDER BY am.created_at DESC
      LIMIT $2
    `, [material_academico_id, limit]);
    return result.rows;
  }
}

// =============================================
// COMENTARIO MATERIAL
// =============================================
class ComentarioMaterial {

  static async findByMaterial(material_academico_id, solo_dudas = false) {
    let where = `WHERE cm.material_academico_id = $1 AND cm.activo = true AND cm.comentario_padre_id IS NULL`;
    if (solo_dudas) where += ` AND cm.es_duda = true`;

    const result = await pool.query(`
      SELECT
        cm.*,
        u.username         AS autor_username,
        COALESCE(e.nombres, d.nombres) AS autor_nombres,
        COALESCE(e.apellidos, d.apellidos) AS autor_apellidos,
        COUNT(r.id)        AS total_respuestas
      FROM comentario_material cm
      INNER JOIN usuarios u    ON cm.usuario_id = u.id
      LEFT JOIN  estudiante e  ON e.usuario_id = u.id
      LEFT JOIN  docente d     ON d.usuario_id = u.id
      LEFT JOIN  comentario_material r ON r.comentario_padre_id = cm.id AND r.activo = true
      ${where}
      GROUP BY cm.id, u.username, e.nombres, e.apellidos, d.nombres, d.apellidos
      ORDER BY cm.created_at DESC
    `, [material_academico_id]);

    return result.rows;
  }

  static async getRespuestas(comentario_padre_id) {
    const result = await pool.query(`
      SELECT
        cm.*,
        u.username         AS autor_username,
        COALESCE(e.nombres, d.nombres) AS autor_nombres,
        COALESCE(e.apellidos, d.apellidos) AS autor_apellidos
      FROM comentario_material cm
      INNER JOIN usuarios u    ON cm.usuario_id = u.id
      LEFT JOIN  estudiante e  ON e.usuario_id = u.id
      LEFT JOIN  docente d     ON d.usuario_id = u.id
      WHERE cm.comentario_padre_id = $1 AND cm.activo = true
      ORDER BY cm.created_at ASC
    `, [comentario_padre_id]);
    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(`
      SELECT * FROM comentario_material WHERE id = $1
    `, [id]);
    return result.rows[0];
  }

  static async create(data) {
    const { material_academico_id, usuario_id, comentario_padre_id, contenido, es_duda } = data;

    const result = await pool.query(`
      INSERT INTO comentario_material (material_academico_id, usuario_id, comentario_padre_id, contenido, es_duda)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [material_academico_id, usuario_id, comentario_padre_id || null, contenido, es_duda ?? false]);
    return result.rows[0];
  }

  static async update(id, usuario_id, contenido) {
    const result = await pool.query(`
      UPDATE comentario_material SET
        contenido    = $1,
        editado      = true,
        fecha_edicion = CURRENT_TIMESTAMP,
        updated_at   = CURRENT_TIMESTAMP
      WHERE id = $2 AND usuario_id = $3 AND activo = true
      RETURNING *
    `, [contenido, id, usuario_id]);
    return result.rows[0];
  }

  static async marcarResuelto(id, resuelto_por) {
    const result = await pool.query(`
      UPDATE comentario_material SET
        es_resuelto     = true,
        resuelto_por    = $1,
        fecha_resolucion = CURRENT_TIMESTAMP,
        updated_at      = CURRENT_TIMESTAMP
      WHERE id = $2 AND es_duda = true
      RETURNING *
    `, [resuelto_por, id]);
    return result.rows[0];
  }

  static async softDelete(id, usuario_id) {
    const result = await pool.query(`
      UPDATE comentario_material SET
        activo     = false,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND usuario_id = $2
      RETURNING *
    `, [id, usuario_id]);
    return result.rows[0];
  }
}

// =============================================
// FAVORITO MATERIAL
// =============================================
class FavoritoMaterial {

  static async findByMatricula(matricula_id) {
    const result = await pool.query(`
      SELECT
        fm.*,
        m.titulo            AS material_titulo,
        m.descripcion       AS material_descripcion,
        m.url_archivo,
        m.url_externa,
        m.es_enlace_externo,
        tm.nombre           AS tipo_material_nombre,
        tm.icono            AS tipo_material_icono,
        tm.color            AS tipo_material_color
      FROM favorito_material fm
      INNER JOIN material_academico m ON fm.material_academico_id = m.id
      INNER JOIN tipo_material tm     ON m.tipo_material_id = tm.id
      WHERE fm.matricula_id = $1
        AND m.activo = true AND m.deleted_at IS NULL
      ORDER BY fm.created_at DESC
    `, [matricula_id]);
    return result.rows;
  }

  static async toggle(material_academico_id, matricula_id, notas_personales = null) {
    // Verifica si ya existe
    const existe = await pool.query(`
      SELECT id FROM favorito_material
      WHERE material_academico_id = $1 AND matricula_id = $2
    `, [material_academico_id, matricula_id]);

    if (existe.rows[0]) {
      await pool.query(`
        DELETE FROM favorito_material WHERE material_academico_id = $1 AND matricula_id = $2
      `, [material_academico_id, matricula_id]);
      return { accion: 'removido' };
    }

    await pool.query(`
      INSERT INTO favorito_material (material_academico_id, matricula_id, notas_personales)
      VALUES ($1, $2, $3)
    `, [material_academico_id, matricula_id, notas_personales]);
    return { accion: 'agregado' };
  }

  static async esFavorito(material_academico_id, matricula_id) {
    const result = await pool.query(`
      SELECT id FROM favorito_material
      WHERE material_academico_id = $1 AND matricula_id = $2
    `, [material_academico_id, matricula_id]);
    return !!result.rows[0];
  }
}

// =============================================
// PROGRESO ESTUDIANTE
// =============================================
class ProgresoEstudiante {

  static async getByMatricula(matricula_id, grado_materia_id) {
    const result = await pool.query(
      `SELECT * FROM reporte_progreso_estudiante($1, $2)`,
      [matricula_id, grado_materia_id]
    );
    return result.rows;
  }

  static async actualizar(matricula_id, tema_id, data) {
    const { estado, porcentaje_avance, tiempo_dedicado } = data;

    const result = await pool.query(`
      INSERT INTO progreso_estudiante (matricula_id, tema_id, estado, porcentaje_avance, fecha_inicio, tiempo_dedicado)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
      ON CONFLICT (matricula_id, tema_id) DO UPDATE SET
        estado            = COALESCE($3, progreso_estudiante.estado),
        porcentaje_avance = COALESCE($4, progreso_estudiante.porcentaje_avance),
        tiempo_dedicado   = progreso_estudiante.tiempo_dedicado + COALESCE($5, 0),
        fecha_completado  = CASE
          WHEN $3 = 'completado' AND progreso_estudiante.fecha_completado IS NULL
          THEN CURRENT_TIMESTAMP ELSE progreso_estudiante.fecha_completado END,
        updated_at        = CURRENT_TIMESTAMP
      RETURNING *
    `, [matricula_id, tema_id, estado || null, porcentaje_avance || null, tiempo_dedicado || 0]);
    return result.rows[0];
  }
  static async getResumenPorTema(tema_id, paralelo_id, periodo_academico_id) {
    const result = await pool.query(`
    SELECT
      COUNT(DISTINCT m.id)                                              AS total_estudiantes,
      COUNT(DISTINCT pe.matricula_id) FILTER (WHERE pe.estado = 'completado')  AS completados,
      COUNT(DISTINCT pe.matricula_id) FILTER (WHERE pe.estado = 'en_progreso') AS en_progreso,
      COUNT(DISTINCT pe.matricula_id) FILTER (WHERE pe.estado = 'revisando')   AS revisando
    FROM matricula m
    LEFT JOIN progreso_estudiante pe
      ON pe.matricula_id = m.id AND pe.tema_id = $1
    WHERE m.paralelo_id = $2
      AND m.periodo_academico_id = $3
      AND m.estado = 'activo'
      AND m.deleted_at IS NULL
  `, [tema_id, paralelo_id, periodo_academico_id]);

    const row = result.rows[0];
    const total = parseInt(row.total_estudiantes);
    const completados = parseInt(row.completados);
    const en_progreso = parseInt(row.en_progreso);
    const revisando = parseInt(row.revisando);

    return {
      tema_id: parseInt(tema_id),
      total_estudiantes: total,
      completados,
      en_progreso,
      revisando,
      no_iniciado: total - completados - en_progreso - revisando,
    };
  }
}
// =============================================
// TEMA QUIZ
// =============================================
class TemaQuiz {

  // Lista de preguntas con respuesta correcta (uso docente / generación)
  static async findByTema(tema_id) {
    const result = await pool.query(`
      SELECT * FROM tema_quiz
      WHERE tema_id = $1 AND activo = true
      ORDER BY orden, id
    `, [tema_id]);
    return result.rows;
  }

  // Versión "segura" para el estudiante: sin respuesta_correcta ni explicación
  static async findByTemaParaEstudiante(tema_id) {
    const result = await pool.query(`
      SELECT id, tema_id, pregunta, opciones, orden
      FROM tema_quiz
      WHERE tema_id = $1 AND activo = true
      ORDER BY orden, id
    `, [tema_id]);
    return result.rows;
  }

  static async countByTema(tema_id) {
    const result = await pool.query(`
      SELECT COUNT(*) FROM tema_quiz WHERE tema_id = $1 AND activo = true
    `, [tema_id]);
    return parseInt(result.rows[0].count);
  }

  // Inserta un set de preguntas generadas por IA, reemplazando las anteriores
  static async reemplazarQuiz(tema_id, preguntas) {
    await pool.query('BEGIN');
    try {
      // Desactivar preguntas anteriores (en vez de borrar, para no romper intento_quiz históricos)
      await pool.query(`
        UPDATE tema_quiz SET activo = false, updated_at = CURRENT_TIMESTAMP
        WHERE tema_id = $1 AND activo = true
      `, [tema_id]);

      const inserted = [];
      for (let i = 0; i < preguntas.length; i++) {
        const p = preguntas[i];
        const result = await pool.query(`
          INSERT INTO tema_quiz (tema_id, pregunta, opciones, respuesta_correcta, explicacion, orden, generado_por_ia)
          VALUES ($1, $2, $3, $4, $5, $6, true)
          RETURNING *
        `, [
          tema_id, p.pregunta, JSON.stringify(p.opciones),
          p.respuesta_correcta, p.explicacion ?? null, i + 1
        ]);
        inserted.push(result.rows[0]);
      }

      await pool.query('COMMIT');
      return inserted;
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  static async findById(id) {
    const result = await pool.query(`SELECT * FROM tema_quiz WHERE id = $1`, [id]);
    return result.rows[0];
  }
}

// =============================================
// INTENTO QUIZ
// =============================================
class IntentoQuiz {

  static async create(data) {
    const { tema_id, matricula_id, respuestas, total_preguntas, correctas, puntaje } = data;

    const result = await pool.query(`
      INSERT INTO intento_quiz (tema_id, matricula_id, respuestas, total_preguntas, correctas, puntaje)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      tema_id, matricula_id, JSON.stringify(respuestas),
      total_preguntas, correctas, puntaje
    ]);
    return result.rows[0];
  }

  // Último intento de un estudiante para un tema
  static async findUltimoIntento(tema_id, matricula_id) {
    const result = await pool.query(`
      SELECT * FROM intento_quiz
      WHERE tema_id = $1 AND matricula_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [tema_id, matricula_id]);
    return result.rows[0];
  }

  // Historial de intentos de un estudiante para un tema
  static async findByEstudiante(tema_id, matricula_id) {
    const result = await pool.query(`
      SELECT * FROM intento_quiz
      WHERE tema_id = $1 AND matricula_id = $2
      ORDER BY created_at DESC
    `, [tema_id, matricula_id]);
    return result.rows;
  }

  // Resumen agregado para el docente: cuántos estudiantes de un paralelo
  // han hecho el quiz, y el promedio de su MEJOR intento.
  static async getResumenPorTema(tema_id, paralelo_id, periodo_academico_id) {
    const result = await pool.query(`
      WITH mejores AS (
        SELECT
          iq.matricula_id,
          MAX(iq.puntaje) AS mejor_puntaje
        FROM intento_quiz iq
        INNER JOIN matricula m ON iq.matricula_id = m.id
        WHERE iq.tema_id = $1
          AND m.paralelo_id = $2
          AND m.periodo_academico_id = $3
          AND m.estado = 'activo'
          AND m.deleted_at IS NULL
        GROUP BY iq.matricula_id
      )
      SELECT
        (SELECT COUNT(*) FROM matricula
          WHERE paralelo_id = $2 AND periodo_academico_id = $3
            AND estado = 'activo' AND deleted_at IS NULL)  AS total_estudiantes,
        COUNT(mejores.matricula_id)                         AS total_intentaron,
        COALESCE(ROUND(AVG(mejores.mejor_puntaje), 1), 0)   AS promedio_puntaje,
        COUNT(*) FILTER (WHERE mejores.mejor_puntaje >= 51) AS aprobados
      FROM mejores
    `, [tema_id, paralelo_id, periodo_academico_id]);

    const row = result.rows[0];
    return {
      tema_id: parseInt(tema_id),
      total_estudiantes: parseInt(row.total_estudiantes),
      total_intentaron: parseInt(row.total_intentaron),
      promedio_puntaje: parseFloat(row.promedio_puntaje),
      aprobados: parseInt(row.aprobados),
    };
  }
}

export {
  TemaQuiz,
  IntentoQuiz,
  UnidadTematica,
  Tema,
  TipoMaterial,
  MaterialAcademico,
  AccesoMaterial,
  ComentarioMaterial,
  FavoritoMaterial,
  ProgresoEstudiante
};