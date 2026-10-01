// server/src/models/registroCotejoModel.js
import { pool } from '../db/pool.js';

export const RegistroCotejoModel = {
  /**
   * Obtiene la estructura completa de la grilla de cotejo para un paralelo y periodo.
   * Si gradoMateriaId viene especificado, filtra solo ese campo; si no, devuelve los 4 campos del grado.
   */
  async findMatrizByParalelo(paraleloId, periodoEvaluacionId, gradoMateriaId = null) {
    // 1. Obtener información del paralelo y su grado
    const parRes = await pool.query(`
      SELECT p.id, p.nombre, p.grado_id, g.nombre as grado_nombre, g.nivel_academico_id
      FROM paralelo p
      JOIN grado g ON p.grado_id = g.id
      WHERE p.id = $1;
    `, [paraleloId]);

    if (!parRes.rows.length) return null;
    const paralelo = parRes.rows[0];

    // 2. Obtener lista de estudiantes matriculados activos
    const estRes = await pool.query(`
      SELECT m.id as matricula_id, e.rude as codigo_rude, m.numero_matricula,
             e.id as estudiante_id, e.nombres, e.apellido_paterno, e.apellido_materno, e.apellidos,
             e.genero, e.ci, e.foto_url
      FROM matricula m
      JOIN estudiante e ON m.estudiante_id = e.id
      WHERE m.paralelo_id = $1
        AND m.estado IN ('activo', 'inscrito', 'regular')
        AND m.deleted_at IS NULL
      ORDER BY e.apellido_paterno ASC, e.apellido_materno ASC, e.nombres ASC;
    `, [paraleloId]);

    // 3. Obtener indicadores de logro (del campo específico o de todos los campos del grado)
    let indQuery = `
      SELECT il.id, il.descripcion, il.orden, il.periodo_evaluacion_id,
             gm.id as grado_materia_id, gm.orden as campo_orden,
             m.id as materia_id, m.codigo as campo_codigo, m.nombre as campo_nombre
      FROM indicador_logro il
      JOIN grado_materia gm ON il.grado_materia_id = gm.id
      JOIN materia m ON gm.materia_id = m.id
      WHERE gm.grado_id = $1
        AND il.activo = true
        AND il.deleted_at IS NULL
        AND (il.periodo_evaluacion_id = $2 OR il.periodo_evaluacion_id IS NULL)
    `;
    const indParams = [paralelo.grado_id, periodoEvaluacionId];

    if (gradoMateriaId) {
      indQuery += ` AND gm.id = $3 `;
      indParams.push(gradoMateriaId);
    }

    indQuery += ` ORDER BY gm.orden ASC, il.orden ASC, il.id ASC;`;
    const indRes = await pool.query(indQuery, indParams);

    // 4. Obtener registros existentes de cotejo para los estudiantes e indicadores obtenidos
    const matriculaIds = estRes.rows.map(e => e.matricula_id);
    let cotejoRows = [];

    if (matriculaIds.length > 0 && indRes.rows.length > 0) {
      const cotRes = await pool.query(`
        SELECT rc.id, rc.matricula_id, rc.indicador_logro_id, rc.periodo_evaluacion_id,
               rc.nivel_logro_id, rc.observaciones, rc.updated_at,
               nl.codigo as nivel_codigo, nl.nombre as nivel_nombre, nl.color as nivel_color
        FROM registro_cotejo rc
        LEFT JOIN nivel_logro nl ON rc.nivel_logro_id = nl.id
        WHERE rc.matricula_id = ANY($1::int[])
          AND rc.periodo_evaluacion_id = $2;
      `, [matriculaIds, periodoEvaluacionId]);
      cotejoRows = cotRes.rows;
    }

    // 5. Obtener los campos curriculares del grado (grado_materia)
    let camposRes = await pool.query(`
      SELECT gm.id as grado_materia_id, gm.orden as campo_orden,
             m.id as materia_id, m.codigo as campo_codigo, m.nombre as campo_nombre
      FROM grado_materia gm
      JOIN materia m ON gm.materia_id = m.id
      WHERE gm.grado_id = $1
      ORDER BY gm.orden ASC, gm.id ASC;
    `, [paralelo.grado_id]);

    // Si este grado de Inicial no tiene asociados los campos de Inicial en grado_materia, los vinculamos
    if (camposRes.rows.length === 0) {
      await pool.query(`
        INSERT INTO grado_materia (grado_id, materia_id, orden, activo)
        SELECT $1, id, ROW_NUMBER() OVER (ORDER BY id), true
        FROM materia
        WHERE codigo IN ('INI-COM', 'INI-CON', 'INI-BIO', 'INI-SOC')
        ON CONFLICT (grado_id, materia_id) DO NOTHING;
      `, [paralelo.grado_id]);

      camposRes = await pool.query(`
        SELECT gm.id as grado_materia_id, gm.orden as campo_orden,
               m.id as materia_id, m.codigo as campo_codigo, m.nombre as campo_nombre
        FROM grado_materia gm
        JOIN materia m ON gm.materia_id = m.id
        WHERE gm.grado_id = $1
        ORDER BY gm.orden ASC, gm.id ASC;
      `, [paralelo.grado_id]);
    }

    return {
      paralelo,
      estudiantes: estRes.rows,
      indicadores: indRes.rows,
      registros: cotejoRows,
      campos: camposRes.rows
    };
  },

  /**
   * Guarda o actualiza múltiples registros de cotejo de manera atómica (bulk upsert).
   * Si un registro viene sin nivel_logro_id ni observaciones, lo elimina.
   */
  async upsertBulk(registros, usuarioId) {
    if (!Array.isArray(registros) || registros.length === 0) return { guardados: 0, eliminados: 0 };

    const client = await pool.connect();
    let guardados = 0;
    let eliminados = 0;

    try {
      await client.query('BEGIN');

      for (const item of registros) {
        const { matricula_id, indicador_logro_id, periodo_evaluacion_id, nivel_logro_id, observaciones } = item;

        // Si se desmarcó y no tiene notas
        if (!nivel_logro_id && (!observaciones || !observaciones.trim())) {
          const delRes = await client.query(`
            DELETE FROM registro_cotejo
            WHERE matricula_id = $1 AND indicador_logro_id = $2 AND periodo_evaluacion_id = $3;
          `, [matricula_id, indicador_logro_id, periodo_evaluacion_id]);
          if (delRes.rowCount > 0) eliminados++;
        } else {
          await client.query(`
            INSERT INTO registro_cotejo (
              matricula_id, indicador_logro_id, periodo_evaluacion_id,
              nivel_logro_id, observaciones, registrado_por, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (matricula_id, indicador_logro_id, periodo_evaluacion_id)
            DO UPDATE SET
              nivel_logro_id = EXCLUDED.nivel_logro_id,
              observaciones = EXCLUDED.observaciones,
              registrado_por = EXCLUDED.registrado_por,
              updated_at = NOW();
          `, [
            matricula_id,
            indicador_logro_id,
            periodo_evaluacion_id,
            nivel_logro_id || null,
            observaciones || null,
            usuarioId
          ]);
          guardados++;
        }
      }

      await client.query('COMMIT');
      return { guardados, eliminados };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Obtiene todos los cotejos de un estudiante en un periodo estructurados por Campo de Desarrollo.
   * Utilizado para alimentar el prompt de Gemini y para la vista del tutor.
   */
  async findByMatriculaPeriodo(matriculaId, periodoEvaluacionId) {
    const query = `
      SELECT m.id as campo_id, m.codigo as campo_codigo, m.nombre as campo_nombre,
             il.id as indicador_id, il.descripcion as indicador_descripcion, il.orden as indicador_orden,
             rc.id as cotejo_id, rc.observaciones,
             nl.id as nivel_id, nl.codigo as nivel_codigo, nl.nombre as nivel_nombre, nl.color as nivel_color
      FROM grado_materia gm
      JOIN materia m ON gm.materia_id = m.id
      JOIN indicador_logro il ON il.grado_materia_id = gm.id AND il.activo = true AND il.deleted_at IS NULL
      JOIN matricula mat ON mat.id = $1
      JOIN paralelo p ON mat.paralelo_id = p.id AND p.grado_id = gm.grado_id
      LEFT JOIN registro_cotejo rc ON rc.indicador_logro_id = il.id 
                                  AND rc.matricula_id = $1 
                                  AND rc.periodo_evaluacion_id = $2
      LEFT JOIN nivel_logro nl ON rc.nivel_logro_id = nl.id
      WHERE (il.periodo_evaluacion_id = $2 OR il.periodo_evaluacion_id IS NULL)
      ORDER BY gm.orden ASC, il.orden ASC;
    `;
    const { rows } = await pool.query(query, [matriculaId, periodoEvaluacionId]);
    return rows;
  }
};
