// controllers/docenteController.js
import { pool } from '../db/pool.js';
import { Estudiante } from '../models/Estudiantes.js';

export default class DocenteController {
  static async miPerfil(req, res) {
    try {
      const usuario_id = req.user.id; // viene del JWT / middleware authenticate

      const result = await pool.query(
        `SELECT id, nombres, apellidos, codigo, email, foto_url, especialidad
         FROM docente
         WHERE usuario_id = $1 AND deleted_at IS NULL AND activo = true
         LIMIT 1`,
        [usuario_id]
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          success: false,
          message: 'No hay un perfil de docente vinculado a este usuario',
        });
      }

      res.json({ success: true, data: { docente: result.rows[0] } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener perfil docente: ' + error.message,
      });
    }
  }

  /**
   * GET /api/docentes/mis-estudiantes
   * Lista los estudiantes asignados a los cursos/paralelos del docente autenticado
   */
  static async misEstudiantes(req, res) {
    try {
      const usuario_id = req.user.id;

      // Buscar docente vinculado
      const docenteRes = await pool.query(
        `SELECT id, nombres, apellidos FROM docente WHERE usuario_id = $1 AND deleted_at IS NULL AND activo = true LIMIT 1`,
        [usuario_id]
      );

      let docente = docenteRes.rows[0];

      // Soporte para admin/super_admin testeando vista docente
      if (!docente) {
        const esAdmin = req.user.roles?.some(r => ['super_admin', 'admin', 'director'].includes(r.nombre));
        if (esAdmin) {
          const docenteIdQuery = req.query.docente_id ? parseInt(req.query.docente_id) : null;
          const dRows = await pool.query(
            docenteIdQuery
              ? `SELECT id, nombres, apellidos FROM docente WHERE id = $1 AND deleted_at IS NULL`
              : `SELECT id, nombres, apellidos FROM docente WHERE deleted_at IS NULL AND activo = true ORDER BY id LIMIT 1`,
            docenteIdQuery ? [docenteIdQuery] : []
          );
          docente = dRows.rows[0];
        }
      }

      if (!docente) {
        return res.status(404).json({
          success: false,
          message: 'No se encontró un perfil docente vinculado a esta cuenta.'
        });
      }

      const { page = 1, limit = 12, search, grado_id, paralelo_id, asignacion_id } = req.query;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.max(1, parseInt(limit) || 12);
      const offset = (pageNum - 1) * limitNum;

      // Obtener cursos únicos asignados al docente para filtros
      const cursosResult = await pool.query(
        `SELECT DISTINCT
           g.id AS grado_id,
           g.nombre AS grado_nombre,
           p.id AS paralelo_id,
           p.nombre AS paralelo_nombre,
           m.id AS materia_id,
           m.nombre AS materia_nombre,
           ad.id AS asignacion_id
         FROM asignacion_docente ad
         JOIN grado_materia gm ON ad.grado_materia_id = gm.id
         JOIN materia m ON gm.materia_id = m.id
         JOIN grado g ON gm.grado_id = g.id
         JOIN paralelo p ON ad.paralelo_id = p.id
         WHERE ad.docente_id = $1
           AND ad.activo = true
           AND ad.deleted_at IS NULL
         ORDER BY g.nombre, p.nombre, m.nombre`,
        [docente.id]
      );

      // Armar condiciones dinámicas
      const whereConditions = [
        `ad.docente_id = $1`,
        `ad.activo = true`,
        `ad.deleted_at IS NULL`,
        `m.estado = 'activo'`,
        `m.deleted_at IS NULL`,
        `e.deleted_at IS NULL`
      ];
      const queryParams = [docente.id];
      let pIdx = 2;

      if (search && search.trim()) {
        whereConditions.push(
          `(e.nombres ILIKE $${pIdx} OR e.apellido_paterno ILIKE $${pIdx} OR e.apellido_materno ILIKE $${pIdx} OR e.codigo ILIKE $${pIdx} OR e.ci ILIKE $${pIdx} OR e.rude ILIKE $${pIdx})`
        );
        queryParams.push(`%${search.trim()}%`);
        pIdx++;
      }

      if (grado_id) {
        whereConditions.push(`g.id = $${pIdx}`);
        queryParams.push(parseInt(grado_id));
        pIdx++;
      }

      if (paralelo_id) {
        whereConditions.push(`p.id = $${pIdx}`);
        queryParams.push(parseInt(paralelo_id));
        pIdx++;
      }

      if (asignacion_id) {
        whereConditions.push(`ad.id = $${pIdx}`);
        queryParams.push(parseInt(asignacion_id));
        pIdx++;
      }

      const whereClause = whereConditions.join(' AND ');

      // Conteo total de estudiantes distintos
      const countQuery = `
        SELECT COUNT(DISTINCT e.id) AS total
        FROM asignacion_docente ad
        INNER JOIN matricula m
          ON COALESCE(m.paralelo_cursado_id, m.paralelo_id) = ad.paralelo_id
          AND m.periodo_academico_id = ad.periodo_academico_id
        INNER JOIN estudiante e ON e.id = m.estudiante_id
        INNER JOIN paralelo p ON p.id = ad.paralelo_id
        INNER JOIN grado g ON g.id = p.grado_id
        WHERE ${whereClause}
      `;

      const countRes = await pool.query(countQuery, queryParams);
      const total = parseInt(countRes.rows[0]?.total || 0);

      // Consulta de estudiantes
      const dataQuery = `
        SELECT
          e.id,
          e.codigo,
          e.rude,
          e.nombres,
          e.apellido_paterno,
          e.apellido_materno,
          e.apellidos,
          e.ci,
          e.fecha_nacimiento,
          e.genero,
          e.telefono,
          e.email,
          e.foto_url,
          e.activo,
          (
            SELECT json_agg(json_build_object(
              'id', mat.id,
              'grado', g2.nombre,
              'paralelo', p2.nombre,
              'estado', mat.estado
            ))
            FROM matricula mat
            JOIN paralelo p2 ON mat.paralelo_id = p2.id
            JOIN grado g2 ON p2.grado_id = g2.id
            WHERE mat.estudiante_id = e.id AND mat.deleted_at IS NULL
          ) AS matriculas,
          (
            SELECT COUNT(*)
            FROM matricula mat
            WHERE mat.estudiante_id = e.id AND mat.deleted_at IS NULL
          ) AS total_matriculas,
          STRING_AGG(DISTINCT (g.nombre || ' "' || p.nombre || '"'), ', ') AS cursos_asignados
        FROM asignacion_docente ad
        INNER JOIN matricula m
          ON COALESCE(m.paralelo_cursado_id, m.paralelo_id) = ad.paralelo_id
          AND m.periodo_academico_id = ad.periodo_academico_id
        INNER JOIN estudiante e ON e.id = m.estudiante_id
        INNER JOIN paralelo p ON p.id = ad.paralelo_id
        INNER JOIN grado g ON g.id = p.grado_id
        WHERE ${whereClause}
        GROUP BY e.id
        ORDER BY e.apellido_paterno, e.apellido_materno, e.nombres
        LIMIT $${pIdx} OFFSET $${pIdx + 1}
      `;

      const dataRes = await pool.query(dataQuery, [...queryParams, limitNum, offset]);

      res.json({
        success: true,
        data: {
          docente: {
            id: docente.id,
            nombre_completo: `${docente.nombres} ${docente.apellidos}`
          },
          estudiantes: dataRes.rows,
          cursos: cursosResult.rows,
          paginacion: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum) || 1
          }
        }
      });
    } catch (error) {
      console.error('Error al listar mis estudiantes docente:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener estudiantes: ' + error.message
      });
    }
  }

  /**
   * GET /api/docentes/mis-estudiantes/:id
   * Información detallada del estudiante y sus tutores para vista del docente
   */
  static async miEstudianteDetalle(req, res) {
    try {
      const usuario_id = req.user.id;
      const { id } = req.params;
      const estudianteId = parseInt(id);

      if (isNaN(estudianteId)) {
        return res.status(400).json({
          success: false,
          message: 'ID de estudiante no válido'
        });
      }

      // Buscar docente vinculado
      const docenteRes = await pool.query(
        `SELECT id FROM docente WHERE usuario_id = $1 AND deleted_at IS NULL AND activo = true LIMIT 1`,
        [usuario_id]
      );
      let docente = docenteRes.rows[0];
      const esAdmin = req.user.roles?.some(r => ['super_admin', 'admin', 'director'].includes(r.nombre));

      if (!docente && !esAdmin) {
        return res.status(403).json({
          success: false,
          message: 'No tienes un perfil docente para realizar esta consulta.'
        });
      }

      // Si es docente (y no admin), validar que tenga al estudiante en alguna de sus materias/paralelos
      if (docente && !esAdmin) {
        const accesoCheck = await pool.query(
          `SELECT 1
           FROM asignacion_docente ad
           INNER JOIN matricula m
             ON COALESCE(m.paralelo_cursado_id, m.paralelo_id) = ad.paralelo_id
             AND m.periodo_academico_id = ad.periodo_academico_id
             AND m.estado = 'activo'
             AND m.deleted_at IS NULL
           WHERE ad.docente_id = $1
             AND ad.activo = true
             AND ad.deleted_at IS NULL
             AND m.estudiante_id = $2
           LIMIT 1`,
          [docente.id, estudianteId]
        );

        if (accesoCheck.rows.length === 0) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para ver a este estudiante o no pertenece a tus cursos asignados.'
          });
        }
      }

      // Obtener estudiante completo
      const estudiante = await Estudiante.findById(estudianteId);
      if (!estudiante) {
        return res.status(404).json({
          success: false,
          message: 'Estudiante no encontrado'
        });
      }

      // Obtener tutores
      const tutores = await Estudiante.getTutores(estudianteId);
      estudiante.tutores = tutores;
      estudiante.total_matriculas = estudiante.matriculas?.length || 0;

      res.json({
        success: true,
        data: { estudiante }
      });
    } catch (error) {
      console.error('Error al obtener detalle de estudiante:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener estudiante: ' + error.message
      });
    }
  }
}