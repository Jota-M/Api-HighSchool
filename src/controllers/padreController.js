// controllers/padreController.js
import { pool } from '../db/pool.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';

class PadreController {

  static async getHijos(req, res) {
    try {
      const usuario_id = req.user.id;

      const query = `
        SELECT
          pf.id                     AS padre_familia_id,
          e.id                      AS estudiante_id,
          e.codigo                  AS codigo,
          e.nombres                 AS nombres,
          e.apellidos               AS apellidos,
          e.foto_url                AS foto_url,
          et.es_tutor_principal,
          pf.parentesco,
          m.id                      AS matricula_id,
          m.numero_matricula,
          m.estado                  AS estado_matricula,
          m.es_becado,
          m.es_repitente,
          p.id                      AS paralelo_id,
          p.nombre                  AS paralelo_nombre,
          p.aula                    AS aula,
          g.nombre                  AS grado_nombre,
          n.nombre                  AS nivel_nombre,
          t.nombre                  AS turno_nombre,
          pa.id                     AS periodo_academico_id,
          pa.nombre                 AS periodo_nombre
        FROM padre_familia pf
        INNER JOIN estudiante_tutor et  ON et.padre_familia_id = pf.id
        INNER JOIN estudiante e         ON e.id = et.estudiante_id
                                       AND e.activo = true
                                       AND e.deleted_at IS NULL
        INNER JOIN matricula m          ON m.estudiante_id = e.id
                                       AND m.estado = 'activo'
                                       AND m.deleted_at IS NULL
        INNER JOIN paralelo p           ON p.id = m.paralelo_id
        INNER JOIN grado g              ON g.id = p.grado_id
        INNER JOIN nivel_academico n    ON n.id = g.nivel_academico_id
        INNER JOIN turno t              ON t.id = p.turno_id
        INNER JOIN periodo_academico pa ON pa.id = m.periodo_academico_id
                                       AND pa.activo = true
                                       AND pa.deleted_at IS NULL
        WHERE pf.usuario_id = $1
        ORDER BY et.es_tutor_principal DESC, e.apellidos, e.nombres
      `;

      const result = await pool.query(query, [usuario_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No se encontraron estudiantes vinculados a este usuario'
        });
      }

      res.json({
        success: true,
        data: { hijos: result.rows }
      });
    } catch (error) {
      console.error('Error al obtener hijos del padre:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener los datos del estudiante: ' + error.message
      });
    }
  }

  static async cancelarPermiso(req, res) {
    try {
      const { id } = req.params;
      const usuario_id = req.user.id;

      const verificacion = await pool.query(`
        SELECT sp.id, sp.estado, sp.codigo_solicitud
        FROM solicitud_permiso sp
        INNER JOIN estudiante e        ON sp.estudiante_id    = e.id
        INNER JOIN estudiante_tutor et ON et.estudiante_id    = e.id
        INNER JOIN padre_familia pf    ON et.padre_familia_id = pf.id
        WHERE sp.id         = $1
          AND pf.usuario_id = $2
          AND sp.estado     = 'pendiente'
      `, [id, usuario_id]);

      if (!verificacion.rows[0]) {
        return res.status(404).json({
          success: false,
          message: 'Solicitud no encontrada, ya fue procesada, o no pertenece a tu hijo/a'
        });
      }

      const result = await pool.query(`
        UPDATE solicitud_permiso
        SET estado = 'cancelada', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `, [id]);

      const solicitud = result.rows[0];

      await pool.query(`
        INSERT INTO solicitud_permiso_historial
          (solicitud_permiso_id, estado_anterior, estado_nuevo, usuario_id, comentario)
        VALUES ($1, 'pendiente', 'cancelada', $2, 'Cancelada por el padre de familia')
      `, [solicitud.id, usuario_id]);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id,
        accion:           'cancelar',
        modulo:           'solicitud_permiso',
        tabla_afectada:   'solicitud_permiso',
        registro_id:      solicitud.id,
        datos_anteriores: { estado: 'pendiente' },
        datos_nuevos:     { estado: 'cancelada' },
        ip_address:       reqInfo.ip,
        user_agent:       reqInfo.userAgent,
        resultado:        'exitoso',
        mensaje:          `Permiso ${solicitud.codigo_solicitud} cancelado por el padre`
      });

      res.json({
        success: true,
        message: 'Solicitud cancelada exitosamente',
        data: { solicitud }
      });
    } catch (error) {
      console.error('Error al cancelar permiso:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cancelar la solicitud: ' + error.message
      });
    }
  }
}

export default PadreController;