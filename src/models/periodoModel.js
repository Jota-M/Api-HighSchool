// models/periodoModel.js
import { pool } from "../db/pool.js";

export const PeriodoModel = {
  async getAll() {
    const { rows } = await pool.query(`
      SELECT 
        id, 
        nombre, 
        TO_CHAR(fecha_inicio, 'YYYY-MM-DD') as fecha_inicio,
        TO_CHAR(fecha_fin, 'YYYY-MM-DD') as fecha_fin,
        activo 
      FROM periodo_academico 
      ORDER BY fecha_inicio DESC;
    `);
    return rows;
  },

  async getById(id) {
    const { rows } = await pool.query(`
      SELECT 
        id, 
        nombre, 
        TO_CHAR(fecha_inicio, 'YYYY-MM-DD') as fecha_inicio,
        TO_CHAR(fecha_fin, 'YYYY-MM-DD') as fecha_fin,
        activo 
      FROM periodo_academico 
      WHERE id = $1;
    `, [id]);
    return rows[0];
  },

  async getActive() {
    const { rows } = await pool.query(`
      SELECT 
        id, 
        nombre, 
        TO_CHAR(fecha_inicio, 'YYYY-MM-DD') as fecha_inicio,
        TO_CHAR(fecha_fin, 'YYYY-MM-DD') as fecha_fin,
        activo 
      FROM periodo_academico 
      WHERE activo = true
      LIMIT 1;
    `);
    return rows[0];
  },

  async create({ nombre, fecha_inicio, fecha_fin, activo }) {
    // Si el nuevo periodo es activo, desactivar los demás
    if (activo) {
      await pool.query("UPDATE Periodo SET activo = false;");
    }

    const { rows } = await pool.query(
      `INSERT INTO periodo_academico (nombre, fecha_inicio, fecha_fin, activo)
       VALUES ($1, $2, $3, $4) 
       RETURNING 
         id, 
         nombre, 
         TO_CHAR(fecha_inicio, 'YYYY-MM-DD') as fecha_inicio,
         TO_CHAR(fecha_fin, 'YYYY-MM-DD') as fecha_fin,
         activo;`,
      [nombre, fecha_inicio, fecha_fin, activo]
    );
    return rows[0];
  },

  async update(id, { nombre, fecha_inicio, fecha_fin, activo }) {
    // Si se activa este periodo, desactivar los demás
    if (activo) {
      await pool.query("UPDATE periodo_academico SET activo = false WHERE id != $1;", [id]);
    }

    const { rows } = await pool.query(
      `UPDATE periodo_academico
       SET nombre=$1, fecha_inicio=$2, fecha_fin=$3, activo=$4
       WHERE id=$5 
       RETURNING 
         id, 
         nombre, 
         TO_CHAR(fecha_inicio, 'YYYY-MM-DD') as fecha_inicio,
         TO_CHAR(fecha_fin, 'YYYY-MM-DD') as fecha_fin,
         activo;`,
      [nombre, fecha_inicio, fecha_fin, activo, id]
    );
    return rows[0];
  },

  async delete(id) {
    // Verificar que no tenga niveles asociados
    const { rows } = await pool.query(
      "SELECT COUNT(*) as count FROM NivelAcademico WHERE periodo_id = $1;",
      [id]
    );
    
    if (parseInt(rows[0].count) > 0) {
      throw new Error("No se puede eliminar un periodo con niveles asociados");
    }

    await pool.query("DELETE FROM Periodo WHERE id = $1;", [id]);
  },
};