// controllers/notasController.js
import {
  PeriodoEvaluacion, DimensionEvaluacion,
  Evaluacion, Calificacion, NotasCalculo
} from '../models/Notas.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import { pool } from '../db/pool.js';
import {
    dispararPrediccionAlCierre,
    cerrarPeriodoClase,
    dispararAsignacionMaterial
  } from '../services/prediccionAutomatica.js';

// =============================================
// PERIODO EVALUACION
// =============================================
class PeriodoEvaluacionController {

  // GET /api/periodos-evaluacion
  static async listar(req, res) {
    try {
      const { periodo_academico_id, activo } = req.query;

      const periodos = await PeriodoEvaluacion.findAll({
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
        activo: activo !== undefined ? activo === 'true' : undefined
      });

      res.json({ success: true, data: { periodos } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al listar períodos: ' + error.message
      });
    }
  }

  // GET /api/periodos-evaluacion/:id
  static async obtenerPorId(req, res) {
    try {
      const periodo = await PeriodoEvaluacion.findById(req.params.id);
      if (!periodo) {
        return res.status(404).json({ success: false, message: 'Período no encontrado' });
      }
      res.json({ success: true, data: { periodo } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener período: ' + error.message
      });
    }
  }

  // POST /api/periodos-evaluacion
  static async crear(req, res) {
    try {
      const { periodo_academico_id, nombre, codigo, orden, fecha_inicio, fecha_fin, observaciones } = req.body;

      if (!periodo_academico_id || !nombre || !orden || !fecha_inicio || !fecha_fin) {
        return res.status(400).json({
          success: false,
          message: 'periodo_academico_id, nombre, orden, fecha_inicio y fecha_fin son requeridos'
        });
      }

      const periodo = await PeriodoEvaluacion.create({
        periodo_academico_id, nombre, codigo, orden, fecha_inicio, fecha_fin, observaciones
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id, accion: 'crear',
        modulo: 'periodo_evaluacion', tabla_afectada: 'periodo_evaluacion',
        registro_id: periodo.id, datos_nuevos: periodo,
        ip_address: reqInfo.ip, user_agent: reqInfo.userAgent,
        resultado: 'exitoso', mensaje: `Período creado: ${nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Período de evaluación creado exitosamente',
        data: { periodo }
      });
    } catch (error) {
      // Conflicto de orden único por periodo_academico
      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un período con ese orden para este período académico'
        });
      }
      res.status(500).json({
        success: false,
        message: 'Error al crear período: ' + error.message
      });
    }
  }

  // PUT /api/periodos-evaluacion/:id
  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const anterior = await PeriodoEvaluacion.findById(id);
      if (!anterior) {
        return res.status(404).json({ success: false, message: 'Período no encontrado' });
      }

      const periodo = await PeriodoEvaluacion.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id, accion: 'actualizar',
        modulo: 'periodo_evaluacion', tabla_afectada: 'periodo_evaluacion',
        registro_id: periodo.id, datos_anteriores: anterior, datos_nuevos: periodo,
        ip_address: reqInfo.ip, user_agent: reqInfo.userAgent,
        resultado: 'exitoso', mensaje: `Período actualizado: ${periodo.nombre}`
      });

      res.json({
        success: true,
        message: 'Período actualizado exitosamente',
        data: { periodo }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al actualizar período: ' + error.message
      });
    }
  }
}

// =============================================
// DIMENSION EVALUACION
// =============================================
class DimensionEvaluacionController {

  // GET /api/dimensiones
  static async listar(_req, res) {
    try {
      const dimensiones = await DimensionEvaluacion.findAll();
      res.json({ success: true, data: { dimensiones } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al listar dimensiones: ' + error.message
      });
    }
  }
}

// =============================================
// EVALUACION
// =============================================
class EvaluacionController {

  // GET /api/evaluaciones
  static async listar(req, res) {
    try {
      const {
        page, limit, asignacion_docente_id,
        dimension_evaluacion_id, periodo_evaluacion_id, activo,
        tema_id       // ← NUEVO
      } = req.query;

      const result = await Evaluacion.findAll({
        page:                    parseInt(page)  || 1,
        limit:                   parseInt(limit) || 20,
        asignacion_docente_id:   asignacion_docente_id   ? parseInt(asignacion_docente_id)   : undefined,
        dimension_evaluacion_id: dimension_evaluacion_id ? parseInt(dimension_evaluacion_id) : undefined,
        periodo_evaluacion_id:   periodo_evaluacion_id   ? parseInt(periodo_evaluacion_id)   : undefined,
        activo:                  activo !== undefined     ? activo === 'true'                : undefined,
        tema_id:                 tema_id                 ? parseInt(tema_id)                : undefined  // ← NUEVO
      });

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al listar evaluaciones: ' + error.message
      });
    }
  }

  // GET /api/evaluaciones/:id
  static async obtenerPorId(req, res) {
    try {
      const evaluacion = await Evaluacion.findById(req.params.id);
      if (!evaluacion) {
        return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
      }
      res.json({ success: true, data: { evaluacion } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener evaluación: ' + error.message
      });
    }
  }

  // POST /api/evaluaciones
  static async crear(req, res) {
    try {
      const {
        asignacion_docente_id, dimension_evaluacion_id, periodo_evaluacion_id,
        nombre, tipo, descripcion, fecha, puntaje_maximo, peso_en_dimension,
        visible_para_padres,
        tema_id       // ← NUEVO
      } = req.body;

      if (!asignacion_docente_id || !dimension_evaluacion_id || !periodo_evaluacion_id || !nombre) {
        return res.status(400).json({
          success: false,
          message: 'asignacion_docente_id, dimension_evaluacion_id, periodo_evaluacion_id y nombre son requeridos'
        });
      }

      // Validar que el tema_id pertenece a la misma materia (opcional pero recomendado)
      if (tema_id) {
        const temaCheck = await pool.query(`
          SELECT t.id
          FROM tema t
          INNER JOIN unidad_tematica u ON t.unidad_tematica_id = u.id
          INNER JOIN asignacion_docente ad ON u.grado_materia_id = ad.grado_materia_id
          WHERE t.id = $1 AND ad.id = $2 AND t.activo = true
        `, [tema_id, asignacion_docente_id]);

        if (!temaCheck.rows[0]) {
          return res.status(400).json({
            success: false,
            message: 'El tema_id no pertenece a esta asignación docente'
          });
        }
      }

      const evaluacion = await Evaluacion.create({
        asignacion_docente_id, dimension_evaluacion_id, periodo_evaluacion_id,
        nombre, tipo, descripcion, fecha, puntaje_maximo, peso_en_dimension,
        visible_para_padres,
        tema_id       // ← NUEVO
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id, accion: 'crear',
        modulo: 'evaluacion', tabla_afectada: 'evaluacion',
        registro_id: evaluacion.id, datos_nuevos: evaluacion,
        ip_address: reqInfo.ip, user_agent: reqInfo.userAgent,
        resultado: 'exitoso', mensaje: `Evaluación creada: ${nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Evaluación creada exitosamente',
        data: { evaluacion }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al crear evaluación: ' + error.message
      });
    }
  }

  // PUT /api/evaluaciones/:id
  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const anterior = await Evaluacion.findById(id);
      if (!anterior) {
        return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
      }

      const evaluacion = await Evaluacion.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id, accion: 'actualizar',
        modulo: 'evaluacion', tabla_afectada: 'evaluacion',
        registro_id: evaluacion.id, datos_anteriores: anterior, datos_nuevos: evaluacion,
        ip_address: reqInfo.ip, user_agent: reqInfo.userAgent,
        resultado: 'exitoso', mensaje: `Evaluación actualizada: ${evaluacion.nombre}`
      });

      res.json({
        success: true,
        message: 'Evaluación actualizada exitosamente',
        data: { evaluacion }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al actualizar evaluación: ' + error.message
      });
    }
  }

  // DELETE /api/evaluaciones/:id
  static async eliminar(req, res) {
    try {
      const { id } = req.params;
      const evaluacion = await Evaluacion.findById(id);
      if (!evaluacion) {
        return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
      }

      await Evaluacion.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id, accion: 'eliminar',
        modulo: 'evaluacion', tabla_afectada: 'evaluacion',
        registro_id: parseInt(id), datos_anteriores: evaluacion,
        ip_address: reqInfo.ip, user_agent: reqInfo.userAgent,
        resultado: 'exitoso', mensaje: `Evaluación desactivada: ${evaluacion.nombre}`
      });

      res.json({ success: true, message: 'Evaluación eliminada exitosamente' });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al eliminar evaluación: ' + error.message
      });
    }
  }
}

