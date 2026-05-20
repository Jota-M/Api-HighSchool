// models/MaterialAsignado.js — v2.0
//
// Cambios respecto a v1:
//   - asignar(): acepta url_recurso_externo, titulo_recurso_externo, origen_externo
//     para recursos de internet sugeridos por Gemini.
//     Cuando viene un recurso externo, material_academico_id es NULL.
//   - asignarExterno(): método específico para recursos web — ON CONFLICT
//     por url_recurso_externo en lugar de material_academico_id.
//   - listarPorEstudiante(): incluye los campos nuevos en el SELECT.
//   - listarParaEstudiante(): ídem — el estudiante ve tanto internos como externos.
//   - marcarVisto(), quitar(), contarPendientes(): sin cambios.

import { pool } from '../db/pool.js';

class MaterialAsignado {

  /**
   * Asignar un material INTERNO del repositorio a un estudiante.
   * Si ya existe (misma clave única), actualiza mensaje y origen.
   */
  static async asignar({
    material_academico_id,
    matricula_id,
    asignacion_docente_id,
    asignado_por,
    origen = 'manual',
    mensaje_docente = null,
  }) {
    const { rows } = await pool.query(`
      INSERT INTO material_asignado_estudiante (
        material_academico_id, matricula_id, asignacion_docente_id,
        asignado_por, origen, mensaje_docente
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT ON CONSTRAINT uq_material_asignado_interno
      DO UPDATE SET
        origen          = EXCLUDED.origen,
        mensaje_docente = EXCLUDED.mensaje_docente,
        asignado_por    = EXCLUDED.asignado_por,
        activo          = true,
        updated_at      = CURRENT_TIMESTAMP
      RETURNING *
    `, [material_academico_id, matricula_id, asignacion_docente_id,
        asignado_por, origen, mensaje_docente]);
    return rows[0];
  }

  /**
   * Asignar un recurso EXTERNO (internet) sugerido por Gemini/búsqueda web.
   * material_academico_id es NULL — el recurso vive solo como URL.
   * ON CONFLICT por (url_recurso_externo, matricula_id, asignacion_docente_id).
   */
  static async asignarExterno({
    url_recurso_externo,
    titulo_recurso_externo,
    origen_externo,           // 'youtube' | 'khan_academy' | 'web' | etc.
    matricula_id,
    asignacion_docente_id,
    asignado_por,
    mensaje_docente = null,
  }) {
    const { rows } = await pool.query(`
      INSERT INTO material_asignado_estudiante (
        material_academico_id,
        url_recurso_externo, titulo_recurso_externo, origen_externo,
        matricula_id, asignacion_docente_id,
        asignado_por, origen, mensaje_docente
      )
      VALUES (NULL, $1, $2, $3, $4, $5, $6, 'web_search', $7)
      ON CONFLICT ON CONSTRAINT uq_material_asignado_externo
      DO UPDATE SET
        titulo_recurso_externo = EXCLUDED.titulo_recurso_externo,
        mensaje_docente        = EXCLUDED.mensaje_docente,
        asignado_por           = EXCLUDED.asignado_por,
        activo                 = true,
        updated_at             = CURRENT_TIMESTAMP
      RETURNING *
    `, [url_recurso_externo, titulo_recurso_externo, origen_externo,
        matricula_id, asignacion_docente_id, asignado_por, mensaje_docente]);
    return rows[0];
  }

