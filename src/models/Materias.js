// models/AreaConocimiento.js
import { pool } from "../db/pool.js";

class AreaConocimiento {
  // Crear área de conocimiento
  static async create(data) {
    const { nombre, descripcion, color, orden } = data;
    
    const query = `
      INSERT INTO area_conocimiento (nombre, descripcion, color, orden)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const result = await pool.query(query, [nombre, descripcion, color, orden]);
    return result.rows[0];
  }

  // Listar todas las áreas
  static async findAll() {
    const query = `
      SELECT a.*, 
        (SELECT COUNT(*) FROM materia m WHERE m.area_conocimiento_id = a.id AND m.deleted_at IS NULL) as total_materias
      FROM area_conocimiento a
      ORDER BY a.orden, a.nombre
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  // Buscar por ID
  static async findById(id) {
    const query = 'SELECT * FROM area_conocimiento WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Actualizar área
  static async update(id, data) {
    const { nombre, descripcion, color, orden } = data;
    
    const query = `
      UPDATE area_conocimiento 
      SET nombre = $1, descripcion = $2, color = $3, orden = $4
      WHERE id = $5
      RETURNING *
    `;
    
    const result = await pool.query(query, [nombre, descripcion, color, orden, id]);
    return result.rows[0];
  }

  // Eliminar área
  static async delete(id) {
    // Verificar que no tenga materias asociadas
    const checkQuery = 'SELECT COUNT(*) FROM materia WHERE area_conocimiento_id = $1 AND deleted_at IS NULL';
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (parseInt(checkResult.rows[0].count) > 0) {
      throw new Error('No se puede eliminar un área de conocimiento con materias asociadas');
    }

    const query = 'DELETE FROM area_conocimiento WHERE id = $1 RETURNING id';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

// models/Materia.js
class Materia {
  // Crear materia
  static async create(data) {
    const { 
      area_conocimiento_id, codigo, nombre, descripcion, 
      horas_semanales, creditos, es_obligatoria, 
      tiene_laboratorio, color, activo 
    } = data;
    
    const query = `
      INSERT INTO materia 
      (area_conocimiento_id, codigo, nombre, descripcion, horas_semanales, 
       creditos, es_obligatoria, tiene_laboratorio, color, activo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      area_conocimiento_id, codigo, nombre, descripcion, 
      horas_semanales, creditos, 
      es_obligatoria ?? true, 
      tiene_laboratorio ?? false, 
      color, activo ?? true
    ]);
    
    return result.rows[0];
  }

  // Listar materias con filtros
  static async findAll(filters = {}) {
    const { page = 1, limit = 10, search, area_conocimiento_id, activo, es_obligatoria } = filters;
    const offset = (page - 1) * limit;

    let whereConditions = ['m.deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;

    if (search) {
      whereConditions.push(`(m.nombre ILIKE $${paramCounter} OR m.codigo ILIKE $${paramCounter})`);
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    if (area_conocimiento_id) {
      whereConditions.push(`m.area_conocimiento_id = $${paramCounter}`);
      queryParams.push(area_conocimiento_id);
      paramCounter++;
    }

    if (activo !== undefined) {
      whereConditions.push(`m.activo = $${paramCounter}`);
      queryParams.push(activo);
      paramCounter++;
    }

    if (es_obligatoria !== undefined) {
      whereConditions.push(`m.es_obligatoria = $${paramCounter}`);
      queryParams.push(es_obligatoria);
      paramCounter++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Contar total
    const countQuery = `
      SELECT COUNT(*) 
      FROM materia m
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Obtener datos paginados
    const dataQuery = `
      SELECT m.*, 
        a.nombre as area_nombre,
        a.color as area_color,
        (SELECT COUNT(*) FROM grado_materia gm WHERE gm.materia_id = m.id) as total_grados
      FROM materia m
      LEFT JOIN area_conocimiento a ON m.area_conocimiento_id = a.id
      ${whereClause}
      ORDER BY a.orden, m.nombre
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;
    
    const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      materias: result.rows,
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
      SELECT m.*, 
        a.nombre as area_nombre,
        a.color as area_color
      FROM materia m
      LEFT JOIN area_conocimiento a ON m.area_conocimiento_id = a.id
      WHERE m.id = $1 AND m.deleted_at IS NULL
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Obtener materias con prerequisitos
  static async findByIdWithPrerequisites(id) {
    const materia = await this.findById(id);
    
    if (!materia) return null;

    // Obtener prerequisitos
    const prereqQuery = `
      SELECT m.id, m.codigo, m.nombre
      FROM materia_prerequisito mp
      INNER JOIN materia m ON mp.prerequisito_id = m.id
      WHERE mp.materia_id = $1 AND m.deleted_at IS NULL
    `;
    const prereqResult = await pool.query(prereqQuery, [id]);
    materia.prerequisitos = prereqResult.rows;

    return materia;
  }

  // Actualizar materia
  static async update(id, data) {
    const { 
      area_conocimiento_id, codigo, nombre, descripcion, 
      horas_semanales, creditos, es_obligatoria, 
      tiene_laboratorio, color, activo 
    } = data;
    
    const query = `
      UPDATE materia 
      SET area_conocimiento_id = $1, codigo = $2, nombre = $3, descripcion = $4,
          horas_semanales = $5, creditos = $6, es_obligatoria = $7,
          tiene_laboratorio = $8, color = $9, activo = $10,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $11 AND deleted_at IS NULL
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      area_conocimiento_id, codigo, nombre, descripcion, 
      horas_semanales, creditos, es_obligatoria, 
      tiene_laboratorio, color, activo, id
    ]);
    
    return result.rows[0];
  }

  // Soft delete
  static async softDelete(id) {
    // Verificar que no esté asignada a grados
    const checkQuery = 'SELECT COUNT(*) FROM grado_materia WHERE materia_id = $1';
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (parseInt(checkResult.rows[0].count) > 0) {
      throw new Error('No se puede eliminar una materia asignada a grados');
    }

    const query = `
      UPDATE materia 
      SET deleted_at = CURRENT_TIMESTAMP 
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Buscar por código
  static async findByCode(codigo) {
    const query = 'SELECT * FROM materia WHERE codigo = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [codigo]);
    return result.rows[0];
  }
}

// models/MateriaPrerequisito.js
class MateriaPrerequisito {
  // Agregar prerequisito
  static async add(materia_id, prerequisito_id) {
    // Verificar que no sean la misma materia
    if (materia_id === prerequisito_id) {
      throw new Error('Una materia no puede ser prerequisito de sí misma');
    }

    // Verificar ciclos
    const hasCycle = await this.checkCycle(materia_id, prerequisito_id);
    if (hasCycle) {
      throw new Error('No se puede agregar este prerequisito porque crearía un ciclo');
    }

    const query = `
      INSERT INTO materia_prerequisito (materia_id, prerequisito_id)
      VALUES ($1, $2)
      RETURNING *
    `;
    
    const result = await pool.query(query, [materia_id, prerequisito_id]);
    return result.rows[0];
  }

  // Verificar ciclos en prerequisitos
  static async checkCycle(materia_id, prerequisito_id) {
    // Si el prerequisito tiene como prerequisito a la materia original, hay ciclo
    const query = `
      WITH RECURSIVE prerequisito_chain AS (
        SELECT prerequisito_id FROM materia_prerequisito WHERE materia_id = $1
        UNION
        SELECT mp.prerequisito_id 
        FROM materia_prerequisito mp
        INNER JOIN prerequisito_chain pc ON mp.materia_id = pc.prerequisito_id
      )
      SELECT EXISTS(SELECT 1 FROM prerequisito_chain WHERE prerequisito_id = $2) as has_cycle
    `;
    
    const result = await pool.query(query, [prerequisito_id, materia_id]);
    return result.rows[0].has_cycle;
  }

  // Listar prerequisitos de una materia
  static async findByMateria(materia_id) {
    const query = `
      SELECT mp.*, m.codigo, m.nombre, m.area_conocimiento_id
      FROM materia_prerequisito mp
      INNER JOIN materia m ON mp.prerequisito_id = m.id
      WHERE mp.materia_id = $1 AND m.deleted_at IS NULL
      ORDER BY m.nombre
    `;
    
    const result = await pool.query(query, [materia_id]);
    return result.rows;
  }

  // Eliminar prerequisito
  static async remove(materia_id, prerequisito_id) {
    const query = `
      DELETE FROM materia_prerequisito 
      WHERE materia_id = $1 AND prerequisito_id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [materia_id, prerequisito_id]);
    return result.rows[0];
  }
}

// models/GradoMateria.js
class GradoMateria {
  // Asignar materia a grado
  static async assign(data) {
    const { 
      grado_id, materia_id, orden, activo, 
      nota_minima_aprobacion, peso_porcentual 
    } = data;
    
    const query = `
      INSERT INTO grado_materia 
      (grado_id, materia_id, orden, activo, nota_minima_aprobacion, peso_porcentual)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      grado_id, materia_id, orden, 
      activo ?? true, 
      nota_minima_aprobacion ?? 51.00, 
      peso_porcentual
    ]);
    
    return result.rows[0];
  }

  // Listar materias de un grado
  static async findByGrado(grado_id, activo = undefined) {
    let whereConditions = ['gm.grado_id = $1'];
    let queryParams = [grado_id];
    let paramCounter = 2;

    if (activo !== undefined) {
      whereConditions.push(`gm.activo = $${paramCounter}`);
      queryParams.push(activo);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT gm.*, 
        m.codigo as materia_codigo,
        m.nombre as materia_nombre,
        m.horas_semanales,
        m.creditos,
        m.es_obligatoria,
        m.tiene_laboratorio,
        a.nombre as area_nombre,
        a.color as area_color
      FROM grado_materia gm
      INNER JOIN materia m ON gm.materia_id = m.id
      LEFT JOIN area_conocimiento a ON m.area_conocimiento_id = a.id
      WHERE ${whereClause} AND m.deleted_at IS NULL
      ORDER BY gm.orden, m.nombre
    `;
    
    const result = await pool.query(query, queryParams);
    return result.rows;
  }
 static async findAllGroupedByGrado(activo = true) {
    const query = `
      SELECT 
        gm.id,
        gm.grado_id,
        gm.materia_id,
        gm.orden,
        gm.activo,
        gm.nota_minima_aprobacion,
        gm.peso_porcentual,
        m.codigo as materia_codigo,
        m.nombre as materia_nombre,
        m.color as materia_color,
        m.descripcion as materia_descripcion,
        m.horas_semanales,
        m.creditos,
        m.es_obligatoria,
        m.tiene_laboratorio,
        g.nombre as grado_nombre,
        g.codigo as grado_codigo,
        g.orden as grado_orden,
        na.id as nivel_id,
        na.nombre as nivel_nombre,
        na.codigo as nivel_codigo,
        na.orden as nivel_orden,
        ac.id as area_id,
        ac.nombre as area_nombre,
        ac.color as area_color
      FROM grado_materia gm
      INNER JOIN materia m ON gm.materia_id = m.id
      INNER JOIN grado g ON gm.grado_id = g.id
      INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
      LEFT JOIN area_conocimiento ac ON m.area_conocimiento_id = ac.id
      WHERE m.deleted_at IS NULL
        AND g.deleted_at IS NULL
        ${activo ? 'AND gm.activo = true AND m.activo = true' : ''}
      ORDER BY 
        na.orden ASC,
        g.orden ASC,
        gm.orden ASC,
        m.nombre ASC
    `;

    const result = await pool.query(query);

    // Agrupar por grado
    const materiasAgrupadas = {};

    result.rows.forEach(row => {
      if (!materiasAgrupadas[row.grado_id]) {
        materiasAgrupadas[row.grado_id] = {
          grado_id: row.grado_id,
          grado_codigo: row.grado_codigo,
          grado_nombre: row.grado_nombre,
          grado_orden: row.grado_orden,
          nivel_id: row.nivel_id,
          nivel_codigo: row.nivel_codigo,
          nivel_nombre: row.nivel_nombre,
          nivel_orden: row.nivel_orden,
          materias: []
        };
      }

      materiasAgrupadas[row.grado_id].materias.push({
        id: row.id,
        materia_id: row.materia_id,
        materia_codigo: row.materia_codigo,
        materia_nombre: row.materia_nombre,
        materia_color: row.materia_color,
        materia_descripcion: row.materia_descripcion,
        area_id: row.area_id,
        area_nombre: row.area_nombre,
        area_color: row.area_color,
        horas_semanales: row.horas_semanales,
        creditos: row.creditos,
        es_obligatoria: row.es_obligatoria,
        tiene_laboratorio: row.tiene_laboratorio,
        orden: row.orden,
        nota_minima_aprobacion: parseFloat(row.nota_minima_aprobacion),
        peso_porcentual: row.peso_porcentual ? parseFloat(row.peso_porcentual) : null,
        activo: row.activo
      });
    });

    // Convertir objeto a array y ordenar
    return Object.values(materiasAgrupadas).sort((a, b) => {
      if (a.nivel_orden !== b.nivel_orden) {
        return a.nivel_orden - b.nivel_orden;
      }
      return a.grado_orden - b.grado_orden;
    });
  }

