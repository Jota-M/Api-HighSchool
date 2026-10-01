// controllers/examenController.js
import Examen from '../models/Examen.js';
import { Tema } from '../models/Material.js';
import { generarExamenTema } from '../utils/geminiClient.js';
import UploadFile from '../utils/uploadFile.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import { pool } from '../db/pool.js';

export class ExamenController {
  // =============================================
  // ENDPOINTS DOCENTE
  // =============================================

  /**
   * POST /api/examenes/generar-ia-directo
   * Genera borrador de examen con IA directamente para el creador de evaluación (sin ID previo).
   */
  static async generarIADirecto(req, res) {
    try {
      const {
        tema_id,
        temaTitulo = 'Evaluación',
        contenidoPersonalizado,
        nivelDificultad = 'medio',
        cantidadOpcionMultiple = 5,
        cantidadVerdaderoFalso = 2,
        cantidadDesarrollo = 1,
      } = req.body;

      let finalTitulo = temaTitulo;
      let finalDificultad = nivelDificultad;
      let contenido = contenidoPersonalizado;

      if (tema_id) {
        const tema = await Tema.findById(parseInt(tema_id));
        if (tema) {
          finalTitulo = tema.titulo || finalTitulo;
          finalDificultad = tema.nivel_dificultad || finalDificultad;
          if (!contenido) {
            contenido = tema.contenido || tema.descripcion;
          }
        }
      }

      if (!contenido || contenido.trim().length < 10) {
        contenido = `Evaluación académica sobre el tema ${finalTitulo}. Generar preguntas pertinentes y adecuadas para nivel escolar de secundaria.`;
      }

      const preguntasGeneradas = await generarExamenTema({
        temaTitulo: finalTitulo,
        contenido,
        nivelDificultad: finalDificultad,
      }, {
        cantidadOpcionMultiple: parseInt(cantidadOpcionMultiple) || 5,
        cantidadVerdaderoFalso: parseInt(cantidadVerdaderoFalso) || 2,
        cantidadDesarrollo: parseInt(cantidadDesarrollo) || 1,
      });

      const preguntasMapeadas = preguntasGeneradas.map((p, index) => ({
        id: -(index + 1),
        tipo: p.tipo,
        pregunta: p.pregunta,
        opciones: p.opciones,
        respuesta_correcta: p.respuesta_correcta,
        respuesta_esperada: p.respuesta_esperada,
        puntos: p.puntos,
        requiere_archivo: p.requiere_archivo || false,
        orden: index + 1,
        generado_por_ia: true,
      }));

      return res.json({
        success: true,
        data: {
          preguntas: preguntasMapeadas,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error al generar preguntas con IA: ' + error.message,
      });
    }
  }

  /**
   * POST /api/examenes/:evaluacionId/generar-ia
   * Genera borrador de examen con IA sin persistir en BD.
   * Body: { cantidadOpcionMultiple, cantidadVerdaderoFalso, cantidadDesarrollo, contenidoPersonalizado }
   */
  static async generarIA(req, res) {
    try {
      const { evaluacionId } = req.params;
      const {
        cantidadOpcionMultiple = 5,
        cantidadVerdaderoFalso = 2,
        cantidadDesarrollo = 1,
        contenidoPersonalizado,
      } = req.body;

      const evaluacion = await Examen.obtenerConfiguracion(parseInt(evaluacionId));
      if (!evaluacion) {
        return res.status(404).json({
          success: false,
          message: 'Evaluación no encontrada',
        });
      }

      let contenido = contenidoPersonalizado;
      let nivelDificultad = 'medio';
      let temaTitulo = evaluacion.nombre;

      if (!contenido && evaluacion.tema_id) {
        const tema = await Tema.findById(evaluacion.tema_id);
        if (tema) {
          contenido = tema.contenido;
          nivelDificultad = tema.nivel_dificultad || 'medio';
          temaTitulo = tema.titulo || evaluacion.nombre;
        }
      }

      if (!contenido || contenido.trim().length < 20) {
        return res.status(400).json({
          success: false,
          message: 'La evaluación no tiene contenido de tema asociado suficiente (mínimo 20 caracteres) para generar preguntas con IA. Vincula la evaluación a un tema con contenido o provee el texto en el cuerpo de la petición.',
        });
      }

      const preguntasGeneradas = await generarExamenTema({
        temaTitulo,
        contenido,
        nivelDificultad,
      }, {
        cantidadOpcionMultiple: parseInt(cantidadOpcionMultiple) || 5,
        cantidadVerdaderoFalso: parseInt(cantidadVerdaderoFalso) || 2,
        cantidadDesarrollo: parseInt(cantidadDesarrollo) || 1,
      });

      // Mapear cada pregunta para el constructor del docente
      const preguntasMapeadas = preguntasGeneradas.map((p, index) => ({
        id: -(index + 1), // ID temporal negativo para frontend
        tipo: p.tipo,
        pregunta: p.pregunta,
        opciones: p.opciones || [],
        respuesta_correcta: p.respuesta_correcta !== undefined ? p.respuesta_correcta : 0,
        respuesta_esperada: p.respuesta_esperada || '',
        puntos: p.puntos || 1,
        requiere_archivo: false,
        orden: index + 1,
        generado_por_ia: true,
      }));

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'generar_examen_ia',
        modulo: 'evaluacion',
        tabla_afectada: 'evaluacion',
        registro_id: parseInt(evaluacionId),
        datos_nuevos: { total_preguntas_generadas: preguntasMapeadas.length },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Generado borrador de examen con IA para evaluación ID ${evaluacionId}`,
      });

      res.json({
        success: true,
        data: {
          preguntas: preguntasMapeadas,
        },
      });
    } catch (error) {
      console.error('Error en generarIA examen:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar examen con IA: ' + error.message,
      });
    }
  }

  /**
   * GET /api/examenes/:evaluacionId/preguntas
   * Obtiene la lista completa de preguntas (vista docente, con respuestas).
   */
  static async obtenerPreguntas(req, res) {
    try {
      const { evaluacionId } = req.params;
      const preguntas = await Examen.listarPreguntas(parseInt(evaluacionId));
      res.json({
        success: true,
        data: { preguntas },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener preguntas del examen: ' + error.message,
      });
    }
  }

  /**
   * PUT /api/examenes/:evaluacionId/preguntas
   * Guarda o actualiza el set completo de preguntas del examen.
   * Body: { preguntas: [...] }
   */
  static async guardarPreguntas(req, res) {
    try {
      const { evaluacionId } = req.params;
      const { preguntas } = req.body;

      if (!Array.isArray(preguntas)) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere un arreglo de preguntas',
        });
      }

      const guardadas = await Examen.reemplazarPreguntas(parseInt(evaluacionId), preguntas);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'guardar_preguntas_examen',
        modulo: 'evaluacion',
        tabla_afectada: 'examen_pregunta',
        registro_id: parseInt(evaluacionId),
        datos_nuevos: { total_guardadas: guardadas.length },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Guardadas ${guardadas.length} preguntas en examen ID ${evaluacionId}`,
      });

      res.json({
        success: true,
        message: 'Banco de preguntas guardado exitosamente',
        data: { preguntas: guardadas },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al guardar preguntas del examen: ' + error.message,
      });
    }
  }

  /**
   * POST /api/examenes/:evaluacionId/publicar-virtual
   * Activa modalidad virtual y configura parámetros de tiempo.
   * Body: { duracion_minutos, fecha_hora_inicio, fecha_hora_fin, intentos_permitidos, orden_aleatorio }
   */
  static async publicarVirtual(req, res) {
    try {
      const { evaluacionId } = req.params;
      const evaluacion = await Examen.activarModalidadVirtual(parseInt(evaluacionId), req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'publicar_examen_virtual',
        modulo: 'evaluacion',
        tabla_afectada: 'evaluacion',
        registro_id: parseInt(evaluacionId),
        datos_nuevos: evaluacion,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Evaluación ID ${evaluacionId} publicada en modalidad virtual`,
      });

      res.json({
        success: true,
        message: 'Modalidad virtual activada exitosamente',
        data: { evaluacion },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al activar modalidad virtual: ' + error.message,
      });
    }
  }

  /**
   * POST /api/examenes/:evaluacionId/desactivar-virtual
   * Desactiva la modalidad virtual volviendo a presencial.
   */
  static async desactivarVirtual(req, res) {
    try {
      const { evaluacionId } = req.params;
      const evaluacion = await Examen.desactivarModalidadVirtual(parseInt(evaluacionId));

      res.json({
        success: true,
        message: 'Evaluación reestablecida a presencial',
        data: { evaluacion },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al desactivar modalidad virtual: ' + error.message,
      });
    }
  }

  /**
   * GET /api/examenes/:evaluacionId/configuracion
   * Obtiene la configuración de una evaluación virtual.
   */
  static async obtenerConfiguracion(req, res) {
    try {
      const { evaluacionId } = req.params;
      const configuracion = await Examen.obtenerConfiguracion(parseInt(evaluacionId));
      if (!configuracion) {
        return res.status(404).json({
          success: false,
          message: 'Evaluación no encontrada',
        });
      }

      res.json({
        success: true,
        data: configuracion,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener configuración de examen: ' + error.message,
      });
    }
  }

  /**
   * GET /api/examenes/:evaluacionId/intentos
   * Lista de intentos de los estudiantes de la evaluación (vista docente).
   */
  static async listarIntentos(req, res) {
    try {
      const { evaluacionId } = req.params;
      const intentos = await Examen.listarIntentos(parseInt(evaluacionId));
      res.json({
        success: true,
        data: { intentos },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al listar intentos del examen: ' + error.message,
      });
    }
  }

  /**
   * GET /api/examenes/intentos/:id
   * Detalle completo de un intento para calificar respuestas subjetivas.
   */
  static async obtenerDetalleIntento(req, res) {
    try {
      const { id } = req.params;
      const detalle = await Examen.obtenerDetalleIntento(parseInt(id));
      if (!detalle) {
        return res.status(404).json({
          success: false,
          message: 'Intento no encontrado',
        });
      }

      res.json({
        success: true,
        data: detalle,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener detalle de intento: ' + error.message,
      });
    }
  }

  /**
   * PUT /api/examenes/respuestas/:id/calificar
   * El docente califica manualmente una respuesta subjetiva (desarrollo / respuesta corta).
   * Body: { puntaje_obtenido, retroalimentacion }
   */
  static async calificarRespuestaManual(req, res) {
    try {
      const { id } = req.params;
      const { puntaje_obtenido, retroalimentacion } = req.body;

      if (puntaje_obtenido === undefined || puntaje_obtenido === null) {
        return res.status(400).json({
          success: false,
          message: 'El puntaje obtenido es requerido',
        });
      }

      const intento = await Examen.calificarRespuestaManual(parseInt(id), {
        puntaje_obtenido: parseFloat(puntaje_obtenido),
        retroalimentacion,
        docente_id: req.user.id,
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'calificar_respuesta_manual',
        modulo: 'evaluacion',
        tabla_afectada: 'examen_respuesta',
        registro_id: parseInt(id),
        datos_nuevos: { puntaje_obtenido, retroalimentacion },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Respuesta ID ${id} calificada manualmente con ${puntaje_obtenido} pts`,
      });

      res.json({
        success: true,
        message: 'Respuesta calificada correctamente',
        data: { intento },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al calificar respuesta: ' + error.message,
      });
    }
  }

  // =============================================
  // ENDPOINTS ESTUDIANTE
  // =============================================

  /**
   * POST /api/examenes/:evaluacionId/iniciar
   * Inicia o continúa el intento del estudiante.
   * Body: { matricula_id? } (si no se envía, se busca por el usuario actual)
   */
  static async iniciarIntento(req, res) {
    try {
      const { evaluacionId } = req.params;
      let matricula_id = req.body.matricula_id;

      if (!matricula_id && req.user) {
        const matRes = await pool.query(`
          SELECT m.id
          FROM matricula m
          INNER JOIN estudiante e ON m.estudiante_id = e.id
          WHERE e.usuario_id = $1 AND m.estado = 'activo' AND m.deleted_at IS NULL
          LIMIT 1
        `, [req.user.id]);
        matricula_id = matRes.rows[0]?.id;
      }

      if (!matricula_id) {
        return res.status(400).json({
          success: false,
          message: 'No se pudo identificar la matrícula del estudiante',
        });
      }

      const resultado = await Examen.iniciarIntento(parseInt(evaluacionId), parseInt(matricula_id));
      res.json({
        success: true,
        data: resultado,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * PUT /api/examenes/respuestas/:id
   * Autosave de respuesta dada por el estudiante.
   * Body: { respuesta_opcion, respuesta_texto }
   */
  static async guardarRespuesta(req, res) {
    try {
      const { id } = req.params;
      const { respuesta_opcion, respuesta_texto, intento_id: bodyIntentoId, pregunta_id: bodyPreguntaId } = req.body;

      let intento_id = bodyIntentoId ? parseInt(bodyIntentoId) : null;
      let pregunta_id = bodyPreguntaId ? parseInt(bodyPreguntaId) : null;

      if (!intento_id || !pregunta_id) {
        if (id && parseInt(id) > 0) {
          const respRes = await pool.query(`
            SELECT intento_id, pregunta_id
            FROM examen_respuesta
            WHERE id = $1
          `, [id]);

          if (respRes.rows[0]) {
            intento_id = respRes.rows[0].intento_id;
            pregunta_id = respRes.rows[0].pregunta_id;
          }
        }
      }

      if (!intento_id || !pregunta_id) {
        return res.status(400).json({
          success: false,
          message: 'No se pudo identificar el intento y la pregunta para registrar la respuesta',
        });
      }

      const guardada = await Examen.guardarRespuesta(intento_id, pregunta_id, {
        respuesta_opcion,
        respuesta_texto,
      });

      res.json({
        success: true,
        data: guardada,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * POST /api/examenes/respuestas/:id/archivo
   * Sube archivo adjunto (imagen o PDF) para respuestas de desarrollo.
   * Multipart: archivo
   */
  static async subirArchivoRespuesta(req, res) {
    try {
      const { id } = req.params;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No se proporcionó ningún archivo',
        });
      }

      const respRes = await pool.query(`
        SELECT intento_id, pregunta_id, archivo_public_id
        FROM examen_respuesta
        WHERE id = $1
      `, [id]);

      if (!respRes.rows[0]) {
        return res.status(404).json({
          success: false,
          message: 'Respuesta no encontrada',
        });
      }

      const { intento_id, pregunta_id, archivo_public_id } = respRes.rows[0];

      // Eliminar archivo anterior si existía
      if (archivo_public_id) {
        try {
          await UploadFile.deleteFile(archivo_public_id);
        } catch (delErr) {
          console.warn('No se pudo eliminar archivo anterior de Cloudinary:', delErr.message);
        }
      }

      // Subir archivo a Cloudinary
      const uploadResult = await UploadFile.uploadFromBuffer(
        req.file.buffer,
        'examenes/respuestas',
        req.file.originalname
      );

      const guardada = await Examen.guardarRespuesta(intento_id, pregunta_id, {
        archivo_url: uploadResult.url,
        archivo_public_id: uploadResult.public_id,
      });

      res.json({
        success: true,
        message: 'Archivo subido correctamente',
        data: guardada,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al subir archivo de examen: ' + error.message,
      });
    }
  }

  /**
   * POST /api/examenes/intentos/:id/entregar
   * Finaliza y entrega el intento formal del estudiante.
   */
  static async entregarIntento(req, res) {
    try {
      const { id } = req.params;
      const entregado = await Examen.entregarIntento(parseInt(id));

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user?.id || 1,
        accion: 'entregar_examen',
        modulo: 'evaluacion',
        tabla_afectada: 'examen_intento',
        registro_id: parseInt(id),
        datos_nuevos: {
          puntaje_obtenido: entregado.puntaje_obtenido,
          calificado_completo: entregado.calificado_completo,
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Intento ID ${id} entregado con estado ${entregado.estado}`,
      });

      res.json({
        success: true,
        message: 'Examen entregado exitosamente',
        data: entregado,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * POST /api/examenes/intentos/:id/reiniciar
   * o DELETE /api/examenes/intentos/:id/reiniciar
   * Reinicia el intento de un estudiante individualmente.
   */
  static async reiniciarIntento(req, res) {
    try {
      const { id } = req.params;
      const intentoEliminado = await Examen.reiniciarIntentoEstudiante(parseInt(id));

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'reiniciar_intento_examen',
        modulo: 'evaluacion',
        tabla_afectada: 'examen_intento',
        registro_id: parseInt(id),
        datos_previos: intentoEliminado,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Intento de examen ID ${id} reiniciado para matrícula ${intentoEliminado.matricula_id}`,
      });

      res.json({
        success: true,
        message: 'El intento del estudiante ha sido reiniciado exitosamente. Ahora puede rendir el examen nuevamente.',
        data: { intento: intentoEliminado },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al reiniciar intento: ' + error.message,
      });
    }
  }

  /**
   * POST /api/examenes/:evaluacionId/limpiar-intentos
   * Limpia todos los intentos y envíos de la evaluación.
   */
  static async limpiarTodosIntentos(req, res) {
    try {
      const { evaluacionId } = req.params;
      const resultado = await Examen.limpiarTodosLosIntentos(parseInt(evaluacionId));

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'limpiar_todos_intentos_examen',
        modulo: 'evaluacion',
        tabla_afectada: 'examen_intento',
        registro_id: parseInt(evaluacionId),
        datos_nuevos: resultado,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Limpiados todos los intentos (${resultado.total_eliminados}) de la evaluación ID ${evaluacionId}`,
      });

      res.json({
        success: true,
        message: `Se han eliminado exitosamente ${resultado.total_eliminados} intentos. La evaluación quedó limpia para todos los estudiantes.`,
        data: resultado,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al limpiar intentos del examen: ' + error.message,
      });
    }
  }
}

export default ExamenController;
