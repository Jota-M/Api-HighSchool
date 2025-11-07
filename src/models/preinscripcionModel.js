import { pool } from "../db/pool.js";

export const Preinscripcion = {
  // Crear
  create: async (estudianteId, representanteId) => {
    const query = `
      INSERT INTO preinscripcion (estudiante_id, representante_id)
      VALUES ($1,$2)
      RETURNING *;
    `;
    const res = await pool.query(query, [estudianteId, representanteId]);
    return res.rows[0];
  },

  // Obtener todas las preinscripciones
getAll: async () => {
  const res = await pool.query(`
    SELECT 
      p.id AS preinscripcion_id,
      p.estado,
      e.nombres AS estudiante_nombres,
      e.apellido_paterno AS estudiante_apellido_paterno,
      e.apellido_materno AS estudiante_apellido_materno,
      e.ci AS estudiante_ci,
      e.grado_solicitado AS estudiante_grado_solicitado,
      r.nombres AS representante_nombres,
      r.apellido_paterno AS representante_apellido_paterno,
      r.apellido_materno AS representante_apellido_materno,
      r.ci AS representante_ci,
      d.certificado_nacimiento,
      d.libreta_notas,
      d.cedula_estudiante,
      d.cedula_representante,
      d.fecha_subida
    FROM preinscripcion p
    JOIN estudiante e ON p.estudiante_id = e.id
    JOIN representante r ON p.representante_id = r.id
    JOIN documentos d ON d.preinscripcion_id = p.id;
  `);
  return res.rows;
},


 // Obtener una preinscripción por ID
getById: async (id) => {
  const res = await pool.query(
    `
    SELECT 
      p.id AS preinscripcion_id,
      p.estado,
      p.fecha_registro AS fecha_subida,
      
      -- Datos del Estudiante
      e.nombres,
      e.apellido_paterno,
      e.apellido_materno,
      e.ci,
      e.fecha_nacimiento,
      e.genero,
      e.nacionalidad,
      e.institucion_procedencia,
      e.ultimo_grado_cursado,
      e.grado_solicitado,
      e.repite_grado,
      e.turno,
      e.discapacidad,
      e.descripcion_discapacidad,
      e.direccion,
      e.numero_casa,
      e.departamento,
      e.ciudad,
      e.telefono_domicilio,
      e.telefono_movil,
      e.correo,
      
      -- Datos del Representante
      r.tipo_representante,
      r.nombres AS representante_nombres,
      r.apellido_paterno AS representante_apellido_paterno,
      r.apellido_materno AS representante_apellido_materno,
      r.ci AS representante_ci,
      r.fecha_nacimiento AS representante_fecha_nacimiento,
      r.genero AS representante_genero,
      r.nacionalidad AS representante_nacionalidad,
      r.profesion,
      r.lugar_trabajo,
      r.telefono,
      r.correo AS representante_correo,
      
      -- Documentos
      d.cedula_estudiante,
      d.certificado_nacimiento,
      d.libreta_notas,
      d.cedula_representante,
      d.fecha_subida AS documentos_fecha_subida
      
    FROM preinscripcion p
    JOIN estudiante e ON p.estudiante_id = e.id
    JOIN representante r ON p.representante_id = r.id
    LEFT JOIN documentos d ON d.preinscripcion_id = p.id
    WHERE p.id = $1;
    `,
    [id]
  );
  
  return res.rows[0];
},


  // Eliminar preinscripción
  delete: async (id) => {
    const res = await pool.query(`DELETE FROM preinscripcion WHERE id = $1 RETURNING *`, [id]);
    return res.rows[0];
  },

  // Actualizar estado (ejemplo)
  updateEstado: async (id, estado) => {
    const res = await pool.query(`
      UPDATE preinscripcion
      SET estado = $1
      WHERE id = $2
      RETURNING *
    `, [estado, id]);
    return res.rows[0];
  }
};
