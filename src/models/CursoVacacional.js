// models/CursoVacacional.js
import { pool } from '../db/pool.js';

// =============================================
// PERIODO VACACIONAL
// =============================================
class PeriodoVacacional {
  static async create(data) {
    const {
      nombre, codigo, tipo, anio, fecha_inicio, fecha_fin,
      fecha_inicio_inscripciones, fecha_fin_inscripciones,
      activo, permite_inscripciones, descripcion
    } = data;

    const query = `
      INSERT INTO periodo_vacacional (
        nombre, codigo, tipo, anio, fecha_inicio, fecha_fin,
        fecha_inicio_inscripciones, fecha_fin_inscripciones,
        activo, permite_inscripciones, descripcion
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const result = await pool.query(query, [
      nombre, codigo, tipo, anio, fecha_inicio, fecha_fin,
      fecha_inicio_inscripciones, fecha_fin_inscripciones,
      activo ?? true, permite_inscripciones ?? true, descripcion
    ]);

    return result.rows[0];
  }

  static async findAll(filters = {}) {
    const { page = 1, limit = 10, search, tipo, anio, activo } = filters;
    const offset = (page - 1) * limit;

    let whereConditions = ['pv.deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;

    if (search) {
      whereConditions.push(`(
        pv.nombre ILIKE $${paramCounter} OR 
        pv.codigo ILIKE $${paramCounter}
      )`);
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    if (tipo) {
      whereConditions.push(`pv.tipo = $${paramCounter}`);
      queryParams.push(tipo);
      paramCounter++;
    }

    if (anio) {
      whereConditions.push(`pv.anio = $${paramCounter}`);
      queryParams.push(anio);
      paramCounter++;
    }

    if (activo !== undefined) {
      whereConditions.push(`pv.activo = $${paramCounter}`);
      queryParams.push(activo);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*)
      FROM periodo_vacacional pv
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    const dataQuery = `
      SELECT pv.*,
        (SELECT COUNT(*) FROM curso_vacacional cv 
         WHERE cv.periodo_vacacional_id = pv.id AND cv.deleted_at IS NULL) as total_cursos,
        (SELECT COALESCE(SUM(cv.cupos_ocupados), 0) FROM curso_vacacional cv 
         WHERE cv.periodo_vacacional_id = pv.id AND cv.deleted_at IS NULL) as total_inscritos
      FROM periodo_vacacional pv
      WHERE ${whereClause}
      ORDER BY pv.anio DESC, pv.fecha_inicio DESC
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      periodos: result.rows,
      paginacion: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  static async findById(id) {
    const query = `
      SELECT pv.*,
        (SELECT COUNT(*) FROM curso_vacacional cv 
         WHERE cv.periodo_vacacional_id = pv.id AND cv.deleted_at IS NULL) as total_cursos,
        (SELECT COALESCE(SUM(cv.cupos_ocupados), 0) FROM curso_vacacional cv 
         WHERE cv.periodo_vacacional_id = pv.id AND cv.deleted_at IS NULL) as total_inscritos,
        (SELECT COALESCE(SUM(cv.cupos_totales), 0) FROM curso_vacacional cv 
         WHERE cv.periodo_vacacional_id = pv.id AND cv.deleted_at IS NULL) as total_cupos
      FROM periodo_vacacional pv
      WHERE pv.id = $1 AND pv.deleted_at IS NULL
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async update(id, data) {
    const {
      nombre, tipo, anio, fecha_inicio, fecha_fin,
      fecha_inicio_inscripciones, fecha_fin_inscripciones,
      activo, permite_inscripciones, descripcion
    } = data;

    const query = `
      UPDATE periodo_vacacional
      SET nombre = $1, tipo = $2, anio = $3, fecha_inicio = $4,
          fecha_fin = $5, fecha_inicio_inscripciones = $6,
          fecha_fin_inscripciones = $7, activo = $8,
          permite_inscripciones = $9, descripcion = $10,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $11 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [
      nombre, tipo, anio, fecha_inicio, fecha_fin,
      fecha_inicio_inscripciones, fecha_fin_inscripciones,
      activo, permite_inscripciones, descripcion, id
    ]);

    return result.rows[0];
  }

