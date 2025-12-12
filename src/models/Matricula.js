// models/Matricula.js
import { pool } from '../db/pool.js';

class Matricula {
  // Crear matrícula
  static async create(data) {
    const {
      estudiante_id, paralelo_id, periodo_academico_id, numero_matricula,
      fecha_matricula, estado, es_repitente, es_becado, porcentaje_beca,
      tipo_beca, observaciones
    } = data;

    const query = `
      INSERT INTO matricula (
        estudiante_id, paralelo_id, periodo_academico_id, numero_matricula,
        fecha_matricula, estado, es_repitente, es_becado, porcentaje_beca,
        tipo_beca, observaciones
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const result = await pool.query(query, [
      estudiante_id, paralelo_id, periodo_academico_id, numero_matricula,
      fecha_matricula || new Date(), estado || 'activo', 
      es_repitente ?? false, es_becado ?? false, porcentaje_beca,
      tipo_beca, observaciones
    ]);

    return result.rows[0];
  }

  // Verificar capacidad del paralelo
  static async checkCapacidad(paralelo_id, periodo_academico_id) {
    const query = `
      SELECT 
        p.capacidad_maxima,
        COUNT(m.id) as matriculas_actuales
      FROM paralelo p
      LEFT JOIN matricula m ON p.id = m.paralelo_id 
        AND m.periodo_academico_id = $2 
        AND m.estado = 'activo' 
        AND m.deleted_at IS NULL
      WHERE p.id = $1
      GROUP BY p.id, p.capacidad_maxima
    `;

    const result = await pool.query(query, [paralelo_id, periodo_academico_id]);
    const data = result.rows[0];

    return {
      capacidad_maxima: data.capacidad_maxima,
      matriculas_actuales: parseInt(data.matriculas_actuales || 0),
      disponible: parseInt(data.matriculas_actuales || 0) < data.capacidad_maxima
    };
  }

  // =============================================
  // GENERAR NÚMERO DE MATRÍCULA CON BLOQUEO
  // =============================================
  static async generateNumeroMatricula(periodo_academico_id, client = null) {
    const conn = client || pool;

    // Si hay client (transacción), bloquear la tabla
    if (client) {
      await client.query('LOCK TABLE matricula IN SHARE ROW EXCLUSIVE MODE');
    }

    // Obtener código del periodo
    const periodoQuery = 'SELECT codigo FROM periodo_academico WHERE id = $1';
    const periodoResult = await conn.query(periodoQuery, [periodo_academico_id]);
    const periodoCodigo = periodoResult.rows[0]?.codigo || new Date().getFullYear();

    // Obtener último número para este periodo
    const query = `
      SELECT numero_matricula 
      FROM matricula 
      WHERE periodo_academico_id = $1 
        AND numero_matricula IS NOT NULL
        AND numero_matricula LIKE $2
      ORDER BY numero_matricula DESC 
      LIMIT 1
    `;

    const prefix = `MAT-${periodoCodigo}-%`;
    const result = await conn.query(query, [periodo_academico_id, prefix]);

    if (result.rows.length === 0) {
      return `MAT-${periodoCodigo}-0001`;
    }

    const lastNumber = result.rows[0].numero_matricula;
    // Formato esperado: MAT-GEST-2025-0001
    // Dividir por '-' y tomar el ÚLTIMO elemento (el número secuencial)
    const parts = lastNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1]); // Tomar el último elemento
    const newNum = (lastNum + 1).toString().padStart(4, '0');

    return `MAT-${periodoCodigo}-${newNum}`;
  }

  // Verificar si ya existe matrícula
  static async exists(estudiante_id, periodo_academico_id) {
    const query = `
      SELECT id FROM matricula 
      WHERE estudiante_id = $1 AND periodo_academico_id = $2 AND deleted_at IS NULL
    `;
    const result = await pool.query(query, [estudiante_id, periodo_academico_id]);
    return result.rows[0];
  }

  // Listar matrículas con filtros
  static async findAll(filters = {}) {
    const { 
      page = 1, limit = 10, search, periodo_academico_id, 
      paralelo_id, grado_id, nivel_academico_id, estado 
    } = filters;
    const offset = (page - 1) * limit;

    let whereConditions = ['m.deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;

    if (search) {
      whereConditions.push(`(
        e.nombres ILIKE $${paramCounter} OR 
        e.apellido_paterno ILIKE $${paramCounter} OR 
        e.apellido_materno ILIKE $${paramCounter} OR
        e.codigo ILIKE $${paramCounter} OR
        m.numero_matricula ILIKE $${paramCounter}
      )`);
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    if (periodo_academico_id) {
      whereConditions.push(`m.periodo_academico_id = $${paramCounter}`);
      queryParams.push(periodo_academico_id);
      paramCounter++;
    }

    if (paralelo_id) {
      whereConditions.push(`m.paralelo_id = $${paramCounter}`);
      queryParams.push(paralelo_id);
      paramCounter++;
    }

    if (grado_id) {
      whereConditions.push(`p.grado_id = $${paramCounter}`);
      queryParams.push(grado_id);
      paramCounter++;
    }

    if (nivel_academico_id) {
      whereConditions.push(`g.nivel_academico_id = $${paramCounter}`);
      queryParams.push(nivel_academico_id);
      paramCounter++;
    }

    if (estado) {
      whereConditions.push(`m.estado = $${paramCounter}`);
      queryParams.push(estado);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*)
      FROM matricula m
      INNER JOIN estudiante e ON m.estudiante_id = e.id
      INNER JOIN paralelo p ON m.paralelo_id = p.id
      INNER JOIN grado g ON p.grado_id = g.id
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    const dataQuery = `
      SELECT m.*,
        e.codigo as estudiante_codigo,
        e.nombres as estudiante_nombres,
        e.apellido_paterno as estudiante_apellido_paterno,
        e.apellido_materno as estudiante_apellido_materno,
        e.foto_url as estudiante_foto,
        pa.nombre as periodo_nombre,
        pa.codigo as periodo_codigo,
        p.nombre as paralelo_nombre,
        p.aula,
        g.nombre as grado_nombre,
        n.nombre as nivel_nombre,
        t.nombre as turno_nombre
      FROM matricula m
      INNER JOIN estudiante e ON m.estudiante_id = e.id
      INNER JOIN periodo_academico pa ON m.periodo_academico_id = pa.id
      INNER JOIN paralelo p ON m.paralelo_id = p.id
      INNER JOIN grado g ON p.grado_id = g.id
      INNER JOIN nivel_academico n ON g.nivel_academico_id = n.id
      INNER JOIN turno t ON p.turno_id = t.id
      WHERE ${whereClause}
      ORDER BY e.apellido_paterno, e.apellido_materno, e.nombres
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      matriculas: result.rows,
      paginacion: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Buscar por ID con información completa
  static async findById(id) {
    const query = `
      SELECT m.*,
        e.id as estudiante_id,
        e.codigo as estudiante_codigo,
        e.nombres as estudiante_nombres,
        e.apellido_paterno as estudiante_apellido_paterno,
        e.apellido_materno as estudiante_apellido_materno,
        e.fecha_nacimiento as estudiante_fecha_nacimiento,
        e.ci as estudiante_ci,
        e.foto_url as estudiante_foto,
        e.telefono as estudiante_telefono,
        pa.id as periodo_id,
        pa.nombre as periodo_nombre,
        pa.codigo as periodo_codigo,
        pa.fecha_inicio as periodo_fecha_inicio,
        pa.fecha_fin as periodo_fecha_fin,
        p.id as paralelo_id,
        p.nombre as paralelo_nombre,
        p.aula,
        p.capacidad_maxima,
        g.id as grado_id,
        g.nombre as grado_nombre,
        n.id as nivel_id,
        n.nombre as nivel_nombre,
        t.nombre as turno_nombre
      FROM matricula m
      INNER JOIN estudiante e ON m.estudiante_id = e.id
      INNER JOIN periodo_academico pa ON m.periodo_academico_id = pa.id
      INNER JOIN paralelo p ON m.paralelo_id = p.id
      INNER JOIN grado g ON p.grado_id = g.id
      INNER JOIN nivel_academico n ON g.nivel_academico_id = n.id
      INNER JOIN turno t ON p.turno_id = t.id
      WHERE m.id = $1 AND m.deleted_at IS NULL
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Actualizar matrícula
  static async update(id, data) {
    const {
      paralelo_id, estado, es_repitente, es_becado, 
      porcentaje_beca, tipo_beca, observaciones
    } = data;

    const query = `
      UPDATE matricula
      SET paralelo_id = $1, estado = $2, es_repitente = $3,
          es_becado = $4, porcentaje_beca = $5, tipo_beca = $6,
          observaciones = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [
      paralelo_id, estado, es_repitente, es_becado,
      porcentaje_beca, tipo_beca, observaciones, id
    ]);

    return result.rows[0];
  }

