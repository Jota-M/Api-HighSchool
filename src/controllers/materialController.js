// controllers/materialController.js
import {
  UnidadTematica, Tema, TipoMaterial, MaterialAcademico,
  AccesoMaterial, ComentarioMaterial, FavoritoMaterial, ProgresoEstudiante
} from '../models/Material.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadFile from '../utils/uploadFile.js';

// =============================================
// TIPOS DE MATERIAL (catálogo)
// =============================================
class TipoMaterialController {

  // GET /api/materiales/tipos
  static async listar(req, res) {
    try {
      const tipos = await TipoMaterial.findAll();
      res.json({ success: true, data: { tipos } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al listar tipos: ' + error.message });
    }
  }
}

// =============================================
// UNIDADES TEMÁTICAS
// =============================================
class UnidadTematicaController {

  // GET /api/materiales/unidades
  static async listar(req, res) {
    try {
      const { grado_materia_id, periodo_evaluacion_id, activo, page, limit } = req.query;

      const result = await UnidadTematica.findAll({
        grado_materia_id:      grado_materia_id      ? parseInt(grado_materia_id)      : undefined,
        periodo_evaluacion_id: periodo_evaluacion_id ? parseInt(periodo_evaluacion_id) : undefined,
        activo:                activo !== undefined   ? activo === 'true'              : undefined,
        page:  parseInt(page)  || 1,
        limit: parseInt(limit) || 50
      });

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al listar unidades: ' + error.message });
    }
  }

  // GET /api/materiales/unidades/temario/:grado_materia_id
  static async getTemario(req, res) {
    try {
      const { grado_materia_id } = req.params;
      const { periodo_evaluacion_id } = req.query;

      const temario = await UnidadTematica.getTemario(
        parseInt(grado_materia_id),
        periodo_evaluacion_id ? parseInt(periodo_evaluacion_id) : null
      );

      res.json({ success: true, data: { temario } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al obtener temario: ' + error.message });
    }
  }

  // GET /api/materiales/unidades/:id
  static async obtenerPorId(req, res) {
    try {
      const unidad = await UnidadTematica.findById(req.params.id);
      if (!unidad) {
        return res.status(404).json({ success: false, message: 'Unidad temática no encontrada' });
      }
      res.json({ success: true, data: { unidad } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al obtener unidad: ' + error.message });
    }
  }

  // POST /api/materiales/unidades
  static async crear(req, res) {
    try {
      const { grado_materia_id, numero_unidad, titulo } = req.body;

      if (!grado_materia_id || !numero_unidad || !titulo) {
        return res.status(400).json({
          success: false,
          message: 'grado_materia_id, numero_unidad y titulo son requeridos'
        });
      }

      const unidad = await UnidadTematica.create(req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:     req.user.id,
        accion:         'crear',
        modulo:         'unidad_tematica',
        tabla_afectada: 'unidad_tematica',
        registro_id:    unidad.id,
        datos_nuevos:   unidad,
        ip_address:     reqInfo.ip,
        user_agent:     reqInfo.userAgent,
        resultado:      'exitoso',
        mensaje:        `Unidad temática creada: ${unidad.titulo}`
      });

      res.status(201).json({
        success: true,
        message: 'Unidad temática creada exitosamente',
        data: { unidad }
      });
    } catch (error) {
      if (error.constraint === 'unidad_tematica_grado_materia_id_numero_unidad_key') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe una unidad con ese número en esta materia'
        });
      }
      res.status(500).json({ success: false, message: 'Error al crear unidad: ' + error.message });
    }
  }

  // PUT /api/materiales/unidades/:id
  static async actualizar(req, res) {
    try {
      const { id } = req.params;

      const existente = await UnidadTematica.findById(id);
      if (!existente) {
        return res.status(404).json({ success: false, message: 'Unidad temática no encontrada' });
      }

      const unidad = await UnidadTematica.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:       req.user.id,
        accion:           'actualizar',
        modulo:           'unidad_tematica',
        tabla_afectada:   'unidad_tematica',
        registro_id:      parseInt(id),
        datos_anteriores: existente,
        datos_nuevos:     unidad,
        ip_address:       reqInfo.ip,
        user_agent:       reqInfo.userAgent,
        resultado:        'exitoso',
        mensaje:          `Unidad temática actualizada: ${unidad.titulo}`
      });

      res.json({ success: true, message: 'Unidad temática actualizada', data: { unidad } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al actualizar unidad: ' + error.message });
    }
  }

  // DELETE /api/materiales/unidades/:id
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const existente = await UnidadTematica.findById(id);
      if (!existente) {
        return res.status(404).json({ success: false, message: 'Unidad temática no encontrada' });
      }

      await UnidadTematica.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:       req.user.id,
        accion:           'eliminar',
        modulo:           'unidad_tematica',
        tabla_afectada:   'unidad_tematica',
        registro_id:      parseInt(id),
        datos_anteriores: existente,
        ip_address:       reqInfo.ip,
        user_agent:       reqInfo.userAgent,
        resultado:        'exitoso',
        mensaje:          `Unidad temática desactivada: ${existente.titulo}`
      });

