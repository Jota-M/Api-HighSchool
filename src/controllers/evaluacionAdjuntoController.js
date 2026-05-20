// controllers/evaluacionAdjuntoController.js
import { EvaluacionAdjunto, EvaluacionRubrica } from '../models/EvaluacionAdjunto.js';
import { Evaluacion } from '../models/Notas.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadImage from '../utils/uploadImage.js';

// =============================================
// ADJUNTOS (foto + PDF)
// =============================================
class EvaluacionAdjuntoController {

  // POST /api/notas/evaluaciones/:id/foto
  static async subirFoto(req, res) {
    try {
      const { id } = req.params;

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No se proporcionó ninguna imagen' });
      }

      // Verificar que la evaluación existe
      const evaluacion = await Evaluacion.findById(id);
      if (!evaluacion) {
        return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
      }

      // Eliminar foto anterior de Cloudinary si existía
      if (evaluacion.foto_public_id) {
        try {
          await UploadImage.deleteImage(evaluacion.foto_public_id);
        } catch (err) {
          console.warn('No se pudo eliminar foto anterior de Cloudinary:', err.message);
        }
      }

      // Subir nueva foto a Cloudinary
      let uploadResult;
      try {
        uploadResult = await UploadImage.uploadFromBuffer(
          req.file.buffer,
          'evaluaciones/fotos',
          `evaluacion_foto_${id}_${Date.now()}`
        );
      } catch (uploadError) {
        return res.status(500).json({
          success: false,
          message: 'Error al subir imagen a Cloudinary: ' + uploadError.message
        });
      }

      const resultado = await EvaluacionAdjunto.guardarFoto(id, {
        foto_url:       uploadResult.url,
        foto_public_id: uploadResult.public_id
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id, accion: 'subir_foto',
        modulo: 'evaluacion', tabla_afectada: 'evaluacion',
        registro_id: parseInt(id),
        datos_nuevos: { foto_url: uploadResult.url },
        ip_address: reqInfo.ip, user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Foto subida a evaluación: ${evaluacion.nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Foto subida exitosamente',
        data: { evaluacion: resultado }
      });
    } catch (error) {
      console.error('Error al subir foto:', error);
      res.status(500).json({ success: false, message: 'Error al subir foto: ' + error.message });
    }
  }

