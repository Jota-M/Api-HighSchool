// controllers/prediccionController.js — v8.3
//
// Cambios respecto a v8.2:
//   - simular: ya no usa import dinámico ni reconstruye el payload manualmente.
//     Llama a simularEscenarios() exportada desde mlService.js.
//   - predecirEstudiante: estudianteId eliminado del body — mlService lo resuelve
//     internamente desde matricula.estudiante_id → estudiante.id (ver mlService.js).
//   - planRecuperacion: estudianteId eliminado del body por la misma razón.
//   - Imports actualizados: agrega simularEscenarios, quita llamarML local.
//   - Prediccion.js sigue como legacy — este controller no lo usa.

import ActividadLog  from '../models/actividadLog.js';
import RequestInfo   from '../utils/requestInfo.js';
import {
  predecirEstudiante      as mlPredecirEstudiante,
  analizarClase           as mlAnalizarClase,
  generarPlanRecuperacion as mlGenerarPlan,
  simularEscenarios       as mlSimularEscenarios,
  simularOptimo           as mlSimularOptimo,
  verificarMLService,
} from '../services/ml-Service.js'; 


// ─────────────────────────────────────────────────────────────
// CONTROLADORES
// ─────────────────────────────────────────────────────────────

class PrediccionController {

  /**
   * POST /api/prediccion/estudiante
   *
   * Predice el rendimiento de un estudiante en una materia.
   *
   * Body: { matricula_id, asignacion_docente_id, periodo_evaluacion_id }
   * Query: ?incluir_gemini=true&incluir_plan=false&usar_xgboost=true
   */
  static async predecirEstudiante(req, res) {
    try {
      const { matricula_id, asignacion_docente_id, periodo_evaluacion_id } = req.body;

      if (!matricula_id || !asignacion_docente_id || !periodo_evaluacion_id) {
        return res.status(400).json({
          success: false,
          message: 'Se requieren: matricula_id, asignacion_docente_id, periodo_evaluacion_id',
        });
      }

      const resultado = await mlPredecirEstudiante({
        matriculaId:         parseInt(matricula_id),
        asignacionDocenteId: parseInt(asignacion_docente_id),
        periodoEvaluacionId: parseInt(periodo_evaluacion_id),
        creadorUsuarioId:    req.user?.id ?? null,
        incluirGemini:       req.query.incluir_gemini !== 'false',
        usarXgboost:         req.query.usar_xgboost   !== 'false',
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:     req.user?.id,
        accion:         'predecir',
        modulo:         'prediccion',
        tabla_afectada: null,
        datos_nuevos: {
          matricula_id,
          asignacion_docente_id,
          estudiante_id:  resultado._meta?.estudianteId,
          nivel_riesgo:   resultado.modelo?.nivel_riesgo,
          nota_estimada:  resultado.modelo?.nota_estimada_final,
          estilo_docente: resultado._meta?.estilo_docente,
          regimen_pond:   resultado._meta?.regimen_pond,
        },
        ip_address: reqInfo.ip,
        user_agent:  reqInfo.userAgent,
        resultado:   'exitoso',
        mensaje:     `Predicción generada — nivel: ${resultado.modelo?.nivel_riesgo}`,
      }).catch(err => console.warn('[prediccionController] ActividadLog falló:', err.message));

      return res.json({ success: true, data: resultado });

    } catch (err) {
      console.error('[prediccionController] predecirEstudiante:', err.message);
      if (err.message.startsWith('ML service error')) {
        return res.status(502).json({
          success: false,
          message: 'Microservicio ML no disponible',
          detalle: err.message,
        });
      }
      return res.status(500).json({ success: false, message: err.message });
    }
  }


  /**
   * POST /api/prediccion/clase
   *
   * Analiza el rendimiento de toda la clase para una asignación docente.
   *
   * Body: { asignacion_docente_id, periodo_evaluacion_id, paralelo_id }
   * Query: ?incluir_gemini=true&usar_xgboost=true
   */
  static async predecirClase(req, res) {
    try {
      const { asignacion_docente_id, periodo_evaluacion_id, paralelo_id } = req.body;

      if (!asignacion_docente_id || !periodo_evaluacion_id || !paralelo_id) {
        return res.status(400).json({
          success: false,
          message: 'Se requieren: asignacion_docente_id, periodo_evaluacion_id, paralelo_id',
        });
      }

      const resultado = await mlAnalizarClase({
        asignacionDocenteId: parseInt(asignacion_docente_id),
        periodoEvaluacionId: parseInt(periodo_evaluacion_id),
        paraleloId:          parseInt(paralelo_id),
        creadorUsuarioId:    req.user?.id ?? null,
        incluirGemini:       req.query.incluir_gemini !== 'false',
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:     req.user?.id,
        accion:         'predecir_clase',
        modulo:         'prediccion',
        tabla_afectada: null,
        datos_nuevos: {
          asignacion_docente_id,
          periodo_evaluacion_id,
          paralelo_id,
          total_estudiantes: resultado.total_estudiantes,
          pct_riesgo:        resultado.pct_riesgo,
        },
        ip_address: reqInfo.ip,
        user_agent:  reqInfo.userAgent,
        resultado:   'exitoso',
        mensaje:     `Análisis de clase — ${resultado.total_estudiantes} estudiantes`,
      }).catch(err => console.warn('[prediccionController] ActividadLog falló:', err.message));

      return res.json({ success: true, data: resultado });

    } catch (err) {
      console.error('[prediccionController] predecirClase:', err.message);
      if (err.message.startsWith('ML service error')) {
        return res.status(502).json({
          success: false,
          message: 'Microservicio ML no disponible',
          detalle: err.message,
        });
      }
      return res.status(500).json({ success: false, message: err.message });
    }
  }


