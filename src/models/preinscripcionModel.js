import { pool } from '../db/pool.js';

export const PreinscripcionModel = {
  async getAll() {
    const result = await pool.query('SELECT * FROM preinscripcion ORDER BY id ASC');
    return result.rows;
  },

  async getById(id) {
    const result = await pool.query('SELECT * FROM preinscripcion WHERE id = $1', [id]);
    return result.rows[0];
  },

  async create({ nombre, edad, curso }) {
    const result = await pool.query(
      'INSERT INTO preinscripcion (nombre, edad, curso) VALUES ($1, $2, $3) RETURNING *',
      [nombre, edad, curso]
    );
    return result.rows[0];
  },

  async update(id, { nombre, edad, curso }) {
    const result = await pool.query(
      'UPDATE preinscripcion SET nombre=$1, edad=$2, curso=$3 WHERE id=$4 RETURNING *',
      [nombre, edad, curso, id]
    );
    return result.rows[0];
  },

  async remove(id) {
    const result = await pool.query(
      'DELETE FROM preinscripcion WHERE id=$1 RETURNING *',
      [id]
    );
    return result.rows[0];
  },
};
