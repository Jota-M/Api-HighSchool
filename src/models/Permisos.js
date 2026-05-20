// models/Permisos.js
import { pool } from '../db/pool.js';

// =============================================
// PERMISOS
// =============================================
class Permiso {

  static async create(data) {
    const { modulo, accion, nombre, descripcion } = data;

    const result = await pool.query(`
      INSERT INTO permisos (modulo, accion, nombre, descripcion)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [modulo, accion, nombre, descripcion || null]);

    return result.rows[0];
  }

  static async findAll(filters = {}) {
    const { modulo, search } = filters;
    let where = [];
    let params = [];
    let p = 1;

    if (modulo) {
      where.push(`p.modulo = $${p++}`);
      params.push(modulo);
    }
    if (search) {
      where.push(`(p.nombre ILIKE $${p} OR p.descripcion ILIKE $${p} OR p.modulo ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT p.*
      FROM permisos p
      ${whereClause}
      ORDER BY p.modulo, p.accion
    `, params);

    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT * FROM permisos WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async findByNombre(nombre) {
    const result = await pool.query(
      `SELECT * FROM permisos WHERE nombre = $1`,
      [nombre]
    );
    return result.rows[0];
  }

  static async update(id, data) {
    const { modulo, accion, nombre, descripcion } = data;

    const result = await pool.query(`
      UPDATE permisos
      SET modulo=$1, accion=$2, nombre=$3, descripcion=$4
      WHERE id = $5
      RETURNING *
    `, [modulo, accion, nombre, descripcion || null, id]);

    return result.rows[0];
  }

  static async delete(id) {
    const uso = await pool.query(
      `SELECT COUNT(*) FROM rol_permisos WHERE permiso_id = $1`,
      [id]
    );
    if (parseInt(uso.rows[0].count) > 0) {
      throw new Error('No se puede eliminar el permiso porque está asignado a uno o más roles');
    }

    const result = await pool.query(
      `DELETE FROM permisos WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  // Lista todos los módulos distintos para filtros del frontend
  static async getModulos() {
    const result = await pool.query(
      `SELECT DISTINCT modulo FROM permisos ORDER BY modulo`
    );
    return result.rows.map(r => r.modulo);
  }
}

// =============================================
// ROLES
// =============================================
class Rol {

  static async create(data) {
    const { nombre, descripcion, es_sistema = false } = data;

    const result = await pool.query(`
      INSERT INTO roles (nombre, descripcion, es_sistema)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [nombre, descripcion || null, es_sistema]);

    return result.rows[0];
  }

  static async findAll(filters = {}) {
    const { es_sistema, search } = filters;
    let where = [];
    let params = [];
    let p = 1;

    if (es_sistema !== undefined) {
      where.push(`r.es_sistema = $${p++}`);
      params.push(es_sistema);
    }
    if (search) {
      where.push(`(r.nombre ILIKE $${p} OR r.descripcion ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT
        r.*,
        COUNT(DISTINCT rp.permiso_id) AS total_permisos,
        COUNT(DISTINCT ur.usuario_id) AS total_usuarios
      FROM roles r
      LEFT JOIN rol_permisos  rp ON rp.rol_id    = r.id
      LEFT JOIN usuario_roles ur ON ur.rol_id    = r.id
      ${whereClause}
      GROUP BY r.id
      ORDER BY r.es_sistema DESC, r.nombre
    `, params);

    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(`
      SELECT
        r.*,
        COUNT(DISTINCT rp.permiso_id) AS total_permisos,
        COUNT(DISTINCT ur.usuario_id) AS total_usuarios
      FROM roles r
      LEFT JOIN rol_permisos  rp ON rp.rol_id = r.id
      LEFT JOIN usuario_roles ur ON ur.rol_id = r.id
      WHERE r.id = $1
      GROUP BY r.id
    `, [id]);
    return result.rows[0];
  }

  static async update(id, data) {
    const { nombre, descripcion } = data;

    const rol = await Rol.findById(id);
    if (!rol)         throw new Error('Rol no encontrado');
    if (rol.es_sistema) throw new Error('No se pueden modificar los roles del sistema');

    const result = await pool.query(`
      UPDATE roles
      SET nombre=$1, descripcion=$2, updated_at=CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [nombre, descripcion || null, id]);

    return result.rows[0];
  }

  static async delete(id) {
    const rol = await Rol.findById(id);
    if (!rol)           throw new Error('Rol no encontrado');
    if (rol.es_sistema) throw new Error('No se pueden eliminar roles del sistema');

    const uso = await pool.query(
      `SELECT COUNT(*) FROM usuario_roles WHERE rol_id = $1`,
      [id]
    );
    if (parseInt(uso.rows[0].count) > 0) {
      throw new Error('No se puede eliminar el rol porque tiene usuarios asignados');
    }

    await pool.query(`DELETE FROM rol_permisos  WHERE rol_id = $1`, [id]);
    const result = await pool.query(
      `DELETE FROM roles WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  // Permisos de un rol agrupados por módulo
  static async getPermisos(rol_id) {
    const result = await pool.query(`
      SELECT p.*, rp.created_at AS asignado_en
      FROM rol_permisos rp
      INNER JOIN permisos p ON rp.permiso_id = p.id
      WHERE rp.rol_id = $1
      ORDER BY p.modulo, p.accion
    `, [rol_id]);

    const agrupado = {};
    for (const row of result.rows) {
      if (!agrupado[row.modulo]) agrupado[row.modulo] = [];
      agrupado[row.modulo].push(row);
    }

    return { lista: result.rows, agrupado };
  }

  // Reemplaza TODOS los permisos de un rol en una sola operación
  static async syncPermisos(rol_id, permiso_ids = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const rolRes = await client.query(`SELECT * FROM roles WHERE id = $1`, [rol_id]);
      if (!rolRes.rows[0]) throw new Error('Rol no encontrado');

      await client.query(`DELETE FROM rol_permisos WHERE rol_id = $1`, [rol_id]);

      if (permiso_ids.length > 0) {
        const values = permiso_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
        await client.query(
          `INSERT INTO rol_permisos (rol_id, permiso_id) VALUES ${values}`,
          [rol_id, ...permiso_ids]
        );
      }

      await client.query('COMMIT');
      return await Rol.getPermisos(rol_id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Agrega un permiso puntual a un rol
  static async agregarPermiso(rol_id, permiso_id) {
    const result = await pool.query(`
      INSERT INTO rol_permisos (rol_id, permiso_id)
      VALUES ($1, $2)
      ON CONFLICT (rol_id, permiso_id) DO NOTHING
      RETURNING *
    `, [rol_id, permiso_id]);
    return result.rows[0];
  }

  // Quita un permiso puntual de un rol
  static async quitarPermiso(rol_id, permiso_id) {
    const result = await pool.query(`
      DELETE FROM rol_permisos
      WHERE rol_id = $1 AND permiso_id = $2
      RETURNING *
    `, [rol_id, permiso_id]);
    return result.rows[0];
  }
}

// =============================================
// USUARIO-ROLES
// =============================================
class UsuarioRol {

  static async getRolesDeUsuario(usuario_id) {
    const result = await pool.query(`
      SELECT
        ur.*,
        r.nombre      AS rol_nombre,
        r.descripcion AS rol_descripcion,
        r.es_sistema  AS rol_es_sistema,
        u.username    AS asignado_por_username
      FROM usuario_roles ur
      INNER JOIN roles   r ON ur.rol_id       = r.id
      LEFT  JOIN usuarios u ON ur.asignado_por = u.id
      WHERE ur.usuario_id = $1
      ORDER BY r.nombre
    `, [usuario_id]);
    return result.rows;
  }

  // Todos los permisos efectivos del usuario (unión de todos sus roles)
  static async getPermisosEfectivos(usuario_id) {
    const result = await pool.query(`
      SELECT DISTINCT p.*
      FROM usuario_roles ur
      INNER JOIN rol_permisos rp ON rp.rol_id     = ur.rol_id
      INNER JOIN permisos     p  ON rp.permiso_id = p.id
      WHERE ur.usuario_id = $1
      ORDER BY p.modulo, p.accion
    `, [usuario_id]);
    return result.rows;
  }

  static async asignarRol(usuario_id, rol_id, asignado_por) {
    const result = await pool.query(`
      INSERT INTO usuario_roles (usuario_id, rol_id, asignado_por)
      VALUES ($1, $2, $3)
      ON CONFLICT (usuario_id, rol_id) DO NOTHING
      RETURNING *
    `, [usuario_id, rol_id, asignado_por]);
    return result.rows[0];
  }

  static async quitarRol(usuario_id, rol_id) {
    const result = await pool.query(`
      DELETE FROM usuario_roles
      WHERE usuario_id = $1 AND rol_id = $2
      RETURNING *
    `, [usuario_id, rol_id]);
    return result.rows[0];
  }

  // Reemplaza TODOS los roles de un usuario en una sola operación
  static async syncRoles(usuario_id, rol_ids = [], asignado_por) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`DELETE FROM usuario_roles WHERE usuario_id = $1`, [usuario_id]);

      if (rol_ids.length > 0) {
        const values = rol_ids.map((_, i) => `($1, $${i + 2}, $${rol_ids.length + 2})`).join(', ');
        await client.query(
          `INSERT INTO usuario_roles (usuario_id, rol_id, asignado_por) VALUES ${values}`,
          [usuario_id, ...rol_ids, asignado_por]
        );
      }

      await client.query('COMMIT');
      return await UsuarioRol.getRolesDeUsuario(usuario_id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export { Permiso, Rol, UsuarioRol };