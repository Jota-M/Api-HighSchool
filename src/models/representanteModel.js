import { pool } from "../db/pool.js";

export const Representante = {
  create: async (data) => {
    const query = `
      INSERT INTO representante (
        tipo_representante, nombres, apellido_paterno, apellido_materno, ci,
        fecha_nacimiento, genero, nacionalidad, profesion, lugar_trabajo,
        telefono, correo
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *;
    `;
    const values = [
      data.tipo_representante, data.nombres, data.apellido_paterno, data.apellido_materno, data.ci,
      data.fecha_nacimiento, data.genero, data.nacionalidad, data.profesion,
      data.lugar_trabajo, data.telefono, data.correo
    ];
    const res = await pool.query(query, values);
    return res.rows[0];
  }
};