  // DELETE /api/notas/evaluaciones/:id/foto
  static async eliminarFoto(req, res) {
    try {
      const { id } = req.params;

      const evaluacion = await Evaluacion.findById(id);
      if (!evaluacion) {
        return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
      }

      if (!evaluacion.foto_url) {
        return res.status(400).json({ success: false, message: 'Esta evaluación no tiene foto' });
      }

      // Eliminar de Cloudinary
      if (evaluacion.foto_public_id) {
        try {
          await UploadImage.deleteImage(evaluacion.foto_public_id);
        } catch (err) {
          console.warn('No se pudo eliminar de Cloudinary:', err.message);
        }
      }

      await EvaluacionAdjunto.eliminarFoto(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id, accion: 'eliminar_foto',
        modulo: 'evaluacion', tabla_afectada: 'evaluacion',
        registro_id: parseInt(id),
        ip_address: reqInfo.ip, user_agent: reqInfo.userAgent,
        resultado: 'exitoso', mensaje: `Foto eliminada de evaluación: ${evaluacion.nombre}`
      });

      res.json({ success: true, message: 'Foto eliminada exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al eliminar foto: ' + error.message });
    }
  }

  // POST /api/notas/evaluaciones/:id/pdf
  static async subirPdf(req, res) {
    try {
      const { id } = req.params;

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No se proporcionó ningún PDF' });
      }

      // Validar que sea PDF
      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ success: false, message: 'El archivo debe ser un PDF' });
      }

      const evaluacion = await Evaluacion.findById(id);
      if (!evaluacion) {
        return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
      }

      // Eliminar PDF anterior de Cloudinary si existía
      if (evaluacion.pdf_public_id) {
        try {
          await UploadImage.deleteImage(evaluacion.pdf_public_id);
        } catch (err) {
          console.warn('No se pudo eliminar PDF anterior de Cloudinary:', err.message);
        }
      }

      // Subir a Cloudinary (carpeta raw para PDFs)
      let uploadResult;
      try {
        uploadResult = await UploadImage.uploadFromBuffer(
          req.file.buffer,
          'evaluaciones/pdfs',
          `evaluacion_pdf_${id}_${Date.now()}`,
          { resource_type: 'raw' }   // Cloudinary: raw para PDFs
        );
      } catch (uploadError) {
        return res.status(500).json({
          success: false,
          message: 'Error al subir PDF a Cloudinary: ' + uploadError.message
        });
      }

      const resultado = await EvaluacionAdjunto.guardarPdf(id, {
        pdf_url:       uploadResult.url,
        pdf_public_id: uploadResult.public_id,
        pdf_nombre:    req.file.originalname
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id, accion: 'subir_pdf',
        modulo: 'evaluacion', tabla_afectada: 'evaluacion',
        registro_id: parseInt(id),
        datos_nuevos: { pdf_url: uploadResult.url, pdf_nombre: req.file.originalname },
        ip_address: reqInfo.ip, user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `PDF subido a evaluación: ${evaluacion.nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'PDF subido exitosamente',
        data: { evaluacion: resultado }
      });
    } catch (error) {
      console.error('Error al subir PDF:', error);
      res.status(500).json({ success: false, message: 'Error al subir PDF: ' + error.message });
    }
  }

  // DELETE /api/notas/evaluaciones/:id/pdf
  static async eliminarPdf(req, res) {
    try {
      const { id } = req.params;

      const evaluacion = await Evaluacion.findById(id);
      if (!evaluacion) {
        return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
      }

      if (!evaluacion.pdf_url) {
        return res.status(400).json({ success: false, message: 'Esta evaluación no tiene PDF' });
      }

      if (evaluacion.pdf_public_id) {
        try {
          await UploadImage.deleteImage(evaluacion.pdf_public_id);
        } catch (err) {
          console.warn('No se pudo eliminar PDF de Cloudinary:', err.message);
        }
      }

      await EvaluacionAdjunto.eliminarPdf(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id, accion: 'eliminar_pdf',
        modulo: 'evaluacion', tabla_afectada: 'evaluacion',
        registro_id: parseInt(id),
        ip_address: reqInfo.ip, user_agent: reqInfo.userAgent,
        resultado: 'exitoso', mensaje: `PDF eliminado de evaluación: ${evaluacion.nombre}`
      });

      res.json({ success: true, message: 'PDF eliminado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al eliminar PDF: ' + error.message });
    }
  }

  // PATCH /api/notas/evaluaciones/:id/publicar
  static async publicar(req, res) {
    try {
      const { id } = req.params;
      const { fecha_limite, instrucciones } = req.body;

      const resultado = await EvaluacionAdjunto.publicar(id, { fecha_limite, instrucciones });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id, accion: 'publicar',
        modulo: 'evaluacion', tabla_afectada: 'evaluacion',
        registro_id: parseInt(id),
        datos_nuevos: { visible_para_padres: true, fecha_limite, instrucciones },
        ip_address: reqInfo.ip, user_agent: reqInfo.userAgent,
        resultado: 'exitoso', mensaje: `Evaluación publicada: ${resultado.nombre}`
      });

      res.json({
        success: true,
        message: 'Evaluación publicada — ya es visible para padres y estudiantes',
        data: { evaluacion: resultado }
      });
    } catch (error) {
      const status = error.message.includes('no encontrada') ? 404 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  // PATCH /api/notas/evaluaciones/:id/despublicar
  static async despublicar(req, res) {
    try {
      const { id } = req.params;
      const resultado = await EvaluacionAdjunto.despublicar(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id, accion: 'despublicar',
        modulo: 'evaluacion', tabla_afectada: 'evaluacion',
        registro_id: parseInt(id),
        ip_address: reqInfo.ip, user_agent: reqInfo.userAgent,
        resultado: 'exitoso', mensaje: `Evaluación despublicada: ${resultado?.nombre}`
      });

      res.json({ success: true, message: 'Evaluación ocultada a padres y estudiantes' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

// =============================================
// RÚBRICA
// =============================================
class EvaluacionRubricaController {

  // GET /api/notas/evaluaciones/:id/rubrica
  static async listar(req, res) {
    try {
      const criterios = await EvaluacionRubrica.findByEvaluacion(req.params.id);
      const suma = criterios.reduce((s, c) => s + parseFloat(c.puntos_posibles), 0);

      res.json({
        success: true,
        data: {
          criterios,
          total_criterios: criterios.length,
          suma_puntos:     suma
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al listar rúbrica: ' + error.message });
    }
  }

  // PUT /api/notas/evaluaciones/:id/rubrica
  // Reemplaza toda la rúbrica en una sola operación (el frontend manda el array completo)
  // Body: { criterios: [{ criterio, descripcion, puntos_posibles, nivel_excelente?, nivel_bueno?, nivel_basico?, nivel_insuficiente? }] }
  static async reemplazar(req, res) {
    try {
      const { id } = req.params;
      const { criterios } = req.body;

      if (!Array.isArray(criterios) || criterios.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Debes enviar al menos un criterio en el array "criterios"'
        });
      }

      // Validar campos mínimos de cada criterio
      for (const c of criterios) {
        if (!c.criterio || c.puntos_posibles === undefined) {
          return res.status(400).json({
            success: false,
            message: 'Cada criterio debe tener "criterio" y "puntos_posibles"'
          });
        }
      }

      const resultado = await EvaluacionRubrica.reemplazar(parseInt(id), criterios);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id, accion: 'actualizar_rubrica',
        modulo: 'evaluacion', tabla_afectada: 'evaluacion_rubrica',
        registro_id: parseInt(id),
        datos_nuevos: { total_criterios: criterios.length, suma: resultado.suma_rubrica },
        ip_address: reqInfo.ip, user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Rúbrica actualizada: ${criterios.length} criterios — ${resultado.suma_rubrica}pts`
      });

      res.json({
        success: true,
        message: 'Rúbrica guardada exitosamente',
        data: resultado
      });
    } catch (error) {
      const status = error.message.includes('supera') ? 400
                   : error.message.includes('no encontrada') ? 404 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  // PATCH /api/notas/evaluaciones/rubrica/:criterio_id
  // Editar un solo criterio sin reemplazar todo
  static async actualizarCriterio(req, res) {
    try {
      const { criterio_id } = req.params;
      const criterio = await EvaluacionRubrica.update(criterio_id, req.body);

      if (!criterio) {
        return res.status(404).json({ success: false, message: 'Criterio no encontrado' });
      }

      res.json({ success: true, message: 'Criterio actualizado', data: { criterio } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al actualizar criterio: ' + error.message });
    }
  }

  // DELETE /api/notas/evaluaciones/rubrica/:criterio_id
  static async eliminarCriterio(req, res) {
    try {
      const criterio = await EvaluacionRubrica.delete(req.params.criterio_id);
      if (!criterio) {
        return res.status(404).json({ success: false, message: 'Criterio no encontrado' });
      }
      res.json({ success: true, message: 'Criterio eliminado' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al eliminar criterio: ' + error.message });
    }
  }
}

// =============================================
// VISTA PÚBLICA (padres y estudiantes)
// =============================================
class VistaPublicaController {

  // GET /api/notas/evaluaciones/:id/publica?matricula_id=X
  // Evaluación completa: descripción + foto + PDF + rúbrica + nota del estudiante
  static async getEvaluacion(req, res) {
    try {
      const { id } = req.params;
      const { matricula_id } = req.query;

      const data = await EvaluacionAdjunto.getVistaPublica(
        parseInt(id),
        matricula_id ? parseInt(matricula_id) : null
      );

      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Evaluación no encontrada o aún no publicada'
        });
      }

      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // GET /api/notas/evaluaciones/publicas?asignacion_docente_id=X&periodo_evaluacion_id=Y&matricula_id=Z
  // Lista de evaluaciones publicadas de una materia con el estado de nota del estudiante
  static async listarPublicas(req, res) {
    try {
      const { asignacion_docente_id, periodo_evaluacion_id, matricula_id } = req.query;

      if (!asignacion_docente_id || !periodo_evaluacion_id) {
        return res.status(400).json({
          success: false,
          message: 'asignacion_docente_id y periodo_evaluacion_id son requeridos'
        });
      }

      const evaluaciones = await EvaluacionAdjunto.getEvaluacionesPublicas({
        asignacion_docente_id: parseInt(asignacion_docente_id),
        periodo_evaluacion_id: parseInt(periodo_evaluacion_id),
        matricula_id:          matricula_id ? parseInt(matricula_id) : null
      });

      res.json({
        success: true,
        data: {
          evaluaciones,
          total:          evaluaciones.length,
          calificadas:    evaluaciones.filter(e => e.puntaje_obtenido !== null).length,
          pendientes:     evaluaciones.filter(e => e.puntaje_obtenido === null).length
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

export {
  EvaluacionAdjuntoController,
  EvaluacionRubricaController,
  VistaPublicaController
};