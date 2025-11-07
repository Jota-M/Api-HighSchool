import { pool } from "../db/pool.js";

export const GradoMateriaModel = {
  async getAll() {
    const { rows } = await pool.query(`
      SELECT gm.*, g.nombre AS grado, m.nombre AS materia
      FROM GradoMateria gm
      JOIN Grado g ON gm.grado_id = g.id
      JOIN Materia m ON gm.materia_id = m.id
      ORDER BY gm.id;
    `);
    return rows;
  },
  async getById(id) {
    const { rows } = await pool.query(
      "SELECT * FROM GradoMateria WHERE id = $1;",
      [id]
    );
    return rows[0];
  },
  async create({ grado_id, materia_id }) {
    const { rows } = await pool.query(
      `INSERT INTO GradoMateria (grado_id, materia_id)
       VALUES ($1, $2) RETURNING *;`,
      [grado_id, materia_id]
    );
    return rows[0];
  },
  async update(id, { grado_id, materia_id }) {
    const { rows } = await pool.query(
      `UPDATE GradoMateria
       SET grado_id=$1, materia_id=$2
       WHERE id=$3 RETURNING *;`,
      [grado_id, materia_id, id]
    );
    return rows[0];
  },
  async delete(id) {
    await pool.query("DELETE FROM GradoMateria WHERE id = $1;", [id]);
  },
};
