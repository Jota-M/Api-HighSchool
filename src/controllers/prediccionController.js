// controllers/prediccionController.js — v8.4
//
// Cambios respecto a v8.3:
//   - predecirClase: catch detecta error del guard anti-duplicados y devuelve 409
//     en lugar de 500, para que el frontend lo distinga de un error real.

import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import {
  predecirEstudiante as mlPredecirEstudiante,
  analizarClase as mlAnalizarClase,
  generarPlanRecuperacion as mlGenerarPlan,
  simularEscenarios as mlSimularEscenarios,
  simularOptimo as mlSimularOptimo,
  simularOptimoV2 as simularOptimoV2,
  verificarMLService,
} from '../services/ml-service.js';
import { pool } from '../db/pool.js';


// ─────────────────────────────────────────────────────────────
// CONTROLADORES
// ─────────────────────────────────────────────────────────────

class PrediccionController {

  /**
   * POST /api/prediccion/estudiante
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

      let nombreEstudiante = null;
      try {
        const { rows } = await pool.query(
          `SELECT e.nombres || ' ' || e.apellido_paterno || ' ' || e.apellido_materno AS nombre_completo
           FROM matricula m
           JOIN estudiante e ON e.id = m.estudiante_id
           WHERE m.id = $1`,
          [parseInt(matricula_id)]
        );
        nombreEstudiante = rows[0]?.nombre_completo ?? null;
      } catch (err) {
        console.warn('[prediccionController] No se pudo obtener nombre del estudiante:', err.message);
      }

      const resultado = await mlPredecirEstudiante({
        matriculaId: parseInt(matricula_id),
        asignacionDocenteId: parseInt(asignacion_docente_id),
        periodoEvaluacionId: parseInt(periodo_evaluacion_id),
        creadorUsuarioId: req.user?.id ?? null,
        nombreEstudiante,
        incluirGemini: req.query.incluir_gemini !== 'false',
        usarXgboost: req.query.usar_xgboost !== 'false',
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user?.id,
        accion: 'predecir',
        modulo: 'prediccion',
        tabla_afectada: null,
        datos_nuevos: {
          matricula_id,
          asignacion_docente_id,
          estudiante_id: resultado._meta?.estudianteId,
          nivel_riesgo: resultado.modelo?.nivel_riesgo,
          nota_estimada: resultado.modelo?.nota_estimada_final,
          estilo_docente: resultado._meta?.estilo_docente,
          regimen_pond: resultado._meta?.regimen_pond,
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Predicción generada — nivel: ${resultado.modelo?.nivel_riesgo}`,
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
        paraleloId: parseInt(paralelo_id),
        creadorUsuarioId: req.user?.id ?? null,
        incluirGemini: req.query.incluir_gemini !== 'false',
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user?.id,
        accion: 'predecir_clase',
        modulo: 'prediccion',
        tabla_afectada: null,
        datos_nuevos: {
          asignacion_docente_id,
          periodo_evaluacion_id,
          paralelo_id,
          total_estudiantes: resultado.total_estudiantes,
          pct_riesgo: resultado.pct_riesgo,
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Análisis de clase — ${resultado.total_estudiantes} estudiantes`,
      }).catch(err => console.warn('[prediccionController] ActividadLog falló:', err.message));

      return res.json({ success: true, data: resultado });

    } catch (err) {
      console.error('[prediccionController] predecirClase:', err.message);

      // FIX v8.4 — guard anti-duplicados lanza este mensaje → 409 en lugar de 500
      if (err.message.includes('ya en progreso')) {
        return res.status(409).json({
          success: false,
          message: 'Análisis en progreso',
          detalle: 'Ya hay un análisis de clase en curso para esta asignación. Intentá en unos segundos.',
        });
      }

      if (err.message.startsWith('ML service error') || err.message.startsWith('ML clase')) {
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
        matriculaId: parseInt(matricula_id),
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
        matriculaId: parseInt(matricula_id),
        asignacionDocenteId: parseInt(asignacion_docente_id),
        periodoEvaluacionId: parseInt(periodo_evaluacion_id),
        escenarios,
        incluirGemini: req.query.incluir_gemini !== 'false',
        usarXgboost: req.query.usar_xgboost !== 'false',
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


  /**
   * POST /api/prediccion/simular/optimo
   */
  static async simularOptimo(req, res) {
    try {
      const {
        matricula_id,
        asignacion_docente_id,
        periodo_evaluacion_id,
        objetivo_nota = 51,
        restricciones = {},
      } = req.body;

      if (!matricula_id || !asignacion_docente_id || !periodo_evaluacion_id) {
        return res.status(400).json({
          success: false,
          message: 'Se requieren: matricula_id, asignacion_docente_id, periodo_evaluacion_id',
        });
      }

      const resultado = await mlSimularOptimo({
        matriculaId: parseInt(matricula_id),
        asignacionDocenteId: parseInt(asignacion_docente_id),
        periodoEvaluacionId: parseInt(periodo_evaluacion_id),
        objetivoNota: parseFloat(objetivo_nota),
        restricciones,
        usarXgboost: req.query.usar_xgboost !== 'false',
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
   * POST /api/prediccion/simular/optimo/v2
   */
  static async simularOptimoV2(req, res) {
    try {
      const {
        matricula_id,
        asignacion_docente_id,
        periodo_evaluacion_id,
        objetivo_nota,
        restricciones,
        practicas_restantes,
        examenes_restantes,
      } = req.body;

      if (!matricula_id || !asignacion_docente_id || !periodo_evaluacion_id) {
        return res.status(400).json({
          success: false,
          message: 'matricula_id, asignacion_docente_id y periodo_evaluacion_id son requeridos',
        });
      }

      const resultado = await simularOptimoV2({
        matriculaId: parseInt(matricula_id),
        asignacionDocenteId: parseInt(asignacion_docente_id),
        periodoEvaluacionId: parseInt(periodo_evaluacion_id),
        objetivoNota: objetivo_nota,
        restricciones: restricciones ?? {},
        usarXgboost: req.query.usar_xgboost !== 'false',
        practicasRestantes: practicas_restantes != null ? parseInt(practicas_restantes) : undefined,
        examenesRestantes: examenes_restantes != null ? parseInt(examenes_restantes) : undefined,
      });

      return res.json({ success: true, data: resultado });

    } catch (err) {
      console.error('[prediccionController] simularOptimoV2:', err.message);
      return res.status(500).json({
        success: false,
        message: err.message || 'Error al calcular simulación óptima v2',
      });
    }
  }


  /**
   * GET /api/prediccion/health
   */
  static async health(req, res) {
    try {
      const data = await verificarMLService();

      if (!data.disponible) {
        return res.json({ success: true, disponible: false, error: data.error });
      }

      return res.json({
        success: true,
        disponible: true,
        modelos_cargados: data.modelos_cargados,
        gemini: data.gemini,
        version: data.version,
        n_features: data.n_features,
      });

    } catch (err) {
      return res.json({ success: true, disponible: false, error: err.message });
    }
  }
}

export default PrediccionController;