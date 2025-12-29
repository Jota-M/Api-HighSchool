// models/CupoPreinscripcion.js
import { pool } from '../db/pool.js';

class CupoPreinscripcion {
  
  // =============================================
  // CREAR CUPO
  // =============================================
  static async crear(datos, client = null) {
    const useClient = client || pool;
    
    const result = await useClient.query(`
      INSERT INTO cupo_preinscripcion (
        periodo_academico_id,
        grado_id,
        turno_id,
        cupos_totales,
        activo,
        observaciones
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      datos.periodo_academico_id,
      datos.grado_id,
      datos.turno_id,
      datos.cupos_totales,
      datos.activo ?? true,
      datos.observaciones || null
    ]);
    
    return result.rows[0];
  }
  
  // =============================================
  // OBTENER TODOS LOS CUPOS
  // =============================================
  static async obtenerTodos(filters = {}) {
    const { 
      periodo_academico_id, 
      grado_id, 
      turno_id,
      solo_activos = true,
      page = 1, 
      limit = 50 
    } = filters;
    
    const offset = (page - 1) * limit;
    
    let whereConditions = [];
    let params = [];
    let paramCount = 1;
    
    if (periodo_academico_id) {
      whereConditions.push(`cp.periodo_academico_id = $${paramCount}`);
      params.push(periodo_academico_id);
      paramCount++;
    }
    
    if (grado_id) {
      whereConditions.push(`cp.grado_id = $${paramCount}`);
      params.push(grado_id);
      paramCount++;
    }
    
    if (turno_id) {
      whereConditions.push(`cp.turno_id = $${paramCount}`);
      params.push(turno_id);
      paramCount++;
    }
    
    if (solo_activos) {
      whereConditions.push('cp.activo = true');
    }
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ') 
      : '';
    
    const countQuery = `
      SELECT COUNT(*) FROM cupo_preinscripcion cp ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    const dataQuery = `
      SELECT 
        cp.*,
        pa.nombre as periodo_nombre,
        g.nombre as grado_nombre,
        t.nombre as turno_nombre,
        na.nombre as nivel_academico_nombre,
        ROUND((cp.cupos_ocupados::decimal / cp.cupos_totales * 100), 2) as porcentaje_ocupacion
      FROM cupo_preinscripcion cp
      LEFT JOIN periodo_academico pa ON cp.periodo_academico_id = pa.id
      LEFT JOIN grado g ON cp.grado_id = g.id
      LEFT JOIN nivel_academico na ON g.nivel_academico_id = na.id
      LEFT JOIN turno t ON cp.turno_id = t.id
      ${whereClause}
      ORDER BY pa.fecha_inicio DESC, na.orden, g.orden, t.nombre
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    
    const result = await pool.query(dataQuery, [...params, limit, offset]);
    
    return {
      cupos: result.rows,
      paginacion: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  }
  
  // =============================================
  // OBTENER POR ID
  // =============================================
  static async obtenerPorId(id) {
    const result = await pool.query(`
      SELECT 
        cp.*,
        pa.nombre as periodo_nombre,
        g.nombre as grado_nombre,
        t.nombre as turno_nombre,
        na.nombre as nivel_academico_nombre,
        ROUND((cp.cupos_ocupados::decimal / cp.cupos_totales * 100), 2) as porcentaje_ocupacion,
        (
          SELECT COUNT(*) 
          FROM pre_inscripcion pi 
          WHERE pi.cupo_preinscripcion_id = cp.id 
            AND pi.deleted_at IS NULL
        ) as preinscripciones_vinculadas
      FROM cupo_preinscripcion cp
      LEFT JOIN periodo_academico pa ON cp.periodo_academico_id = pa.id
      LEFT JOIN grado g ON cp.grado_id = g.id
      LEFT JOIN nivel_academico na ON g.nivel_academico_id = na.id
      LEFT JOIN turno t ON cp.turno_id = t.id
      WHERE cp.id = $1
    `, [id]);
    
    return result.rows[0];
  }
  
  // =============================================
  // ACTUALIZAR CUPO
  // =============================================
  static async actualizar(id, datos) {
    const result = await pool.query(`
      UPDATE cupo_preinscripcion
      SET 
        cupos_totales = COALESCE($1, cupos_totales),
        activo = COALESCE($2, activo),
        observaciones = COALESCE($3, observaciones),
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [
      datos.cupos_totales,
      datos.activo,
      datos.observaciones,
      id
    ]);
    
    return result.rows[0];
  }
  