  /**
   * POST /api/prediccion/plan
   *
   * Plan de recuperación semana a semana (requiere Gemini).
   *
   * Body: { matricula_id, asignacion_docente_id, periodo_evaluacion_id }
   */
  static async planRecuperacion(req, res) {
    try {
      const { matricula_id, asignacion_docente_id, periodo_evaluacion_id } = req.body;

      if (!matricula_id || !asignacion_docente_id || !periodo_evaluacion_id) {
        return res.status(400).json({
          success: false,
          message: 'Se requieren: matricula_id, asignacion_docente_id, periodo_evaluacion_id',
        });
      }

      const resultado = await mlGenerarPlan({
        matriculaId:         parseInt(matricula_id),
        asignacionDocenteId: parseInt(asignacion_docente_id),
        periodoEvaluacionId: parseInt(periodo_evaluacion_id),
      });

      return res.json({ success: true, data: resultado });

    } catch (err) {
      console.error('[prediccionController] planRecuperacion:', err.message);
      if (err.message.startsWith('ML service error')) {
        return res.status(502).json({
          success: false,
          message: 'Microservicio ML no disponible',
          detalle: err.message,
        });
      }
      return res.status(500).json({ success: false, message: err.message });
    }
  }


  /**
   * POST /api/prediccion/simular
   *
   * Simula hasta 5 escenarios de intervención pedagógica.
   *
   * Body: {
   *   matricula_id, asignacion_docente_id, periodo_evaluacion_id,
   *   escenarios: [
   *     { descripcion, asistencia_proyectada? },
   *     { descripcion, nota_proxima_practica? },
   *     { descripcion, nota_proximo_examen? },
   *     { descripcion, semanas_adicionales? }
   *   ]
   * }
   * Query: ?incluir_gemini=true&usar_xgboost=true
   */
  static async simular(req, res) {
    try {
      const {
        matricula_id,
        asignacion_docente_id,
        periodo_evaluacion_id,
        escenarios,
      } = req.body;

      if (!matricula_id || !asignacion_docente_id || !periodo_evaluacion_id) {
        return res.status(400).json({
          success: false,
          message: 'Se requieren: matricula_id, asignacion_docente_id, periodo_evaluacion_id',
        });
      }

      if (!Array.isArray(escenarios) || escenarios.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere al menos un escenario en escenarios[]',
        });
      }

      if (escenarios.length > 5) {
        return res.status(400).json({
          success: false,
          message: 'Máximo 5 escenarios por simulación',
        });
      }

      const resultado = await mlSimularEscenarios({
        matriculaId:         parseInt(matricula_id),
        asignacionDocenteId: parseInt(asignacion_docente_id),
        periodoEvaluacionId: parseInt(periodo_evaluacion_id),
        escenarios,
        incluirGemini: req.query.incluir_gemini !== 'false',
        usarXgboost:   req.query.usar_xgboost   !== 'false',
      });

      return res.json({ success: true, data: resultado });

    } catch (err) {
      console.error('[prediccionController] simular:', err.message);
      if (err.message.startsWith('ML service error')) {
        return res.status(502).json({
          success: false,
          message: 'Microservicio ML no disponible',
          detalle: err.message,
        });
      }
      return res.status(500).json({ success: false, message: err.message });
    }
  }
  static async simularOptimo(req, res) {
    try {
      const {
        matricula_id,
        asignacion_docente_id,
        periodo_evaluacion_id,
        objetivo_nota   = 51,
        restricciones   = {},
      } = req.body;
 
      if (!matricula_id || !asignacion_docente_id || !periodo_evaluacion_id) {
        return res.status(400).json({
          success: false,
          message: 'Se requieren: matricula_id, asignacion_docente_id, periodo_evaluacion_id',
        });
      }
 
      const resultado = await mlSimularOptimo({
        matriculaId:         parseInt(matricula_id),
        asignacionDocenteId: parseInt(asignacion_docente_id),
        periodoEvaluacionId: parseInt(periodo_evaluacion_id),
        objetivoNota:        parseFloat(objetivo_nota),
        restricciones,
        usarXgboost:         req.query.usar_xgboost !== 'false',
      });
 
      return res.json({ success: true, data: resultado });
 
    } catch (err) {
      console.error('[prediccionController] simularOptimo:', err.message);
      if (err.message.startsWith('ML service error') || err.message.startsWith('ML simular')) {
        return res.status(502).json({
          success: false,
          message: 'Microservicio ML no disponible',
          detalle: err.message,
        });
      }
      return res.status(500).json({ success: false, message: err.message });
    }
  }


  /**
   * GET /api/prediccion/health
   */
  static async health(req, res) {
    try {
      const data = await verificarMLService();

      if (!data.disponible) {
        return res.json({
          success:    true,
          disponible: false,
          error:      data.error,
        });
      }

      return res.json({
        success:          true,
        disponible:       true,
        modelos_cargados: data.modelos_cargados,
        gemini:           data.gemini,
        version:          data.version,
        n_features:       data.n_features,
      });

    } catch (err) {
      return res.json({
        success:    true,
        disponible: false,
        error:      err.message,
      });
    }
  }
}

export default PrediccionController;