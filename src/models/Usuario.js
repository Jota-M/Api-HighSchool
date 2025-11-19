// models/Usuario.js
import { pool } from '../db/pool.js';
import TokenUtils from '../utils/jwt.js';

class Usuario {
  // Crear usuario CON SOPORTE DE TRANSACCIONES
  static async create(data, client = null) {
    const { username, email, password, rolIds = [], activo = true } = data;
    const hashedPassword = await TokenUtils.hashPassword(password);
    const tokenVerificacion = TokenUtils.generateRandomToken();

    const db = client || pool;
    const shouldCommit = !client; // Solo hacer commit si no hay transacción externa

    let localClient;
    try {
      if (shouldCommit) {
        localClient = await pool.connect();
        await localClient.query('BEGIN');
      }

      const executeQuery = shouldCommit ? localClient : db;

      const result = await executeQuery.query(
        `INSERT INTO usuarios (username, email, password, token_verificacion, activo)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [username, email, hashedPassword, tokenVerificacion, activo]
      );

      const usuario = result.rows[0];

      // Asignar roles si se proporcionaron
      if (rolIds.length > 0) {
        for (const rolId of rolIds) {
          await executeQuery.query(
            `INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)`,
            [usuario.id, rolId]
          );
        }
      }

      if (shouldCommit) {
        await localClient.query('COMMIT');
      }

      delete usuario.password;
      return usuario;
    } catch (error) {
      if (shouldCommit && localClient) {
        await localClient.query('ROLLBACK');
      }
      throw error;
    } finally {
      if (shouldCommit && localClient) {
        localClient.release();
      }
    }
  }

  // Buscar por username (con soporte de transacción)
  static async findByUsername(username, client = null) {
    const db = client || pool;
    const result = await db.query(
      'SELECT * FROM usuarios WHERE username = $1 AND deleted_at IS NULL',
      [username]
    );
    return result.rows[0];
  }

  // Buscar por email (con soporte de transacción)
  static async findByEmail(email, client = null) {
    const db = client || pool;
    const result = await db.query(
      'SELECT * FROM usuarios WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );
    return result.rows[0];
  }

  // Buscar por ID (con soporte de transacción)
  static async findById(id, client = null) {
    const db = client || pool;
    const result = await db.query(
      'SELECT * FROM usuarios WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return result.rows[0];
  }

  // Buscar por username o email
  static async findByCredential(credential) {
    const result = await pool.query(
      `SELECT u.*, array_agg(ur.rol_id) as rol_ids
       FROM usuarios u
       LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
       WHERE (u.username = $1 OR u.email = $1) 
       AND u.deleted_at IS NULL
       GROUP BY u.id`,
      [credential]
    );
    return result.rows[0];
  }

  // Buscar por ID con roles y permisos
  static async findByIdWithPermissions(id) {
    const result = await pool.query(
      `SELECT 
        u.id, u.username, u.email, u.activo, u.verificado,
        json_agg(DISTINCT jsonb_build_object(
          'id', r.id,
          'nombre', r.nombre,
          'descripcion', r.descripcion
        )) FILTER (WHERE r.id IS NOT NULL) as roles,
        json_agg(DISTINCT jsonb_build_object(
          'id', p.id,
          'modulo', p.modulo,
          'accion', p.accion,
          'nombre', p.nombre
        )) FILTER (WHERE p.id IS NOT NULL) as permisos
       FROM usuarios u
       LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
       LEFT JOIN roles r ON ur.rol_id = r.id
       LEFT JOIN rol_permisos rp ON r.id = rp.rol_id
       LEFT JOIN permisos p ON rp.permiso_id = p.id
       WHERE u.id = $1 AND u.deleted_at IS NULL
       GROUP BY u.id`,
      [id]
    );
    return result.rows[0];
  }

  // Actualizar último acceso
  static async updateLastAccess(id) {
    await pool.query(
      'UPDATE usuarios SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  }

  // Incrementar intentos fallidos
  static async incrementFailedAttempts(id) {
    const result = await pool.query(
      `UPDATE usuarios 
       SET intentos_fallidos = intentos_fallidos + 1,
           bloqueado_hasta = CASE 
             WHEN intentos_fallidos + 1 >= 5 
             THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes'
             ELSE bloqueado_hasta
           END
       WHERE id = $1
       RETURNING intentos_fallidos, bloqueado_hasta`,
      [id]
    );
    return result.rows[0];
  }

  // Resetear intentos fallidos
  static async resetFailedAttempts(id) {
    await pool.query(
      'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1',
      [id]
    );
  }

  // Verificar si usuario está bloqueado
  static async isLocked(id) {
    const result = await pool.query(
      `SELECT bloqueado_hasta FROM usuarios 
       WHERE id = $1 AND bloqueado_hasta > CURRENT_TIMESTAMP`,
      [id]
    );
    return result.rows.length > 0;
  }

  // Verificar cuenta
  static async verifyAccount(token) {
    const result = await pool.query(
      `UPDATE usuarios 
       SET verificado = true, token_verificacion = NULL
       WHERE token_verificacion = $1 AND deleted_at IS NULL
       RETURNING id, username, email`,
      [token]
    );
    return result.rows[0];
  }

  // Cambiar contraseña
  static async changePassword(id, newPassword) {
    const hashedPassword = await TokenUtils.hashPassword(newPassword);
    await pool.query(
      `UPDATE usuarios 
       SET password = $1, debe_cambiar_password = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [hashedPassword, id]
    );
  }
}

export default Usuario;