// =============================================
// CALIFICACION
// =============================================

// ──────────────────────────────────────────────────────────────
// MATERIAS DEL DOCENTE AUTENTICADO
// Flujo: token → usuario_id → docente → materias con resumen
// ──────────────────────────────────────────────────────────────
class MisMateriasController {

  // GET /api/notas/mis-materias
  // Query: ?periodo_evaluacion_id=X (opcional, filtra un trimestre específico)
  //
  // Sin filtro   → devuelve todas las materias con resumen de TODOS los trimestres
  // Con filtro   → devuelve solo el resumen del trimestre indicado
  //
  // Flujo de uso en frontend:
  //   1. Docente inicia sesión
  //   2. GET /mis-materias               → ve sus materias del año con totales generales
  //   3. GET /mis-materias?periodo_evaluacion_id=2  → filtra por 2do trimestre
  //   4. Selecciona materia+trimestre    → GET /evaluaciones?asignacion_docente_id=X&periodo_evaluacion_id=Y
  //   5. Crea/edita evaluaciones y registra notas
  static async getMisMaterias(req, res) {
    try {
      const { periodo_evaluacion_id } = req.query;

      const materias = await Evaluacion.getMisMaterias({
        usuario_id:           req.user.id,
        periodo_evaluacion_id: periodo_evaluacion_id ? parseInt(periodo_evaluacion_id) : null
      });

      if (materias.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No se encontraron materias asignadas para este docente'
        });
      }

