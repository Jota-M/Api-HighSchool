import { pool } from '../db/pool.js';

export const TurnoModel = {
  // Obtener todos los turnos
  async getAll() {
    const query = `
      SELECT 
        t.*,
        COUNT(DISTINCT p.id) as total_paralelos
      FROM turno t
      LEFT JOIN paralelo p ON t.id = p.turno_id
      GROUP BY t.id
      ORDER BY t.hora_inicio
    `;
    const result = await pool.query(query);
    return result.rows;
  },

  // Obtener un turno por ID
  async getById(id) {
    const query = `
      SELECT 
        t.*,
        COUNT(DISTINCT p.id) as total_paralelos
      FROM turno t
      LEFT JOIN paralelo p ON t.id = p.turno_id
      WHERE t.id = $1
      GROUP BY t.id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  },

  // Crear un turno
  async create(data) {
    const { nombre, hora_inicio, hora_fin } = data;
    const query = `
      INSERT INTO turno (nombre, hora_inicio, hora_fin)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await pool.query(query, [nombre, hora_inicio, hora_fin]);
    return result.rows[0];
  },

  // Actualizar un turno
  async update(id, data) {
    const { nombre, hora_inicio, hora_fin } = data;
    const query = `
      UPDATE turno
      SET nombre = $1, hora_inicio = $2, hora_fin = $3
      WHERE id = $4
      RETURNING *
    `;
    const result = await pool.query(query, [nombre, hora_inicio, hora_fin, id]);
    return result.rows[0];
  },

  // Eliminar un turno
  async delete(id) {
    const query = 'DELETE FROM turno WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
};