      res.json({ success: true, message: 'Unidad temática eliminada exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al eliminar unidad: ' + error.message });
    }
  }
}

// =============================================
// TEMAS
// =============================================
class TemaController {

  // GET /api/materiales/temas
  static async listar(req, res) {
    try {
      const { unidad_tematica_id, activo, nivel_dificultad, page, limit } = req.query;

      const result = await Tema.findAll({
        unidad_tematica_id: unidad_tematica_id ? parseInt(unidad_tematica_id) : undefined,
        activo:             activo !== undefined ? activo === 'true' : undefined,
        nivel_dificultad,
        page:  parseInt(page)  || 1,
        limit: parseInt(limit) || 50
      });

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al listar temas: ' + error.message });
    }
  }

  // GET /api/materiales/temas/:id
  static async obtenerPorId(req, res) {
    try {
      const tema = await Tema.findById(req.params.id);
      if (!tema) {
        return res.status(404).json({ success: false, message: 'Tema no encontrado' });
      }
      res.json({ success: true, data: { tema } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al obtener tema: ' + error.message });
    }
  }

  // POST /api/materiales/temas
  static async crear(req, res) {
    try {
      const { unidad_tematica_id, numero_tema, titulo } = req.body;

      if (!unidad_tematica_id || !numero_tema || !titulo) {
        return res.status(400).json({
          success: false,
          message: 'unidad_tematica_id, numero_tema y titulo son requeridos'
        });
      }

      const tema = await Tema.create(req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:     req.user.id,
        accion:         'crear',
        modulo:         'tema',
        tabla_afectada: 'tema',
        registro_id:    tema.id,
        datos_nuevos:   tema,
        ip_address:     reqInfo.ip,
        user_agent:     reqInfo.userAgent,
        resultado:      'exitoso',
        mensaje:        `Tema creado: ${tema.titulo}`
      });

      res.status(201).json({
        success: true,
        message: 'Tema creado exitosamente',
        data: { tema }
      });
    } catch (error) {
      if (error.constraint === 'tema_unidad_tematica_id_numero_tema_key') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un tema con ese número en esta unidad'
        });
      }
      res.status(500).json({ success: false, message: 'Error al crear tema: ' + error.message });
    }
  }

  // PUT /api/materiales/temas/:id
  static async actualizar(req, res) {
    try {
      const { id } = req.params;

      const existente = await Tema.findById(id);
      if (!existente) {
        return res.status(404).json({ success: false, message: 'Tema no encontrado' });
      }

      const tema = await Tema.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:       req.user.id,
        accion:           'actualizar',
        modulo:           'tema',
        tabla_afectada:   'tema',
        registro_id:      parseInt(id),
        datos_anteriores: existente,
        datos_nuevos:     tema,
        ip_address:       reqInfo.ip,
        user_agent:       reqInfo.userAgent,
        resultado:        'exitoso',
        mensaje:          `Tema actualizado: ${tema.titulo}`
      });

      res.json({ success: true, message: 'Tema actualizado exitosamente', data: { tema } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al actualizar tema: ' + error.message });
    }
  }

  // DELETE /api/materiales/temas/:id
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const existente = await Tema.findById(id);
      if (!existente) {
        return res.status(404).json({ success: false, message: 'Tema no encontrado' });
      }

      await Tema.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:       req.user.id,
        accion:           'eliminar',
        modulo:           'tema',
        tabla_afectada:   'tema',
        registro_id:      parseInt(id),
        datos_anteriores: existente,
        ip_address:       reqInfo.ip,
        user_agent:       reqInfo.userAgent,
        resultado:        'exitoso',
        mensaje:          `Tema desactivado: ${existente.titulo}`
      });

      res.json({ success: true, message: 'Tema eliminado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al eliminar tema: ' + error.message });
    }
  }
}

