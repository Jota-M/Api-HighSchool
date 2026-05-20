// models/RutaTransporte.js
import { pool } from '../db/pool.js';

class RutaTransporte {
  // Crear ruta
  static async create(data) {
    const {
      codigo, nombre, descripcion, zona_cobertura, punto_inicio, punto_fin,
      horario_ida, horario_retorno, capacidad_maxima, costo_mensual,
      conductor_responsable, telefono_conductor, placa_vehiculo,
      modelo_vehiculo, anio_vehiculo, color, observaciones
    } = data;

    const query = `
      INSERT INTO ruta_transporte (
        codigo, nombre, descripcion, zona_cobertura, punto_inicio, punto_fin,
        horario_ida, horario_retorno, capacidad_maxima, costo_mensual,
        conductor_responsable, telefono_conductor, placa_vehiculo,
        modelo_vehiculo, anio_vehiculo, color, observaciones, activo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, true)
      RETURNING *
    `;

    const result = await pool.query(query, [
      codigo, nombre, descripcion, zona_cobertura, punto_inicio, punto_fin,
      horario_ida, horario_retorno, capacidad_maxima || 40, costo_mensual,
      conductor_responsable, telefono_conductor, placa_vehiculo,
      modelo_vehiculo, anio_vehiculo, color, observaciones
    ]);

    return result.rows[0];
  }

