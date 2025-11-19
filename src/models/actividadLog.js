// models/actividadLog.js
import { pool } from '../db/pool.js';

class ActividadLog {
  /**
   * Crea un registro de actividad en la base de datos.
   * @param {Object} data - Datos del registro.
   * @param {Object} [client] - Cliente de DB opcional para transacciones.
   * @returns {Object} - Registro creado.
   */
  static async create(data, client = null) {
    const db = client || pool;

    const {
      usuario_id,
      accion,
      modulo,
      tabla_afectada,
      registro_id,
      datos_anteriores,
      datos_nuevos,
      ip_address,
      user_agent,
      resultado = 'exitoso',
      mensaje
    } = data;

    const query = `
      INSERT INTO actividad_log (
        usuario_id, accion, modulo, tabla_afectada, registro_id,
        datos_anteriores, datos_nuevos, ip_address, user_agent,
        resultado, mensaje
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const result = await db.query(query, [
      usuario_id,
      accion,
      modulo,
      tabla_afectada,
      registro_id,
      datos_anteriores ? JSON.stringify(datos_anteriores) : null,
      datos_nuevos ? JSON.stringify(datos_nuevos) : null,
      ip_address,
      user_agent,
      resultado,
      mensaje
    ]);

    return result.rows[0];
  }

  /**
   * Obtiene los registros de actividad de un usuario.
   * @param {number} userId - ID del usuario.
   * @param {number} [limit=50] - Cantidad máxima de registros.
   * @returns {Array} - Lista de registros.
   */
  static async findByUser(userId, limit = 50) {
    const result = await pool.query(
      `
      SELECT * FROM actividad_log
      WHERE usuario_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [userId, limit]
    );
    return result.rows;
  }
}

export default ActividadLog;
