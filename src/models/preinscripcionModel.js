import { pool } from "../db/pool.js";

export const Preinscripcion = {
  create: async (estudianteId, representanteId) => {
    const query = `
      INSERT INTO preinscripcion (estudiante_id, representante_id)
      VALUES ($1,$2)
      RETURNING *;
    `;
    const res = await pool.query(query, [estudianteId, representanteId]);
    return res.rows[0];
  }
};
