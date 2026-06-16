import { pool } from "../db/pool.js";

class Estudiante {
  // =============================================
  // CREAR ESTUDIANTE - VERSIÓN ÚNICA Y CORRECTA
  // =============================================
  static async create(data, client = null) {
  const conn = client || pool;

  const {
    usuario_id,
    codigo,
    rude, // ✅ NUEVO
    nombres,
    apellido_paterno,
    apellido_materno,
    fecha_nacimiento,
    ci,
    lugar_nacimiento,
    genero,
    direccion,
    zona,
    ciudad,
    telefono,
    email,
    foto_url,
    contacto_emergencia,
    tiene_discapacidad,
    tipo_discapacidad,
    observaciones,
    activo
  } = data;

  const query = `
    INSERT INTO estudiante (
      usuario_id,
      codigo,
      rude,
      nombres,
      apellido_paterno,
      apellido_materno,
      fecha_nacimiento,
      ci,
      lugar_nacimiento,
      genero,
      direccion,
      zona,
      ciudad,
      telefono,
      email,
      foto_url,
      contacto_emergencia,
      tiene_discapacidad,
      tipo_discapacidad,
      observaciones,
      activo
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
    )
    RETURNING *
  `;

  const result = await conn.query(query, [
    usuario_id,
    codigo,
    rude ?? null, // ✅
    nombres,
    apellido_paterno,
    apellido_materno,
    fecha_nacimiento,
    ci,
    lugar_nacimiento,
    genero,
    direccion,
    zona,
    ciudad,
    telefono,
    email,
    foto_url,
    contacto_emergencia,
    tiene_discapacidad ?? false,
    tipo_discapacidad,
    observaciones,
    activo ?? true
  ]);

  return result.rows[0];
}


  // =============================================
  // GENERAR CÓDIGO CON BLOQUEO (PARA TRANSACCIONES)
  // =============================================
  static async generateCodeWithLock(client, year = new Date().getFullYear()) {
    if (!client) {
      throw new Error('Se requiere un client de transacción para generateCodeWithLock');
    }

    // Bloquear la tabla para evitar race conditions
    await client.query('LOCK TABLE estudiante IN SHARE ROW EXCLUSIVE MODE');

    const prefix = `EST-${year}-`;
    
    const query = `
      SELECT codigo FROM estudiante 
      WHERE codigo LIKE $1 
      ORDER BY codigo DESC 
      LIMIT 1
    `;

    const result = await client.query(query, [`${prefix}%`]);

    if (result.rows.length === 0) {
      return `${prefix}0001`;
    }

    const lastCode = result.rows[0].codigo;
    const lastNumber = parseInt(lastCode.split('-')[2]);
    const newNumber = (lastNumber + 1).toString().padStart(4, '0');

    return `${prefix}${newNumber}`;
  }

  // =============================================
  // GENERAR CÓDIGO SIN BLOQUEO (PARA USO FUERA DE TRANSACCIONES)
  // =============================================
  static async generateCode(year = new Date().getFullYear()) {
    const prefix = `EST-${year}-`;
    
    const query = `
      SELECT codigo FROM estudiante 
      WHERE codigo LIKE $1 
      ORDER BY codigo DESC 
      LIMIT 1
    `;

    const result = await pool.query(query, [`${prefix}%`]);

    if (result.rows.length === 0) {
      return `${prefix}0001`;
    }

    const lastCode = result.rows[0].codigo;
    const lastNumber = parseInt(lastCode.split('-')[2]);
    const newNumber = (lastNumber + 1).toString().padStart(4, '0');

    return `${prefix}${newNumber}`;
  }

  // =============================================
  // BUSCAR POR CI
  // =============================================
  static async findByCI(ci, client = null) {
    const conn = client || pool;
    const query = 'SELECT * FROM estudiante WHERE ci = $1 AND deleted_at IS NULL';
    const result = await conn.query(query, [ci]);
    return result.rows[0];
  }

  // =============================================
  // BUSCAR POR CÓDIGO
  // =============================================
  static async findByCode(codigo, client = null) {
    const conn = client || pool;
    const query = 'SELECT * FROM estudiante WHERE codigo = $1 AND deleted_at IS NULL';
    const result = await conn.query(query, [codigo]);
    return result.rows[0];
  }

  // =============================================
  // LISTAR ESTUDIANTES CON FILTROS Y PAGINACIÓN
  // =============================================
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

