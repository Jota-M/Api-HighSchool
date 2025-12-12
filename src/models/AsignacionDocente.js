import { pool } from '../db/pool.js';

class AsignacionDocente {
  // Crear asignación
  static async create(data, client = null) {
    const db = client || pool;
    const {
      docente_id, grado_materia_id, paralelo_id, periodo_academico_id,
      es_titular, fecha_inicio, fecha_fin, activo
    } = data;

    const query = `
      INSERT INTO asignacion_docente (
        docente_id, grado_materia_id, paralelo_id, periodo_academico_id,
        es_titular, fecha_inicio, fecha_fin, activo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await db.query(query, [
      docente_id, grado_materia_id, paralelo_id, periodo_academico_id,
      es_titular ?? true, fecha_inicio, fecha_fin, activo ?? true
    ]);

    return result.rows[0];
  }

  // Verificar si ya existe la asignación
  static async exists(grado_materia_id, paralelo_id, periodo_academico_id, client = null) {
    const db = client || pool;
    const query = `
      SELECT id, docente_id FROM asignacion_docente 
      WHERE grado_materia_id = $1 
        AND paralelo_id = $2 
        AND periodo_academico_id = $3
        AND deleted_at IS NULL
    `;
    const result = await db.query(query, [grado_materia_id, paralelo_id, periodo_academico_id]);
    return result.rows[0];
  }

  // Buscar por ID con detalles completos
  static async findById(id) {
    const query = `
      SELECT ad.*,
        d.codigo as docente_codigo,
        d.nombres as docente_nombres,
        d.apellidos as docente_apellidos,
        d.foto_url as docente_foto,
        d.email as docente_email,
        d.telefono as docente_telefono,
        m.nombre as materia_nombre,
        m.codigo as materia_codigo,
        g.nombre as grado_nombre,
        p.nombre as paralelo_nombre,
        t.nombre as turno_nombre,
        pa.nombre as periodo_nombre
      FROM asignacion_docente ad
      INNER JOIN docente d ON ad.docente_id = d.id
      INNER JOIN grado_materia gm ON ad.grado_materia_id = gm.id
      INNER JOIN materia m ON gm.materia_id = m.id
      INNER JOIN grado g ON gm.grado_id = g.id
      INNER JOIN paralelo p ON ad.paralelo_id = p.id
      INNER JOIN turno t ON p.turno_id = t.id
      INNER JOIN periodo_academico pa ON ad.periodo_academico_id = pa.id
      WHERE ad.id = $1 AND ad.deleted_at IS NULL
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Listar asignaciones con filtros
  static async findAll(filters = {}) {
    const { 
      page = 1, limit = 20, docente_id, grado_id, materia_id, 
      paralelo_id, periodo_academico_id, activo 
    } = filters;
    const offset = (page - 1) * limit;

    let whereConditions = ['ad.deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;

    if (docente_id) {
      whereConditions.push(`ad.docente_id = $${paramCounter}`);
      queryParams.push(docente_id);
      paramCounter++;
    }

    if (grado_id) {
      whereConditions.push(`gm.grado_id = $${paramCounter}`);
      queryParams.push(grado_id);
      paramCounter++;
    }

    if (materia_id) {
      whereConditions.push(`gm.materia_id = $${paramCounter}`);
      queryParams.push(materia_id);
      paramCounter++;
    }

    if (paralelo_id) {
      whereConditions.push(`ad.paralelo_id = $${paramCounter}`);
      queryParams.push(paralelo_id);
      paramCounter++;
    }

    if (periodo_academico_id) {
      whereConditions.push(`ad.periodo_academico_id = $${paramCounter}`);
      queryParams.push(periodo_academico_id);
      paramCounter++;
    }

    if (activo !== undefined) {
      whereConditions.push(`ad.activo = $${paramCounter}`);
      queryParams.push(activo);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Contar total
    const countQuery = `
      SELECT COUNT(*) FROM asignacion_docente ad
      INNER JOIN grado_materia gm ON ad.grado_materia_id = gm.id
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Obtener datos
    const dataQuery = `
      SELECT ad.*,
        d.codigo as docente_codigo,
        d.nombres as docente_nombres,
        d.apellidos as docente_apellidos,
        d.foto_url as docente_foto,
        m.nombre as materia_nombre,
        m.codigo as materia_codigo,
        m.color as materia_color,
        g.nombre as grado_nombre,
        na.nombre as nivel_nombre,
        p.nombre as paralelo_nombre,
        t.nombre as turno_nombre,
        pa.nombre as periodo_nombre
      FROM asignacion_docente ad
      INNER JOIN docente d ON ad.docente_id = d.id
      INNER JOIN grado_materia gm ON ad.grado_materia_id = gm.id
      INNER JOIN materia m ON gm.materia_id = m.id
      INNER JOIN grado g ON gm.grado_id = g.id
      INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
      INNER JOIN paralelo p ON ad.paralelo_id = p.id
      INNER JOIN turno t ON p.turno_id = t.id
      INNER JOIN periodo_academico pa ON ad.periodo_academico_id = pa.id
      WHERE ${whereClause}
      ORDER BY na.orden, g.orden, p.nombre, m.nombre
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      asignaciones: result.rows,
      paginacion: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Obtener asignaciones de un docente
  static async findByDocente(docente_id, periodo_academico_id = null) {
    let whereConditions = ['ad.docente_id = $1', 'ad.deleted_at IS NULL'];
    let queryParams = [docente_id];

    if (periodo_academico_id) {
      whereConditions.push('ad.periodo_academico_id = $2');
      queryParams.push(periodo_academico_id);
    }

    const query = `
      SELECT ad.*,
        m.nombre as materia_nombre,
        m.codigo as materia_codigo,
        m.color as materia_color,
        m.horas_semanales,
        g.nombre as grado_nombre,
        na.nombre as nivel_nombre,
        p.nombre as paralelo_nombre,
        t.nombre as turno_nombre,
        pa.nombre as periodo_nombre,
        (SELECT COUNT(*) FROM matricula mat 
         WHERE mat.paralelo_id = ad.paralelo_id 
         AND mat.periodo_academico_id = ad.periodo_academico_id 
         AND mat.estado = 'activo' AND mat.deleted_at IS NULL) as total_estudiantes
      FROM asignacion_docente ad
      INNER JOIN grado_materia gm ON ad.grado_materia_id = gm.id
      INNER JOIN materia m ON gm.materia_id = m.id
      INNER JOIN grado g ON gm.grado_id = g.id
      INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
      INNER JOIN paralelo p ON ad.paralelo_id = p.id
      INNER JOIN turno t ON p.turno_id = t.id
      INNER JOIN periodo_academico pa ON ad.periodo_academico_id = pa.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY na.orden, g.orden, p.nombre
    `;

    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  // Obtener docentes asignados a un paralelo
  static async findByParalelo(paralelo_id, periodo_academico_id) {
    const query = `
      SELECT ad.*,
        d.codigo as docente_codigo,
        d.nombres as docente_nombres,
        d.apellidos as docente_apellidos,
        d.foto_url as docente_foto,
        d.email as docente_email,
        d.especialidad,
        m.nombre as materia_nombre,
        m.codigo as materia_codigo,
        m.color as materia_color,
        m.horas_semanales
      FROM asignacion_docente ad
      INNER JOIN docente d ON ad.docente_id = d.id
      INNER JOIN grado_materia gm ON ad.grado_materia_id = gm.id
      INNER JOIN materia m ON gm.materia_id = m.id
      WHERE ad.paralelo_id = $1 
        AND ad.periodo_academico_id = $2
        AND ad.activo = true 
        AND ad.deleted_at IS NULL
      ORDER BY m.nombre
    `;
    const result = await pool.query(query, [paralelo_id, periodo_academico_id]);
    return result.rows;
  }

  // Actualizar asignación
  static async update(id, data, client = null) {
    const db = client || pool;
    const { es_titular, fecha_inicio, fecha_fin, activo } = data;

    const query = `
      UPDATE asignacion_docente SET
        es_titular = COALESCE($1, es_titular),
        fecha_inicio = COALESCE($2, fecha_inicio),
        fecha_fin = $3,
        activo = COALESCE($4, activo),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await db.query(query, [es_titular, fecha_inicio, fecha_fin, activo, id]);
    return result.rows[0];
  }

  // Cambiar docente de una asignación
  static async cambiarDocente(id, nuevo_docente_id, client = null) {
    const db = client || pool;
    
    const query = `
      UPDATE asignacion_docente SET
        docente_id = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await db.query(query, [nuevo_docente_id, id]);
    return result.rows[0];
  }

  // Soft delete
  static async softDelete(id, client = null) {
    const db = client || pool;
    const query = `
      UPDATE asignacion_docente SET 
        deleted_at = CURRENT_TIMESTAMP,
        activo = false
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  // Copiar asignaciones de un periodo a otro
  static async copiarDePeriodo(periodo_origen_id, periodo_destino_id, client = null) {
    const db = client || pool;
    
    const query = `
      INSERT INTO asignacion_docente (
        docente_id, grado_materia_id, paralelo_id, periodo_academico_id,
        es_titular, activo
      )
      SELECT 
        docente_id, grado_materia_id, paralelo_id, $2,
        es_titular, true
      FROM asignacion_docente
      WHERE periodo_academico_id = $1 
        AND activo = true 
        AND deleted_at IS NULL
      ON CONFLICT (grado_materia_id, paralelo_id, periodo_academico_id) DO NOTHING
      RETURNING *
    `;

    const result = await db.query(query, [periodo_origen_id, periodo_destino_id]);
    return result.rows;
  }

  // Obtener carga horaria del docente
  static async getCargaHoraria(docente_id, periodo_academico_id) {
    const query = `
      SELECT 
        SUM(m.horas_semanales) as total_horas,
        COUNT(*) as total_asignaciones,
        COUNT(DISTINCT ad.paralelo_id) as total_paralelos
      FROM asignacion_docente ad
      INNER JOIN grado_materia gm ON ad.grado_materia_id = gm.id
      INNER JOIN materia m ON gm.materia_id = m.id
      WHERE ad.docente_id = $1 
        AND ad.periodo_academico_id = $2
        AND ad.activo = true 
        AND ad.deleted_at IS NULL
    `;
    const result = await pool.query(query, [docente_id, periodo_academico_id]);
    return result.rows[0];
  }

  // Verificar disponibilidad del docente (para horarios)
  static async getAsignacionesParalelo(docente_id, periodo_academico_id) {
    const query = `
      SELECT 
        ad.id,
        p.id as paralelo_id,
        p.nombre as paralelo_nombre,
        t.hora_inicio,
        t.hora_fin,
        t.nombre as turno_nombre
      FROM asignacion_docente ad
      INNER JOIN paralelo p ON ad.paralelo_id = p.id
      INNER JOIN turno t ON p.turno_id = t.id
      WHERE ad.docente_id = $1 
        AND ad.periodo_academico_id = $2
        AND ad.activo = true 
        AND ad.deleted_at IS NULL
    `;
    const result = await pool.query(query, [docente_id, periodo_academico_id]);
    return result.rows;
  }
}

export default AsignacionDocente;