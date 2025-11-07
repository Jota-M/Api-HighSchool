import { pool } from '../db/pool.js';

export const GradoModel = {
  // Obtener todos los grados con información del nivel
  async getAll() {
    const query = `
      SELECT 
        g.*,
        na.nombre as nivel_nombre,
        na.orden as nivel_orden,
        na.descripcion as nivel_descripcion
      FROM grado g
      INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
      ORDER BY na.orden, g.orden
    `;
    const result = await pool.query(query);
    return result.rows;
  },

  // Obtener un grado por ID
  async getById(id) {
    const query = `
      SELECT 
        g.*,
        na.nombre as nivel_nombre,
        na.orden as nivel_orden,
        na.descripcion as nivel_descripcion
      FROM grado g
      INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
      WHERE g.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  },

  // Crear un grado
  async create(data) {
    const { nivel_academico_id, nombre, descripcion, orden } = data;
    const query = `
      INSERT INTO grado (nivel_academico_id, nombre, descripcion, orden)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await pool.query(query, [
      nivel_academico_id,
      nombre,
      descripcion,
      orden
    ]);
    return result.rows[0];
  },

  // Actualizar un grado
  async update(id, data) {
    const { nivel_academico_id, nombre, descripcion, orden } = data;
    const query = `
      UPDATE grado
      SET nivel_academico_id = $1, nombre = $2, descripcion = $3, orden = $4
      WHERE id = $5
      RETURNING *
    `;
    const result = await pool.query(query, [
      nivel_academico_id,
      nombre,
      descripcion,
      orden,
      id
    ]);
    return result.rows[0];
  },

  // Eliminar un grado
  async delete(id) {
    const query = 'DELETE FROM grado WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  },

  // Obtener grados por nivel
  async getByNivel(nivelId) {
    const query = `
      SELECT 
        g.*,
        na.nombre as nivel_nombre,
        na.orden as nivel_orden
      FROM grado g
      INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
      WHERE g.nivel_academico_id = $1
      ORDER BY g.orden
    `;
    const result = await pool.query(query, [nivelId]);
    return result.rows;
  }
};