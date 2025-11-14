import { pool } from '../db/pool.js';

class ActividadLog {
  static async create(data) {
    const {
      usuario_id, accion, modulo, tabla_afectada, registro_id,
      datos_anteriores, datos_nuevos, ip_address, user_agent,
      resultado = 'exitoso', mensaje
    } = data;

    await pool.query(
      `INSERT INTO actividad_log 
       (usuario_id, accion, modulo, tabla_afectada, registro_id, 
        datos_anteriores, datos_nuevos, ip_address, user_agent, resultado, mensaje)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        usuario_id, accion, modulo, tabla_afectada, registro_id,
        datos_anteriores ? JSON.stringify(datos_anteriores) : null,
        datos_nuevos ? JSON.stringify(datos_nuevos) : null,
        ip_address, user_agent, resultado, mensaje
      ]
    );
  }

  static async findByUser(userId, limit = 50) {
    const result = await pool.query(
      `SELECT * FROM actividad_log 
       WHERE usuario_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  }
}

export default ActividadLog;