      res.json({
        success: true,
        data: {
          docente_usuario_id:    req.user.id,
          total_materias:        [...new Set(materias.map(m => m.asignacion_id))].length,
          periodo_evaluacion_id: periodo_evaluacion_id ? parseInt(periodo_evaluacion_id) : null,
          materias
        }
      });
    } catch (error) {
      console.error('Error al obtener materias del docente:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener materias: ' + error.message
      });
    }
  }
}

class CalificacionController {
 
  // GET /api/notas/calificaciones/evaluacion/:evaluacion_id
  static async listarPorEvaluacion(req, res) {
    try {
      const { evaluacion_id } = req.params;
      const calificaciones = await Calificacion.findByEvaluacion(parseInt(evaluacion_id));
 
      res.json({
        success: true,
        data: {
          calificaciones,
          total:    calificaciones.length,
          con_nota: calificaciones.filter(c => c.puntaje_obtenido !== null).length,
          sin_nota: calificaciones.filter(c => c.puntaje_obtenido === null).length,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al listar calificaciones: ' + error.message,
      });
    }
  }
 
  // GET /api/notas/calificaciones/matricula/:matricula_id/periodo/:periodo_evaluacion_id
  static async listarPorMatriculaPeriodo(req, res) {
    try {
      const { matricula_id, periodo_evaluacion_id } = req.params;
      const calificaciones = await Calificacion.findByMatriculaPeriodo(
        parseInt(matricula_id),
        parseInt(periodo_evaluacion_id)
      );
      res.json({ success: true, data: { calificaciones } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al listar calificaciones: ' + error.message,
      });
    }
  }
 
  // POST /api/notas/calificaciones
  // Registro individual — con hook de asignación automática de materiales
  static async registrar(req, res) {
    try {
      const {
        evaluacion_id, matricula_id, puntaje_obtenido,
        esta_ausente, observacion,
      } = req.body;
 
      if (!evaluacion_id || !matricula_id || puntaje_obtenido === undefined) {
        return res.status(400).json({
          success: false,
          message: 'evaluacion_id, matricula_id y puntaje_obtenido son requeridos',
        });
      }
 
      const calificacion = await Calificacion.upsert({
        evaluacion_id, matricula_id, puntaje_obtenido,
        esta_ausente: esta_ausente ?? false,
        observacion, registrado_por: req.user.id,
      });
 
      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id, accion: 'crear',
        modulo: 'notas', tabla_afectada: 'calificacion',
        registro_id: calificacion.id, datos_nuevos: calificacion,
        ip_address: reqInfo.ip, user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Nota registrada: matrícula ${matricula_id} → ${puntaje_obtenido}`,
      });
 
      // ── HOOK: asignación automática de materiales ─────────────────────────
      // Fire-and-forget — no bloquea la respuesta al docente.
      // Internamente verifica si la nota < 60 y si el tema tiene materiales.
      dispararAsignacionMaterial({
        evaluacionId:   parseInt(evaluacion_id),
        matriculaId:    parseInt(matricula_id),
        puntajeObtenido: calificacion.puntaje_obtenido,
        estaAusente:    calificacion.esta_ausente,
      }).catch(err =>
        console.error('[notasController] asignación material falló:', err.message)
      );
      // ─────────────────────────────────────────────────────────────────────
 
      res.status(201).json({
        success: true,
        message: 'Calificación registrada exitosamente',
        data: { calificacion },
      });
    } catch (error) {
      const status = error.message.includes('supera el máximo') ? 400 : 500;
      res.status(status).json({
        success: false,
        message: 'Error al registrar calificación: ' + error.message,
      });
    }
  }
 
  // POST /api/notas/calificaciones/masivo
  // Registro masivo — hook por cada registro con nota baja
  static async registrarMasivo(req, res) {
    try {
      const { evaluacion_id, registros } = req.body;
 
      if (!evaluacion_id || !Array.isArray(registros) || registros.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'evaluacion_id y registros[] son requeridos',
        });
      }
 
      const resultado = await Calificacion.upsertMasivo({
        evaluacion_id: parseInt(evaluacion_id),
        registrado_por: req.user.id,
        registros,
      });
 
      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id, accion: 'registrar_masivo',
        modulo: 'notas', tabla_afectada: 'calificacion',
        datos_nuevos: { evaluacion_id, total: resultado.length },
        ip_address: reqInfo.ip, user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Notas masivas: ${resultado.length} registros para evaluación ${evaluacion_id}`,
      });
 
      // ── HOOK: asignación automática por cada calificación baja ────────────
      // Se lanza un hook por cada registro — todos fire-and-forget.
      // dispararAsignacionMaterial hace su propio filtro interno (nota < 60,
      // tema_id presente, materiales disponibles) así que es seguro llamarlo
      // para todos sin pre-filtrar acá.
      for (const cal of resultado) {
        dispararAsignacionMaterial({
          evaluacionId:    parseInt(evaluacion_id),
          matriculaId:     cal.matricula_id,
          puntajeObtenido: cal.puntaje_obtenido,
          estaAusente:     cal.esta_ausente,
        }).catch(err =>
          console.error(
            `[notasController] asignación material falló (matrícula ${cal.matricula_id}):`,
            err.message
          )
        );
      }
      // ─────────────────────────────────────────────────────────────────────
 
      res.status(201).json({
        success: true,
        message: `${resultado.length} calificaciones guardadas`,
        data: { total: resultado.length, calificaciones: resultado },
      });
    } catch (error) {
      const status = error.message.includes('supera el máximo') ? 400 : 500;
      res.status(status).json({
        success: false,
        message: 'Error en registro masivo: ' + error.message,
      });
    }
  }
}

