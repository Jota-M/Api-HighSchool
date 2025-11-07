import { pool } from "../db/pool.js";

export const NivelAcademicoModel = {
  // Obtener todos los niveles con sus grados
  async getAllWithGrados() {
    const query = `
      SELECT * FROM nivel_academico
    `;
    const result = await pool.query(query);
    return result.rows;
  },

  // Obtener un nivel por ID
  async getById(id) {
    const query = 'SELECT * FROM nivel_academico WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  },

  // Crear nivel
  async create(data) {
    const { nombre, descripcion, orden } = data;
    const query = `
      INSERT INTO nivel_academico (nombre, descripcion, orden)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await pool.query(query, [nombre, descripcion, orden]);
    return result.rows[0];
  },

  // Actualizar nivel
  async update(id, data) {
    const { nombre, descripcion, orden } = data;
    const query = `
      UPDATE nivel_academico
      SET nombre = $1, descripcion = $2, orden = $3
      WHERE id = $4
      RETURNING *
    `;
    const result = await pool.query(query, [nombre, descripcion, orden, id]);
    return result.rows[0];
  },

  // Eliminar nivel
  async delete(id) {
    const query = 'DELETE FROM nivel_academico WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  },

  // Obtener estadísticas
  async getStats() {
    const query = `
      SELECT 
        COUNT(DISTINCT na.id) as total_niveles,
        COUNT(g.id) as total_grados
      FROM nivel_academico na
      LEFT JOIN grado g ON g.nivel_academico_id = na.id
    `;
    const result = await pool.query(query);
    return result.rows[0];
  }
};