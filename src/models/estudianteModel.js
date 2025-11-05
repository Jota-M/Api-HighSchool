import { pool } from "../db/pool.js";

export const Estudiante = {
  create: async (data) => {
    const query = `
      INSERT INTO estudiante (
        nombres, apellido_paterno, apellido_materno, ci, fecha_nacimiento,
        genero, nacionalidad, institucion_procedencia, ultimo_grado_cursado,
        grado_solicitado, repite_grado, turno, discapacidad,
        descripcion_discapacidad, direccion, numero_casa, departamento,
        ciudad, telefono_domicilio, telefono_movil, correo
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
      ) RETURNING *;
    `;
    const values = [
      data.nombres, data.apellido_paterno, data.apellido_materno, data.ci, data.fecha_nacimiento,
      data.genero, data.nacionalidad, data.institucion_procedencia, data.ultimo_grado_cursado,
      data.grado_solicitado, data.repite_grado, data.turno, data.discapacidad,
      data.descripcion_discapacidad, data.direccion, data.numero_casa, data.departamento,
      data.ciudad, data.telefono_domicilio, data.telefono_movil, data.correo
    ];

    const res = await pool.query(query, values);
    return res.rows[0];
  }
};