  // Obtener por ID
  static async findById(id) {
    const query = `
      SELECT gm.*, 
        g.nombre as grado_nombre,
        m.codigo as materia_codigo,
        m.nombre as materia_nombre
      FROM grado_materia gm
      INNER JOIN grado g ON gm.grado_id = g.id
      INNER JOIN materia m ON gm.materia_id = m.id
      WHERE gm.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Actualizar asignación
  static async update(id, data) {
    const { orden, activo, nota_minima_aprobacion, peso_porcentual } = data;
    
    const query = `
      UPDATE grado_materia 
      SET orden = $1, activo = $2, nota_minima_aprobacion = $3, 
          peso_porcentual = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      orden, activo, nota_minima_aprobacion, peso_porcentual, id
    ]);
    
    return result.rows[0];
  }

  // Remover materia de grado
  static async remove(id) {
    const query = 'DELETE FROM grado_materia WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Verificar si existe asignación
  static async exists(grado_id, materia_id) {
    const query = `
      SELECT id FROM grado_materia 
      WHERE grado_id = $1 AND materia_id = $2
    `;
    const result = await pool.query(query, [grado_id, materia_id]);
    return result.rows[0];
  }

  // Reordenar materias
  static async reorder(grado_id, materias_ordenadas) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      for (const [index, materia_id] of materias_ordenadas.entries()) {
        await client.query(
          'UPDATE grado_materia SET orden = $1 WHERE grado_id = $2 AND materia_id = $3',
          [index + 1, grado_id, materia_id]
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

export { AreaConocimiento, Materia, MateriaPrerequisito, GradoMateria };