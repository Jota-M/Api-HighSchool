import { pool } from "../db/pool.js";

export const MateriaModel = {
  async getAll() {
    const { rows } = await pool.query("SELECT * FROM Materia ORDER BY id;");
    return rows;
  },
  async getById(id) {
    const { rows } = await pool.query("SELECT * FROM Materia WHERE id = $1;", [id]);
    return rows[0];
  },
  async create({ nombre, descripcion }) {
    const { rows } = await pool.query(
      `INSERT INTO Materia (nombre, descripcion)
       VALUES ($1, $2) RETURNING *;`,
      [nombre, descripcion]
    );
    return rows[0];
  },
  async update(id, { nombre, descripcion }) {
    const { rows } = await pool.query(
      `UPDATE Materia
       SET nombre=$1, descripcion=$2
       WHERE id=$3 RETURNING *;`,
      [nombre, descripcion, id]
    );
    return rows[0];
  },
  async delete(id) {
    await pool.query("DELETE FROM Materia WHERE id = $1;", [id]);
  },
};
