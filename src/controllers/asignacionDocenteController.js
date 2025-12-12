// controllers/asignacionDocenteController.js
import { pool } from '../db/pool.js';
import AsignacionDocente from '../models/AsignacionDocente.js';
import Docente from '../models/Docente.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';

class AsignacionDocenteController {
  // ========================================
  // ASIGNAR DOCENTE A MATERIA/PARALELO
  // ========================================
  static async asignar(req, res) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const {
        docente_id,
        grado_materia_id,
        paralelo_id,
        periodo_academico_id,
        es_titular,
        fecha_inicio
      } = req.body;

      // Validaciones
      if (!docente_id || !grado_materia_id || !paralelo_id || !periodo_academico_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Faltan datos requeridos (docente_id, grado_materia_id, paralelo_id, periodo_academico_id)'
        });
      }

      // Verificar que el docente existe
      const docente = await Docente.findById(docente_id);
      if (!docente) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Docente no encontrado'
        });
      }

      // Verificar si ya existe una asignación para esta combinación
      const asignacionExistente = await AsignacionDocente.exists(
        grado_materia_id, paralelo_id, periodo_academico_id, client
      );

      if (asignacionExistente) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Ya existe un docente asignado para esta materia en este paralelo y periodo',
          data: { asignacion_existente_id: asignacionExistente.id }
        });
      }

      // Crear asignación
      const asignacion = await AsignacionDocente.create({
        docente_id,
        grado_materia_id,
        paralelo_id,
        periodo_academico_id,
        es_titular: es_titular ?? true,
        fecha_inicio: fecha_inicio || new Date(),
        activo: true
      }, client);

      await client.query('COMMIT');

      // Obtener datos completos para la respuesta
      const asignacionCompleta = await AsignacionDocente.findById(asignacion.id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'asignar',
        modulo: 'asignacion_docente',
        tabla_afectada: 'asignacion_docente',
        registro_id: asignacion.id,
        datos_nuevos: asignacionCompleta,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Docente ${docente.nombres} asignado a ${asignacionCompleta.materia_nombre} - ${asignacionCompleta.paralelo_nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Docente asignado exitosamente',
        data: { asignacion: asignacionCompleta }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al asignar docente:', error);
      res.status(500).json({
        success: false,
        message: 'Error al asignar docente: ' + error.message
      });
    } finally {
      client.release();
    }
  }

  // ========================================
  // ASIGNACIÓN MASIVA
  // ========================================
  static async asignarMasivo(req, res) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const { asignaciones, periodo_academico_id } = req.body;

      if (!asignaciones || !Array.isArray(asignaciones) || asignaciones.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar un array de asignaciones'
        });
      }

      const resultados = {
        exitosas: [],
        fallidas: [],
        omitidas: []
      };

      for (const asig of asignaciones) {
        try {
          // Verificar si ya existe
          const existe = await AsignacionDocente.exists(
            asig.grado_materia_id,
            asig.paralelo_id,
            periodo_academico_id || asig.periodo_academico_id,
            client
          );

          if (existe) {
            resultados.omitidas.push({
              ...asig,
              razon: 'Ya existe asignación'
            });
            continue;
          }

          const nuevaAsignacion = await AsignacionDocente.create({
            docente_id: asig.docente_id,
            grado_materia_id: asig.grado_materia_id,
            paralelo_id: asig.paralelo_id,
            periodo_academico_id: periodo_academico_id || asig.periodo_academico_id,
            es_titular: asig.es_titular ?? true,
            fecha_inicio: asig.fecha_inicio,
            activo: true
          }, client);

          resultados.exitosas.push(nuevaAsignacion);

        } catch (err) {
          resultados.fallidas.push({
            ...asig,
            error: err.message
          });
        }
      }

      await client.query('COMMIT');

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'asignar_masivo',
        modulo: 'asignacion_docente',
        datos_nuevos: {
          total_enviadas: asignaciones.length,
          exitosas: resultados.exitosas.length,
          fallidas: resultados.fallidas.length,
          omitidas: resultados.omitidas.length
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: resultados.fallidas.length === 0 ? 'exitoso' : 'parcial',
        mensaje: `Asignación masiva: ${resultados.exitosas.length} exitosas de ${asignaciones.length}`
      });

      res.status(201).json({
        success: true,
        message: `${resultados.exitosas.length} asignaciones creadas`,
        data: resultados
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en asignación masiva:', error);
      res.status(500).json({
        success: false,
        message: 'Error en asignación masiva: ' + error.message
      });
    } finally {
      client.release();
    }
  }

  // ========================================
  // LISTAR ASIGNACIONES
  // ========================================
  static async listar(req, res) {
    try {
      const { 
        page, limit, docente_id, grado_id, materia_id, 
        paralelo_id, periodo_academico_id, activo 
      } = req.query;

      const result = await AsignacionDocente.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        docente_id: docente_id ? parseInt(docente_id) : undefined,
        grado_id: grado_id ? parseInt(grado_id) : undefined,
        materia_id: materia_id ? parseInt(materia_id) : undefined,
        paralelo_id: paralelo_id ? parseInt(paralelo_id) : undefined,
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
        activo: activo !== undefined ? activo === 'true' : undefined
      });

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Error al listar asignaciones:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar asignaciones: ' + error.message
      });
    }
  }

  // ========================================
  // OBTENER ASIGNACIONES DE UN DOCENTE
  // ========================================
  static async listarPorDocente(req, res) {
    try {
      const { docente_id } = req.params;
      const { periodo_academico_id } = req.query;

      const asignaciones = await AsignacionDocente.findByDocente(
        parseInt(docente_id),
        periodo_academico_id ? parseInt(periodo_academico_id) : null
      );

      // Obtener carga horaria
      let cargaHoraria = null;
      if (periodo_academico_id) {
        cargaHoraria = await AsignacionDocente.getCargaHoraria(
          parseInt(docente_id),
          parseInt(periodo_academico_id)
        );
      }

      res.json({
        success: true,
        data: {
          asignaciones,
          carga_horaria: cargaHoraria
        }
      });
    } catch (error) {
      console.error('Error al listar asignaciones del docente:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar asignaciones: ' + error.message
      });
    }
  }

  // ========================================
  // OBTENER DOCENTES DE UN PARALELO
  // ========================================
  static async listarPorParalelo(req, res) {
    try {
      const { paralelo_id } = req.params;
      const { periodo_academico_id } = req.query;

      if (!periodo_academico_id) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere periodo_academico_id'
        });
      }

      const asignaciones = await AsignacionDocente.findByParalelo(
        parseInt(paralelo_id),
        parseInt(periodo_academico_id)
      );

      res.json({
        success: true,
        data: { asignaciones }
      });
    } catch (error) {
      console.error('Error al listar docentes del paralelo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar docentes: ' + error.message
      });
    }
  }

  // ========================================
  // OBTENER ASIGNACIÓN POR ID
  // ========================================
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const asignacion = await AsignacionDocente.findById(id);

      if (!asignacion) {
        return res.status(404).json({
          success: false,
          message: 'Asignación no encontrada'
        });
      }

      res.json({
        success: true,
        data: { asignacion }
      });
    } catch (error) {
      console.error('Error al obtener asignación:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener asignación: ' + error.message
      });
    }
  }

  // ========================================
  // ACTUALIZAR ASIGNACIÓN
  // ========================================
  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const { es_titular, fecha_inicio, fecha_fin, activo } = req.body;

      const asignacionExistente = await AsignacionDocente.findById(id);
      if (!asignacionExistente) {
        return res.status(404).json({
          success: false,
          message: 'Asignación no encontrada'
        });
      }

      const asignacion = await AsignacionDocente.update(id, {
        es_titular, fecha_inicio, fecha_fin, activo
      });

      const asignacionActualizada = await AsignacionDocente.findById(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'asignacion_docente',
        tabla_afectada: 'asignacion_docente',
        registro_id: parseInt(id),
        datos_anteriores: asignacionExistente,
        datos_nuevos: asignacionActualizada,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Asignación actualizada`
      });

      res.json({
        success: true,
        message: 'Asignación actualizada exitosamente',
        data: { asignacion: asignacionActualizada }
      });
    } catch (error) {
      console.error('Error al actualizar asignación:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar asignación: ' + error.message
      });
    }
  }

  // ========================================
  // CAMBIAR DOCENTE DE UNA ASIGNACIÓN
  // ========================================
  static async cambiarDocente(req, res) {
    try {
      const { id } = req.params;
      const { nuevo_docente_id } = req.body;

      if (!nuevo_docente_id) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere nuevo_docente_id'
        });
      }

      const asignacionExistente = await AsignacionDocente.findById(id);
      if (!asignacionExistente) {
        return res.status(404).json({
          success: false,
          message: 'Asignación no encontrada'
        });
      }

      const nuevoDocente = await Docente.findById(nuevo_docente_id);
      if (!nuevoDocente) {
        return res.status(404).json({
          success: false,
          message: 'Nuevo docente no encontrado'
        });
      }

      await AsignacionDocente.cambiarDocente(id, nuevo_docente_id);
      const asignacionActualizada = await AsignacionDocente.findById(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'cambiar_docente',
        modulo: 'asignacion_docente',
        tabla_afectada: 'asignacion_docente',
        registro_id: parseInt(id),
        datos_anteriores: { docente_id: asignacionExistente.docente_id },
        datos_nuevos: { docente_id: nuevo_docente_id },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Docente cambiado de ${asignacionExistente.docente_nombres} a ${nuevoDocente.nombres}`
      });

      res.json({
        success: true,
        message: 'Docente cambiado exitosamente',
        data: { asignacion: asignacionActualizada }
      });
    } catch (error) {
      console.error('Error al cambiar docente:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cambiar docente: ' + error.message
      });
    }
  }

  // ========================================
  // ELIMINAR ASIGNACIÓN
  // ========================================
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const asignacion = await AsignacionDocente.findById(id);
      if (!asignacion) {
        return res.status(404).json({
          success: false,
          message: 'Asignación no encontrada'
        });
      }

      await AsignacionDocente.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'asignacion_docente',
        tabla_afectada: 'asignacion_docente',
        registro_id: parseInt(id),
        datos_anteriores: asignacion,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Asignación eliminada: ${asignacion.docente_nombres} - ${asignacion.materia_nombre}`
      });

      res.json({
        success: true,
        message: 'Asignación eliminada exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar asignación:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar asignación: ' + error.message
      });
    }
  }

  // ========================================
  // COPIAR ASIGNACIONES DE OTRO PERIODO
  // ========================================
  static async copiarDePeriodo(req, res) {
    try {
      const { periodo_origen_id, periodo_destino_id } = req.body;

      if (!periodo_origen_id || !periodo_destino_id) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere periodo_origen_id y periodo_destino_id'
        });
      }

      const asignacionesCopias = await AsignacionDocente.copiarDePeriodo(
        periodo_origen_id, periodo_destino_id
      );

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'copiar_periodo',
        modulo: 'asignacion_docente',
        datos_nuevos: {
          periodo_origen_id,
          periodo_destino_id,
          asignaciones_copiadas: asignacionesCopias.length
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `${asignacionesCopias.length} asignaciones copiadas del periodo ${periodo_origen_id} al ${periodo_destino_id}`
      });

      res.json({
        success: true,
        message: `${asignacionesCopias.length} asignaciones copiadas exitosamente`,
        data: { asignaciones: asignacionesCopias }
      });
    } catch (error) {
      console.error('Error al copiar asignaciones:', error);
      res.status(500).json({
        success: false,
        message: 'Error al copiar asignaciones: ' + error.message
      });
    }
  }
}

export default AsignacionDocenteController;