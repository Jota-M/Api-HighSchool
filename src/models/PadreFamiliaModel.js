// models/PadreFamilia.js
import { pool } from '../db/pool.js';
import bcrypt from 'bcryptjs';

class PadreFamilia {
  /**
   * Buscar padres de familia por nombre, CI o email
   */
  static async buscar(searchTerm) {
    const query = `
      SELECT 
        id, nombres, apellido_paterno, apellido_materno, ci,
        telefono, celular, email, parentesco, ocupacion,
        lugar_trabajo, usuario_id,
        (nombres || ' ' || apellido_paterno || ' ' || COALESCE(apellido_materno, '')) as nombre_completo
      FROM padre_familia
      WHERE deleted_at IS NULL
      AND (
        LOWER(nombres || ' ' || apellido_paterno || ' ' || COALESCE(apellido_materno, '')) 
        LIKE LOWER($1)
        OR ci LIKE $1
        OR LOWER(email) LIKE LOWER($1)
        OR LOWER(celular) LIKE LOWER($1)
      )
      ORDER BY nombres, apellido_paterno
      LIMIT 20
    `;
    
    const result = await pool.query(query, [`%${searchTerm}%`]);
    return result.rows;
  }

  /**
   * Buscar por ID
   */
  static async findById(id, client = pool) {
    const query = `
      SELECT * FROM padre_familia 
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const result = await client.query(query, [id]);
    return result.rows[0];
  }

  /**
   * Buscar por CI
   */
  static async findByCI(ci, client = pool) {
    const query = `
      SELECT * FROM padre_familia 
      WHERE ci = $1 AND deleted_at IS NULL
    `;
    const result = await client.query(query, [ci]);
    return result.rows[0];
  }

  /**
   * Buscar por email
   */
  static async findByEmail(email, client = pool) {
    const query = `
      SELECT * FROM padre_familia 
      WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL
    `;
    const result = await client.query(query, [email]);
    return result.rows[0];
  }

  /**
   * Crear nuevo padre de familia
   */
  static async create(data, client = pool) {
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

    const values = [
      data.usuario_id || null,
      data.nombres,
      data.apellido_paterno,
      data.apellido_materno || null,
      data.ci,
      data.fecha_nacimiento || null,
      data.telefono || null,
      data.celular || null,
      data.email || null,
      data.direccion || null,
      data.ocupacion || null,
      data.lugar_trabajo || null,
      data.telefono_trabajo || null,
      data.parentesco || null,
      data.estado_civil || null,
      data.nivel_educacion || null
    ];

    const result = await client.query(query, values);
    return result.rows[0];
  }

  /**
   * Actualizar padre de familia
   */
  static async update(id, data, client = pool) {
    const fields = [];
    const values = [];
    let counter = 1;

    // Campos actualizables
    const allowedFields = [
      'usuario_id', 'nombres', 'apellido_paterno', 'apellido_materno',
      'ci', 'fecha_nacimiento', 'telefono', 'celular', 'email',
      'direccion', 'ocupacion', 'lugar_trabajo', 'telefono_trabajo',
      'parentesco', 'estado_civil', 'nivel_educacion'
    ];

    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        fields.push(`${field} = $${counter}`);
        values.push(data[field]);
        counter++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No hay campos para actualizar');
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE padre_familia 
      SET ${fields.join(', ')}
      WHERE id = $${counter} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await client.query(query, values);
    return result.rows[0];
  }

  /**
   * Eliminar (soft delete)
   */
  static async delete(id, client = pool) {
    const query = `
      UPDATE padre_familia 
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    const result = await client.query(query, [id]);
    return result.rows[0];
  }

  /**
   * Listar con paginación y filtros
   */
  static async findAll(filters = {}, client = pool) {
    const {
      page = 1,
      limit = 10,
      search = '',
      activo = null
    } = filters;

    const offset = (page - 1) * limit;
    const conditions = ['deleted_at IS NULL'];
    const values = [];
    let counter = 1;

    if (search) {
      conditions.push(`(
        LOWER(nombres || ' ' || apellido_paterno || ' ' || COALESCE(apellido_materno, '')) 
        LIKE LOWER($${counter})
        OR ci LIKE $${counter}
        OR LOWER(email) LIKE LOWER($${counter})
      )`);
      values.push(`%${search}%`);
      counter++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query para contar total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM padre_familia
      ${whereClause}
    `;

    // Query para obtener datos
    const dataQuery = `
      SELECT 
        pf.*,
        u.username,
        u.email as usuario_email,
        COUNT(DISTINCT et.estudiante_id) as total_estudiantes
      FROM padre_familia pf
      LEFT JOIN usuarios u ON pf.usuario_id = u.id
      LEFT JOIN estudiante_tutor et ON pf.id = et.padre_familia_id
      ${whereClause}
      GROUP BY pf.id, u.username, u.email
      ORDER BY pf.nombres, pf.apellido_paterno
      LIMIT $${counter} OFFSET $${counter + 1}
    `;

    values.push(limit, offset);

    const [countResult, dataResult] = await Promise.all([
      client.query(countQuery, values.slice(0, -2)),
      client.query(dataQuery, values)
    ]);

    return {
      tutores: dataResult.rows,
      paginacion: {
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.rows[0].total / limit)
      }
    };
  }

  /**
   * Obtener estudiantes asociados a un tutor
   */
  static async getEstudiantes(tutorId, client = pool) {
    const query = `
      SELECT 
        e.*,
        et.es_tutor_principal,
        et.vive_con_estudiante,
        et.autorizado_recoger,
        et.puede_autorizar_salidas,
        et.recibe_notificaciones,
        et.prioridad_contacto
      FROM estudiante e
      INNER JOIN estudiante_tutor et ON e.id = et.estudiante_id
      WHERE et.padre_familia_id = $1
      AND e.deleted_at IS NULL
      ORDER BY et.prioridad_contacto, e.nombres
    `;
    
    const result = await client.query(query, [tutorId]);
    return result.rows;
  }
}

export { PadreFamilia };
export default PadreFamilia;