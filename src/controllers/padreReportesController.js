// ══════════════════════════════════════════════
// controllers/padreReportesController.js
// Endpoints que usa el portal del padre para
// cargar sus hijos y las materias de cada uno
// ══════════════════════════════════════════════

import { pool } from '../db/pool.js';

class PadreReportesController {

  // ──────────────────────────────────────────────
  // GET /api/padre/mis-hijos
  // Devuelve los hijos matriculados del padre
  // autenticado en el período académico activo
  // ──────────────────────────────────────────────
  static async misHijos(req, res) {
    try {
      const result = await pool.query(`
        SELECT
          m.id                    AS matricula_id,
          e.id                    AS estudiante_id,
          e.codigo,
          e.nombres,
          e.apellidos,
          e.foto_url,
          g.nombre                AS grado_nombre,
          n.nombre                AS nivel_nombre,
          par.nombre              AS paralelo_nombre,
          pa.nombre               AS periodo_nombre,
          pa.id                   AS periodo_academico_id
        FROM padre_familia pf
        INNER JOIN estudiante_tutor et ON et.padre_familia_id = pf.id
        INNER JOIN estudiante e        ON et.estudiante_id    = e.id
        INNER JOIN matricula m
          ON  m.estudiante_id = e.id
          AND m.estado        = 'activo'
          AND m.deleted_at    IS NULL
        INNER JOIN paralelo par         ON m.paralelo_id           = par.id
        INNER JOIN grado g              ON par.grado_id            = g.id
        INNER JOIN nivel_academico n    ON g.nivel_academico_id    = n.id
        INNER JOIN periodo_academico pa ON m.periodo_academico_id  = pa.id
          AND pa.activo = true
        WHERE pf.usuario_id = $1
          AND e.deleted_at  IS NULL
        ORDER BY e.apellidos, e.nombres
      `, [req.user.id]);

      res.json({ success: true, data: { hijos: result.rows } });
    } catch (error) {
      console.error('Error al obtener hijos:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ──────────────────────────────────────────────
  // GET /api/padre/materias/:matricula_id
  // Materias del hijo — con validación de acceso
  // (el padre solo puede ver a sus propios hijos)
  // ──────────────────────────────────────────────
  static async materiasHijo(req, res) {
    try {
      const { matricula_id } = req.params;

      // Verificar que la matrícula pertenece a un hijo del padre
      const acceso = await pool.query(`
        SELECT m.id
        FROM matricula m
        INNER JOIN estudiante e        ON m.estudiante_id    = e.id
        INNER JOIN estudiante_tutor et ON et.estudiante_id   = e.id
        INNER JOIN padre_familia pf    ON et.padre_familia_id = pf.id
        WHERE m.id         = $1
          AND pf.usuario_id = $2
          AND m.deleted_at  IS NULL
      `, [matricula_id, req.user.id]);

      if (acceso.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'No tenés acceso a esta matrícula',
        });
      }

      // Materias del período de esa matrícula
      const result = await pool.query(`
        SELECT
          ad.id                AS asignacion_id,
          mat.nombre           AS materia_nombre,
          mat.codigo           AS materia_codigo,
          mat.color            AS materia_color,
          gm.id                AS grado_materia_id
        FROM matricula m
        INNER JOIN asignacion_docente ad
          ON  ad.paralelo_id          = m.paralelo_id
          AND ad.periodo_academico_id = m.periodo_academico_id
          AND ad.activo               = true
          AND ad.deleted_at           IS NULL
        INNER JOIN grado_materia gm ON ad.grado_materia_id = gm.id
        INNER JOIN materia mat       ON gm.materia_id       = mat.id
        WHERE m.id = $1
        ORDER BY mat.nombre
      `, [matricula_id]);

      res.json({ success: true, data: { materias: result.rows } });
    } catch (error) {
      console.error('Error al obtener materias del hijo:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

export default PadreReportesController;