// =============================================
// NOTAS CALCULO (dimensiones + nota final)
// =============================================
class NotasCalculoController {

  // POST /api/notas/calcular
  // Body: { matricula_id, grado_materia_id, periodo_evaluacion_id }
  static async calcular(req, res) {
    try {
      const { matricula_id, grado_materia_id, periodo_evaluacion_id } = req.body;

      if (!matricula_id || !grado_materia_id || !periodo_evaluacion_id) {
        return res.status(400).json({
          success: false,
          message: 'matricula_id, grado_materia_id y periodo_evaluacion_id son requeridos'
        });
      }

      const nota_final = await NotasCalculo.calcularCalificacionPeriodo(
        parseInt(matricula_id),
        parseInt(grado_materia_id),
        parseInt(periodo_evaluacion_id)
      );

      const notas_dimension = await NotasCalculo.getNotasDimension(
        parseInt(matricula_id),
        parseInt(grado_materia_id),
        parseInt(periodo_evaluacion_id)
      );

      const calificacion = await NotasCalculo.getCalificacionPeriodo(
        parseInt(matricula_id),
        parseInt(grado_materia_id),
        parseInt(periodo_evaluacion_id)
      );

      res.json({
        success: true,
        message: 'Notas calculadas exitosamente',
        data: { nota_final, notas_dimension, calificacion }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al calcular notas: ' + error.message
      });
    }
  }