  // Listar rutas con filtros
  static async findAll(filters = {}) {
    const { page = 1, limit = 10, search, activo } = filters;
    const offset = (page - 1) * limit;

    let whereConditions = ['r.deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;

    if (search) {
      whereConditions.push(`(
        r.nombre ILIKE $${paramCounter} OR 
        r.codigo ILIKE $${paramCounter} OR 
        r.zona_cobertura ILIKE $${paramCounter} OR
        r.conductor_responsable ILIKE $${paramCounter} OR
        r.placa_vehiculo ILIKE $${paramCounter}
      )`);
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    if (activo !== undefined) {
      whereConditions.push(`r.activo = $${paramCounter}`);
      queryParams.push(activo);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Contar total
    const countQuery = `
      SELECT COUNT(*) FROM ruta_transporte r WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Obtener datos con paradas
    const dataQuery = `
      SELECT r.*,
        COUNT(DISTINCT pr.id) as cantidad_paradas,
        ROUND((r.cupos_ocupados::NUMERIC / r.capacidad_maxima * 100), 1) as porcentaje_ocupacion
      FROM ruta_transporte r
      LEFT JOIN parada_ruta pr ON r.id = pr.ruta_id AND pr.activo = true
      WHERE ${whereClause}
      GROUP BY r.id
      ORDER BY r.nombre
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      rutas: result.rows,
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
      SELECT r.*,
        COUNT(DISTINCT pr.id) as cantidad_paradas,
        COUNT(DISTINCT at.id) FILTER (WHERE at.activo = true) as estudiantes_asignados,
        ROUND((r.cupos_ocupados::NUMERIC / r.capacidad_maxima * 100), 1) as porcentaje_ocupacion
      FROM ruta_transporte r
      LEFT JOIN parada_ruta pr ON r.id = pr.ruta_id AND pr.activo = true
      LEFT JOIN asignacion_transporte at ON r.id = at.ruta_id AND at.activo = true
      WHERE r.id = $1 AND r.deleted_at IS NULL
      GROUP BY r.id
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Actualizar ruta
  static async update(id, data) {
    const {
      nombre, descripcion, zona_cobertura, punto_inicio, punto_fin,
      horario_ida, horario_retorno, capacidad_maxima, costo_mensual,
      conductor_responsable, telefono_conductor, placa_vehiculo,
      modelo_vehiculo, anio_vehiculo, color, activo, observaciones
    } = data;

    const query = `
      UPDATE ruta_transporte
      SET nombre = $1, descripcion = $2, zona_cobertura = $3, 
          punto_inicio = $4, punto_fin = $5, horario_ida = $6,
          horario_retorno = $7, capacidad_maxima = $8, costo_mensual = $9,
          conductor_responsable = $10, telefono_conductor = $11,
          placa_vehiculo = $12, modelo_vehiculo = $13, anio_vehiculo = $14,
          color = $15, activo = $16, observaciones = $17,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $18 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [
      nombre, descripcion, zona_cobertura, punto_inicio, punto_fin,
      horario_ida, horario_retorno, capacidad_maxima, costo_mensual,
      conductor_responsable, telefono_conductor, placa_vehiculo,
      modelo_vehiculo, anio_vehiculo, color, activo, observaciones, id
    ]);

    return result.rows[0];
  }

  // Verificar si existe por código
  static async existsByCodigo(codigo, excludeId = null) {
    let query = 'SELECT id FROM ruta_transporte WHERE codigo = $1 AND deleted_at IS NULL';
    const params = [codigo];

    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }

    const result = await pool.query(query, params);
    return result.rows[0];
  }

  // Soft delete
  static async softDelete(id) {
    const query = `
      UPDATE ruta_transporte
      SET deleted_at = CURRENT_TIMESTAMP, activo = false
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Obtener estadísticas
  static async getEstadisticas() {
    const query = `
      SELECT 
        COUNT(*) as total_rutas,
        COUNT(CASE WHEN activo = true THEN 1 END) as rutas_activas,
        SUM(capacidad_maxima) as capacidad_total,
        SUM(cupos_ocupados) as cupos_ocupados_total,
        SUM(cupos_disponibles) as cupos_disponibles_total,
        ROUND(AVG(cupos_ocupados::NUMERIC / capacidad_maxima * 100), 1) as ocupacion_promedio
      FROM ruta_transporte
      WHERE deleted_at IS NULL
    `;

    const result = await pool.query(query);
    return result.rows[0];
  }
}

// =============================================
// PARADA RUTA
// =============================================
class ParadaRuta {
  // Crear parada
  static async create(data) {
    const {
      ruta_id, nombre, direccion, referencia, latitud, longitud,
      orden, hora_estimada_ida, hora_estimada_retorno
    } = data;

    const query = `
      INSERT INTO parada_ruta (
        ruta_id, nombre, direccion, referencia, latitud, longitud,
        orden, hora_estimada_ida, hora_estimada_retorno, activo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
      RETURNING *
    `;

    const result = await pool.query(query, [
      ruta_id, nombre, direccion, referencia, latitud, longitud,
      orden, hora_estimada_ida, hora_estimada_retorno
    ]);

    return result.rows[0];
  }

  // Listar paradas de una ruta
  static async findByRuta(ruta_id) {
    const query = `
      SELECT pr.*,
        COUNT(DISTINCT at.id) FILTER (WHERE at.activo = true) as estudiantes_en_parada
      FROM parada_ruta pr
      LEFT JOIN asignacion_transporte at ON pr.id = at.parada_id AND at.activo = true
      WHERE pr.ruta_id = $1 AND pr.activo = true
      GROUP BY pr.id
      ORDER BY pr.orden
    `;

    const result = await pool.query(query, [ruta_id]);
    return result.rows;
  }

  // Buscar por ID
  static async findById(id) {
    const query = 'SELECT * FROM parada_ruta WHERE id = $1 AND activo = true';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Actualizar parada
  static async update(id, data) {
    const {
      nombre, direccion, referencia, latitud, longitud,
      orden, hora_estimada_ida, hora_estimada_retorno, activo
    } = data;

    const query = `
      UPDATE parada_ruta
      SET nombre = $1, direccion = $2, referencia = $3,
          latitud = $4, longitud = $5, orden = $6,
          hora_estimada_ida = $7, hora_estimada_retorno = $8, activo = $9
      WHERE id = $10
      RETURNING *
    `;

    const result = await pool.query(query, [
      nombre, direccion, referencia, latitud, longitud, orden,
      hora_estimada_ida, hora_estimada_retorno, activo, id
    ]);

    return result.rows[0];
  }

  // Eliminar parada
  static async delete(id) {
    // Verificar si hay estudiantes asignados
    const checkQuery = `
      SELECT COUNT(*) as count
      FROM asignacion_transporte
      WHERE parada_id = $1 AND activo = true
    `;
    const checkResult = await pool.query(checkQuery, [id]);

    if (parseInt(checkResult.rows[0].count) > 0) {
      throw new Error('No se puede eliminar la parada porque hay estudiantes asignados');
    }

    const query = 'UPDATE parada_ruta SET activo = false WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Reordenar paradas
  static async reordenar(ruta_id, nuevosOrdenes) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const { id, orden } of nuevosOrdenes) {
        await client.query(
          'UPDATE parada_ruta SET orden = $1 WHERE id = $2 AND ruta_id = $3',
          [orden, id, ruta_id]
        );
      }

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export { RutaTransporte, ParadaRuta };