// controllers/alertaRendimientoController.js
import AlertaRendimiento from '../models/AlertaRendimiento.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';

class AlertaRendimientoController {

  // ─────────────────────────────────────────────────────────────
  // PORTAL DEL PADRE
  // ─────────────────────────────────────────────────────────────

  /**
   * GET /api/alertas-rendimiento/mis-hijos
   *
   * El padre ve el resumen de todos sus hijos:
   * una tarjeta por hijo con el peor nivel de riesgo actual
   * y el contador de alertas no leídas.
   *
   * req.user debe tener: id, hijos = [{ estudiante_id }]
   * (el middleware de auth lo inyecta desde la sesión)
   */
  static async getMisHijos(req, res) {
    try {
      const estudianteIds = (req.user.hijos || []).map(h => h.estudiante_id);

      if (!estudianteIds.length) {
        return res.json({
          success: true,
          data: {
            hijos:          [],
            no_leidas_total: 0,
          },
        });
      }

      const [hijos, noLeidas] = await Promise.all([
        AlertaRendimiento.getResumenHijos(estudianteIds, req.user.id),
        AlertaRendimiento.contarNoLeidas(estudianteIds, req.user.id),
      ]);

      res.json({
        success: true,
        data: {
          hijos,
          no_leidas_total: noLeidas,
        },
      });
    } catch (error) {
      console.error('Error getMisHijos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener el resumen de hijos: ' + error.message,
      });
    }
  }

  /**
   * GET /api/alertas-rendimiento/hijo/:estudiante_id
   *
   * Todas las materias activas del hijo con su última alerta.
   * Vista principal del portal del padre para ese hijo.
   * Las materias con riesgo crítico/alto aparecen primero.
   */
  static async getPortalHijo(req, res) {
    try {
      const estudiante_id = parseInt(req.params.estudiante_id);

      // Verificar que el estudiante es hijo del padre autenticado
      const esHijo = (req.user.hijos || []).some(
        h => h.estudiante_id === estudiante_id
      );
      if (!esHijo) {
        return res.status(403).json({
          success: false,
          message: 'No tiene acceso a la información de este estudiante',
        });
      }

      const materias = await AlertaRendimiento.getPortalPadre(
        estudiante_id,
        req.user.id
      );

      // Calcular el semáforo general del hijo (peor materia)
      const nivelesOrden = { critico: 4, alto: 3, medio: 2, bajo: 1 };
      const peorNivel = materias.reduce((peor, m) => {
        const nivelActual = nivelesOrden[m.nivel_riesgo] || 0;
        return nivelActual > (nivelesOrden[peor] || 0) ? m.nivel_riesgo : peor;
      }, 'bajo');

      const materiasConAlerta = materias.filter(
        m => m.nivel_riesgo && m.nivel_riesgo !== 'bajo'
      ).length;

      res.json({
        success: true,
        data: {
          estudiante: {
            id:       materias[0]?.estudiante_id,
            nombres:  materias[0]?.estudiante_nombres,
            apellidos:materias[0]?.estudiante_apellidos,
            codigo:   materias[0]?.estudiante_codigo,
            foto:     materias[0]?.estudiante_foto,
          },
          resumen: {
            total_materias:      materias.length,
            materias_con_alerta: materiasConAlerta,
            peor_nivel_riesgo:   peorNivel,
          },
          materias,
        },
      });
    } catch (error) {
      console.error('Error getPortalHijo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener el portal del hijo: ' + error.message,
      });
    }
  }

  /**
   * GET /api/alertas-rendimiento/hijo/:estudiante_id/historial
   *
   * Historial semana a semana de una materia.
   * El padre puede ver cómo evolucionó el riesgo durante el trimestre.
   * Query: ?asignacion_docente_id=X&trimestre=1
   */
  static async getHistorialMateria(req, res) {
    try {
      const estudiante_id = parseInt(req.params.estudiante_id);
      const { asignacion_docente_id, trimestre } = req.query;

      if (!asignacion_docente_id || !trimestre) {
        return res.status(400).json({
          success: false,
          message: 'asignacion_docente_id y trimestre son requeridos',
        });
      }

      // Verificar acceso
      const esHijo = (req.user.hijos || []).some(
        h => h.estudiante_id === estudiante_id
      );
      if (!esHijo) {
        return res.status(403).json({
          success: false,
          message: 'No tiene acceso a la información de este estudiante',
        });
      }

      const historial = await AlertaRendimiento.getHistorialMateria(
        estudiante_id,
        parseInt(asignacion_docente_id),
        parseInt(trimestre)
      );

      res.json({ success: true, data: { historial } });
    } catch (error) {
      console.error('Error getHistorialMateria:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener historial: ' + error.message,
      });
    }
  }

  /**
   * POST /api/alertas-rendimiento/:id/leer
   *
   * El padre marca una alerta como leída.
   * Idempotente — si ya la leyó, no hace nada.
   * También registra en ActividadLog para que el docente
   * vea "Padre notificado ✓" en su panel.
   */
  static async marcarLeida(req, res) {
    try {
      const alerta_id = parseInt(req.params.id);

      // Registrar la lectura (ON CONFLICT DO NOTHING → seguro repetir)
      await AlertaRendimiento.registrarLectura(alerta_id, req.user.id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:     req.user.id,
        accion:         'leer',
        modulo:         'alerta_rendimiento',
        tabla_afectada: 'alerta_rendimiento_lectura',
        registro_id:    alerta_id,
        ip_address:     reqInfo.ip,
        user_agent:     reqInfo.userAgent,
        resultado:      'exitoso',
        mensaje:        `Padre leyó alerta #${alerta_id}`,
      });

      res.json({
        success: true,
        message: 'Alerta marcada como leída',
      });
    } catch (error) {
      console.error('Error marcarLeida:', error);
      res.status(500).json({
        success: false,
        message: 'Error al marcar como leída: ' + error.message,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PANEL DEL DOCENTE
  // ─────────────────────────────────────────────────────────────

  /**
   * GET /api/alertas-rendimiento/clase
   *
   * El docente ve el estado de riesgo actual de su clase
   * y si cada padre ya leyó la alerta.
   * Query: ?asignacion_docente_id=X&trimestre=1&semana=6
   */
  static async getEstadoClase(req, res) {
    try {
      const { asignacion_docente_id, trimestre, semana } = req.query;

      if (!asignacion_docente_id || !trimestre || !semana) {
        return res.status(400).json({
          success: false,
          message: 'asignacion_docente_id, trimestre y semana son requeridos',
        });
      }

      const estudiantes = await AlertaRendimiento.getEstadoClase(
        parseInt(asignacion_docente_id),
        parseInt(trimestre),
        parseInt(semana)
      );

      // Resumen rápido para el encabezado del panel
      const resumen = {
        total:            estudiantes.length,
        critico:          estudiantes.filter(e => e.nivel_riesgo === 'critico').length,
        alto:             estudiantes.filter(e => e.nivel_riesgo === 'alto').length,
        medio:            estudiantes.filter(e => e.nivel_riesgo === 'medio').length,
        bajo:             estudiantes.filter(e => e.nivel_riesgo === 'bajo').length,
        padres_notificados: estudiantes.filter(e => e.estado_envio === 'notificada').length,
        padres_leyeron:   estudiantes.filter(e => e.padre_leyo).length,
      };

      res.json({
        success: true,
        data: {
          resumen,
          estudiantes,
        },
      });
    } catch (error) {
      console.error('Error getEstadoClase:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener estado de clase: ' + error.message,
      });
    }
  }
}

export default AlertaRendimientoController;