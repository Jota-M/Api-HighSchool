// server/src/models/indicadorLogroModel.js
import { pool } from '../db/pool.js';

export const IndicadorLogroModel = {
  async getById(id) {
    const query = `
      SELECT il.*, m.nombre as campo_nombre, m.codigo as campo_codigo
      FROM indicador_logro il
      JOIN grado_materia gm ON il.grado_materia_id = gm.id
      JOIN materia m ON gm.materia_id = m.id
      WHERE il.id = $1 AND il.deleted_at IS NULL;
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
  },

  async findByGradoMateria(gradoMateriaId, periodoEvaluacionId = null) {
    let query = `
      SELECT il.*, pe.nombre as periodo_nombre
      FROM indicador_logro il
      LEFT JOIN periodo_evaluacion pe ON il.periodo_evaluacion_id = pe.id
      WHERE il.grado_materia_id = $1
        AND il.activo = true
        AND il.deleted_at IS NULL
    `;
    const params = [gradoMateriaId];

    if (periodoEvaluacionId) {
      query += ` AND (il.periodo_evaluacion_id = $2 OR il.periodo_evaluacion_id IS NULL) `;
      params.push(periodoEvaluacionId);
    }

    query += ` ORDER BY il.orden ASC, il.id ASC;`;
    const { rows } = await pool.query(query, params);
    return rows;
  },

  async findByGrado(gradoId, periodoEvaluacionId = null) {
    let query = `
      SELECT il.*, gm.id as grado_materia_id, m.id as materia_id, m.codigo as campo_codigo, m.nombre as campo_nombre
      FROM indicador_logro il
      JOIN grado_materia gm ON il.grado_materia_id = gm.id
      JOIN materia m ON gm.materia_id = m.id
      WHERE gm.grado_id = $1
        AND il.activo = true
        AND il.deleted_at IS NULL
    `;
    const params = [gradoId];

    if (periodoEvaluacionId) {
      query += ` AND (il.periodo_evaluacion_id = $2 OR il.periodo_evaluacion_id IS NULL) `;
      params.push(periodoEvaluacionId);
    }

    query += ` ORDER BY gm.orden ASC, il.orden ASC, il.id ASC;`;
    const { rows } = await pool.query(query, params);
    return rows;
  },

  async create({ grado_materia_id, periodo_evaluacion_id = null, descripcion, orden = 1 }) {
    const query = `
      INSERT INTO indicador_logro (grado_materia_id, periodo_evaluacion_id, descripcion, orden, activo)
      VALUES ($1, $2, $3, $4, true)
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [
      grado_materia_id,
      periodo_evaluacion_id || null,
      descripcion,
      orden || 1
    ]);
    return rows[0];
  },

  async update(id, { descripcion, orden, activo, periodo_evaluacion_id }) {
    const fields = [];
    const params = [];
    let p = 1;

    if (descripcion !== undefined) { fields.push(`descripcion = $${p++}`); params.push(descripcion); }
    if (orden !== undefined) { fields.push(`orden = $${p++}`); params.push(orden); }
    if (activo !== undefined) { fields.push(`activo = $${p++}`); params.push(activo); }
    if (periodo_evaluacion_id !== undefined) { fields.push(`periodo_evaluacion_id = $${p++}`); params.push(periodo_evaluacion_id || null); }

    fields.push(`updated_at = NOW()`);
    params.push(id);

    const query = `
      UPDATE indicador_logro
      SET ${fields.join(', ')}
      WHERE id = $${p} AND deleted_at IS NULL
      RETURNING *;
    `;
    const { rows } = await pool.query(query, params);
    return rows[0] || null;
  },

  async delete(id) {
    const query = `
      UPDATE indicador_logro
      SET deleted_at = NOW(), activo = false
      WHERE id = $1
      RETURNING id;
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
  }
};
