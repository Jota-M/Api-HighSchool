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
import notificacionesAcademicas from '../utils/notificacionesAcademicas.js';

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

  static async crear(req, res) {
    try {
      const { nombre, codigo, orden, color, porcentaje_ponderacion, descripcion } = req.body;

      if (!nombre || !codigo || orden === undefined || porcentaje_ponderacion === undefined) {
        return res.status(400).json({
          success: false,
          message: 'nombre, codigo, orden y porcentaje_ponderacion son requeridos'
        });
      }

      const result = await pool.query(`
        INSERT INTO dimension_evaluacion
          (nombre, codigo, orden, color, porcentaje_ponderacion, descripcion)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        nombre,
        codigo.toUpperCase(),
        orden,
        color || null,
        porcentaje_ponderacion,
        descripcion || null
      ]);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:     req.user.id,
        accion:         'crear',
        modulo:         'dimension_evaluacion',
        tabla_afectada: 'dimension_evaluacion',
        registro_id:    result.rows[0].id,
        datos_nuevos:   result.rows[0],
        ip_address:     reqInfo.ip,
        user_agent:     reqInfo.userAgent,
        resultado:      'exitoso',
        mensaje:        `Dimensión creada: ${nombre} (${codigo})`
      });

      res.status(201).json({
        success: true,
        message: 'Dimensión creada exitosamente',
        data: { dimension: result.rows[0] }
      });

    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe una dimensión con ese código'
        });
      }
      res.status(500).json({
        success: false,
        message: 'Error al crear dimensión: ' + error.message
      });
    }
  }

  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const { nombre, codigo, orden, color, porcentaje_ponderacion, descripcion, activo } = req.body;

      const anterior = await pool.query(
        `SELECT * FROM dimension_evaluacion WHERE id = $1`, [id]
      );
      if (!anterior.rows[0]) {
        return res.status(404).json({
          success: false,
          message: 'Dimensión no encontrada'
        });
      }

      const result = await pool.query(`
        UPDATE dimension_evaluacion SET
          nombre                 = COALESCE($1, nombre),
          codigo                 = COALESCE($2, codigo),
          orden                  = COALESCE($3, orden),
          color                  = COALESCE($4, color),
          porcentaje_ponderacion = COALESCE($5, porcentaje_ponderacion),
          descripcion            = COALESCE($6, descripcion),
          activo                 = COALESCE($7, activo),
          updated_at             = CURRENT_TIMESTAMP
        WHERE id = $8
        RETURNING *
      `, [
        nombre        || null,
        codigo        ? codigo.toUpperCase() : null,
        orden         ?? null,
        color         || null,
        porcentaje_ponderacion ?? null,
        descripcion   || null,
        activo        ?? null,
        id
      ]);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:       req.user.id,
        accion:           'actualizar',
        modulo:           'dimension_evaluacion',
        tabla_afectada:   'dimension_evaluacion',
        registro_id:      parseInt(id),
        datos_anteriores: anterior.rows[0],
        datos_nuevos:     result.rows[0],
        ip_address:       reqInfo.ip,
        user_agent:       reqInfo.userAgent,
        resultado:        'exitoso',
        mensaje:          `Dimensión actualizada: ${result.rows[0].nombre}`
      });

      res.json({
        success: true,
        message: 'Dimensión actualizada exitosamente',
        data: { dimension: result.rows[0] }
      });

    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe una dimensión con ese código'
        });
      }
      res.status(500).json({
        success: false,
        message: 'Error al actualizar dimensión: ' + error.message
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
        tema_id
      } = req.query;

      const result = await Evaluacion.findAll({
        page:                    parseInt(page)  || 1,
        limit:                   parseInt(limit) || 20,
        asignacion_docente_id:   asignacion_docente_id   ? parseInt(asignacion_docente_id)   : undefined,
        dimension_evaluacion_id: dimension_evaluacion_id ? parseInt(dimension_evaluacion_id) : undefined,
        periodo_evaluacion_id:   periodo_evaluacion_id   ? parseInt(periodo_evaluacion_id)   : undefined,
        activo:                  activo !== undefined     ? activo === 'true'                : undefined,
        tema_id:                 tema_id                 ? parseInt(tema_id)                : undefined
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
  // ✅ SIN hook de notificación — crear evaluación no es registrar nota
  static async crear(req, res) {
    try {
      const {
        asignacion_docente_id, dimension_evaluacion_id, periodo_evaluacion_id,
        nombre, tipo, descripcion, fecha, puntaje_maximo, peso_en_dimension,
        visible_para_padres, tema_id
      } = req.body;

      if (!asignacion_docente_id || !dimension_evaluacion_id || !periodo_evaluacion_id || !nombre) {
        return res.status(400).json({
          success: false,
          message: 'asignacion_docente_id, dimension_evaluacion_id, periodo_evaluacion_id y nombre son requeridos'
        });
      }

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
        visible_para_padres, tema_id
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
// MIS MATERIAS
// =============================================
class MisMateriasController {

  // GET /api/notas/mis-materias
  static async getMisMaterias(req, res) {
    try {
      const { periodo_evaluacion_id } = req.query;

      const materias = await Evaluacion.getMisMaterias({
        usuario_id:            req.user.id,
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

// =============================================
// CALIFICACION
// =============================================
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
  // ✅ Hook de notificación individual — después del upsert, antes del res.json
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
      dispararAsignacionMaterial({
        evaluacionId:    parseInt(evaluacion_id),
        matriculaId:     parseInt(matricula_id),
        puntajeObtenido: calificacion.puntaje_obtenido,
        estaAusente:     calificacion.esta_ausente,
      }).catch(err =>
        console.error('[notasController] asignación material falló:', err.message)
      );

      // ✅ HOOK: notificación automática al estudiante y padre
      notificacionesAcademicas.onCalificacionCargada({
        calificacion_id: calificacion.id,
        matricula_id:    parseInt(matricula_id),
        evaluacion_id:   parseInt(evaluacion_id),
      }).catch(() => {});
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
  // ✅ Hook de notificación por cada calificación del loop
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

      // ── HOOKS por cada calificación registrada ────────────────────────────
      for (const cal of resultado) {
        // Asignación automática de materiales
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

        // ✅ Notificación automática al estudiante y padre
        notificacionesAcademicas.onCalificacionCargada({
          calificacion_id: cal.id,
          matricula_id:    cal.matricula_id,
          evaluacion_id:   parseInt(evaluacion_id),
        }).catch(() => {});
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
  // ✅ Hook de notificación al cerrar período individual
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

      // ── Obtener asignacion_docente_id para la predicción ──────────────────
      const { rows: [asig] } = await pool.query(`
        SELECT ad.id AS asignacion_docente_id
        FROM   asignacion_docente ad
        WHERE  ad.grado_materia_id = $1
          AND  ad.activo           = true
          AND  ad.deleted_at       IS NULL
        LIMIT 1
      `, [grado_materia_id]);

      if (asig?.asignacion_docente_id) {
        // Predicción automática
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

      // ✅ Notificación automática al estudiante y padre con nota de período
      notificacionesAcademicas.onNotaPeriodoCerrada({
        calificacion_periodo_id: calificacion.id,
        matricula_id:            parseInt(matricula_id),
        grado_materia_id:        parseInt(grado_materia_id),
        periodo_evaluacion_id:   parseInt(periodo_evaluacion_id),
      }).catch(() => {});
      // ─────────────────────────────────────────────────────────────────────

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

  // PATCH /api/notas/cerrar-periodo-clase
  // ✅ El cierre masivo dispara notificaciones internamente desde cerrarPeriodoClase
  //    (que a su vez llama cerrarPeriodo por cada matrícula)
  static async cerrarPeriodoClase(req, res) {
    try {
      const { asignacion_docente_id, grado_materia_id, periodo_evaluacion_id } = req.body;

      if (!asignacion_docente_id || !grado_materia_id || !periodo_evaluacion_id) {
        return res.status(400).json({
          success: false,
          message: 'asignacion_docente_id, grado_materia_id y periodo_evaluacion_id son requeridos',
        });
      }

      // Responder inmediatamente — el proceso continúa en background
      res.json({
        success: true,
        message: 'Cierre iniciado. Las predicciones y notificaciones se generarán automáticamente.',
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
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error al iniciar cierre: ' + error.message,
        });
      }
    }
  }

  // PATCH /api/notas/nota-manual
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

// =============================================
// TAREAS (vista del padre/estudiante)
// =============================================
class TareasController {

  // GET /api/notas/tareas/:matricula_id
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

            de.id                         AS dimension_id,
            de.nombre                     AS dimension_nombre,
            de.codigo                     AS dimension_codigo,
            de.color                      AS dimension_color,
            de.porcentaje_ponderacion,

            mat.nombre                    AS materia_nombre,
            mat.codigo                    AS materia_codigo,
            mat.color                     AS materia_color,

            pe.nombre                     AS periodo_nombre,
            pe.id                         AS periodo_evaluacion_id,
            pe.orden                      AS periodo_orden,

            c.id                          AS calificacion_id,
            c.puntaje_obtenido,
            c.esta_ausente,
            c.observacion                 AS observacion_docente,
            c.fecha_registro,

            CASE
              WHEN c.puntaje_obtenido IS NOT NULL AND ev.puntaje_maximo > 0
              THEN ROUND((c.puntaje_obtenido / ev.puntaje_maximo * 100)::NUMERIC, 1)
              ELSE NULL
            END                           AS nota_sobre_100,

            CASE
              WHEN c.esta_ausente = true
                THEN 'ausente'
              WHEN c.puntaje_obtenido IS NOT NULL
                THEN 'entregado'
              WHEN ev.fecha_limite IS NOT NULL AND ev.fecha_limite < NOW()
                THEN 'atrasado'
              ELSE 'pendiente'
            END                           AS estado_calculado,

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
          CASE WHEN estado_calculado = 'atrasado'  THEN 0 ELSE 1 END,
          CASE WHEN estado_calculado = 'pendiente' THEN 0 ELSE 1 END,
          dias_restantes NULLS LAST,
          fecha_registro DESC NULLS LAST,
          evaluacion_id DESC
      `;

      const result = await pool.query(query, params);

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

// =============================================
// TEMARIO
// =============================================
class TemarioController {

  // GET /api/notas/temario/:grado_materia_id
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