  // =============================================
  // VERIFICAR DISPONIBILIDAD
  // =============================================
  static async verificarDisponibilidad(gradoId, turnoId, periodoAcademicoId) {
    const result = await pool.query(`
      SELECT 
        cp.*,
        g.nombre as grado_nombre,
        t.nombre as turno_nombre,
        (cp.cupos_disponibles > 0) as tiene_cupos
      FROM cupo_preinscripcion cp
      LEFT JOIN grado g ON cp.grado_id = g.id
      LEFT JOIN turno t ON cp.turno_id = t.id
      WHERE cp.grado_id = $1 
        AND cp.turno_id = $2 
        AND cp.periodo_academico_id = $3
        AND cp.activo = true
      LIMIT 1
    `, [gradoId, turnoId, periodoAcademicoId]);
    
    return result.rows[0] || null;
  }
  
  // =============================================
  // OBTENER RESUMEN DE CUPOS POR PERIODO
  // =============================================
  static async obtenerResumenPorPeriodo(periodoAcademicoId) {
    const result = await pool.query(`
      SELECT 
        na.nombre as nivel_academico,
        g.nombre as grado,
        t.nombre as turno,
        cp.cupos_totales,
        cp.cupos_ocupados,
        cp.cupos_disponibles,
        ROUND((cp.cupos_ocupados::decimal / cp.cupos_totales * 100), 2) as porcentaje_ocupacion,
        cp.activo
      FROM cupo_preinscripcion cp
      INNER JOIN grado g ON cp.grado_id = g.id
      INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
      INNER JOIN turno t ON cp.turno_id = t.id
      WHERE cp.periodo_academico_id = $1
      ORDER BY na.orden, g.orden, t.nombre
    `, [periodoAcademicoId]);
    
    // Agrupar por nivel académico
    const resumen = {};
    
    result.rows.forEach(row => {
      if (!resumen[row.nivel_academico]) {
        resumen[row.nivel_academico] = {
          nivel: row.nivel_academico,
          grados: []
        };
      }
      
      resumen[row.nivel_academico].grados.push({
        grado: row.grado,
        turno: row.turno,
        cupos_totales: row.cupos_totales,
        cupos_ocupados: row.cupos_ocupados,
        cupos_disponibles: row.cupos_disponibles,
        porcentaje_ocupacion: parseFloat(row.porcentaje_ocupacion),
        activo: row.activo
      });
    });
    
    return Object.values(resumen);
  }
  
  // =============================================
  // ELIMINAR CUPO
  // =============================================
  static async eliminar(id) {
    // Verificar que no tenga preinscripciones activas
    const checkResult = await pool.query(`
      SELECT COUNT(*) 
      FROM pre_inscripcion 
      WHERE cupo_preinscripcion_id = $1 
        AND estado NOT IN ('cancelada', 'rechazada', 'convertida')
        AND deleted_at IS NULL
    `, [id]);
    
    const preinscripcionesActivas = parseInt(checkResult.rows[0].count);
    
    if (preinscripcionesActivas > 0) {
      throw new Error(`No se puede eliminar el cupo porque tiene ${preinscripcionesActivas} preinscripción(es) activa(s)`);
    }
    
    const result = await pool.query(
      'DELETE FROM cupo_preinscripcion WHERE id = $1 RETURNING *',
      [id]
    );
    
    return result.rows[0];
  }
}

export { CupoPreinscripcion };