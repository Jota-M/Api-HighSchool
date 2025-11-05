import { pool } from "../db/pool.js";

export const Documentos = {
  create: async (preinscripcionId, archivos) => {
    const query = `
      INSERT INTO documentos (
        preinscripcion_id,
        cedula_estudiante,
        certificado_nacimiento,
        libreta_notas,
        cedula_representante
      ) VALUES ($1,$2,$3,$4,$5)
      RETURNING *;
    `;
    const values = [
      preinscripcionId,
      archivos.cedula_estudiante,
      archivos.certificado_nacimiento,
      archivos.libreta_notas,
      archivos.cedula_representante
    ];

    const res = await pool.query(query, values);
    return res.rows[0];
  }
};
