// server/src/models/informeCualitativoModel.js
import { pool } from '../db/pool.js';

export const InformeCualitativoModel = {
  async getByMatriculaPeriodo(matriculaId, periodoEvaluacionId) {
    const query = `
      SELECT ic.*, 
             u.username as redactado_por_usuario,
             e.rude as codigo_rude,
             e.nombres as estudiante_nombres,
             e.apellidos as estudiante_apellidos,
             e.genero as estudiante_genero,
             p.nombre as paralelo_nombre,
             g.nombre as grado_nombre
      FROM informe_cualitativo ic
      JOIN matricula m ON ic.matricula_id = m.id
      JOIN estudiante e ON m.estudiante_id = e.id
      JOIN paralelo p ON m.paralelo_id = p.id
      JOIN grado g ON p.grado_id = g.id
      LEFT JOIN usuarios u ON ic.redactado_por = u.id
      WHERE ic.matricula_id = $1 AND ic.periodo_evaluacion_id = $2;
    `;
    const { rows } = await pool.query(query, [matriculaId, periodoEvaluacionId]);
    return rows[0] || null;
  },

  async findByParaleloPeriodo(paraleloId, periodoEvaluacionId) {
    const query = `
      SELECT m.id as matricula_id, e.rude as codigo_rude,
             e.id as estudiante_id, e.nombres, e.apellidos, e.genero, e.foto_url,
             ic.id as informe_id, ic.texto, ic.generado_por_ia, 
             COALESCE(ic.estado, 'pendiente') as estado,
             ic.fecha_publicacion, ic.updated_at
      FROM matricula m
      JOIN estudiante e ON m.estudiante_id = e.id
      LEFT JOIN informe_cualitativo ic ON ic.matricula_id = m.id AND ic.periodo_evaluacion_id = $2
      WHERE m.paralelo_id = $1
        AND m.estado IN ('activo', 'inscrito', 'regular')
        AND m.deleted_at IS NULL
      ORDER BY e.apellido_paterno ASC, e.apellido_materno ASC, e.nombres ASC;
    `;
    const { rows } = await pool.query(query, [paraleloId, periodoEvaluacionId]);
    return rows;
  },

  async findCentralizadorByParalelo(paraleloId) {
    const query = `
      SELECT m.id as matricula_id, e.rude as codigo_rude,
             e.id as estudiante_id, e.nombres, e.apellidos, e.genero, e.foto_url,
             p.id as paralelo_id, p.nombre as paralelo_nombre,
             g.id as grado_id, g.nombre as grado_nombre,
             COALESCE(
               json_agg(
                 json_build_object(
                   'periodo_id', pe.id,
                   'periodo_nombre', pe.nombre,
                   'periodo_orden', pe.orden,
                   'informe_id', ic.id,
                   'texto', ic.texto,
                   'estado', COALESCE(ic.estado, 'pendiente'),
                   'generado_por_ia', ic.generado_por_ia,
                   'updated_at', ic.updated_at
                 ) ORDER BY pe.orden ASC
               ) FILTER (WHERE pe.id IS NOT NULL), '[]'
             ) as periodos_informe
      FROM matricula m
      JOIN estudiante e ON m.estudiante_id = e.id
      JOIN paralelo p ON m.paralelo_id = p.id
      JOIN grado g ON p.grado_id = g.id
      CROSS JOIN (
        SELECT id, nombre, orden
        FROM periodo_evaluacion
        WHERE activo = true
        ORDER BY orden ASC
      ) pe
      LEFT JOIN informe_cualitativo ic ON ic.matricula_id = m.id AND ic.periodo_evaluacion_id = pe.id
      WHERE m.paralelo_id = $1
        AND m.estado IN ('activo', 'inscrito', 'regular')
        AND m.deleted_at IS NULL
      GROUP BY m.id, e.id, e.rude, e.nombres, e.apellidos, e.genero, e.foto_url, p.id, p.nombre, g.id, g.nombre
      ORDER BY e.apellido_paterno ASC, e.apellido_materno ASC, e.nombres ASC;
    `;
    const { rows } = await pool.query(query, [paraleloId]);
    return rows;
  },

  async upsert({ matricula_id, periodo_evaluacion_id, texto, generado_por_ia = false, estado = 'borrador', redactado_por }) {
    const query = `
      INSERT INTO informe_cualitativo (
        matricula_id, periodo_evaluacion_id, texto,
        generado_por_ia, estado, redactado_por, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (matricula_id, periodo_evaluacion_id)
      DO UPDATE SET
        texto = EXCLUDED.texto,
        generado_por_ia = EXCLUDED.generado_por_ia,
        estado = EXCLUDED.estado,
        redactado_por = EXCLUDED.redactado_por,
        updated_at = NOW()
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [
      matricula_id,
      periodo_evaluacion_id,
      texto,
      generado_por_ia,
      estado,
      redactado_por || null
    ]);
    return rows[0];
  },

  async publicar(matriculaId, periodoEvaluacionId, redactadoPor) {
    const query = `
      UPDATE informe_cualitativo
      SET estado = 'publicado',
          fecha_publicacion = NOW(),
          redactado_por = COALESCE($3, redactado_por),
          updated_at = NOW()
      WHERE matricula_id = $1 AND periodo_evaluacion_id = $2
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [matriculaId, periodoEvaluacionId, redactadoPor]);
    return rows[0] || null;
  }
};
