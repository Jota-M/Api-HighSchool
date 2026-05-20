// controllers/ingresoController.js
import { Ingreso, TipoIngreso } from '../models/Ingreso.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadImage from '../utils/uploadImage.js';

class IngresoController {
  // Listar ingresos
  static async listar(req, res) {
    try {
      const {
        page, limit, search, tipo_ingreso_id, periodo_academico_id,
        estudiante_id, fecha_desde, fecha_hasta, metodo_pago,
        estado, referencia_tipo
      } = req.query;

      const result = await Ingreso.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search,
        tipo_ingreso_id: tipo_ingreso_id ? parseInt(tipo_ingreso_id) : undefined,
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
        estudiante_id: estudiante_id ? parseInt(estudiante_id) : undefined,
        fecha_desde,
        fecha_hasta,
        metodo_pago,
        estado,
        referencia_tipo
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error al listar ingresos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar ingresos: ' + error.message
      });
    }
  }

  // Obtener ingreso por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const ingreso = await Ingreso.findById(id);

      if (!ingreso) {
        return res.status(404).json({
          success: false,
          message: 'Ingreso no encontrado'
        });
      }

      res.json({
        success: true,
        data: { ingreso }
      });
    } catch (error) {
      console.error('Error al obtener ingreso:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener ingreso: ' + error.message
      });
    }
  }

  // Obtener ingreso por código
  static async obtenerPorCodigo(req, res) {
    try {
      const { codigo } = req.params;
      const ingreso = await Ingreso.findByCodigo(codigo);

      if (!ingreso) {
        return res.status(404).json({
          success: false,
          message: 'Ingreso no encontrado'
        });
      }

      res.json({
        success: true,
        data: { ingreso }
      });
    } catch (error) {
      console.error('Error al obtener ingreso:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener ingreso: ' + error.message
      });
    }
  }

  // Crear ingreso (registro manual)
  static async crear(req, res) {
    try {
      const {
        tipo_ingreso_id, monto, metodo_pago,
        estudiante_id, periodo_academico_id
      } = req.body;

      // Validaciones básicas
      if (!tipo_ingreso_id || !monto || !metodo_pago) {
        return res.status(400).json({
          success: false,
          message: 'Tipo de ingreso, monto y método de pago son requeridos'
        });
      }

      // Verificar que el tipo de ingreso existe
      const tipoIngreso = await TipoIngreso.findById(tipo_ingreso_id);
      if (!tipoIngreso) {
        return res.status(404).json({
          success: false,
          message: 'Tipo de ingreso no encontrado'
        });
      }

      // Si requiere estudiante, validar que esté presente
      if (tipoIngreso.requiere_estudiante && !estudiante_id) {
        return res.status(400).json({
          success: false,
          message: 'Este tipo de ingreso requiere un estudiante'
        });
      }

      // Manejar comprobante si existe
      let comprobante_url = null;
      if (req.file) {
        try {
          const uploadResult = await UploadImage.uploadFromBuffer(
            req.file.buffer,
            'comprobantes_ingresos',
            `ingreso_${Date.now()}`
          );
          comprobante_url = uploadResult.url;
        } catch (uploadError) {
          console.error('Error al subir comprobante:', uploadError);
        }
      }

      // Generar código de ingreso
      const codigo_ingreso = await Ingreso.generateCodigo();

      // Crear ingreso
      const ingreso = await Ingreso.create({
        ...req.body,
        codigo_ingreso,
        comprobante_url,
        registrado_por: req.user.id
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'ingresos',
        tabla_afectada: 'ingreso',
        registro_id: ingreso.id,
        datos_nuevos: ingreso,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Ingreso creado: ${ingreso.codigo_ingreso} - Bs. ${ingreso.monto_neto}`
      });

      res.status(201).json({
        success: true,
        message: 'Ingreso registrado exitosamente',
        data: { ingreso }
      });
    } catch (error) {
      console.error('Error al crear ingreso:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear ingreso: ' + error.message
      });
    }
  }

  // Verificar ingreso
  static async verificar(req, res) {
    try {
      const { id } = req.params;

      const ingresoExistente = await Ingreso.findById(id);
      if (!ingresoExistente) {
        return res.status(404).json({
          success: false,
          message: 'Ingreso no encontrado'
        });
      }

      if (ingresoExistente.verificado) {
        return res.status(409).json({
          success: false,
          message: 'Este ingreso ya está verificado'
        });
      }

      const ingreso = await Ingreso.verificar(id, req.user.id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'verificar',
        modulo: 'ingresos',
        tabla_afectada: 'ingreso',
        registro_id: ingreso.id,
        datos_anteriores: { verificado: false },
        datos_nuevos: { verificado: true },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Ingreso verificado: ${ingreso.codigo_ingreso}`
      });

      res.json({
        success: true,
        message: 'Ingreso verificado exitosamente',
        data: { ingreso }
      });
    } catch (error) {
      console.error('Error al verificar ingreso:', error);
      res.status(500).json({
        success: false,
        message: 'Error al verificar ingreso: ' + error.message
      });
    }
  }

  // Anular ingreso
  static async anular(req, res) {
    try {
      const { id } = req.params;
      const { motivo } = req.body;

      if (!motivo) {
        return res.status(400).json({
          success: false,
          message: 'El motivo de anulación es requerido'
        });
      }

      const ingresoExistente = await Ingreso.findById(id);
      if (!ingresoExistente) {
        return res.status(404).json({
          success: false,
          message: 'Ingreso no encontrado'
        });
      }

      if (ingresoExistente.anulado) {
        return res.status(409).json({
          success: false,
          message: 'Este ingreso ya está anulado'
        });
      }

      const ingreso = await Ingreso.anular(id, motivo, req.user.id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'anular',
        modulo: 'ingresos',
        tabla_afectada: 'ingreso',
        registro_id: ingreso.id,
        datos_anteriores: ingresoExistente,
        datos_nuevos: { anulado: true, motivo },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Ingreso anulado: ${ingreso.codigo_ingreso}`
      });

      res.json({
        success: true,
        message: 'Ingreso anulado exitosamente',
        data: { ingreso }
      });
    } catch (error) {
      console.error('Error al anular ingreso:', error);
      res.status(500).json({
        success: false,
        message: 'Error al anular ingreso: ' + error.message
      });
    }
  }

  // Obtener resumen por categoría
  static async obtenerResumenPorCategoria(req, res) {
    try {
      const { periodo_academico_id, fecha_desde, fecha_hasta } = req.query;

      const resumen = await Ingreso.getResumenPorCategoria({
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
        fecha_desde,
        fecha_hasta
      });

      res.json({
        success: true,
        data: { resumen }
      });
    } catch (error) {
      console.error('Error al obtener resumen:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener resumen: ' + error.message
      });
    }
  }

  // Obtener resumen por método de pago
  static async obtenerResumenPorMetodoPago(req, res) {
    try {
      const { periodo_academico_id, fecha_desde, fecha_hasta } = req.query;

      const resumen = await Ingreso.getResumenPorMetodoPago({
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
        fecha_desde,
        fecha_hasta
      });

      res.json({
        success: true,
        data: { resumen }
      });
    } catch (error) {
      console.error('Error al obtener resumen:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener resumen: ' + error.message
      });
    }
  }

  // Obtener ingresos diarios
  static async obtenerIngresosDiarios(req, res) {
    try {
      const { fecha_desde, fecha_hasta, periodo_academico_id } = req.query;

      const ingresos = await Ingreso.getIngresosDiarios({
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
        fecha_desde,
        fecha_hasta
      });

      res.json({
        success: true,
        data: { ingresos }
      });
    } catch (error) {
      console.error('Error al obtener ingresos diarios:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener ingresos diarios: ' + error.message
      });
    }
  }

  // Obtener estadísticas generales
  static async obtenerEstadisticas(req, res) {
    try {
      const { periodo_academico_id, fecha_desde, fecha_hasta } = req.query;

      const estadisticas = await Ingreso.getEstadisticas({
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
        fecha_desde,
        fecha_hasta
      });

      res.json({
        success: true,
        data: { estadisticas }
      });
    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener estadísticas: ' + error.message
      });
    }
  }
}

// ==========================================
// CONTROLADOR TIPO INGRESO
// ==========================================
class TipoIngresoController {
  // Listar tipos de ingreso
  static async listar(req, res) {
    try {
      const { activo, categoria } = req.query;

      const tipos = await TipoIngreso.findAll({
        activo: activo !== undefined ? activo === 'true' : undefined,
        categoria
      });

      res.json({
        success: true,
        data: { tipos }
      });
    } catch (error) {
      console.error('Error al listar tipos de ingreso:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar tipos de ingreso: ' + error.message
      });
    }
  }

  // Obtener tipo de ingreso por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const tipo = await TipoIngreso.findById(id);

      if (!tipo) {
        return res.status(404).json({
          success: false,
          message: 'Tipo de ingreso no encontrado'
        });
      }

      res.json({
        success: true,
        data: { tipo }
      });
    } catch (error) {
      console.error('Error al obtener tipo de ingreso:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener tipo de ingreso: ' + error.message
      });
    }
  }

  // Crear tipo de ingreso
  static async crear(req, res) {
    try {
      const { codigo, nombre, categoria } = req.body;

      if (!codigo || !nombre || !categoria) {
        return res.status(400).json({
          success: false,
          message: 'Código, nombre y categoría son requeridos'
        });
      }

      // Verificar que el código no exista
      const existente = await TipoIngreso.findByCodigo(codigo);
      if (existente) {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un tipo de ingreso con este código'
        });
      }

      const tipo = await TipoIngreso.create(req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'ingresos',
        tabla_afectada: 'tipo_ingreso',
        registro_id: tipo.id,
        datos_nuevos: tipo,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Tipo de ingreso creado: ${tipo.nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Tipo de ingreso creado exitosamente',
        data: { tipo }
      });
    } catch (error) {
      console.error('Error al crear tipo de ingreso:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear tipo de ingreso: ' + error.message
      });
    }
  }

  // Actualizar tipo de ingreso
 static async actualizar(req, res) {
  try {
    const { id } = req.params;

    // Verificar que el tipo existe
    const tipoExistente = await TipoIngreso.findById(id);
    if (!tipoExistente) {
      return res.status(404).json({
        success: false,
        message: 'Tipo de ingreso no encontrado'
      });
    }

    // Validar categoría si se está actualizando
    if (req.body.categoria) {
      const categoriasValidas = [
        'academico',    // Mensualidades, matrículas, pagos anuales
        'transporte',   // Bus escolar
        'productos',    // Uniformes, materiales, libros
        'eventos',      // Eventos especiales, actividades
        'donaciones',   // Aportes y donaciones voluntarias
        'servicios',    // Otros servicios adicionales
        'vacacional',   // Cursos vacacionales
        'otros'         // Otros ingresos no clasificados
      ];
      
      if (!categoriasValidas.includes(req.body.categoria)) {
        return res.status(400).json({
          success: false,
          message: `Categoría inválida. Debe ser una de: ${categoriasValidas.join(', ')}`
        });
      }
    }

    // Preparar datos de actualización (solo campos que vienen en el body)
    const updateData = {};
    
    if (req.body.nombre !== undefined) updateData.nombre = req.body.nombre;
    if (req.body.descripcion !== undefined) updateData.descripcion = req.body.descripcion;
    if (req.body.categoria !== undefined) updateData.categoria = req.body.categoria;
    if (req.body.requiere_estudiante !== undefined) updateData.requiere_estudiante = req.body.requiere_estudiante;
    if (req.body.activo !== undefined) updateData.activo = req.body.activo;
    if (req.body.color !== undefined) updateData.color = req.body.color;
    if (req.body.orden !== undefined) updateData.orden = req.body.orden;

    console.log('Datos recibidos en body:', req.body);
    console.log('Datos a actualizar:', updateData);

    // Actualizar
    const tipo = await TipoIngreso.update(id, updateData);

    // Log de actividad
    const reqInfo = RequestInfo.extract(req);
    await ActividadLog.create({
      usuario_id: req.user.id,
      accion: 'actualizar',
      modulo: 'ingresos',
      tabla_afectada: 'tipo_ingreso',
      registro_id: tipo.id,
      datos_anteriores: tipoExistente,
      datos_nuevos: tipo,
      ip_address: reqInfo.ip,
      user_agent: reqInfo.userAgent,
      resultado: 'exitoso',
      mensaje: `Tipo de ingreso actualizado: ${tipo.nombre}`
    });

    res.json({
      success: true,
      message: 'Tipo de ingreso actualizado exitosamente',
      data: { tipo }
    });
  } catch (error) {
    console.error('Error al actualizar tipo de ingreso:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar tipo de ingreso: ' + error.message
    });
  }
}
}

export { IngresoController, TipoIngresoController };