// =============================================
// MATERIALES ACADÉMICOS
// =============================================
class MaterialAcademicoController {

  // GET /api/materiales
  static async listar(req, res) {
    try {
      const {
        page, limit, asignacion_docente_id, tipo_material_id,
        visible_para_estudiantes, es_destacado, solo_publicados, tema_id
      } = req.query;

      const result = await MaterialAcademico.findAll({
        page:  parseInt(page)  || 1,
        limit: parseInt(limit) || 10,
        asignacion_docente_id: asignacion_docente_id ? parseInt(asignacion_docente_id) : undefined,
        tipo_material_id:      tipo_material_id      ? parseInt(tipo_material_id)      : undefined,
        tema_id:               tema_id               ? parseInt(tema_id)               : undefined,
        visible_para_estudiantes: visible_para_estudiantes !== undefined
          ? visible_para_estudiantes === 'true' : undefined,
        es_destacado:  es_destacado  !== undefined  ? es_destacado  === 'true' : undefined,
        solo_publicados: solo_publicados === 'true'
      });

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al listar materiales: ' + error.message });
    }
  }

  // GET /api/materiales/buscar?q=algebra
  static async buscar(req, res) {
    try {
      const { q, asignacion_docente_id, tipo_material_id, solo_visibles } = req.query;

      if (!q || q.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'El término de búsqueda debe tener al menos 2 caracteres'
        });
      }

      const materiales = await MaterialAcademico.buscar(
        q.trim(),
        asignacion_docente_id ? parseInt(asignacion_docente_id) : null,
        tipo_material_id      ? parseInt(tipo_material_id)      : null,
        solo_visibles !== 'false'
      );

      res.json({ success: true, data: { materiales, total: materiales.length } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error en búsqueda: ' + error.message });
    }
  }