  // GET /api/notas/boletin/:matricula_id/:periodo_evaluacion_id
  static async getBoletin(req, res) {
    try {
      const { matricula_id, periodo_evaluacion_id } = req.params;

      const boletin = await NotasCalculo.getBoletin(
        parseInt(matricula_id),
        parseInt(periodo_evaluacion_id)
      );

      res.json({ success: true, data: { boletin } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener boletín: ' + error.message
      });
    }
  }

  // GET /api/notas/dimensiones/:matricula_id/:grado_materia_id/:periodo_evaluacion_id
  static async getNotasDimension(req, res) {
    try {
      const { matricula_id, grado_materia_id, periodo_evaluacion_id } = req.params;

      const notas = await NotasCalculo.getNotasDimension(
        parseInt(matricula_id),
        parseInt(grado_materia_id),
        parseInt(periodo_evaluacion_id)
      );

      res.json({ success: true, data: { notas } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener notas por dimensión: ' + error.message
      });
    }
  }

  // PATCH /api/notas/cerrar-periodo
  // Body: { matricula_id, grado_materia_id, periodo_evaluacion_id }
  static async cerrarPeriodo(req, res) {
    try {
      const { matricula_id, grado_materia_id, periodo_evaluacion_id } = req.body;
 
      if (!matricula_id || !grado_materia_id || !periodo_evaluacion_id) {
        return res.status(400).json({
          success: false,
          message: 'matricula_id, grado_materia_id y periodo_evaluacion_id son requeridos',
        });
      }
 
      const calificacion = await NotasCalculo.cerrarPeriodo(
        parseInt(matricula_id),
        parseInt(grado_materia_id),
        parseInt(periodo_evaluacion_id),
        req.user.id,
      );
 
      if (!calificacion) {
        return res.status(404).json({
          success: false,
          message: 'No se encontró calificación activa para cerrar',
        });
      }
 
      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:     req.user.id,
        accion:         'cerrar',
        modulo:         'notas',
        tabla_afectada: 'calificacion_periodo',
        registro_id:    calificacion.id,
        datos_nuevos:   { estado: 'cerrada' },
        ip_address:     reqInfo.ip,
        user_agent:     reqInfo.userAgent,
        resultado:      'exitoso',
        mensaje:        `Período cerrado: matrícula ${matricula_id} / materia ${grado_materia_id}`,
      });
 