    const countQuery = `
      SELECT COUNT(DISTINCT e.id)
      FROM estudiante e
      ${joins}
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

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

  // =============================================
  // BUSCAR POR ID CON INFORMACIÓN COMPLETA
  // =============================================
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

  // =============================================
  // ACTUALIZAR ESTUDIANTE
  // =============================================
  static async update(id, data) {
  const {
    rude, // ✅ AÑADIDO
    nombres,
    apellido_paterno,
    apellido_materno,
    fecha_nacimiento,
    ci,
    lugar_nacimiento,
    genero,
    direccion,
    zona,
    ciudad,
    telefono,
    email,
    foto_url,
    contacto_emergencia,
    tiene_discapacidad,
    tipo_discapacidad,
    observaciones,
    activo
  } = data;

  const query = `
    UPDATE estudiante
    SET rude = $1,
        nombres = $2,
        apellido_paterno = $3,
        apellido_materno = $4,
        fecha_nacimiento = $5,
        ci = $6,
        lugar_nacimiento = $7,
        genero = $8,
        direccion = $9,
        zona = $10,
        ciudad = $11,
        telefono = $12,
        email = $13,
        foto_url = $14,
        contacto_emergencia = $15,
        tiene_discapacidad = $16,
        tipo_discapacidad = $17,
        observaciones = $18,
        activo = $19,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $20 AND deleted_at IS NULL
    RETURNING *
  `;

  const result = await pool.query(query, [
    rude ?? null,
    nombres,
    apellido_paterno,
    apellido_materno,
    fecha_nacimiento,
    ci,
    lugar_nacimiento,
    genero,
    direccion,
    zona,
    ciudad,
    telefono,
    email,
    foto_url,
    contacto_emergencia,
    tiene_discapacidad,
    tipo_discapacidad,
    observaciones,
    activo,
    id
  ]);

  return result.rows[0];
}


  // =============================================
  // SOFT DELETE
  // =============================================
  static async softDelete(id) {
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

  // =============================================
  // OBTENER TUTORES DEL ESTUDIANTE
  // =============================================
  static async getTutores(estudiante_id) {
  const query = `
     SELECT
    et.id              AS relacion_id,
    et.es_tutor_principal,
    et.vive_con_estudiante,
    et.autorizado_recoger,
    et.puede_autorizar_salidas,
    et.recibe_notificaciones,
    et.prioridad_contacto,
    et.observaciones   AS relacion_observaciones,
    pf.id,
    pf.nombres,
    pf.apellido_paterno,
    pf.apellido_materno,
    pf.ci,
    pf.telefono,
    pf.celular,
    pf.email,
    pf.parentesco,
    pf.ocupacion,
    pf.direccion,
    pf.fecha_nacimiento,
    pf.estado_civil,
    u.username,
    u.email AS user_email
  FROM estudiante_tutor et
  INNER JOIN padre_familia pf ON et.padre_familia_id = pf.id
  LEFT JOIN usuarios u ON pf.usuario_id = u.id
  WHERE et.estudiante_id = $1 AND pf.deleted_at IS NULL
  ORDER BY et.prioridad_contacto, pf.apellido_paterno
  `;

  const result = await pool.query(query, [estudiante_id]);
  return result.rows;
}
}

// =============================================
// PADRE FAMILIA
// =============================================
class PadreFamilia {
  static async create(data, client = null) {
    const conn = client || pool;

    const {
      usuario_id,
      nombres,
      apellido_paterno,
      apellido_materno,
      ci,
      fecha_nacimiento,
      telefono,
      celular,
      email,
      direccion,
      ocupacion, // ✅ SE QUEDA
      parentesco,
      estado_civil
    } = data;

    const query = `
      INSERT INTO padre_familia (
        usuario_id,
        nombres,
        apellido_paterno,
        apellido_materno,
        ci,
        fecha_nacimiento,
        telefono,
        celular,
        email,
        direccion,
        ocupacion,
        parentesco,
        estado_civil
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `;

    const result = await conn.query(query, [
      usuario_id,
      nombres,
      apellido_paterno,
      apellido_materno,
      ci,
      fecha_nacimiento,
      telefono,
      celular,
      email,
      direccion,
      ocupacion,
      parentesco,
      estado_civil
    ]);

    return result.rows[0];
  }

  static async findByCI(ci, client = null) {
    const conn = client || pool;
    const query = 'SELECT * FROM padre_familia WHERE ci = $1 AND deleted_at IS NULL';
    const result = await conn.query(query, [ci]);
    return result.rows[0];
  }

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

  static async update(id, data) {
  const {
    nombres,
    apellido_paterno,
    apellido_materno,
    ci,
    fecha_nacimiento,
    telefono,
    celular,
    email,
    direccion,
    ocupacion,
    parentesco,
    estado_civil
  } = data;

  const query = `
    UPDATE padre_familia
    SET nombres = $1,
        apellido_paterno = $2,
        apellido_materno = $3,
        ci = $4,
        fecha_nacimiento = $5,
        telefono = $6,
        celular = $7,
        email = $8,
        direccion = $9,
        ocupacion = $10,
        parentesco = $11,
        estado_civil = $12,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $13 AND deleted_at IS NULL
    RETURNING *
  `;

  const result = await pool.query(query, [
    nombres,
    apellido_paterno,
    apellido_materno,
    ci,
    fecha_nacimiento,
    telefono,
    celular,
    email,
    direccion,
    ocupacion,
    parentesco,
    estado_civil,
    id
  ]);

  return result.rows[0];
}


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

// =============================================
// ESTUDIANTE TUTOR
// =============================================
class EstudianteTutor {
  static async assign(data, client = null) {
    const conn = client || pool;
    
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

    const result = await conn.query(query, [
      estudiante_id, padre_familia_id, es_tutor_principal ?? false,
      vive_con_estudiante ?? false, autorizado_recoger ?? true,
      puede_autorizar_salidas ?? true, recibe_notificaciones ?? true,
      prioridad_contacto ?? 1, observaciones
    ]);

    return result.rows[0];
  }

  static async exists(estudiante_id, padre_familia_id) {
    const query = `
      SELECT id FROM estudiante_tutor 
      WHERE estudiante_id = $1 AND padre_familia_id = $2
    `;
    const result = await pool.query(query, [estudiante_id, padre_familia_id]);
    return result.rows[0];
  }

  static async findById(id) {
  const query = 'SELECT * FROM estudiante_tutor WHERE id = $1';
  const result = await pool.query(query, [id]);
  return result.rows[0];
}

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

  static async remove(id) {
    const query = 'DELETE FROM estudiante_tutor WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}


export { Estudiante, PadreFamilia, EstudianteTutor };