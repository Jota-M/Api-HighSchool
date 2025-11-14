import { pool } from '../db/pool.js';

class Sesion {
  // Crear sesión
  static async create(data) {
    const { usuario_id, token, refresh_token, ip_address, user_agent, dispositivo, ubicacion, expires_at } = data;
    
    const result = await pool.query(
      `INSERT INTO sesiones 
       (usuario_id, token, refresh_token, ip_address, user_agent, dispositivo, ubicacion, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [usuario_id, token, refresh_token, ip_address, user_agent, dispositivo, ubicacion, expires_at]
    );
    return result.rows[0];
  }

  // Buscar por token
  static async findByToken(token) {
    const result = await pool.query(
      `SELECT * FROM sesiones 
       WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP`,
      [token]
    );
    return result.rows[0];
  }

  // Buscar por refresh token
  static async findByRefreshToken(refreshToken) {
    const result = await pool.query(
      `SELECT * FROM sesiones 
       WHERE refresh_token = $1 AND expires_at > CURRENT_TIMESTAMP`,
      [refreshToken]
    );
    return result.rows[0];
  }

  // Actualizar token
  static async updateToken(id, newToken, newExpiresAt) {
    await pool.query(
      'UPDATE sesiones SET token = $1, expires_at = $2 WHERE id = $3',
      [newToken, newExpiresAt, id]
    );
  }

  // Eliminar sesión
  static async delete(token) {
    await pool.query('DELETE FROM sesiones WHERE token = $1', [token]);
  }

  // Eliminar sesiones de usuario
  static async deleteByUserId(userId) {
    await pool.query('DELETE FROM sesiones WHERE usuario_id = $1', [userId]);
  }

  // Limpiar sesiones expiradas
  static async cleanExpired() {
    await pool.query('DELETE FROM sesiones WHERE expires_at < CURRENT_TIMESTAMP');
  }

  // Obtener sesiones activas de usuario
  static async getActiveSessions(userId) {
    const result = await pool.query(
      `SELECT id, ip_address, user_agent, dispositivo, ubicacion, created_at, expires_at
       FROM sesiones 
       WHERE usuario_id = $1 AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  }
}
export default Sesion;