import { pool } from "../db/pool.js";


class Estudiante {
  // Crear estudiante
  static async create(data) {
    const {
      usuario_id, codigo, nombres, apellido_paterno, apellido_materno,
      fecha_nacimiento, ci, lugar_nacimiento, genero, direccion, zona,
      ciudad, telefono, email, foto_url, contacto_emergencia,
      telefono_emergencia, tiene_discapacidad, tipo_discapacidad,
      observaciones, activo
    } = data;

    const query = `
      INSERT INTO estudiante (
        usuario_id, codigo, nombres, apellido_paterno, apellido_materno,
        fecha_nacimiento, ci, lugar_nacimiento, genero, direccion, zona,
        ciudad, telefono, email, foto_url, contacto_emergencia,
        telefono_emergencia, tiene_discapacidad, tipo_discapacidad,
        observaciones, activo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING *
    `;

    const result = await pool.query(query, [
      usuario_id, codigo, nombres, apellido_paterno, apellido_materno,
      fecha_nacimiento, ci, lugar_nacimiento, genero, direccion, zona,
      ciudad, telefono, email, foto_url, contacto_emergencia,
      telefono_emergencia, tiene_discapacidad ?? false, tipo_discapacidad,
      observaciones, activo ?? true
    ]);

    return result.rows[0];
  }

