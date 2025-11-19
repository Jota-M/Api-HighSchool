// models/PeriodoAcademico.js
import { pool } from '../db/pool.js';

class PeriodoAcademico {
  // Crear periodo académico
  static async create(data) {
    const { nombre, codigo, fecha_inicio, fecha_fin, activo, permite_inscripciones, permite_calificaciones, observaciones } = data;
    
    const query = `
      INSERT INTO periodo_academico 
      (nombre, codigo, fecha_inicio, fecha_fin, activo, permite_inscripciones, permite_calificaciones, observaciones)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      nombre, codigo, fecha_inicio, fecha_fin, 
      activo ?? true, 
      permite_inscripciones ?? true, 
      permite_calificaciones ?? true, 
      observaciones
    ]);
    
    return result.rows[0];
  }

  // Listar periodos con paginación y filtros
  static async findAll(filters = {}) {
    const { page = 1, limit = 10, search, activo, cerrado } = filters;
    const offset = (page - 1) * limit;

    let whereConditions = ['deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;

    if (search) {
      whereConditions.push(`(nombre ILIKE $${paramCounter} OR codigo ILIKE $${paramCounter})`);
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    if (activo !== undefined) {
      whereConditions.push(`activo = $${paramCounter}`);
      queryParams.push(activo);
      paramCounter++;
    }

    if (cerrado !== undefined) {
      whereConditions.push(`cerrado = $${paramCounter}`);
      queryParams.push(cerrado);
      paramCounter++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Query para contar total
    const countQuery = `SELECT COUNT(*) FROM periodo_academico ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Query para obtener datos paginados
    const dataQuery = `
      SELECT * FROM periodo_academico 
      ${whereClause}
      ORDER BY fecha_inicio DESC
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

  // Buscar por ID
  static async findById(id) {
    const query = 'SELECT * FROM periodo_academico WHERE id = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Actualizar periodo
  static async update(id, data) {
    const { nombre, codigo, fecha_inicio, fecha_fin, activo, permite_inscripciones, permite_calificaciones, observaciones } = data;
    
    const query = `
      UPDATE periodo_academico 
      SET nombre = $1, codigo = $2, fecha_inicio = $3, fecha_fin = $4,
          activo = $5, permite_inscripciones = $6, permite_calificaciones = $7,
          observaciones = $8, updated_at = CURRENT_TIMESTAMP
      WHERE id = $9 AND deleted_at IS NULL
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      nombre, codigo, fecha_inicio, fecha_fin, 
      activo, permite_inscripciones, permite_calificaciones, 
      observaciones, id
    ]);
    
    return result.rows[0];
  }

  // Soft delete
  static async softDelete(id) {
    const query = `
      UPDATE periodo_academico 
      SET deleted_at = CURRENT_TIMESTAMP 
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Cerrar periodo
  static async cerrar(id) {
    const query = `
      UPDATE periodo_academico 
      SET cerrado = true, activo = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Obtener periodo activo
  static async getActivo() {
    const query = 'SELECT * FROM periodo_academico WHERE activo = true AND deleted_at IS NULL ORDER BY fecha_inicio DESC LIMIT 1';
    const result = await pool.query(query);
    return result.rows[0];
  }

  // Verificar solapamiento de fechas
  static async checkOverlap(fecha_inicio, fecha_fin, excludeId = null) {
    let query = `
      SELECT id, nombre FROM periodo_academico 
      WHERE deleted_at IS NULL
        AND (
          (fecha_inicio <= $1 AND fecha_fin >= $1) OR
          (fecha_inicio <= $2 AND fecha_fin >= $2) OR
          (fecha_inicio >= $1 AND fecha_fin <= $2)
        )
    `;
    const params = [fecha_inicio, fecha_fin];

    if (excludeId) {
      query += ' AND id != $3';
      params.push(excludeId);
    }

    const result = await pool.query(query, params);
    return result.rows;
  }
  static async activar(id) {
  // Desactivar todos
  await pool.query('UPDATE periodo_academico SET activo = false');

  // Activar uno
  const result = await pool.query(
    `UPDATE periodo_academico 
     SET activo = true, cerrado = false, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );

  return result.rows[0];
}

}

// models/Turno.js
class Turno {
  static async create(data) {
    const { nombre, codigo, hora_inicio, hora_fin, activo, color } = data;
    
    const query = `
      INSERT INTO turno (nombre, codigo, hora_inicio, hora_fin, activo, color)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const result = await pool.query(query, [nombre, codigo, hora_inicio, hora_fin, activo ?? true, color]);
    return result.rows[0];
  }

  static async findAll(filters = {}) {
    const { activo } = filters;
    
    let whereConditions = ['deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;

    if (activo !== undefined) {
      whereConditions.push(`activo = $${paramCounter}`);
      queryParams.push(activo);
      paramCounter++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `SELECT * FROM turno ${whereClause} ORDER BY hora_inicio`;
    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  static async findById(id) {
    const query = 'SELECT * FROM turno WHERE id = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async update(id, data) {
    const { nombre, codigo, hora_inicio, hora_fin, activo, color } = data;
    
    const query = `
      UPDATE turno 
      SET nombre = $1, codigo = $2, hora_inicio = $3, hora_fin = $4, 
          activo = $5, color = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7 AND deleted_at IS NULL
      RETURNING *
    `;
    
    const result = await pool.query(query, [nombre, codigo, hora_inicio, hora_fin, activo, color, id]);
    return result.rows[0];
  }

  static async softDelete(id) {
    const query = `
      UPDATE turno 
      SET deleted_at = CURRENT_TIMESTAMP 
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

// models/NivelAcademico.js
class NivelAcademico {
  static async create(data) {
    const { nombre, codigo, descripcion, orden, edad_minima, edad_maxima, activo, color, icono } = data;
    
    const query = `
      INSERT INTO nivel_academico 
      (nombre, codigo, descripcion, orden, edad_minima, edad_maxima, activo, color, icono)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      nombre, codigo, descripcion, orden, edad_minima, edad_maxima, 
      activo ?? true, color, icono
    ]);
    
    return result.rows[0];
  }

  static async findAll(filters = {}) {
    const { activo } = filters;
    
    let whereConditions = ['deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;

    if (activo !== undefined) {
      whereConditions.push(`activo = $${paramCounter}`);
      queryParams.push(activo);
      paramCounter++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT n.*, 
        (SELECT COUNT(*) FROM grado g WHERE g.nivel_academico_id = n.id AND g.deleted_at IS NULL) as total_grados
      FROM nivel_academico n
      ${whereClause}
      ORDER BY orden
    `;
    
    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  static async findById(id) {
    const query = 'SELECT * FROM nivel_academico WHERE id = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async update(id, data) {
    const { nombre, codigo, descripcion, orden, edad_minima, edad_maxima, activo, color, icono } = data;
    
    const query = `
      UPDATE nivel_academico 
      SET nombre = $1, codigo = $2, descripcion = $3, orden = $4,
          edad_minima = $5, edad_maxima = $6, activo = $7, color = $8, icono = $9,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $10 AND deleted_at IS NULL
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      nombre, codigo, descripcion, orden, edad_minima, edad_maxima, 
      activo, color, icono, id
    ]);
    
    return result.rows[0];
  }

  static async softDelete(id) {
    // Verificar que no tenga grados asociados
    const checkQuery = 'SELECT COUNT(*) FROM grado WHERE nivel_academico_id = $1 AND deleted_at IS NULL';
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (parseInt(checkResult.rows[0].count) > 0) {
      throw new Error('No se puede eliminar un nivel académico con grados asociados');
    }

    const query = `
      UPDATE nivel_academico 
      SET deleted_at = CURRENT_TIMESTAMP 
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

// models/Grado.js
class Grado {
  static async create(data) {
    const { nivel_academico_id, nombre, codigo, descripcion, orden, activo } = data;
    
    const query = `
      INSERT INTO grado (nivel_academico_id, nombre, codigo, descripcion, orden, activo)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      nivel_academico_id, nombre, codigo, descripcion, orden, activo ?? true
    ]);
    
    return result.rows[0];
  }

  static async findAll(filters = {}) {
    const { nivel_academico_id, activo } = filters;
    
    let whereConditions = ['g.deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;

    if (nivel_academico_id) {
      whereConditions.push(`g.nivel_academico_id = $${paramCounter}`);
      queryParams.push(nivel_academico_id);
      paramCounter++;
    }

    if (activo !== undefined) {
      whereConditions.push(`g.activo = $${paramCounter}`);
      queryParams.push(activo);
      paramCounter++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT g.*, 
        n.nombre as nivel_nombre,
        n.codigo as nivel_codigo,
        (SELECT COUNT(*) FROM paralelo p WHERE p.grado_id = g.id AND p.deleted_at IS NULL) as total_paralelos
      FROM grado g
      INNER JOIN nivel_academico n ON g.nivel_academico_id = n.id
      ${whereClause}
      ORDER BY n.orden, g.orden
    `;
    
    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  static async findById(id) {
    const query = `
      SELECT g.*, 
        n.nombre as nivel_nombre,
        n.codigo as nivel_codigo
      FROM grado g
      INNER JOIN nivel_academico n ON g.nivel_academico_id = n.id
      WHERE g.id = $1 AND g.deleted_at IS NULL
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async update(id, data) {
    const { nivel_academico_id, nombre, codigo, descripcion, orden, activo } = data;
    
    const query = `
      UPDATE grado 
      SET nivel_academico_id = $1, nombre = $2, codigo = $3, descripcion = $4, 
          orden = $5, activo = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7 AND deleted_at IS NULL
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      nivel_academico_id, nombre, codigo, descripcion, orden, activo, id
    ]);
    
    return result.rows[0];
  }

  static async softDelete(id) {
    // Verificar que no tenga paralelos asociados
    const checkQuery = 'SELECT COUNT(*) FROM paralelo WHERE grado_id = $1 AND deleted_at IS NULL';
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (parseInt(checkResult.rows[0].count) > 0) {
      throw new Error('No se puede eliminar un grado con paralelos asociados');
    }

    const query = `
      UPDATE grado 
      SET deleted_at = CURRENT_TIMESTAMP 
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

// models/Paralelo.js
class Paralelo {
  static async create(data) {
    const { grado_id, turno_id, nombre, capacidad_maxima, capacidad_minima, anio, aula, activo } = data;
    
    const query = `
      INSERT INTO paralelo 
      (grado_id, turno_id, nombre, capacidad_maxima, capacidad_minima, anio, aula, activo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      grado_id, turno_id, nombre, 
      capacidad_maxima ?? 30, 
      capacidad_minima ?? 15, 
      anio, aula, activo ?? true
    ]);
    
    return result.rows[0];
  }

  static async findAll(filters = {}) {
    const { grado_id, turno_id, anio, activo } = filters;
    
    let whereConditions = ['p.deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;

    if (grado_id) {
      whereConditions.push(`p.grado_id = $${paramCounter}`);
      queryParams.push(grado_id);
      paramCounter++;
    }

    if (turno_id) {
      whereConditions.push(`p.turno_id = $${paramCounter}`);
      queryParams.push(turno_id);
      paramCounter++;
    }

    if (anio) {
      whereConditions.push(`p.anio = $${paramCounter}`);
      queryParams.push(anio);
      paramCounter++;
    }

    if (activo !== undefined) {
      whereConditions.push(`p.activo = $${paramCounter}`);
      queryParams.push(activo);
      paramCounter++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT p.*, 
        g.nombre as grado_nombre,
        g.codigo as grado_codigo,
        n.nombre as nivel_nombre,
        t.nombre as turno_nombre,
        t.codigo as turno_codigo,
        (SELECT COUNT(*) FROM matricula m WHERE m.paralelo_id = p.id AND m.deleted_at IS NULL) as total_estudiantes
      FROM paralelo p
      INNER JOIN grado g ON p.grado_id = g.id
      INNER JOIN nivel_academico n ON g.nivel_academico_id = n.id
      INNER JOIN turno t ON p.turno_id = t.id
      ${whereClause}
      ORDER BY n.orden, g.orden, p.nombre
    `;
    
    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  static async findById(id) {
    const query = `
      SELECT p.*, 
        g.nombre as grado_nombre,
        g.codigo as grado_codigo,
        n.nombre as nivel_nombre,
        t.nombre as turno_nombre,
        t.codigo as turno_codigo,
        (SELECT COUNT(*) FROM matricula m WHERE m.paralelo_id = p.id AND m.deleted_at IS NULL) as total_estudiantes
      FROM paralelo p
      INNER JOIN grado g ON p.grado_id = g.id
      INNER JOIN nivel_academico n ON g.nivel_academico_id = n.id
      INNER JOIN turno t ON p.turno_id = t.id
      WHERE p.id = $1 AND p.deleted_at IS NULL
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async update(id, data) {
    const { grado_id, turno_id, nombre, capacidad_maxima, capacidad_minima, anio, aula, activo } = data;
    
    const query = `
      UPDATE paralelo 
      SET grado_id = $1, turno_id = $2, nombre = $3, capacidad_maxima = $4,
          capacidad_minima = $5, anio = $6, aula = $7, activo = $8,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $9 AND deleted_at IS NULL
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      grado_id, turno_id, nombre, capacidad_maxima, capacidad_minima, 
      anio, aula, activo, id
    ]);
    
    return result.rows[0];
  }

  static async softDelete(id) {
    // Verificar que no tenga estudiantes matriculados
    const checkQuery = 'SELECT COUNT(*) FROM matricula WHERE paralelo_id = $1 AND deleted_at IS NULL AND estado = \'activo\'';
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (parseInt(checkResult.rows[0].count) > 0) {
      throw new Error('No se puede eliminar un paralelo con estudiantes activos');
    }

    const query = `
      UPDATE paralelo 
      SET deleted_at = CURRENT_TIMESTAMP 
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

export { PeriodoAcademico, Turno, NivelAcademico, Grado, Paralelo };