  // Cambiar estado de matrícula
  static async changeStatus(id, estado, motivo = null) {
    const query = `
      UPDATE matricula
      SET estado = $1, 
          fecha_retiro = CASE WHEN $1 IN ('retirado', 'trasladado') THEN CURRENT_DATE ELSE fecha_retiro END,
          motivo_retiro = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [estado, motivo, id]);
    return result.rows[0];
  }

  // Soft delete
  static async softDelete(id) {
    const query = `
      UPDATE matricula
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Obtener estadísticas de matrícula
  static async getEstadisticas(periodo_academico_id) {
    const query = `
      SELECT 
        COUNT(*) as total_matriculas,
        COUNT(CASE WHEN estado = 'activo' THEN 1 END) as activas,
        COUNT(CASE WHEN estado = 'retirado' THEN 1 END) as retirados,
        COUNT(CASE WHEN es_becado = true THEN 1 END) as becados,
        COUNT(CASE WHEN es_repitente = true THEN 1 END) as repitentes,
        COUNT(DISTINCT paralelo_id) as paralelos_con_estudiantes
      FROM matricula
      WHERE periodo_academico_id = $1 AND deleted_at IS NULL
    `;

    const result = await pool.query(query, [periodo_academico_id]);
    return result.rows[0];
  }

  // Listar estudiantes por paralelo
  static async findByParalelo(paralelo_id, periodo_academico_id, estado = 'activo') {
    const query = `
      SELECT m.id as matricula_id, m.numero_matricula, m.estado, m.es_becado,
        e.id, e.codigo, e.nombres, e.apellido_paterno, e.apellido_materno,
        e.fecha_nacimiento, e.foto_url, e.telefono
      FROM matricula m
      INNER JOIN estudiante e ON m.estudiante_id = e.id
      WHERE m.paralelo_id = $1 
        AND m.periodo_academico_id = $2
        AND m.estado = $3
        AND m.deleted_at IS NULL
      ORDER BY e.apellido_paterno, e.apellido_materno, e.nombres
    `;

    const result = await pool.query(query, [paralelo_id, periodo_academico_id, estado]);
    return result.rows;
  }

  // Transferir estudiante a otro paralelo
  static async transferirParalelo(matricula_id, nuevo_paralelo_id, motivo) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const matriculaQuery = 'SELECT * FROM matricula WHERE id = $1';
      const matriculaResult = await client.query(matriculaQuery, [matricula_id]);
      const matricula = matriculaResult.rows[0];

      const capacidadQuery = await this.checkCapacidad(nuevo_paralelo_id, matricula.periodo_academico_id);
      if (!capacidadQuery.disponible) {
        throw new Error('El paralelo destino no tiene capacidad disponible');
      }

      const updateQuery = `
        UPDATE matricula
        SET paralelo_id = $1, observaciones = CONCAT(
          COALESCE(observaciones, ''), 
          E'\n', 
          'Transferido desde paralelo anterior. Motivo: ', 
          $2
        )
        WHERE id = $3
        RETURNING *
      `;

      const result = await client.query(updateQuery, [nuevo_paralelo_id, motivo, matricula_id]);

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  static async findByIdCompleto(id) {
  const query = `
    SELECT 
      m.*,
      -- Datos del estudiante
      e.id as estudiante_id,
      e.codigo as estudiante_codigo,
      e.nombres as estudiante_nombres,
      e.apellido_paterno as estudiante_apellido_paterno,
      e.apellido_materno as estudiante_apellido_materno,
      e.fecha_nacimiento as estudiante_fecha_nacimiento,
      e.ci as estudiante_ci,
      e.foto_url as estudiante_foto,
      e.telefono as estudiante_telefono,
      e.direccion as estudiante_direccion,
      e.zona as estudiante_zona,
      e.ciudad as estudiante_ciudad,
      
      -- 🔥 Usuario del estudiante
      u_estudiante.username as estudiante_username,
      u_estudiante.email as estudiante_email,
      
      -- Datos del periodo académico
      pa.id as periodo_id,
      pa.nombre as periodo_nombre,
      pa.codigo as periodo_codigo,
      pa.fecha_inicio as periodo_fecha_inicio,
      pa.fecha_fin as periodo_fecha_fin,
      
      -- Datos del paralelo
      p.id as paralelo_id,
      p.nombre as paralelo_nombre,
      p.aula,
      p.capacidad_maxima,
      
      -- Datos del grado
      g.id as grado_id,
      g.nombre as grado_nombre,
      
      -- Datos del nivel académico
      n.id as nivel_id,
      n.nombre as nivel_nombre,
      
      -- Datos del turno
      t.nombre as turno_nombre,
      t.hora_inicio as turno_hora_inicio,
      t.hora_fin as turno_hora_fin,
      
      -- 🔥 DATO DEL USUARIO QUE CREÓ LA MATRÍCULA
      u.username as usuario_registrador,
      u.email as usuario_email
      
    FROM matricula m
    INNER JOIN estudiante e ON m.estudiante_id = e.id
    INNER JOIN periodo_academico pa ON m.periodo_academico_id = pa.id
    INNER JOIN paralelo p ON m.paralelo_id = p.id
    INNER JOIN grado g ON p.grado_id = g.id
    INNER JOIN nivel_academico n ON g.nivel_academico_id = n.id
    INNER JOIN turno t ON p.turno_id = t.id
    
    -- 🔥 JOIN para obtener el usuario del estudiante
    LEFT JOIN usuarios u_estudiante ON e.usuario_id = u_estudiante.id
    
    -- 🔥 JOIN con la tabla actividad_log para obtener el usuario que creó
    LEFT JOIN LATERAL (
      SELECT usuario_id
      FROM actividad_log
      WHERE tabla_afectada = 'matricula' 
        AND registro_id = m.id 
        AND accion = 'crear'
      ORDER BY created_at ASC
      LIMIT 1
    ) log ON true
    LEFT JOIN usuarios u ON log.usuario_id = u.id
    
    WHERE m.id = $1 AND m.deleted_at IS NULL
  `;

  const result = await pool.query(query, [id]);
  return result.rows[0];
}
}

// =============================================
// MATRICULA DOCUMENTO
// =============================================
class MatriculaDocumento {
  static async create(data) {
    const {
      matricula_id, tipo_documento, nombre_archivo, 
      url_archivo, verificado, observaciones
    } = data;

    const query = `
      INSERT INTO matricula_documento (
        matricula_id, tipo_documento, nombre_archivo, url_archivo,
        verificado, observaciones
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await pool.query(query, [
      matricula_id, tipo_documento, nombre_archivo, url_archivo,
      verificado ?? false, observaciones
    ]);

    return result.rows[0];
  }

  static async findByMatricula(matricula_id) {
    const query = `
      SELECT md.*,
        u.username as verificado_por_username
      FROM matricula_documento md
      LEFT JOIN usuarios u ON md.verificado_por = u.id
      WHERE md.matricula_id = $1
      ORDER BY md.created_at DESC
    `;

    const result = await pool.query(query, [matricula_id]);
    return result.rows;
  }

  static async verificar(id, verificado_por) {
    const query = `
      UPDATE matricula_documento
      SET verificado = true, 
          verificado_por = $1,
          fecha_verificacion = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [verificado_por, id]);
    return result.rows[0];
  }

  static async delete(id) {
    const query = 'DELETE FROM matricula_documento WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async checkDocumentosCompletos(matricula_id, documentos_requeridos) {
    const query = `
      SELECT tipo_documento, verificado
      FROM matricula_documento
      WHERE matricula_id = $1
    `;

    const result = await pool.query(query, [matricula_id]);
    const documentos = result.rows;

    const faltantes = documentos_requeridos.filter(req => 
      !documentos.some(doc => doc.tipo_documento === req && doc.verificado)
    );

    return {
      completo: faltantes.length === 0,
      faltantes,
      total_requeridos: documentos_requeridos.length,
      total_verificados: documentos.filter(d => d.verificado).length
    };
  }
}

export { Matricula, MatriculaDocumento };