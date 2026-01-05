// controllers/cursoVacacionalController.js
import { pool } from '../db/pool.js';
import { PaqueteVacacional, PeriodoVacacional, CursoVacacional, InscripcionVacacional } from '../models/CursoVacacional.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadImage from '../utils/uploadImage.js';

class CursoVacacionalController {
  // ==========================================
  // PAQUETES VACACIONALES (NUEVO)
  // ==========================================

  static async listarPaquetes(req, res) {
    try {
      const paquetes = await PaqueteVacacional.findAll();

      res.json({
        success: true,
        data: paquetes
      });
    } catch (error) {
      console.error('Error al listar paquetes:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar paquetes: ' + error.message
      });
    }
  }

  static async obtenerPaquete(req, res) {
    try {
      const { id } = req.params;

      const paquete = await PaqueteVacacional.findById(id);
      if (!paquete) {
        return res.status(404).json({
          success: false,
          message: 'Paquete no encontrado'
        });
      }

      res.json({
        success: true,
        data: paquete
      });
    } catch (error) {
      console.error('Error al obtener paquete:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener paquete: ' + error.message
      });
    }
  }

  // ==========================================
  // PERIODOS VACACIONALES
  // ==========================================

  static async crearPeriodo(req, res) {
    try {
      const {
        nombre, codigo, tipo, anio, fecha_inicio, fecha_fin,
        fecha_inicio_inscripciones, fecha_fin_inscripciones,
        activo, permite_inscripciones, descripcion
      } = req.body;

      if (!nombre || !tipo || !anio || !fecha_inicio || !fecha_fin) {
        return res.status(400).json({
          success: false,
          message: 'Faltan datos obligatorios'
        });
      }

      if (!['verano', 'invierno'].includes(tipo)) {
        return res.status(400).json({
          success: false,
          message: 'Tipo de periodo inválido (verano/invierno)'
        });
      }

      const periodo = await PeriodoVacacional.create({
        nombre, codigo, tipo, anio, fecha_inicio, fecha_fin,
        fecha_inicio_inscripciones, fecha_fin_inscripciones,
        activo, permite_inscripciones, descripcion
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear_periodo_vacacional',
        modulo: 'curso_vacacional',
        tabla_afectada: 'periodo_vacacional',
        registro_id: periodo.id,
        datos_nuevos: periodo,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Periodo vacacional creado: ${periodo.nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Periodo vacacional creado exitosamente',
        data: periodo
      });
    } catch (error) {
      console.error('Error al crear periodo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear periodo: ' + error.message
      });
    }
  }

  static async listarPeriodos(req, res) {
    try {
      const { page, limit, search, tipo, anio, activo } = req.query;

      const result = await PeriodoVacacional.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search,
        tipo,
        anio: anio ? parseInt(anio) : undefined,
        activo: activo === 'true' ? true : activo === 'false' ? false : undefined
      });

      res.json({
        success: true,
        data: result.periodos,
        paginacion: result.paginacion
      });
    } catch (error) {
      console.error('Error al listar periodos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar periodos: ' + error.message
      });
    }
  }

  static async obtenerPeriodo(req, res) {
    try {
      const { id } = req.params;

      const periodo = await PeriodoVacacional.findById(id);
      if (!periodo) {
        return res.status(404).json({
          success: false,
          message: 'Periodo no encontrado'
        });
      }

      res.json({
        success: true,
        data: periodo
      });
    } catch (error) {
      console.error('Error al obtener periodo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener periodo: ' + error.message
      });
    }
  }

  static async actualizarPeriodo(req, res) {
    try {
      const { id } = req.params;
      const {
        nombre, tipo, anio, fecha_inicio, fecha_fin,
        fecha_inicio_inscripciones, fecha_fin_inscripciones,
        activo, permite_inscripciones, descripcion
      } = req.body;

      const periodoExistente = await PeriodoVacacional.findById(id);
      if (!periodoExistente) {
        return res.status(404).json({
          success: false,
          message: 'Periodo no encontrado'
        });
      }

      const periodoActualizado = await PeriodoVacacional.update(id, {
        nombre, tipo, anio, fecha_inicio, fecha_fin,
        fecha_inicio_inscripciones, fecha_fin_inscripciones,
        activo, permite_inscripciones, descripcion
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar_periodo_vacacional',
        modulo: 'curso_vacacional',
        tabla_afectada: 'periodo_vacacional',
        registro_id: id,
        datos_anteriores: periodoExistente,
        datos_nuevos: periodoActualizado,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Periodo actualizado: ${periodoActualizado.nombre}`
      });

      res.json({
        success: true,
        message: 'Periodo actualizado exitosamente',
        data: periodoActualizado
      });
    } catch (error) {
      console.error('Error al actualizar periodo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar periodo: ' + error.message
      });
    }
  }

  static async eliminarPeriodo(req, res) {
    try {
      const { id } = req.params;

      const periodo = await PeriodoVacacional.findById(id);
      if (!periodo) {
        return res.status(404).json({
          success: false,
          message: 'Periodo no encontrado'
        });
      }

      await PeriodoVacacional.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar_periodo_vacacional',
        modulo: 'curso_vacacional',
        tabla_afectada: 'periodo_vacacional',
        registro_id: id,
        datos_anteriores: periodo,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Periodo eliminado: ${periodo.nombre}`
      });

      res.json({
        success: true,
        message: 'Periodo eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar periodo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar periodo: ' + error.message
      });
    }
  }

  static async obtenerPeriodoActivo(req, res) {
    try {
      const periodo = await PeriodoVacacional.getActivo();
      
      if (!periodo) {
        return res.status(404).json({
          success: false,
          message: 'No hay periodo activo disponible para inscripciones'
        });
      }

      res.json({
        success: true,
        data: periodo
      });
    } catch (error) {
      console.error('Error al obtener periodo activo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener periodo activo: ' + error.message
      });
    }
  }

  // ==========================================
  // CURSOS VACACIONALES (CON FOTO)
  // ==========================================

  static async crearCurso(req, res) {
    let foto_url = null;
    let foto_public_id = null;

    try {
      const {
        periodo_vacacional_id, materia_id, grado_id, nombre, codigo,
        descripcion, fecha_inicio, fecha_fin, dias_semana, hora_inicio,
        hora_fin, cupos_totales, costo, aula, requisitos, activo
      } = req.body;

      if (!periodo_vacacional_id || !nombre || !fecha_inicio || !fecha_fin || !cupos_totales || !costo) {
        return res.status(400).json({
          success: false,
          message: 'Faltan datos obligatorios'
        });
      }

      if (cupos_totales <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Los cupos deben ser mayor a 0'
        });
      }

      if (req.file) {
        if (!UploadImage.isValidImage(req.file)) {
          return res.status(400).json({
            success: false,
            message: 'Solo se permiten archivos de imagen (jpg, png, gif, webp)'
          });
        }

        if (!UploadImage.isValidSize(req.file, 5)) {
          return res.status(400).json({
            success: false,
            message: 'La imagen es muy grande (máximo 5MB)'
          });
        }

        const uploadResult = await UploadImage.uploadFromBuffer(
          req.file.buffer,
          'cursos_vacacionales',
          `curso_${Date.now()}`
        );

        foto_url = uploadResult.url;
        foto_public_id = uploadResult.public_id;
      }

      const curso = await CursoVacacional.create({
        periodo_vacacional_id, materia_id, grado_id, nombre, codigo,
        descripcion, fecha_inicio, fecha_fin, dias_semana, hora_inicio,
        hora_fin, cupos_totales, costo, aula, requisitos, activo,
        foto_url, foto_public_id
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear_curso_vacacional',
        modulo: 'curso_vacacional',
        tabla_afectada: 'curso_vacacional',
        registro_id: curso.id,
        datos_nuevos: curso,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Curso creado: ${curso.nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Curso creado exitosamente',
        data: curso
      });
    } catch (error) {
      console.error('Error al crear curso:', error);

      if (foto_public_id) {
        try {
          await UploadImage.deleteImage(foto_public_id);
        } catch (err) {
          console.error('Error al eliminar foto:', err);
        }
      }

      res.status(500).json({
        success: false,
        message: 'Error al crear curso: ' + error.message
      });
    }
  }

  static async listarCursos(req, res) {
    try {
      const { page, limit, search, periodo_vacacional_id, grado_id, activo, con_cupos } = req.query;

      const result = await CursoVacacional.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search,
        periodo_vacacional_id: periodo_vacacional_id ? parseInt(periodo_vacacional_id) : undefined,
        grado_id: grado_id ? parseInt(grado_id) : undefined,
        activo: activo === 'true' ? true : activo === 'false' ? false : undefined,
        con_cupos: con_cupos === 'true'
      });

      res.json({
        success: true,
        data: result.cursos,
        paginacion: result.paginacion
      });
    } catch (error) {
      console.error('Error al listar cursos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar cursos: ' + error.message
      });
    }
  }

  static async obtenerCurso(req, res) {
    try {
      const { id } = req.params;

      const curso = await CursoVacacional.findById(id);
      if (!curso) {
        return res.status(404).json({
          success: false,
          message: 'Curso no encontrado'
        });
      }

      res.json({
        success: true,
        data: curso
      });
    } catch (error) {
      console.error('Error al obtener curso:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener curso: ' + error.message
      });
    }
  }

  static async actualizarCurso(req, res) {
    let nueva_foto_url = null;
    let nueva_foto_public_id = null;

    try {
      const { id } = req.params;
      const {
        nombre, descripcion, fecha_inicio, fecha_fin, dias_semana,
        hora_inicio, hora_fin, cupos_totales, costo, aula, requisitos, activo
      } = req.body;

      const cursoExistente = await CursoVacacional.findById(id);
      if (!cursoExistente) {
        return res.status(404).json({
          success: false,
          message: 'Curso no encontrado'
        });
      }

      if (req.file) {
        if (!UploadImage.isValidImage(req.file)) {
          return res.status(400).json({
            success: false,
            message: 'Solo se permiten archivos de imagen (jpg, png, gif, webp)'
          });
        }

        if (!UploadImage.isValidSize(req.file, 5)) {
          return res.status(400).json({
            success: false,
            message: 'La imagen es muy grande (máximo 5MB)'
          });
        }

        const uploadResult = await UploadImage.uploadFromBuffer(
          req.file.buffer,
          'cursos_vacacionales',
          `curso_${Date.now()}`
        );

        nueva_foto_url = uploadResult.url;
        nueva_foto_public_id = uploadResult.public_id;

        if (cursoExistente.foto_public_id) {
          try {
            await UploadImage.deleteImage(cursoExistente.foto_public_id);
          } catch (err) {
            console.error('Error al eliminar foto anterior:', err);
          }
        }
      }

      const cursoActualizado = await CursoVacacional.update(id, {
        nombre, descripcion, fecha_inicio, fecha_fin, dias_semana,
        hora_inicio, hora_fin, cupos_totales, costo, aula, requisitos, activo,
        foto_url: nueva_foto_url,
        foto_public_id: nueva_foto_public_id
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar_curso_vacacional',
        modulo: 'curso_vacacional',
        tabla_afectada: 'curso_vacacional',
        registro_id: id,
        datos_anteriores: cursoExistente,
        datos_nuevos: cursoActualizado,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Curso actualizado: ${cursoActualizado.nombre}`
      });

      res.json({
        success: true,
        message: 'Curso actualizado exitosamente',
        data: cursoActualizado
      });
    } catch (error) {
      console.error('Error al actualizar curso:', error);

      if (nueva_foto_public_id) {
        try {
          await UploadImage.deleteImage(nueva_foto_public_id);
        } catch (err) {
          console.error('Error al eliminar nueva foto:', err);
        }
      }

      res.status(500).json({
        success: false,
        message: 'Error al actualizar curso: ' + error.message
      });
    }
  }

  static async eliminarCurso(req, res) {
    try {
      const { id } = req.params;

      const curso = await CursoVacacional.findById(id);
      if (!curso) {
        return res.status(404).json({
          success: false,
          message: 'Curso no encontrado'
        });
      }

      const resultDelete = await CursoVacacional.softDelete(id);

      if (resultDelete.foto_public_id) {
        try {
          await UploadImage.deleteImage(resultDelete.foto_public_id);
        } catch (err) {
          console.error('Error al eliminar foto:', err);
        }
      }

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar_curso_vacacional',
        modulo: 'curso_vacacional',
        tabla_afectada: 'curso_vacacional',
        registro_id: id,
        datos_anteriores: curso,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Curso eliminado: ${curso.nombre}`
      });

      res.json({
        success: true,
        message: 'Curso eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar curso:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar curso: ' + error.message
      });
    }
  }

  static async eliminarFotoCurso(req, res) {
    try {
      const { id } = req.params;

      const curso = await CursoVacacional.findById(id);
      if (!curso) {
        return res.status(404).json({
          success: false,
          message: 'Curso no encontrado'
        });
      }

      if (!curso.foto_public_id) {
        return res.status(404).json({
          success: false,
          message: 'El curso no tiene foto'
        });
      }

      await UploadImage.deleteImage(curso.foto_public_id);
      const cursoActualizado = await CursoVacacional.deleteFoto(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar_foto_curso_vacacional',
        modulo: 'curso_vacacional',
        tabla_afectada: 'curso_vacacional',
        registro_id: id,
        datos_anteriores: { foto_url: curso.foto_url, foto_public_id: curso.foto_public_id },
        datos_nuevos: { foto_url: null, foto_public_id: null },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Foto eliminada del curso: ${curso.nombre}`
      });

      res.json({
        success: true,
        message: 'Foto eliminada exitosamente',
        data: cursoActualizado
      });
    } catch (error) {
      console.error('Error al eliminar foto:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar foto: ' + error.message
      });
    }
  }

  // ==========================================
  // INSCRIPCIONES CON PAQUETES (ACTUALIZADO)
  // ==========================================


static async inscribir(req, res) {
  const client = await pool.connect();
  let comprobante_url = null;

  try {
    await client.query('BEGIN');

    let cursos;
    try {
      cursos = typeof req.body.cursos === 'string' 
        ? JSON.parse(req.body.cursos) 
        : req.body.cursos;
    } catch (error) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'El formato del campo "cursos" es inválido'
      });
    }

    const {
      paquete_id,
      nombres, apellido_paterno, apellido_materno,
      fecha_nacimiento, ci, genero, telefono, email, nombre_tutor,
      telefono_tutor, email_tutor, parentesco_tutor, monto_pagado,
      metodo_pago, // NUEVO
      numero_comprobante, 
      observaciones_pago, // NUEVO
      fecha_pago, 
      observaciones
    } = req.body;

    // Validaciones básicas
    if (!cursos || !Array.isArray(cursos) || cursos.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Debe seleccionar al menos un curso'
      });
    }

    if (!nombres || !apellido_paterno || !fecha_nacimiento ||
        !nombre_tutor || !telefono_tutor || !monto_pagado) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Faltan datos obligatorios'
      });
    }

    // Validar método de pago
    const metodosValidos = ['transferencia', 'efectivo', 'qr', 'tarjeta'];
    const metodo = metodo_pago || 'transferencia';
    
    if (!metodosValidos.includes(metodo)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Método de pago inválido'
      });
    }

    // Validaciones según método de pago
    if (metodo === 'transferencia' || metodo === 'qr') {
      if (!numero_comprobante) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'El número de comprobante es obligatorio para transferencias/QR'
        });
      }
      
      if (!req.file) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Debe adjuntar el comprobante de pago'
        });
      }
    }

    // Para pagos en efectivo, validar que sea usuario autenticado (admin)
    if (metodo === 'efectivo' && !req.user) {
      await client.query('ROLLBACK');
      return res.status(401).json({
        success: false,
        message: 'Los pagos en efectivo solo pueden ser registrados por administradores'
      });
    }

    // Validar paquete si se proporcionó
    if (paquete_id) {
      const paquete = await PaqueteVacacional.findById(paquete_id);
      if (!paquete) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Paquete no encontrado'
        });
      }

      if (cursos.length !== paquete.cantidad_cursos) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `El paquete requiere exactamente ${paquete.cantidad_cursos} cursos`
        });
      }
    }

    // Verificar disponibilidad de todos los cursos
    for (const curso_id of cursos) {
      const curso = await CursoVacacional.findById(curso_id);
      if (!curso) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: `Curso con ID ${curso_id} no encontrado`
        });
      }

      const disponibilidad = await CursoVacacional.checkDisponibilidad(curso_id);
      if (!disponibilidad.disponible) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `El curso "${curso.nombre}" no tiene cupos disponibles`
        });
      }
    }

    // Subir comprobante si existe (transferencia/QR)
    if (req.file) {
      if (!UploadImage.isValidSize(req.file, 5)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'El archivo es muy grande (máximo 5MB)'
        });
      }

      const uploadResult = await UploadImage.uploadFromBuffer(
        req.file.buffer,
        'comprobantes_vacacionales',
        `comprobante_${Date.now()}`
      );
      comprobante_url = uploadResult.url;
    }

    // Generar códigos
    const codigo_grupo = await InscripcionVacacional.generateCodigoGrupo(client);
    
    // Generar recibo interno solo para pagos en efectivo
    let recibo_interno = null;
    if (metodo === 'efectivo') {
      recibo_interno = await InscripcionVacacional.generateReciboInterno(client);
    }

    // Determinar estado inicial según método de pago
    let estado_inicial = 'pendiente';
    let pago_verificado = false;
    let verificado_por = null;

    if (metodo === 'efectivo' && req.user) {
      // Pagos en efectivo registrados por admin se marcan como verificados automáticamente
      estado_inicial = 'pago_verificado';
      pago_verificado = true;
      verificado_por = req.user.id;
    }

    // Crear inscripciones para cada curso
    const inscripciones = [];
    for (let i = 0; i < cursos.length; i++) {
      const curso_id = cursos[i];
      
      const codigo_inscripcion = await InscripcionVacacional.generateCodigoInscripcion(
        curso_id, 
        client
      );

      const inscripcion = await InscripcionVacacional.create({
        codigo_inscripcion,
        codigo_grupo,
        paquete_id: paquete_id || null,
        curso_vacacional_id: curso_id,
        nombres,
        apellido_paterno,
        apellido_materno,
        fecha_nacimiento,
        ci,
        genero,
        telefono,
        email,
        nombre_tutor,
        telefono_tutor,
        email_tutor,
        parentesco_tutor,
        monto_pagado: i === 0 ? monto_pagado : 0,
        metodo_pago: metodo,
        numero_comprobante: i === 0 ? numero_comprobante : null,
        recibo_interno: i === 0 ? recibo_interno : null,
        fecha_pago: i === 0 ? (fecha_pago || new Date()) : null,
        comprobante_pago_url: i === 0 ? comprobante_url : null,
        observaciones_pago: i === 0 ? observaciones_pago : null,
        estado: estado_inicial,
        pago_verificado,
        verificado_por,
        fecha_verificacion: pago_verificado ? new Date() : null,
        observaciones
      }, client);

      await CursoVacacional.incrementarCupo(curso_id, client);
      inscripciones.push(inscripcion);
    }

    await client.query('COMMIT');

    // Log de actividad
    if (req.user) {
      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear_inscripcion_vacacional',
        modulo: 'curso_vacacional',
        tabla_afectada: 'inscripcion_vacacional',
        registro_id: inscripciones[0].id,
        datos_nuevos: { 
          codigo_grupo, 
          total_cursos: cursos.length, 
          paquete_id,
          metodo_pago: metodo,
          recibo_interno
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Inscripción grupal creada: ${codigo_grupo} - ${cursos.length} cursos - ${metodo}`
      });
    }

    res.status(201).json({
      success: true,
      message: metodo === 'efectivo' 
        ? 'Inscripción creada y pago en efectivo registrado exitosamente'
        : 'Inscripción creada exitosamente. El pago será verificado pronto.',
      data: {
        codigo_grupo,
        recibo_interno,
        metodo_pago: metodo,
        total_cursos: inscripciones.length,
        inscripciones,
        requiere_verificacion: metodo !== 'efectivo'
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al inscribir:', error);

    if (comprobante_url) {
      const publicId = UploadImage.extractPublicIdFromUrl(comprobante_url);
      if (publicId) {
        try {
          await UploadImage.deleteImage(publicId);
        } catch (err) {
          console.error('Error al eliminar comprobante:', err);
        }
      }
    }

    res.status(500).json({
      success: false,
      message: 'Error al inscribir: ' + error.message
    });
  } finally {
    client.release();
  }
}

  static async listarInscripciones(req, res) {
    try {
      const { page, limit, search, curso_vacacional_id, periodo_vacacional_id, estado, pago_verificado, codigo_grupo } = req.query;

      const result = await InscripcionVacacional.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search,
        curso_vacacional_id: curso_vacacional_id ? parseInt(curso_vacacional_id) : undefined,
        periodo_vacacional_id: periodo_vacacional_id ? parseInt(periodo_vacacional_id) : undefined,
        estado,
        pago_verificado: pago_verificado === 'true' ? true : pago_verificado === 'false' ? false : undefined,
        codigo_grupo
      });

      res.json({
        success: true,
        data: result.inscripciones,
        paginacion: result.paginacion
      });
    } catch (error) {
      console.error('Error al listar inscripciones:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar inscripciones: ' + error.message
      });
    }
  }

  static async obtenerInscripcion(req, res) {
    try {
      const { id } = req.params;

      const inscripcion = await InscripcionVacacional.findById(id);
      if (!inscripcion) {
        return res.status(404).json({
          success: false,
          message: 'Inscripción no encontrada'
        });
      }

      res.json({
        success: true,
        data: inscripcion
      });
    } catch (error) {
      console.error('Error al obtener inscripción:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener inscripción: ' + error.message
      });
    }
  }

  static async obtenerInscripcionesPorGrupo(req, res) {
    try {
      const { codigo_grupo } = req.params;

      const inscripciones = await InscripcionVacacional.findByCodigoGrupo(codigo_grupo);
      
      if (inscripciones.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No se encontraron inscripciones con ese código de grupo'
        });
      }

      res.json({
        success: true,
        data: inscripciones
      });
    } catch (error) {
      console.error('Error al obtener inscripciones por grupo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener inscripciones: ' + error.message
      });
    }
  }

  static async verificarPago(req, res) {
    try {
      const { id } = req.params;

      const inscripcion = await InscripcionVacacional.findById(id);
      if (!inscripcion) {
        return res.status(404).json({
          success: false,
          message: 'Inscripción no encontrada'
        });
      }

      if (inscripcion.pago_verificado) {
        return res.status(400).json({
          success: false,
          message: 'El pago ya fue verificado anteriormente'
        });
      }

      const inscripcionActualizada = await InscripcionVacacional.verificarPago(id, req.user.id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'verificar_pago_vacacional',
        modulo: 'curso_vacacional',
        tabla_afectada: 'inscripcion_vacacional',
        registro_id: id,
        datos_anteriores: inscripcion,
        datos_nuevos: inscripcionActualizada,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Pago verificado: ${inscripcion.codigo_inscripcion}`
      });

      res.json({
        success: true,
        message: 'Pago verificado exitosamente',
        data: inscripcionActualizada
      });
    } catch (error) {
      console.error('Error al verificar pago:', error);
      res.status(500).json({
        success: false,
        message: 'Error al verificar pago: ' + error.message
      });
    }
  }

  static async cambiarEstado(req, res) {
    try {
      const { id } = req.params;
      const { estado, motivo_rechazo } = req.body;

      if (!estado) {
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar un estado'
        });
      }

      const estadosValidos = ['pendiente', 'pago_verificado', 'activo', 'completado', 'retirado', 'rechazado'];
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({
          success: false,
          message: 'Estado inválido'
        });
      }

      const inscripcionExistente = await InscripcionVacacional.findById(id);
      if (!inscripcionExistente) {
        return res.status(404).json({
          success: false,
          message: 'Inscripción no encontrada'
        });
      }

      const inscripcionActualizada = await InscripcionVacacional.changeStatus(id, estado, motivo_rechazo);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'cambiar_estado_inscripcion_vacacional',
        modulo: 'curso_vacacional',
        tabla_afectada: 'inscripcion_vacacional',
        registro_id: id,
        datos_anteriores: inscripcionExistente,
        datos_nuevos: inscripcionActualizada,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Estado cambiado a ${estado}: ${inscripcionExistente.codigo_inscripcion}`
      });

      res.json({
        success: true,
        message: 'Estado actualizado exitosamente',
        data: inscripcionActualizada
      });
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cambiar estado: ' + error.message
      });
    }
  }

  static async actualizarInscripcion(req, res) {
    try {
      const { id } = req.params;
      const {
        nombres, apellido_paterno, apellido_materno, fecha_nacimiento,
        ci, genero, telefono, email, nombre_tutor, telefono_tutor,
        email_tutor, parentesco_tutor, observaciones
      } = req.body;

      const inscripcionExistente = await InscripcionVacacional.findById(id);
      if (!inscripcionExistente) {
        return res.status(404).json({
          success: false,
          message: 'Inscripción no encontrada'
        });
      }

      const inscripcionActualizada = await InscripcionVacacional.update(id, {
        nombres, apellido_paterno, apellido_materno, fecha_nacimiento,
        ci, genero, telefono, email, nombre_tutor, telefono_tutor,
        email_tutor, parentesco_tutor, observaciones
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar_inscripcion_vacacional',
        modulo: 'curso_vacacional',
        tabla_afectada: 'inscripcion_vacacional',
        registro_id: id,
        datos_anteriores: inscripcionExistente,
        datos_nuevos: inscripcionActualizada,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Inscripción actualizada: ${inscripcionExistente.codigo_inscripcion}`
      });

      res.json({
        success: true,
        message: 'Inscripción actualizada exitosamente',
        data: inscripcionActualizada
      });
    } catch (error) {
      console.error('Error al actualizar inscripción:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar inscripción: ' + error.message
      });
    }
  }

  static async eliminarInscripcion(req, res) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { id } = req.params;

      const inscripcion = await InscripcionVacacional.findById(id);
      if (!inscripcion) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Inscripción no encontrada'
        });
      }

      await CursoVacacional.decrementarCupo(inscripcion.curso_vacacional_id, client);
      await InscripcionVacacional.softDelete(id);

      await client.query('COMMIT');

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar_inscripcion_vacacional',
        modulo: 'curso_vacacional',
        tabla_afectada: 'inscripcion_vacacional',
        registro_id: id,
        datos_anteriores: inscripcion,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Inscripción eliminada: ${inscripcion.codigo_inscripcion}`
      });

      res.json({
        success: true,
        message: 'Inscripción eliminada exitosamente'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al eliminar inscripción:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar inscripción: ' + error.message
      });
    } finally {
      client.release();
    }
  }

  static async obtenerEstadisticas(req, res) {
    try {
      const { periodo_id } = req.params;

      const estadisticas = await InscripcionVacacional.getEstadisticas(periodo_id);

      res.json({
        success: true,
        data: estadisticas
      });
    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener estadísticas: ' + error.message
      });
    }
  }

  static async listarEstudiantesCurso(req, res) {
    try {
      const { curso_id } = req.params;
      const { estado } = req.query;

      const estudiantes = await InscripcionVacacional.findByCurso(
        parseInt(curso_id),
        estado
      );

      res.json({
        success: true,
        data: estudiantes
      });
    } catch (error) {
      console.error('Error al listar estudiantes:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar estudiantes: ' + error.message
      });
    }
  }

  static async generarReporte(req, res) {
    try {
      const { curso_id } = req.params;
      const { formato } = req.query;

      const curso = await CursoVacacional.findById(curso_id);
      if (!curso) {
        return res.status(404).json({
          success: false,
          message: 'Curso no encontrado'
        });
      }

      const inscritos = await InscripcionVacacional.findByCurso(parseInt(curso_id));

      res.json({
        success: true,
        message: 'Reporte generado',
        data: {
          curso: curso.nombre,
          total_inscritos: inscritos.length,
          inscritos
        }
      });
    } catch (error) {
      console.error('Error al generar reporte:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar reporte: ' + error.message
      });
    }
  }
}

export default CursoVacacionalController;