  static async softDelete(id) {
    const query = `
      UPDATE periodo_vacacional
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async getActivo() {
    const query = `
      SELECT * FROM periodo_vacacional
      WHERE activo = true 
        AND permite_inscripciones = true
        AND CURRENT_DATE BETWEEN fecha_inicio_inscripciones AND fecha_fin_inscripciones
        AND deleted_at IS NULL
      ORDER BY fecha_inicio DESC
      LIMIT 1
    `;
    const result = await pool.query(query);
    return result.rows[0];
  }
}

// =============================================
// CURSO VACACIONAL (CON FOTO)
// =============================================
class CursoVacacional {
  static async create(data, client = null) {
    const conn = client || pool;

    const {
      periodo_vacacional_id, materia_id, grado_id, nombre, codigo,
      descripcion, fecha_inicio, fecha_fin, dias_semana, hora_inicio,
      hora_fin, cupos_totales, costo, aula, requisitos, activo,
      foto_url, foto_public_id
    } = data;

    const query = `
      INSERT INTO curso_vacacional (
        periodo_vacacional_id, materia_id, grado_id, nombre, codigo,
        descripcion, fecha_inicio, fecha_fin, dias_semana, hora_inicio,
        hora_fin, cupos_totales, cupos_ocupados, costo, aula, requisitos, 
        activo, foto_url, foto_public_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `;

    const result = await conn.query(query, [
      periodo_vacacional_id, materia_id, grado_id, nombre, codigo,
      descripcion, fecha_inicio, fecha_fin, dias_semana, hora_inicio,
      hora_fin, cupos_totales, 0, costo, aula, requisitos, activo ?? true,
      foto_url || null, foto_public_id || null
    ]);

    return result.rows[0];
  }

  static async findAll(filters = {}) {
    const { 
      page = 1, limit = 10, search, periodo_vacacional_id, 
      grado_id, activo, con_cupos 
    } = filters;
    const offset = (page - 1) * limit;

    let whereConditions = ['cv.deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;

    if (search) {
      whereConditions.push(`(
        cv.nombre ILIKE $${paramCounter} OR 
        cv.codigo ILIKE $${paramCounter}
      )`);
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    if (periodo_vacacional_id) {
      whereConditions.push(`cv.periodo_vacacional_id = $${paramCounter}`);
      queryParams.push(periodo_vacacional_id);
      paramCounter++;
    }

    if (grado_id) {
      whereConditions.push(`cv.grado_id = $${paramCounter}`);
      queryParams.push(grado_id);
      paramCounter++;
    }

    if (activo !== undefined) {
      whereConditions.push(`cv.activo = $${paramCounter}`);
      queryParams.push(activo);
      paramCounter++;
    }

    if (con_cupos === true || con_cupos === 'true') {
      whereConditions.push(`cv.cupos_disponibles > 0`);
    }

    const whereClause = whereConditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*)
      FROM curso_vacacional cv
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    const dataQuery = `
      SELECT cv.*,
        pv.nombre as periodo_nombre,
        pv.tipo as periodo_tipo,
        g.nombre as grado_nombre,
        m.nombre as materia_nombre
      FROM curso_vacacional cv
      INNER JOIN periodo_vacacional pv ON cv.periodo_vacacional_id = pv.id
      LEFT JOIN grado g ON cv.grado_id = g.id
      LEFT JOIN materia m ON cv.materia_id = m.id
      WHERE ${whereClause}
      ORDER BY cv.fecha_inicio ASC, cv.nombre ASC
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      cursos: result.rows,
      paginacion: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  static async findById(id) {
    const query = `
      SELECT cv.*,
        pv.nombre as periodo_nombre,
        pv.tipo as periodo_tipo,
        pv.fecha_inicio as periodo_fecha_inicio,
        pv.fecha_fin as periodo_fecha_fin,
        g.nombre as grado_nombre,
        m.nombre as materia_nombre,
        (SELECT COUNT(*) FROM inscripcion_vacacional iv 
         WHERE iv.curso_vacacional_id = cv.id AND iv.deleted_at IS NULL) as total_inscripciones
      FROM curso_vacacional cv
      INNER JOIN periodo_vacacional pv ON cv.periodo_vacacional_id = pv.id
      LEFT JOIN grado g ON cv.grado_id = g.id
      LEFT JOIN materia m ON cv.materia_id = m.id
      WHERE cv.id = $1 AND cv.deleted_at IS NULL
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async update(id, data) {
    const {
      nombre, descripcion, fecha_inicio, fecha_fin, dias_semana,
      hora_inicio, hora_fin, cupos_totales, costo, aula, requisitos, activo,
      foto_url, foto_public_id
    } = data;

    const query = `
      UPDATE curso_vacacional
      SET nombre = $1, descripcion = $2, fecha_inicio = $3,
          fecha_fin = $4, dias_semana = $5, hora_inicio = $6,
          hora_fin = $7, cupos_totales = $8, costo = $9,
          aula = $10, requisitos = $11, activo = $12,
          foto_url = COALESCE($13, foto_url),
          foto_public_id = COALESCE($14, foto_public_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $15 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [
      nombre, descripcion, fecha_inicio, fecha_fin, dias_semana,
      hora_inicio, hora_fin, cupos_totales, costo, aula, requisitos,
      activo, foto_url, foto_public_id, id
    ]);

    return result.rows[0];
  }

  static async updateFoto(id, foto_url, foto_public_id) {
    const query = `
      UPDATE curso_vacacional
      SET foto_url = $1, foto_public_id = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING *
    `;
    const result = await pool.query(query, [foto_url, foto_public_id, id]);
    return result.rows[0];
  }

  static async deleteFoto(id) {
    const query = `
      UPDATE curso_vacacional
      SET foto_url = NULL, foto_public_id = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async softDelete(id) {
    const checkQuery = `
      SELECT COUNT(*) FROM inscripcion_vacacional 
      WHERE curso_vacacional_id = $1 
        AND estado IN ('pago_verificado', 'activo') 
        AND deleted_at IS NULL
    `;
    const checkResult = await pool.query(checkQuery, [id]);

    if (parseInt(checkResult.rows[0].count) > 0) {
      throw new Error('No se puede eliminar un curso con inscripciones activas');
    }

    const query = `
      UPDATE curso_vacacional
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, foto_public_id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async incrementarCupo(id, client = null) {
    const conn = client || pool;
    const query = `
      UPDATE curso_vacacional
      SET cupos_ocupados = cupos_ocupados + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    const result = await conn.query(query, [id]);
    return result.rows[0];
  }

  static async decrementarCupo(id, client = null) {
    const conn = client || pool;
    const query = `
      UPDATE curso_vacacional
      SET cupos_ocupados = GREATEST(cupos_ocupados - 1, 0),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    const result = await conn.query(query, [id]);
    return result.rows[0];
  }

  static async checkDisponibilidad(id) {
    const query = `
      SELECT cupos_totales, cupos_ocupados, cupos_disponibles
      FROM curso_vacacional
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const result = await pool.query(query, [id]);
    const curso = result.rows[0];

    return {
      cupos_totales: curso.cupos_totales,
      cupos_ocupados: curso.cupos_ocupados,
      cupos_disponibles: curso.cupos_disponibles,
      disponible: curso.cupos_disponibles > 0
    };
  }
}

// =============================================
// INSCRIPCION VACACIONAL
// =============================================
class InscripcionVacacional {
  static async create(data, client = null) {
    const conn = client || pool;

    const {
      codigo_inscripcion, curso_vacacional_id, nombres, apellido_paterno,
      apellido_materno, fecha_nacimiento, ci, genero, telefono, email,
      nombre_tutor, telefono_tutor, email_tutor, parentesco_tutor,
      monto_pagado, numero_comprobante, fecha_pago, comprobante_pago_url,
      estado, observaciones
    } = data;

    const query = `
      INSERT INTO inscripcion_vacacional (
        codigo_inscripcion, curso_vacacional_id, nombres, apellido_paterno,
        apellido_materno, fecha_nacimiento, ci, genero, telefono, email,
        nombre_tutor, telefono_tutor, email_tutor, parentesco_tutor,
        monto_pagado, numero_comprobante, fecha_pago, comprobante_pago_url,
        estado, observaciones
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `;

    const result = await conn.query(query, [
      codigo_inscripcion, curso_vacacional_id, nombres, apellido_paterno,
      apellido_materno, fecha_nacimiento, ci, genero, telefono, email,
      nombre_tutor, telefono_tutor, email_tutor, parentesco_tutor,
      monto_pagado, numero_comprobante, fecha_pago, comprobante_pago_url,
      estado || 'pendiente', observaciones
    ]);

    return result.rows[0];
  }

  static async generateCodigoInscripcion(curso_id, client = null) {
    const conn = client || pool;

    if (client) {
      await client.query('LOCK TABLE inscripcion_vacacional IN SHARE ROW EXCLUSIVE MODE');
    }

    const query = `
      SELECT codigo_inscripcion 
      FROM inscripcion_vacacional 
      WHERE curso_vacacional_id = $1 
        AND codigo_inscripcion IS NOT NULL
      ORDER BY codigo_inscripcion DESC 
      LIMIT 1
    `;

    const result = await conn.query(query, [curso_id]);

    if (result.rows.length === 0) {
      return `INS-VAC-${curso_id}-0001`;
    }

    const lastCodigo = result.rows[0].codigo_inscripcion;
    const parts = lastCodigo.split('-');
    const lastNum = parseInt(parts[parts.length - 1]);
    const newNum = (lastNum + 1).toString().padStart(4, '0');

    return `INS-VAC-${curso_id}-${newNum}`;
  }

  static async findAll(filters = {}) {
    const { 
      page = 1, limit = 10, search, curso_vacacional_id, 
      periodo_vacacional_id, estado, pago_verificado 
    } = filters;
    const offset = (page - 1) * limit;

    let whereConditions = ['iv.deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;

    if (search) {
      whereConditions.push(`(
        iv.nombres ILIKE $${paramCounter} OR 
        iv.apellido_paterno ILIKE $${paramCounter} OR 
        iv.apellido_materno ILIKE $${paramCounter} OR
        iv.ci ILIKE $${paramCounter} OR
        iv.codigo_inscripcion ILIKE $${paramCounter} OR
        iv.telefono_tutor ILIKE $${paramCounter}
      )`);
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    if (curso_vacacional_id) {
      whereConditions.push(`iv.curso_vacacional_id = $${paramCounter}`);
      queryParams.push(curso_vacacional_id);
      paramCounter++;
    }

    if (periodo_vacacional_id) {
      whereConditions.push(`cv.periodo_vacacional_id = $${paramCounter}`);
      queryParams.push(periodo_vacacional_id);
      paramCounter++;
    }

    if (estado) {
      whereConditions.push(`iv.estado = $${paramCounter}`);
      queryParams.push(estado);
      paramCounter++;
    }

    if (pago_verificado !== undefined) {
      whereConditions.push(`iv.pago_verificado = $${paramCounter}`);
      queryParams.push(pago_verificado);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*)
      FROM inscripcion_vacacional iv
      INNER JOIN curso_vacacional cv ON iv.curso_vacacional_id = cv.id
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    const dataQuery = `
      SELECT iv.*,
        cv.nombre as curso_nombre,
        cv.codigo as curso_codigo,
        cv.costo as curso_costo,
        pv.nombre as periodo_nombre,
        pv.tipo as periodo_tipo
      FROM inscripcion_vacacional iv
      INNER JOIN curso_vacacional cv ON iv.curso_vacacional_id = cv.id
      INNER JOIN periodo_vacacional pv ON cv.periodo_vacacional_id = pv.id
      WHERE ${whereClause}
      ORDER BY iv.created_at DESC
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      inscripciones: result.rows,
      paginacion: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  static async findById(id) {
    const query = `
      SELECT iv.*,
        cv.nombre as curso_nombre,
        cv.codigo as curso_codigo,
        cv.costo as curso_costo,
        cv.fecha_inicio as curso_fecha_inicio,
        cv.fecha_fin as curso_fecha_fin,
        cv.dias_semana as curso_dias_semana,
        cv.hora_inicio as curso_hora_inicio,
        cv.hora_fin as curso_hora_fin,
        pv.nombre as periodo_nombre,
        pv.tipo as periodo_tipo,
        u.username as verificado_por_username
      FROM inscripcion_vacacional iv
      INNER JOIN curso_vacacional cv ON iv.curso_vacacional_id = cv.id
      INNER JOIN periodo_vacacional pv ON cv.periodo_vacacional_id = pv.id
      LEFT JOIN usuarios u ON iv.verificado_por = u.id
      WHERE iv.id = $1 AND iv.deleted_at IS NULL
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async update(id, data) {
    const {
      nombres, apellido_paterno, apellido_materno, fecha_nacimiento,
      ci, genero, telefono, email, nombre_tutor, telefono_tutor,
      email_tutor, parentesco_tutor, observaciones
    } = data;

    const query = `
      UPDATE inscripcion_vacacional
      SET nombres = $1, apellido_paterno = $2, apellido_materno = $3,
          fecha_nacimiento = $4, ci = $5, genero = $6, telefono = $7,
          email = $8, nombre_tutor = $9, telefono_tutor = $10,
          email_tutor = $11, parentesco_tutor = $12, observaciones = $13,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $14 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [
      nombres, apellido_paterno, apellido_materno, fecha_nacimiento,
      ci, genero, telefono, email, nombre_tutor, telefono_tutor,
      email_tutor, parentesco_tutor, observaciones, id
    ]);

    return result.rows[0];
  }

  static async changeStatus(id, estado, motivo_rechazo = null) {
    const query = `
      UPDATE inscripcion_vacacional
      SET estado = $1, motivo_rechazo = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [estado, motivo_rechazo, id]);
    return result.rows[0];
  }

  static async verificarPago(id, verificado_por) {
    const query = `
      UPDATE inscripcion_vacacional
      SET pago_verificado = true,
          verificado_por = $1,
          fecha_verificacion = CURRENT_TIMESTAMP,
          estado = 'pago_verificado',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [verificado_por, id]);
    return result.rows[0];
  }

  static async softDelete(id) {
    const query = `
      UPDATE inscripcion_vacacional
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async getEstadisticas(periodo_vacacional_id) {
    const query = `
      SELECT 
        COUNT(*) as total_inscripciones,
        COUNT(CASE WHEN iv.estado = 'pendiente' THEN 1 END) as pendientes,
        COUNT(CASE WHEN iv.estado = 'pago_verificado' THEN 1 END) as verificadas,
        COUNT(CASE WHEN iv.estado = 'activo' THEN 1 END) as activas,
        COUNT(CASE WHEN iv.estado = 'completado' THEN 1 END) as completadas,
        COUNT(CASE WHEN iv.estado = 'retirado' THEN 1 END) as retiradas,
        COALESCE(SUM(iv.monto_pagado), 0) as total_ingresos
      FROM inscripcion_vacacional iv
      INNER JOIN curso_vacacional cv ON iv.curso_vacacional_id = cv.id
      WHERE cv.periodo_vacacional_id = $1 AND iv.deleted_at IS NULL
    `;

    const result = await pool.query(query, [periodo_vacacional_id]);
    return result.rows[0];
  }

  static async findByCurso(curso_vacacional_id, estado = null) {
    let query = `
      SELECT iv.*
      FROM inscripcion_vacacional iv
      WHERE iv.curso_vacacional_id = $1 AND iv.deleted_at IS NULL
    `;

    const params = [curso_vacacional_id];

    if (estado) {
      query += ` AND iv.estado = $2`;
      params.push(estado);
    }

    query += ` ORDER BY iv.apellido_paterno, iv.apellido_materno, iv.nombres`;

    const result = await pool.query(query, params);
    return result.rows;
  }
}

export { PeriodoVacacional, CursoVacacional, InscripcionVacacional };