  // GET /api/materiales/:id
  static async obtenerPorId(req, res) {
    try {
      const material = await MaterialAcademico.findById(req.params.id);
      if (!material) {
        return res.status(404).json({ success: false, message: 'Material no encontrado' });
      }

      // Obtener temas vinculados
      const temas = await MaterialAcademico.getTemas(material.id);

      res.json({ success: true, data: { material, temas } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al obtener material: ' + error.message });
    }
  }

  // GET /api/materiales/:id/estadisticas
  static async getEstadisticas(req, res) {
    try {
      const { id } = req.params;
      const { fecha_inicio, fecha_fin } = req.query;

      const estadisticas = await MaterialAcademico.getEstadisticas(
        parseInt(id), fecha_inicio || null, fecha_fin || null
      );

      res.json({ success: true, data: { estadisticas } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al obtener estadísticas: ' + error.message });
    }
  }

  // GET /api/materiales/destacados?asignacion_docente_id=X&limite=5
  static async getDestacados(req, res) {
    try {
      const { asignacion_docente_id, limite } = req.query;

      if (!asignacion_docente_id) {
        return res.status(400).json({
          success: false,
          message: 'asignacion_docente_id es requerido'
        });
      }

      const materiales = await MaterialAcademico.getDestacados(
        parseInt(asignacion_docente_id),
        limite ? parseInt(limite) : 5
      );

      res.json({ success: true, data: { materiales } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al obtener destacados: ' + error.message });
    }
  }

  /**
   * POST /api/materiales
   * Crear material con archivo o enlace externo.
   *
   * Multipart/form-data si es archivo físico.
   * JSON si es enlace externo (es_enlace_externo = true, url_externa = '...').
   */
  static async crear(req, res) {
    try {
      const {
        asignacion_docente_id, tipo_material_id, titulo,
        descripcion, es_enlace_externo, url_externa,
        visible_para_estudiantes, fecha_publicacion, fecha_despublicacion,
        requiere_descarga, es_destacado,
        temas // JSON array: [{ tema_id, es_principal, orden }]
      } = req.body;

      // Validaciones básicas
      if (!asignacion_docente_id || !tipo_material_id || !titulo) {
        console.log('Faltan campos requeridos', req.body);
        return res.status(400).json({
          success: false,
          message: 'asignacion_docente_id, tipo_material_id y titulo son requeridos'
        });
      }

      const esEnlace = es_enlace_externo === 'true' || es_enlace_externo === true;

      if (esEnlace && !url_externa) {
        console.log('url_externa es requerida para materiales de tipo enlace externo', req.body);
        return res.status(400).json({
          success: false,
          message: 'url_externa es requerida para materiales de tipo enlace externo'
        });
      }

      if (!esEnlace && !req.file) {
  console.log('No llegó archivo');
  console.log(req.body);
  console.log(req.file);

  return res.status(400).json({
    success: false,
    message: 'Debes subir un archivo o marcar es_enlace_externo = true'
  });
}

      let url_archivo = null;
      let nombre_archivo = null;
      let tamano_bytes = null;
      let tipo_mime = null;

      // Subir archivo a Cloudinary
      if (req.file) {
        if (!UploadFile.isValidSize(req.file, 50)) {
          return res.status(400).json({
            success: false,
            message: 'El archivo supera el límite de 50MB'
          });
        }

        const resourceType = UploadFile.getResourceType(req.file.mimetype);

        // Extraer la extensión del nombre original del archivo
        const ext = req.file.originalname.split('.').pop();
        const fileName = resourceType === 'raw'
          ? `material_${Date.now()}.${ext}`   // ← Con extensión para raw
          : `material_${Date.now()}`;          // ← Sin extensión para image/video

        const uploadResult = await UploadFile.uploadFromBuffer(
          req.file.buffer,
          'materiales_academicos',
          fileName,
          resourceType
        );

        url_archivo    = uploadResult.url;
        nombre_archivo = req.file.originalname;
        tamano_bytes   = req.file.size;
        tipo_mime      = req.file.mimetype;
      }

      const material = await MaterialAcademico.create({
        asignacion_docente_id: parseInt(asignacion_docente_id),
        tipo_material_id:      parseInt(tipo_material_id),
        titulo,
        descripcion: descripcion || null,
        es_enlace_externo: esEnlace,
        url_archivo,
        url_externa:   esEnlace ? url_externa : null,
        nombre_archivo,
        tamano_bytes,
        tipo_mime,
        subido_por:    req.user.id,
        visible_para_estudiantes: visible_para_estudiantes !== 'false',
        fecha_publicacion:    fecha_publicacion    || null,
        fecha_despublicacion: fecha_despublicacion || null,
        requiere_descarga: requiere_descarga === 'true' || requiere_descarga === true,
        es_destacado:      es_destacado      === 'true' || es_destacado      === true,
      });

      // Vincular temas si se enviaron
      if (temas) {
        const temasArray = typeof temas === 'string' ? JSON.parse(temas) : temas;
        for (const t of temasArray) {
          await MaterialAcademico.vincularTema(material.id, t.tema_id, t.es_principal ?? false, t.orden ?? 1);
        }
      }

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:     req.user.id,
        accion:         'crear',
        modulo:         'material',
        tabla_afectada: 'material_academico',
        registro_id:    material.id,
        datos_nuevos:   { titulo: material.titulo, codigo: material.codigo_material },
        ip_address:     reqInfo.ip,
        user_agent:     reqInfo.userAgent,
        resultado:      'exitoso',
        mensaje:        `Material creado: ${material.codigo_material} - ${material.titulo}`
      });

      res.status(201).json({
        success: true,
        message: 'Material creado exitosamente',
        data: { material }
      });
    } catch (error) {
      console.error('Error al crear material:', error);
      res.status(500).json({ success: false, message: 'Error al crear material: ' + error.message });
    }
  }

  // PUT /api/materiales/:id
  static async actualizar(req, res) {
    try {
      const { id } = req.params;

      const existente = await MaterialAcademico.findById(id);
      if (!existente) {
        return res.status(404).json({ success: false, message: 'Material no encontrado' });
      }

      let updateData = { ...req.body };

      // Si subió un nuevo archivo, reemplazarlo en Cloudinary
      if (req.file) {
        // Eliminar archivo anterior si existe y no es enlace externo
        if (existente.url_archivo && !existente.es_enlace_externo) {
          const publicId = UploadFile.extractPublicIdFromUrl(existente.url_archivo);
          if (publicId) {
            const resourceType = UploadFile.getResourceType(existente.tipo_mime || 'application/octet-stream');
            await UploadFile.deleteFile(publicId, resourceType).catch(e =>
              console.error('Error al eliminar archivo anterior:', e)
            );
          }
        }

        const resourceType = UploadFile.getResourceType(req.file.mimetype);

        const ext = req.file.originalname.split('.').pop();
        const fileName = resourceType === 'raw'
          ? `material_${id}_${Date.now()}.${ext}`
          : `material_${id}_${Date.now()}`;

        const uploadResult = await UploadFile.uploadFromBuffer(
          req.file.buffer,
          'materiales_academicos',
          fileName,
          resourceType
        );

        updateData.url_archivo    = uploadResult.url;
        updateData.nombre_archivo = req.file.originalname;
        updateData.tamano_bytes   = req.file.size;
        updateData.tipo_mime      = req.file.mimetype;
      }

      const material = await MaterialAcademico.update(id, updateData);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:       req.user.id,
        accion:           'actualizar',
        modulo:           'material',
        tabla_afectada:   'material_academico',
        registro_id:      parseInt(id),
        datos_anteriores: { titulo: existente.titulo },
        datos_nuevos:     { titulo: material.titulo },
        ip_address:       reqInfo.ip,
        user_agent:       reqInfo.userAgent,
        resultado:        'exitoso',
        mensaje:          `Material actualizado: ${material.titulo}`
      });

      res.json({ success: true, message: 'Material actualizado exitosamente', data: { material } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al actualizar material: ' + error.message });
    }
  }

  // DELETE /api/materiales/:id
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const existente = await MaterialAcademico.findById(id);
      if (!existente) {
        return res.status(404).json({ success: false, message: 'Material no encontrado' });
      }

      // Eliminar archivo de Cloudinary si existe
      if (existente.url_archivo && !existente.es_enlace_externo) {
        const publicId = UploadFile.extractPublicIdFromUrl(existente.url_archivo);
        if (publicId) {
          const resourceType = UploadFile.getResourceType(existente.tipo_mime || 'application/octet-stream');
          await UploadFile.deleteFile(publicId, resourceType).catch(e =>
            console.error('Error al eliminar de Cloudinary:', e)
          );
        }
      }

      await MaterialAcademico.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:       req.user.id,
        accion:           'eliminar',
        modulo:           'material',
        tabla_afectada:   'material_academico',
        registro_id:      parseInt(id),
        datos_anteriores: { titulo: existente.titulo, codigo: existente.codigo_material },
        ip_address:       reqInfo.ip,
        user_agent:       reqInfo.userAgent,
        resultado:        'exitoso',
        mensaje:          `Material eliminado: ${existente.codigo_material} - ${existente.titulo}`
      });

      res.json({ success: true, message: 'Material eliminado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al eliminar material: ' + error.message });
    }
  }