  // Listar estudiantes con filtros y paginación
  static async findAll(filters = {}) {
    const { page = 1, limit = 10, search, genero, activo, grado_id, paralelo_id } = filters;
    const offset = (page - 1) * limit;

    let whereConditions = ['e.deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;
    let joins = '';

    if (search) {
      whereConditions.push(`(
        e.nombres ILIKE $${paramCounter} OR 
        e.apellido_paterno ILIKE $${paramCounter} OR 
        e.apellido_materno ILIKE $${paramCounter} OR
        e.codigo ILIKE $${paramCounter} OR
        e.ci ILIKE $${paramCounter}
      )`);
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    if (genero) {
      whereConditions.push(`e.genero = $${paramCounter}`);
      queryParams.push(genero);
      paramCounter++;
    }

    if (activo !== undefined) {
      whereConditions.push(`e.activo = $${paramCounter}`);
      queryParams.push(activo);
      paramCounter++;
    }

    // Filtrar por grado o paralelo (requiere join con matrícula)
    if (grado_id || paralelo_id) {
      joins = `
        INNER JOIN matricula m ON e.id = m.estudiante_id AND m.deleted_at IS NULL AND m.estado = 'activo'
        INNER JOIN paralelo p ON m.paralelo_id = p.id
      `;

      if (grado_id) {
        whereConditions.push(`p.grado_id = $${paramCounter}`);
        queryParams.push(grado_id);
        paramCounter++;
      }

      if (paralelo_id) {
        whereConditions.push(`m.paralelo_id = $${paramCounter}`);
        queryParams.push(paralelo_id);
        paramCounter++;
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Contar total
    const countQuery = `
      SELECT COUNT(DISTINCT e.id)
      FROM estudiante e
      ${joins}
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Obtener datos
    const dataQuery = `
      SELECT DISTINCT e.*,
        (SELECT COUNT(*) FROM matricula m WHERE m.estudiante_id = e.id AND m.deleted_at IS NULL) as total_matriculas
      FROM estudiante e
      ${joins}
      ${whereClause}
      ORDER BY e.apellido_paterno, e.apellido_materno, e.nombres
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      estudiantes: result.rows,
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
      SELECT e.*,
        u.username, u.email as usuario_email,
        (SELECT json_agg(json_build_object(
          'id', m.id,
          'periodo', pa.nombre,
          'grado', g.nombre,
          'paralelo', p.nombre,
          'turno', t.nombre,
          'estado', m.estado
        ))
        FROM matricula m
        INNER JOIN periodo_academico pa ON m.periodo_academico_id = pa.id
        INNER JOIN paralelo p ON m.paralelo_id = p.id
        INNER JOIN grado g ON p.grado_id = g.id
        INNER JOIN turno t ON p.turno_id = t.id
        WHERE m.estudiante_id = e.id AND m.deleted_at IS NULL
        ) as matriculas
      FROM estudiante e
      LEFT JOIN usuarios u ON e.usuario_id = u.id
      WHERE e.id = $1 AND e.deleted_at IS NULL
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Buscar por código
  static async findByCode(codigo) {
    const query = 'SELECT * FROM estudiante WHERE codigo = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [codigo]);
    return result.rows[0];
  }

  // Buscar por CI
  static async findByCI(ci) {
    const query = 'SELECT * FROM estudiante WHERE ci = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [ci]);
    return result.rows[0];
  }

  // Actualizar estudiante
  static async update(id, data) {
    const {
      nombres, apellido_paterno, apellido_materno, fecha_nacimiento,
      ci, lugar_nacimiento, genero, direccion, zona, ciudad,
      telefono, email, foto_url, contacto_emergencia,
      telefono_emergencia, tiene_discapacidad, tipo_discapacidad,
      observaciones, activo
    } = data;

    const query = `
      UPDATE estudiante
      SET nombres = $1, apellido_paterno = $2, apellido_materno = $3,
          fecha_nacimiento = $4, ci = $5, lugar_nacimiento = $6,
          genero = $7, direccion = $8, zona = $9, ciudad = $10,
          telefono = $11, email = $12, foto_url = $13,
          contacto_emergencia = $14, telefono_emergencia = $15,
          tiene_discapacidad = $16, tipo_discapacidad = $17,
          observaciones = $18, activo = $19,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $20 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [
      nombres, apellido_paterno, apellido_materno, fecha_nacimiento,
      ci, lugar_nacimiento, genero, direccion, zona, ciudad,
      telefono, email, foto_url, contacto_emergencia,
      telefono_emergencia, tiene_discapacidad, tipo_discapacidad,
      observaciones, activo, id
    ]);

    return result.rows[0];
  }

  // Soft delete
  static async softDelete(id) {
    // Verificar que no tenga matrículas activas
    const checkQuery = `
      SELECT COUNT(*) FROM matricula 
      WHERE estudiante_id = $1 AND estado = 'activo' AND deleted_at IS NULL
    `;
    const checkResult = await pool.query(checkQuery, [id]);

    if (parseInt(checkResult.rows[0].count) > 0) {
      throw new Error('No se puede eliminar un estudiante con matrículas activas');
    }

    const query = `
      UPDATE estudiante
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Obtener tutores del estudiante
  static async getTutores(estudiante_id) {
    const query = `
      SELECT et.*, pf.*,
        et.es_tutor_principal, et.vive_con_estudiante,
        et.autorizado_recoger, et.puede_autorizar_salidas,
        et.recibe_notificaciones, et.prioridad_contacto
      FROM estudiante_tutor et
      INNER JOIN padre_familia pf ON et.padre_familia_id = pf.id
      WHERE et.estudiante_id = $1 AND pf.deleted_at IS NULL
      ORDER BY et.prioridad_contacto, pf.apellido_paterno
    `;

    const result = await pool.query(query, [estudiante_id]);
    return result.rows;
  }

  // Generar código automático
  static async generateCode(year = new Date().getFullYear()) {
    const query = `
      SELECT codigo FROM estudiante 
      WHERE codigo LIKE $1 
      ORDER BY codigo DESC 
      LIMIT 1
    `;

    const prefix = `EST-${year}-`;
    const result = await pool.query(query, [`${prefix}%`]);

    if (result.rows.length === 0) {
      return `${prefix}0001`;
    }

    const lastCode = result.rows[0].codigo;
    const lastNumber = parseInt(lastCode.split('-')[2]);
    const newNumber = (lastNumber + 1).toString().padStart(4, '0');

    return `${prefix}${newNumber}`;
  }
}

// models/PadreFamilia.js
class PadreFamilia {
  // Crear padre/tutor
  static async create(data) {
    const {
      usuario_id, nombres, apellido_paterno, apellido_materno, ci,
      fecha_nacimiento, telefono, celular, email, direccion,
      ocupacion, lugar_trabajo, telefono_trabajo, parentesco,
      estado_civil, nivel_educacion
    } = data;

    const query = `
      INSERT INTO padre_familia (
        usuario_id, nombres, apellido_paterno, apellido_materno, ci,
        fecha_nacimiento, telefono, celular, email, direccion,
        ocupacion, lugar_trabajo, telefono_trabajo, parentesco,
        estado_civil, nivel_educacion
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const result = await pool.query(query, [
      usuario_id, nombres, apellido_paterno, apellido_materno, ci,
      fecha_nacimiento, telefono, celular, email, direccion,
      ocupacion, lugar_trabajo, telefono_trabajo, parentesco,
      estado_civil, nivel_educacion
    ]);

    return result.rows[0];
  }

  // Listar padres
  static async findAll(filters = {}) {
    const { page = 1, limit = 10, search, parentesco } = filters;
    const offset = (page - 1) * limit;

    let whereConditions = ['deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;

    if (search) {
      whereConditions.push(`(
        nombres ILIKE $${paramCounter} OR 
        apellido_paterno ILIKE $${paramCounter} OR 
        apellido_materno ILIKE $${paramCounter} OR
        ci ILIKE $${paramCounter}
      )`);
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    if (parentesco) {
      whereConditions.push(`parentesco = $${paramCounter}`);
      queryParams.push(parentesco);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Contar total
    const countQuery = `SELECT COUNT(*) FROM padre_familia WHERE ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Obtener datos
    const dataQuery = `
      SELECT *,
        (SELECT COUNT(*) FROM estudiante_tutor WHERE padre_familia_id = padre_familia.id) as total_estudiantes
      FROM padre_familia
      WHERE ${whereClause}
      ORDER BY apellido_paterno, apellido_materno, nombres
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      tutores: result.rows,
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
      SELECT pf.*,
        (SELECT json_agg(json_build_object(
          'estudiante_id', e.id,
          'estudiante_nombre', e.nombres || ' ' || e.apellido_paterno,
          'es_tutor_principal', et.es_tutor_principal
        ))
        FROM estudiante_tutor et
        INNER JOIN estudiante e ON et.estudiante_id = e.id
        WHERE et.padre_familia_id = pf.id AND e.deleted_at IS NULL
        ) as estudiantes
      FROM padre_familia pf
      WHERE pf.id = $1 AND pf.deleted_at IS NULL
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Buscar por CI
  static async findByCI(ci) {
    const query = 'SELECT * FROM padre_familia WHERE ci = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [ci]);
    return result.rows[0];
  }

  // Actualizar
  static async update(id, data) {
    const {
      nombres, apellido_paterno, apellido_materno, ci, fecha_nacimiento,
      telefono, celular, email, direccion, ocupacion, lugar_trabajo,
      telefono_trabajo, parentesco, estado_civil, nivel_educacion
    } = data;

    const query = `
      UPDATE padre_familia
      SET nombres = $1, apellido_paterno = $2, apellido_materno = $3,
          ci = $4, fecha_nacimiento = $5, telefono = $6, celular = $7,
          email = $8, direccion = $9, ocupacion = $10, lugar_trabajo = $11,
          telefono_trabajo = $12, parentesco = $13, estado_civil = $14,
          nivel_educacion = $15, updated_at = CURRENT_TIMESTAMP
      WHERE id = $16 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [
      nombres, apellido_paterno, apellido_materno, ci, fecha_nacimiento,
      telefono, celular, email, direccion, ocupacion, lugar_trabajo,
      telefono_trabajo, parentesco, estado_civil, nivel_educacion, id
    ]);

    return result.rows[0];
  }

  // Soft delete
  static async softDelete(id) {
    const query = `
      UPDATE padre_familia
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

// models/EstudianteTutor.js
class EstudianteTutor {
  // Asignar tutor a estudiante
  static async assign(data) {
    const {
      estudiante_id, padre_familia_id, es_tutor_principal,
      vive_con_estudiante, autorizado_recoger, puede_autorizar_salidas,
      recibe_notificaciones, prioridad_contacto, observaciones
    } = data;

    const query = `
      INSERT INTO estudiante_tutor (
        estudiante_id, padre_familia_id, es_tutor_principal,
        vive_con_estudiante, autorizado_recoger, puede_autorizar_salidas,
        recibe_notificaciones, prioridad_contacto, observaciones
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await pool.query(query, [
      estudiante_id, padre_familia_id, es_tutor_principal ?? false,
      vive_con_estudiante ?? false, autorizado_recoger ?? true,
      puede_autorizar_salidas ?? true, recibe_notificaciones ?? true,
      prioridad_contacto ?? 1, observaciones
    ]);

    return result.rows[0];
  }

  // Obtener relación específica
  static async findById(id) {
    const query = `
      SELECT et.*, 
        e.nombres as estudiante_nombres, e.apellido_paterno as estudiante_apellido,
        pf.nombres as tutor_nombres, pf.apellido_paterno as tutor_apellido
      FROM estudiante_tutor et
      INNER JOIN estudiante e ON et.estudiante_id = e.id
      INNER JOIN padre_familia pf ON et.padre_familia_id = pf.id
      WHERE et.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Verificar si ya existe la relación
  static async exists(estudiante_id, padre_familia_id) {
    const query = `
      SELECT id FROM estudiante_tutor 
      WHERE estudiante_id = $1 AND padre_familia_id = $2
    `;
    const result = await pool.query(query, [estudiante_id, padre_familia_id]);
    return result.rows[0];
  }

  // Actualizar relación
  static async update(id, data) {
    const {
      es_tutor_principal, vive_con_estudiante, autorizado_recoger,
      puede_autorizar_salidas, recibe_notificaciones, prioridad_contacto,
      observaciones
    } = data;

    const query = `
      UPDATE estudiante_tutor
      SET es_tutor_principal = $1, vive_con_estudiante = $2,
          autorizado_recoger = $3, puede_autorizar_salidas = $4,
          recibe_notificaciones = $5, prioridad_contacto = $6,
          observaciones = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `;

    const result = await pool.query(query, [
      es_tutor_principal, vive_con_estudiante, autorizado_recoger,
      puede_autorizar_salidas, recibe_notificaciones, prioridad_contacto,
      observaciones, id
    ]);

    return result.rows[0];
  }

  // Remover relación
  static async remove(id) {
    const query = 'DELETE FROM estudiante_tutor WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

export { Estudiante, PadreFamilia, EstudianteTutor };