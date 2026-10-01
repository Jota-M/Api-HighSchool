// server/src/models/nivelLogroModel.js
import { pool } from '../db/pool.js';

export const NivelLogroModel = {
  async getAll(activo = true) {
    const query = `
      SELECT * FROM nivel_logro
      WHERE ($1::boolean IS NULL OR activo = $1)
      ORDER BY orden ASC;
    `;
    const { rows } = await pool.query(query, [activo]);
    return rows;
  },

  async getById(id) {
    const query = 'SELECT * FROM nivel_logro WHERE id = $1;';
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
  },

  async getByCodigo(codigo) {
    const query = 'SELECT * FROM nivel_logro WHERE codigo = $1;';
    const { rows } = await pool.query(query, [codigo]);
    return rows[0] || null;
  }
};