  // PATCH /api/materiales/:id/publicar
  static async publicar(req, res) {
    try {
      const { id } = req.params;
      const { fecha_publicacion, fecha_despublicacion } = req.body;

      const material = await MaterialAcademico.publicar(
        id,
        fecha_publicacion || new Date().toISOString(),
        fecha_despublicacion || null
      );

      if (!material) {
        return res.status(404).json({ success: false, message: 'Material no encontrado' });
      }

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:     req.user.id,
        accion:         'publicar',
        modulo:         'material',
        tabla_afectada: 'material_academico',
        registro_id:    parseInt(id),
        datos_nuevos:   { fecha_publicacion: material.fecha_publicacion },
        ip_address:     reqInfo.ip,
        user_agent:     reqInfo.userAgent,
        resultado:      'exitoso',
        mensaje:        `Material publicado: ${material.titulo}`
      });

      res.json({ success: true, message: 'Material publicado exitosamente', data: { material } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al publicar: ' + error.message });
    }
  }

  // POST /api/materiales/:id/temas — vincular temas
  static async vincularTema(req, res) {
    try {
      const { id } = req.params;
      const { tema_id, es_principal, orden } = req.body;

      if (!tema_id) {
        return res.status(400).json({ success: false, message: 'tema_id es requerido' });
      }

      const vinculo = await MaterialAcademico.vincularTema(
        parseInt(id), parseInt(tema_id), es_principal ?? false, orden || 1
      );

      res.status(201).json({
        success: true,
        message: 'Tema vinculado exitosamente',
        data: { vinculo }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al vincular tema: ' + error.message });
    }
  }

  // DELETE /api/materiales/:id/temas/:tema_id — desvincular tema
  static async desvincularTema(req, res) {
    try {
      const { id, tema_id } = req.params;

      const vinculo = await MaterialAcademico.desvincularTema(parseInt(id), parseInt(tema_id));
      if (!vinculo) {
        return res.status(404).json({ success: false, message: 'Vínculo no encontrado' });
      }

      res.json({ success: true, message: 'Tema desvinculado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al desvincular tema: ' + error.message });
    }
  }
}

// =============================================
// ACCESO MATERIAL (log de vistas/descargas)
// =============================================
class AccesoMaterialController {

  /**
   * POST /api/materiales/:id/acceso
   * Registra que el usuario vio o descargó el material.
   * El trigger en la BD actualiza contadores y progreso automáticamente.
   */
  static async registrar(req, res) {
    try {
      const { id } = req.params;
      const { tipo_accion, matricula_id, dispositivo, duracion_segundos, completado } = req.body;

      const tiposValidos = ['visualizacion', 'descarga', 'compartido', 'impresion'];
      if (!tipo_accion || !tiposValidos.includes(tipo_accion)) {
        return res.status(400).json({
          success: false,
          message: `tipo_accion inválido. Debe ser: ${tiposValidos.join(', ')}`
        });
      }

      const reqInfo = RequestInfo.extract(req);
      const acceso = await AccesoMaterial.registrar({
        material_academico_id: parseInt(id),
        matricula_id:          matricula_id ? parseInt(matricula_id) : null,
        usuario_id:            req.user.id,
        tipo_accion,
        ip_address:            reqInfo.ip,
        user_agent:            reqInfo.userAgent,
        dispositivo:           dispositivo || 'web',
        duracion_segundos:     duracion_segundos ? parseInt(duracion_segundos) : null,
        completado:            completado ?? false,
      });

      res.status(201).json({ success: true, data: { acceso } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al registrar acceso: ' + error.message });
    }
  }
}

// =============================================
// COMENTARIOS
// =============================================
class ComentarioMaterialController {

  // GET /api/materiales/:id/comentarios
  static async listar(req, res) {
    try {
      const { id } = req.params;
      const { solo_dudas } = req.query;

      const comentarios = await ComentarioMaterial.findByMaterial(
        parseInt(id), solo_dudas === 'true'
      );

      // Cargar respuestas para cada comentario raíz
      const comentariosConRespuestas = await Promise.all(
        comentarios.map(async (c) => {
          const respuestas = await ComentarioMaterial.getRespuestas(c.id);
          return { ...c, respuestas };
        })
      );

      res.json({ success: true, data: { comentarios: comentariosConRespuestas } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al obtener comentarios: ' + error.message });
    }
  }

  // POST /api/materiales/:id/comentarios
  static async crear(req, res) {
    try {
      const { id } = req.params;
      const { contenido, comentario_padre_id, es_duda } = req.body;

      if (!contenido || contenido.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'El contenido es requerido' });
      }

      const comentario = await ComentarioMaterial.create({
        material_academico_id: parseInt(id),
        usuario_id:            req.user.id,
        comentario_padre_id:   comentario_padre_id ? parseInt(comentario_padre_id) : null,
        contenido:             contenido.trim(),
        es_duda:               es_duda ?? false,
      });

      res.status(201).json({
        success: true,
        message: 'Comentario creado exitosamente',
        data: { comentario }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al crear comentario: ' + error.message });
    }
  }

  // PUT /api/materiales/:id/comentarios/:comentario_id
  static async actualizar(req, res) {
    try {
      const { comentario_id } = req.params;
      const { contenido } = req.body;

      if (!contenido || contenido.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'El contenido es requerido' });
      }

      const comentario = await ComentarioMaterial.update(
        parseInt(comentario_id), req.user.id, contenido.trim()
      );

      if (!comentario) {
        return res.status(404).json({
          success: false,
          message: 'Comentario no encontrado o no tienes permiso para editarlo'
        });
      }

      res.json({ success: true, message: 'Comentario actualizado', data: { comentario } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al actualizar comentario: ' + error.message });
    }
  }

  // PATCH /api/materiales/:id/comentarios/:comentario_id/resolver
  static async marcarResuelto(req, res) {
    try {
      const { comentario_id } = req.params;

      const comentario = await ComentarioMaterial.marcarResuelto(
        parseInt(comentario_id), req.user.id
      );

      if (!comentario) {
        return res.status(404).json({
          success: false,
          message: 'Duda no encontrada'
        });
      }

      res.json({ success: true, message: 'Duda marcada como resuelta', data: { comentario } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al resolver duda: ' + error.message });
    }
  }

  // DELETE /api/materiales/:id/comentarios/:comentario_id
  static async eliminar(req, res) {
    try {
      const { comentario_id } = req.params;

      const comentario = await ComentarioMaterial.softDelete(
        parseInt(comentario_id), req.user.id
      );

      if (!comentario) {
        return res.status(404).json({
          success: false,
          message: 'Comentario no encontrado o no tienes permiso para eliminarlo'
        });
      }

      res.json({ success: true, message: 'Comentario eliminado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al eliminar comentario: ' + error.message });
    }
  }
}

// =============================================
// FAVORITOS
// =============================================
class FavoritoMaterialController {

  // GET /api/materiales/favoritos?matricula_id=X
  static async listar(req, res) {
    try {
      const { matricula_id } = req.query;

      if (!matricula_id) {
        return res.status(400).json({ success: false, message: 'matricula_id es requerido' });
      }

      const favoritos = await FavoritoMaterial.findByMatricula(parseInt(matricula_id));
      res.json({ success: true, data: { favoritos } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al obtener favoritos: ' + error.message });
    }
  }

  // POST /api/materiales/:id/favorito
  // Toggle: si existe lo quita, si no existe lo agrega
  static async toggle(req, res) {
    try {
      const { id } = req.params;
      const { matricula_id, notas_personales } = req.body;

      if (!matricula_id) {
        return res.status(400).json({ success: false, message: 'matricula_id es requerido' });
      }

      const resultado = await FavoritoMaterial.toggle(
        parseInt(id), parseInt(matricula_id), notas_personales || null
      );

      res.json({
        success: true,
        message: resultado.accion === 'agregado'
          ? 'Material agregado a favoritos'
          : 'Material removido de favoritos',
        data: resultado
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al gestionar favorito: ' + error.message });
    }
  }
}

// =============================================
// PROGRESO ESTUDIANTE
// =============================================
class ProgresoEstudianteController {

  // GET /api/materiales/progreso?matricula_id=X&grado_materia_id=Y
  static async getReporte(req, res) {
    try {
      const { matricula_id, grado_materia_id } = req.query;

      if (!matricula_id || !grado_materia_id) {
        return res.status(400).json({
          success: false,
          message: 'matricula_id y grado_materia_id son requeridos'
        });
      }

      const progreso = await ProgresoEstudiante.getByMatricula(
        parseInt(matricula_id), parseInt(grado_materia_id)
      );

      res.json({ success: true, data: { progreso } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al obtener progreso: ' + error.message });
    }
  }

  // PUT /api/materiales/progreso/:tema_id
  static async actualizar(req, res) {
    try {
      const { tema_id } = req.params;
      const { matricula_id, estado, porcentaje_avance, tiempo_dedicado } = req.body;

      if (!matricula_id) {
        return res.status(400).json({ success: false, message: 'matricula_id es requerido' });
      }

      const estadosValidos = ['no_iniciado', 'en_progreso', 'completado', 'revisando'];
      if (estado && !estadosValidos.includes(estado)) {
        return res.status(400).json({
          success: false,
          message: `Estado inválido. Debe ser: ${estadosValidos.join(', ')}`
        });
      }

      const progreso = await ProgresoEstudiante.actualizar(
        parseInt(matricula_id), parseInt(tema_id),
        { estado, porcentaje_avance, tiempo_dedicado }
      );

      res.json({ success: true, message: 'Progreso actualizado', data: { progreso } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al actualizar progreso: ' + error.message });
    }
  }
}

export {
  TipoMaterialController,
  UnidadTematicaController,
  TemaController,
  MaterialAcademicoController,
  AccesoMaterialController,
  ComentarioMaterialController,
  FavoritoMaterialController,
  ProgresoEstudianteController
};