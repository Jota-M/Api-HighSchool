// models/Docente.js
import { pool } from '../db/pool.js';

class Docente {
  // Generar código único de docente
  static async generateCode(client = null) {
    const db = client || pool;
    const year = new Date().getFullYear().toString().slice(-2);
    
    const query = `
      SELECT codigo FROM docente 
      WHERE codigo LIKE $1 
      ORDER BY codigo DESC 
      LIMIT 1
    `;
    const result = await db.query(query, [`DOC${year}%`]);
    
    if (result.rows.length === 0) {
      return `DOC${year}0001`;
    }
    
    const lastCode = result.rows[0].codigo;
    const lastNumber = parseInt(lastCode.slice(-4));
    const newNumber = (lastNumber + 1).toString().padStart(4, '0');
    
    return `DOC${year}${newNumber}`;
  }

  // Generar código con lock (para transacciones)
  static async generateCodeWithLock(client) {
    await client.query('LOCK TABLE docente IN EXCLUSIVE MODE');
    return this.generateCode(client);
  }

  // Crear docente
  static async create(data, client = null) {
    const db = client || pool;
    const {
      usuario_id, codigo, nombres, apellido_paterno, apellido_materno,
      ci, fecha_nacimiento, genero, telefono, celular, email, direccion,
      titulo_profesional, titulo_postgrado, especialidad, salario_mensual,
      numero_cuenta, fecha_contratacion, tipo_contrato, foto_url, cv_url,
      nivel_formacion, experiencia_anios, activo
    } = data;

    const query = `
      INSERT INTO docente (
        usuario_id, codigo, nombres, apellido_paterno, apellido_materno,
        ci, fecha_nacimiento, genero, telefono, celular, email, direccion,
        titulo_profesional, titulo_postgrado, especialidad, salario_mensual,
        numero_cuenta, fecha_contratacion, tipo_contrato, foto_url, cv_url,
        nivel_formacion, experiencia_anios, activo
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
      RETURNING *
    `;

    const result = await db.query(query, [
      usuario_id, codigo, nombres, apellido_paterno, apellido_materno,
      ci, fecha_nacimiento, genero, telefono, celular, email, direccion,
      titulo_profesional, titulo_postgrado, especialidad, salario_mensual,
      numero_cuenta, fecha_contratacion, tipo_contrato, foto_url, cv_url,
      nivel_formacion, experiencia_anios, activo ?? true
    ]);

    return result.rows[0];
  }