  /**
   * Quitar una asignación (soft delete).
   */
  static async quitar(id) {
    const { rows } = await pool.query(`
      UPDATE material_asignado_estudiante
      SET activo = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);
    return rows[0];
  }

  /**
   * Listar materiales asignados a un estudiante (vista del DOCENTE).
   * Incluye tanto materiales internos como recursos externos.
   */
  static async listarPorEstudiante(matricula_id, asignacion_docente_id) {
    const { rows } = await pool.query(`
      SELECT
        mae.id,
        mae.origen,
        mae.mensaje_docente,
        mae.visto_por_estudiante,
        mae.fecha_vista,
        mae.created_at,
        mae.asignado_por,
        -- Recurso externo (cuando material_academico_id es NULL)
        mae.url_recurso_externo,
        mae.titulo_recurso_externo,
        mae.origen_externo,
        -- Material interno (puede ser NULL si es externo)
        ma.id             AS material_id,
        ma.codigo_material,
        ma.titulo,
        ma.descripcion,
        ma.url_archivo,
        ma.url_externa,
        ma.es_enlace_externo,
        ma.es_destacado,
        ma.contador_vistas,
        -- Tipo (NULL para recursos externos sin material_academico)
        tm.nombre         AS tipo_nombre,
        tm.codigo         AS tipo_codigo,
        tm.icono          AS tipo_icono,
        tm.color          AS tipo_color,
        -- Quién asignó
        u.username        AS asignado_por_username,
        -- Campo calculado para el frontend
        CASE
          WHEN mae.material_academico_id IS NOT NULL THEN 'interno'
          ELSE 'externo'
        END               AS tipo_recurso
      FROM material_asignado_estudiante mae
      LEFT JOIN material_academico ma ON mae.material_academico_id = ma.id
      LEFT JOIN tipo_material tm      ON ma.tipo_material_id = tm.id
      JOIN  usuarios u                ON mae.asignado_por = u.id
      WHERE mae.matricula_id          = $1
        AND mae.asignacion_docente_id = $2
        AND mae.activo                = true
        AND (ma.activo = true OR mae.material_academico_id IS NULL)
        AND (ma.deleted_at IS NULL OR mae.material_academico_id IS NULL)
      ORDER BY mae.created_at DESC
    `, [matricula_id, asignacion_docente_id]);
    return rows;
  }

  /**
   * Listar materiales asignados al ESTUDIANTE autenticado.
   * Agrupa por asignación docente/materia.
   * Incluye internos y externos.
   */
  static async listarParaEstudiante(matricula_id) {
  const { rows } = await pool.query(`
    SELECT
      mae.id,
      mae.origen,
      mae.mensaje_docente,
      mae.visto_por_estudiante,
      mae.fecha_vista,
      mae.created_at,
      -- Recurso externo
      mae.url_recurso_externo,
      mae.titulo_recurso_externo,
      mae.origen_externo,
      -- Material interno (puede ser NULL)
      ma.id              AS material_id,
      ma.codigo_material,
      ma.titulo,
      ma.descripcion,
      ma.url_archivo,
      ma.url_externa,
      ma.es_enlace_externo,
      ma.es_destacado,
      -- Tipo
      tm.nombre          AS tipo_nombre,
      tm.codigo          AS tipo_codigo,
      tm.icono           AS tipo_icono,
      tm.color           AS tipo_color,
      -- Materia
      mat.nombre         AS materia_nombre,
      mat.codigo         AS materia_codigo,
      -- Docente
      d.nombres          AS docente_nombres,
      d.apellido_paterno AS docente_apellido,
      -- Asignación
      mae.asignacion_docente_id,
      -- Tipo de recurso para el frontend
      CASE
        WHEN mae.material_academico_id IS NOT NULL THEN 'interno'
        ELSE 'externo'
      END                AS tipo_recurso,
      -- Título unificado: interno usa ma.titulo, externo usa mae.titulo_recurso_externo
      COALESCE(
        ma.titulo,
        mae.titulo_recurso_externo
      )                  AS titulo_final,
      -- URL final unificada
      COALESCE(
        ma.url_externa,
        ma.url_archivo,
        mae.url_recurso_externo
      )                  AS url_final
    FROM material_asignado_estudiante mae
    LEFT JOIN material_academico ma  ON mae.material_academico_id = ma.id
    LEFT JOIN tipo_material tm       ON ma.tipo_material_id = tm.id
    JOIN  asignacion_docente ad      ON mae.asignacion_docente_id = ad.id
    JOIN  grado_materia gm           ON ad.grado_materia_id = gm.id
    JOIN  materia mat                ON gm.materia_id = mat.id
    JOIN  docente d                  ON ad.docente_id = d.id
    WHERE mae.matricula_id = $1
      AND mae.activo       = true
      AND (ma.activo    = true OR mae.material_academico_id IS NULL)
      AND (ma.deleted_at IS NULL OR mae.material_academico_id IS NULL)
    ORDER BY mae.visto_por_estudiante ASC, mae.created_at DESC
  `, [matricula_id]);
  return rows;
}

  /**
   * Marcar como visto por el estudiante.
   */
  static async marcarVisto(id, matricula_id) {
    const { rows } = await pool.query(`
      UPDATE material_asignado_estudiante
      SET
        visto_por_estudiante = true,
        fecha_vista          = CURRENT_TIMESTAMP,
        updated_at           = CURRENT_TIMESTAMP
      WHERE id = $1
        AND matricula_id = $2
        AND activo = true
      RETURNING *
    `, [id, matricula_id]);
    return rows[0];
  }

  /**
   * Contar pendientes de ver para badge en el navbar del estudiante.
   */
  static async contarPendientes(matricula_id) {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::INTEGER AS total
      FROM material_asignado_estudiante
      WHERE matricula_id           = $1
        AND activo                 = true
        AND visto_por_estudiante   = false
    `, [matricula_id]);
    return rows[0]?.total ?? 0;
  }
}

export default MaterialAsignado;