      // ── NUEVO: disparar predicción en background ──────────────
      // Necesitamos asignacion_docente_id — lo obtenemos de la BD
        const { rows: [asig] } = await pool.query(`
        SELECT ad.id AS asignacion_docente_id
        FROM   asignacion_docente ad
        WHERE  ad.grado_materia_id = $1
          AND  ad.activo           = true
          AND  ad.deleted_at       IS NULL
        LIMIT 1
      `, [grado_materia_id]);
    
      if (asig?.asignacion_docente_id) {
        dispararPrediccionAlCierre({
          matriculaId:         parseInt(matricula_id),
          gradoMateriaId:      parseInt(grado_materia_id),
          periodoEvaluacionId: parseInt(periodo_evaluacion_id),
          asignacionDocenteId: asig.asignacion_docente_id,
          cerradoPor:          req.user.id,
        }).catch(err =>
          console.error('[notasController] predicción automática falló:', err.message)
        );
      
      }
      // ─────────────────────────────────────────────────────────
 
      return res.json({
        success: true,
        message: 'Período cerrado exitosamente',
        data:    { calificacion },
      });
 
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al cerrar período: ' + error.message,
      });
    }
  }

  static async cerrarPeriodoClase(req, res) {
    try {
      const { asignacion_docente_id, grado_materia_id, periodo_evaluacion_id } = req.body;
 
      if (!asignacion_docente_id || !grado_materia_id || !periodo_evaluacion_id) {
        return res.status(400).json({
          success: false,
          message: 'asignacion_docente_id, grado_materia_id y periodo_evaluacion_id son requeridos',
        });
      }
 
      // Responder inmediatamente al docente — el proceso continúa en background
      res.json({
        success: true,
        message: 'Cierre iniciado. Las predicciones se generarán automáticamente.',
        data:    { asignacion_docente_id, grado_materia_id, periodo_evaluacion_id },
      });
 
      // Fire-and-forget del cierre masivo + predicciones
      cerrarPeriodoClase({
        asignacionDocenteId: parseInt(asignacion_docente_id),
        gradoMateriaId:      parseInt(grado_materia_id),
        periodoEvaluacionId: parseInt(periodo_evaluacion_id),
        cerradoPor:          req.user.id,
      }).catch(err =>
        console.error('[notasController] cerrarPeriodoClase falló:', err.message)
      );
 
    } catch (error) {
      // Solo llega acá si hay error antes del res.json
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error al iniciar cierre: ' + error.message,
        });
      }
    }
  }
  // PATCH /api/notas/nota-manual
  // Requiere permiso especial: notas.manual
  static async aplicarNotaManual(req, res) {
    try {
      const {
        matricula_id, grado_materia_id, periodo_evaluacion_id,
        nota_manual, justificacion_manual
      } = req.body;

      if (!matricula_id || !grado_materia_id || !periodo_evaluacion_id || nota_manual === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Todos los campos son requeridos'
        });
      }

      if (!justificacion_manual) {
        return res.status(400).json({
          success: false,
          message: 'La justificación es obligatoria para una nota manual'
        });
      }

      const calificacion = await NotasCalculo.aplicarNotaManual(
        parseInt(matricula_id),
        parseInt(grado_materia_id),
        parseInt(periodo_evaluacion_id),
        { nota_manual, justificacion_manual, aplicado_por: req.user.id }
      );

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id, accion: 'nota_manual',
        modulo: 'notas', tabla_afectada: 'calificacion_periodo',
        registro_id: calificacion?.id,
        datos_nuevos: { nota_manual, justificacion_manual },
        ip_address: reqInfo.ip, user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Nota manual aplicada: ${nota_manual} — ${justificacion_manual}`
      });

      res.json({
        success: true,
        message: 'Nota manual aplicada exitosamente',
        data: { calificacion }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al aplicar nota manual: ' + error.message
      });
    }
  }
}
class TareasController {
 
  /**
   * GET /api/notas/tareas/:matricula_id
   * Query: ?periodo_evaluacion_id=X (opcional)
   *        &estado=pendiente|entregado|atrasado (opcional)
   *
   * Devuelve todas las evaluaciones visibles para el padre,
   * con su calificación y estado calculado:
   *   - 'entregado' → tiene calificacion.puntaje_obtenido registrado
   *   - 'atrasado'  → no tiene nota Y fecha_limite < ahora
   *   - 'pendiente' → no tiene nota Y (fecha_limite >= ahora O fecha_limite es NULL)
   *   - 'ausente'   → calificacion.esta_ausente = true
   *
   * Solo devuelve evaluaciones con visible_para_padres = true.
   * El padre solo puede ver las de su propio hijo (valida matricula_id).
   */
  static async listarTareas(req, res) {
    try {
      const { matricula_id } = req.params;
      const { periodo_evaluacion_id, estado } = req.query;
 
      // Verificar que la matrícula pertenece al usuario autenticado
      const verificacion = await pool.query(`
        SELECT m.id
        FROM matricula m
        INNER JOIN estudiante e        ON m.estudiante_id = e.id
        INNER JOIN estudiante_tutor et ON et.estudiante_id = e.id
        INNER JOIN padre_familia pf    ON et.padre_familia_id = pf.id
        WHERE m.id = $1
          AND pf.usuario_id = $2
          AND m.deleted_at IS NULL
      `, [matricula_id, req.user.id]);
 
      if (!verificacion.rows[0]) {
        return res.status(403).json({
          success: false,
          message: 'No tenés acceso a esta matrícula'
        });
      }
 
      const params = [matricula_id];
      let p = 2;
      let filtros = '';
 
      if (periodo_evaluacion_id) {
        filtros += ` AND ev.periodo_evaluacion_id = $${p++}`;
        params.push(parseInt(periodo_evaluacion_id));
      }
 
      // Filtro de estado aplicado DESPUÉS del HAVING via subconsulta
      const estadoFiltro = estado
        ? `WHERE estado_calculado = $${p++}`
        : '';
      if (estado) params.push(estado);
 
      const query = `
        SELECT *
        FROM (
          SELECT
            ev.id                         AS evaluacion_id,
            ev.nombre                     AS evaluacion_nombre,
            ev.tipo,
            ev.descripcion,
            ev.instrucciones,
            ev.fecha                      AS fecha_evaluacion,
            ev.fecha_limite,
            ev.puntaje_maximo,
            ev.peso_en_dimension,
            ev.publicado_en,
 
            -- Dimensión
            de.id                         AS dimension_id,
            de.nombre                     AS dimension_nombre,
            de.codigo                     AS dimension_codigo,
            de.color                      AS dimension_color,
            de.porcentaje_ponderacion,
 
            -- Materia
            mat.nombre                    AS materia_nombre,
            mat.codigo                    AS materia_codigo,
            mat.color                     AS materia_color,
 
            -- Período
            pe.nombre                     AS periodo_nombre,
            pe.id                         AS periodo_evaluacion_id,
            pe.orden                      AS periodo_orden,
 
            -- Calificación (puede ser NULL si no fue registrada aún)
            c.id                          AS calificacion_id,
            c.puntaje_obtenido,
            c.esta_ausente,
            c.observacion                 AS observacion_docente,
            c.fecha_registro,
 
            -- Nota sobre 100 (normalizada)
            CASE
              WHEN c.puntaje_obtenido IS NOT NULL AND ev.puntaje_maximo > 0
              THEN ROUND((c.puntaje_obtenido / ev.puntaje_maximo * 100)::NUMERIC, 1)
              ELSE NULL
            END                           AS nota_sobre_100,
 
            -- Estado calculado
            CASE
              WHEN c.esta_ausente = true
                THEN 'ausente'
              WHEN c.puntaje_obtenido IS NOT NULL
                THEN 'entregado'
              WHEN ev.fecha_limite IS NOT NULL AND ev.fecha_limite < NOW()
                THEN 'atrasado'
              ELSE 'pendiente'
            END                           AS estado_calculado,
 
            -- Días restantes (negativo = atrasado)
            CASE
              WHEN ev.fecha_limite IS NOT NULL
              THEN EXTRACT(DAY FROM ev.fecha_limite - NOW())::INTEGER
              ELSE NULL
            END                           AS dias_restantes
 
          FROM matricula m
          INNER JOIN asignacion_docente ad
            ON  ad.paralelo_id          = m.paralelo_id
            AND ad.periodo_academico_id = m.periodo_academico_id
            AND ad.activo               = true
            AND ad.deleted_at           IS NULL
          INNER JOIN evaluacion ev
            ON  ev.asignacion_docente_id = ad.id
            AND ev.activo                = true
            AND ev.visible_para_padres   = true
          INNER JOIN dimension_evaluacion de ON ev.dimension_evaluacion_id = de.id
          INNER JOIN periodo_evaluacion pe   ON ev.periodo_evaluacion_id   = pe.id
          INNER JOIN grado_materia gm        ON ad.grado_materia_id        = gm.id
          INNER JOIN materia mat             ON gm.materia_id              = mat.id
          LEFT JOIN calificacion c
            ON  c.evaluacion_id = ev.id
            AND c.matricula_id  = m.id
          WHERE m.id = $1
            AND m.deleted_at IS NULL
            ${filtros}
        ) sub
        ${estadoFiltro}
        ORDER BY
          -- Primero: atrasados sin nota
          CASE WHEN estado_calculado = 'atrasado'  THEN 0 ELSE 1 END,
          -- Luego: pendientes próximos a vencer
          CASE WHEN estado_calculado = 'pendiente' THEN 0 ELSE 1 END,
          dias_restantes NULLS LAST,
          -- Después: entregados recientes
          fecha_registro DESC NULLS LAST,
          evaluacion_id DESC
      `;
 
      const result = await pool.query(query, params);
 
      // Estadísticas rápidas para el resumen
      const total      = result.rows.length;
      const entregados = result.rows.filter(r => r.estado_calculado === 'entregado').length;
      const pendientes = result.rows.filter(r => r.estado_calculado === 'pendiente').length;
      const atrasados  = result.rows.filter(r => r.estado_calculado === 'atrasado').length;
      const ausentes   = result.rows.filter(r => r.estado_calculado === 'ausente').length;
 
      res.json({
        success: true,
        data: {
          tareas: result.rows,
          resumen: { total, entregados, pendientes, atrasados, ausentes }
        }
      });
    } catch (error) {
      console.error('Error al listar tareas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar tareas: ' + error.message
      });
    }
  }
  
}
class TemarioController {

  /**
   * GET /api/notas/temario/:grado_materia_id
   * Query: ?periodo_evaluacion_id=X (opcional)
   *
   * Devuelve el temario completo de una materia con las
   * evaluaciones agrupadas por unidad → tema.
   * Útil para la vista del docente al crear evaluaciones.
   */
  static async getTemario(req, res) {
    try {
      const { grado_materia_id } = req.params;
      const { periodo_evaluacion_id } = req.query;

      const temario = await Evaluacion.getTemario({
        grado_materia_id:      parseInt(grado_materia_id),
        periodo_evaluacion_id: periodo_evaluacion_id ? parseInt(periodo_evaluacion_id) : null
      });

      res.json({
        success: true,
        data: { temario, total_unidades: [...new Set(temario.map(r => r.unidad_id))].length }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener temario: ' + error.message
      });
    }
  }
}
export {
  PeriodoEvaluacionController,
  DimensionEvaluacionController,
  EvaluacionController,
  MisMateriasController,
  CalificacionController,
  NotasCalculoController,
  TareasController,
  TemarioController,
};