  // Listar docentes con filtros y paginación
  static async findAll(filters = {}) {
    const { page = 1, limit = 10, search, activo, tipo_contrato, especialidad } = filters;
    const offset = (page - 1) * limit;

    let whereConditions = ['d.deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;

    if (search) {
      whereConditions.push(`(
        d.nombres ILIKE $${paramCounter} OR 
        d.apellidos ILIKE $${paramCounter} OR 
        d.codigo ILIKE $${paramCounter} OR 
        d.ci ILIKE $${paramCounter} OR
        d.email ILIKE $${paramCounter}
      )`);
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    if (activo !== undefined) {
      whereConditions.push(`d.activo = $${paramCounter}`);
      queryParams.push(activo);
      paramCounter++;
    }

    if (tipo_contrato) {
      whereConditions.push(`d.tipo_contrato = $${paramCounter}`);
      queryParams.push(tipo_contrato);
      paramCounter++;
    }

    if (especialidad) {
      whereConditions.push(`d.especialidad ILIKE $${paramCounter}`);
      queryParams.push(`%${especialidad}%`);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Contar total
    const countQuery = `SELECT COUNT(*) FROM docente d WHERE ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Obtener datos
    const dataQuery = `
      SELECT d.*,
        u.username,
        u.email as usuario_email,
        (SELECT COUNT(*) FROM asignacion_docente ad 
         WHERE ad.docente_id = d.id AND ad.activo = true AND ad.deleted_at IS NULL) as total_asignaciones
      FROM docente d
      LEFT JOIN usuarios u ON d.usuario_id = u.id
      WHERE ${whereClause}
      ORDER BY d.apellidos, d.nombres
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      docentes: result.rows,
      paginacion: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Buscar por ID
  static async findById(id) {
    const query = `
      SELECT d.*,
        u.username,
        u.email as usuario_email
      FROM docente d
      LEFT JOIN usuarios u ON d.usuario_id = u.id
      WHERE d.id = $1 AND d.deleted_at IS NULL
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Buscar por CI
  static async findByCI(ci, client = null) {
    const db = client || pool;
    const query = 'SELECT * FROM docente WHERE ci = $1 AND deleted_at IS NULL';
    const result = await db.query(query, [ci]);
    return result.rows[0];
  }

  // Buscar por código
  static async findByCode(codigo, client = null) {
    const db = client || pool;
    const query = 'SELECT * FROM docente WHERE codigo = $1 AND deleted_at IS NULL';
    const result = await db.query(query, [codigo]);
    return result.rows[0];
  }

  // Actualizar docente
  static async update(id, data, client = null) {
    const db = client || pool;
    const {
      nombres, apellido_paterno, apellido_materno, ci, fecha_nacimiento,
      genero, telefono, celular, email, direccion, titulo_profesional,
      titulo_postgrado, especialidad, salario_mensual, numero_cuenta,
      fecha_contratacion, fecha_retiro, tipo_contrato, foto_url, cv_url,
      nivel_formacion, experiencia_anios, activo
    } = data;

    const query = `
      UPDATE docente SET
        nombres = COALESCE($1, nombres),
        apellido_paterno = COALESCE($2, apellido_paterno),
        apellido_materno = COALESCE($3, apellido_materno),
        ci = COALESCE($4, ci),
        fecha_nacimiento = COALESCE($5, fecha_nacimiento),
        genero = COALESCE($6, genero),
        telefono = COALESCE($7, telefono),
        celular = COALESCE($8, celular),
        email = COALESCE($9, email),
        direccion = COALESCE($10, direccion),
        titulo_profesional = COALESCE($11, titulo_profesional),
        titulo_postgrado = COALESCE($12, titulo_postgrado),
        especialidad = COALESCE($13, especialidad),
        salario_mensual = COALESCE($14, salario_mensual),
        numero_cuenta = COALESCE($15, numero_cuenta),
        fecha_contratacion = COALESCE($16, fecha_contratacion),
        fecha_retiro = $17,
        tipo_contrato = COALESCE($18, tipo_contrato),
        foto_url = COALESCE($19, foto_url),
        cv_url = COALESCE($20, cv_url),
        nivel_formacion = COALESCE($21, nivel_formacion),
        experiencia_anios = COALESCE($22, experiencia_anios),
        activo = COALESCE($23, activo),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $24 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await db.query(query, [
      nombres, apellido_paterno, apellido_materno, ci, fecha_nacimiento,
      genero, telefono, celular, email, direccion, titulo_profesional,
      titulo_postgrado, especialidad, salario_mensual, numero_cuenta,
      fecha_contratacion, fecha_retiro, tipo_contrato, foto_url, cv_url,
      nivel_formacion, experiencia_anios, activo, id
    ]);

    return result.rows[0];
  }

  // Soft delete
  static async softDelete(id) {
    // Verificar asignaciones activas
    const checkQuery = `
      SELECT COUNT(*) FROM asignacion_docente 
      WHERE docente_id = $1 AND activo = true AND deleted_at IS NULL
    `;
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (parseInt(checkResult.rows[0].count) > 0) {
      throw new Error('No se puede eliminar un docente con asignaciones activas');
    }

    const query = `
      UPDATE docente SET deleted_at = CURRENT_TIMESTAMP, activo = false
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Obtener docentes por materia
  static async findByMateria(materia_id, periodo_academico_id) {
    const query = `
      SELECT DISTINCT d.*, ad.es_titular
      FROM docente d
      INNER JOIN asignacion_docente ad ON d.id = ad.docente_id
      INNER JOIN grado_materia gm ON ad.grado_materia_id = gm.id
      WHERE gm.materia_id = $1 
        AND ad.periodo_academico_id = $2
        AND ad.activo = true 
        AND ad.deleted_at IS NULL
        AND d.deleted_at IS NULL
      ORDER BY d.apellidos
    `;
    const result = await pool.query(query, [materia_id, periodo_academico_id]);
    return result.rows;
  }

  // Obtener estadísticas del docente
  static async getEstadisticas(id) {
    const query = `
      SELECT 
        (SELECT COUNT(*) FROM asignacion_docente WHERE docente_id = $1 AND activo = true AND deleted_at IS NULL) as asignaciones_activas,
        (SELECT COUNT(DISTINCT paralelo_id) FROM asignacion_docente WHERE docente_id = $1 AND activo = true AND deleted_at IS NULL) as paralelos_asignados,
        (SELECT COUNT(DISTINCT gm.materia_id) FROM asignacion_docente ad 
         INNER JOIN grado_materia gm ON ad.grado_materia_id = gm.id 
         WHERE ad.docente_id = $1 AND ad.activo = true AND ad.deleted_at IS NULL) as materias_diferentes
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

export default Docente;