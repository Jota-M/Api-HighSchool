// controllers/pagoTransporteController.js
import { PagoTransporte } from '../models/AsignacionTransporte.js';
import { Ingreso } from '../models/Ingreso.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadImage from '../utils/uploadImage.js';

class PagoTransporteController {
  // Listar pagos
  static async listar(req, res) {
    try {
      const {
        page, limit, asignacion_transporte_id, estudiante_id,
        ruta_id, estado, mes_correspondiente
      } = req.query;

      const result = await PagoTransporte.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        asignacion_transporte_id: asignacion_transporte_id ? parseInt(asignacion_transporte_id) : undefined,
        estudiante_id: estudiante_id ? parseInt(estudiante_id) : undefined,
        ruta_id: ruta_id ? parseInt(ruta_id) : undefined,
        estado,
        mes_correspondiente
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error al listar pagos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar pagos: ' + error.message
      });
    }
  }

  // Obtener pago por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const pago = await PagoTransporte.findById(id);

      if (!pago) {
        return res.status(404).json({
          success: false,
          message: 'Pago no encontrado'
        });
      }

      res.json({
        success: true,
        data: { pago }
      });
    } catch (error) {
      console.error('Error al obtener pago:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener pago: ' + error.message
      });
    }
  }

  // Obtener pago por código
  static async obtenerPorCodigo(req, res) {
    try {
      const { codigo } = req.params;
      const pago = await PagoTransporte.findByCodigo(codigo);

      if (!pago) {
        return res.status(404).json({
          success: false,
          message: 'Pago no encontrado'
        });
      }

      res.json({
        success: true,
        data: { pago }
      });
    } catch (error) {
      console.error('Error al obtener pago:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener pago: ' + error.message
      });
    }
  }

  // Registrar pago individual
  static async registrarPago(req, res) {
    try {
      const { id } = req.params;
      const { monto_pagado, metodo_pago, numero_comprobante, observaciones } = req.body;

      if (!monto_pagado || !metodo_pago) {
        return res.status(400).json({
          success: false,
          message: 'Monto pagado y método de pago son requeridos'
        });
      }

      const pagoExistente = await PagoTransporte.findById(id);
      if (!pagoExistente) {
        return res.status(404).json({
          success: false,
          message: 'Pago no encontrado'
        });
      }

      if (pagoExistente.estado === 'pagado') {
        return res.status(409).json({
          success: false,
          message: 'Este pago ya está registrado como pagado'
        });
      }

      // Manejar comprobante si existe
      let comprobante_url = null;
      if (req.file) {
        try {
          const uploadResult = await UploadImage.uploadFromBuffer(
            req.file.buffer,
            'comprobantes_transporte',
            `pago_${id}_${Date.now()}`
          );
          comprobante_url = uploadResult.url;
        } catch (uploadError) {
          console.error('Error al subir comprobante:', uploadError);
        }
      }

      const pago = await PagoTransporte.registrarPago(id, {
        monto_pagado,
        metodo_pago,
        numero_comprobante,
        comprobante_url,
        observaciones
      }, req.user.id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'registrar_pago',
        modulo: 'transporte',
        tabla_afectada: 'pago_transporte',
        registro_id: pago.id,
        datos_anteriores: pagoExistente,
        datos_nuevos: pago,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Pago registrado: ${pago.codigo_pago} - Bs. ${monto_pagado}`
      });

      res.json({
        success: true,
        message: 'Pago registrado exitosamente',
        data: { pago }
      });
    } catch (error) {
      console.error('Error al registrar pago:', error);
      res.status(500).json({
        success: false,
        message: 'Error al registrar pago: ' + error.message
      });
    }
  }

  // 🆕 PAGO MÚLTIPLE
  static async registrarPagoMultiple(req, res) {
  try {
    const { pagos, metodo_pago, numero_comprobante, observaciones } = req.body;

    if (!pagos || !Array.isArray(pagos) || pagos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar al menos un pago'
      });
    }

    if (!metodo_pago) {
      return res.status(400).json({
        success: false,
        message: 'Método de pago es requerido'
      });
    }

    // Validar que todos los pagos existen y están pendientes
    for (const pagoData of pagos) {
      const pagoExistente = await PagoTransporte.findById(pagoData.pago_transporte_id);
      
      if (!pagoExistente) {
        return res.status(404).json({
          success: false,
          message: `Pago ${pagoData.pago_transporte_id} no encontrado`
        });
      }

      if (pagoExistente.estado === 'pagado') {
        return res.status(409).json({
          success: false,
          message: `El pago ${pagoExistente.codigo_pago} ya está pagado`
        });
      }
    }

    // Registrar todos los pagos
    const resultado = await PagoTransporte.registrarPagoMultiple({
      pagos,
      metodo_pago,
      numero_comprobante,
      observaciones
    }, req.user.id);

    const reqInfo = RequestInfo.extract(req);
    await ActividadLog.create({
      usuario_id: req.user.id,
      accion: 'registrar_pago_multiple',
      modulo: 'transporte',
      tabla_afectada: 'pago_transporte',
      registro_id: null,
      datos_nuevos: {
        cantidad_pagos: resultado.cantidad_pagos,
        monto_total: resultado.monto_total
      },
      ip_address: reqInfo.ip,
      user_agent: reqInfo.userAgent,
      resultado: 'exitoso',
      mensaje: `Pago múltiple: ${resultado.cantidad_pagos} cuotas por Bs. ${resultado.monto_total}`
    });

    res.json({
      success: true,
      message: `${resultado.cantidad_pagos} pagos registrados exitosamente`,
      data: resultado
    });
  } catch (error) {
    console.error('Error al registrar pago múltiple:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar pago múltiple: ' + error.message
    });
  }
}

// 🆕 CALCULAR DISTRIBUCIÓN (sin cambios)
static async calcularDistribucion(req, res) {
  try {
    const { asignacion_id, monto_total } = req.body;

    if (!asignacion_id || !monto_total) {
      return res.status(400).json({
        success: false,
        message: 'ID de asignación y monto total son requeridos'
      });
    }

    if (monto_total <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El monto debe ser mayor a 0'
      });
    }

    const distribucion = await PagoTransporte.calcularDistribucion(asignacion_id, monto_total);

    res.json({
      success: true,
      data: distribucion
    });
  } catch (error) {
    console.error('Error al calcular distribución:', error);
    res.status(500).json({
      success: false,
      message: 'Error al calcular distribución: ' + error.message
    });
  }
}

// 🆕 PAGO DISTRIBUIDO (CORREGIDO - sin banco_origen ni numero_referencia)
static async registrarPagoDistribuido(req, res) {
  try {
    const { 
      asignacion_id, 
      monto_total, 
      metodo_pago, 
      numero_comprobante, 
      observaciones 
    } = req.body;

    if (!asignacion_id || !monto_total || !metodo_pago) {
      return res.status(400).json({
        success: false,
        message: 'ID de asignación, monto total y método de pago son requeridos'
      });
    }

    if (monto_total <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El monto debe ser mayor a 0'
      });
    }

    // Registrar pago distribuido
    const resultado = await PagoTransporte.registrarPagoDistribuido({
      asignacion_id,
      monto_total,
      metodo_pago,
      numero_comprobante,
      observaciones
    }, req.user.id);

    const reqInfo = RequestInfo.extract(req);
    await ActividadLog.create({
      usuario_id: req.user.id,
      accion: 'registrar_pago_distribuido',
      modulo: 'transporte',
      tabla_afectada: 'pago_transporte',
      registro_id: null,
      datos_nuevos: {
        cantidad_pagos: resultado.cantidad_pagos,
        monto_distribuido: resultado.monto_distribuido
      },
      ip_address: reqInfo.ip,
      user_agent: reqInfo.userAgent,
      resultado: 'exitoso',
      mensaje: `Pago distribuido: ${resultado.cantidad_pagos} cuotas por Bs. ${resultado.monto_distribuido}`
    });

    res.json({
      success: true,
      message: `Pago distribuido registrado: ${resultado.cantidad_pagos} cuota(s)`,
      data: resultado
    });
  } catch (error) {
    console.error('Error al registrar pago distribuido:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar pago distribuido: ' + error.message
    });
  }
}


  // 🆕 CALCULAR DISTRIBUCIÓN
  static async calcularDistribucion(req, res) {
    try {
      const { asignacion_id, monto_total } = req.body;

      if (!asignacion_id || !monto_total) {
        return res.status(400).json({
          success: false,
          message: 'ID de asignación y monto total son requeridos'
        });
      }

      if (monto_total <= 0) {
        return res.status(400).json({
          success: false,
          message: 'El monto debe ser mayor a 0'
        });
      }

      const distribucion = await PagoTransporte.calcularDistribucion(asignacion_id, monto_total);

      res.json({
        success: true,
        data: distribucion
      });
    } catch (error) {
      console.error('Error al calcular distribución:', error);
      res.status(500).json({
        success: false,
        message: 'Error al calcular distribución: ' + error.message
      });
    }
  }

  // Anular pago
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

      const pagoExistente = await PagoTransporte.findById(id);
      if (!pagoExistente) {
        return res.status(404).json({
          success: false,
          message: 'Pago no encontrado'
        });
      }

      if (pagoExistente.anulado) {
        return res.status(409).json({
          success: false,
          message: 'Este pago ya está anulado'
        });
      }

      const pago = await PagoTransporte.anular(id, motivo, req.user.id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'anular_pago',
        modulo: 'transporte',
        tabla_afectada: 'pago_transporte',
        registro_id: pago.id,
        datos_anteriores: pagoExistente,
        datos_nuevos: { anulado: true, motivo },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Pago anulado: ${pago.codigo_pago}`
      });

      res.json({
        success: true,
        message: 'Pago anulado exitosamente',
        data: { pago }
      });
    } catch (error) {
      console.error('Error al anular pago:', error);
      res.status(500).json({
        success: false,
        message: 'Error al anular pago: ' + error.message
      });
    }
  }

  // Obtener estado de cuenta
  static async obtenerEstadoCuenta(req, res) {
    try {
      const { estudiante_id } = req.params;
      const { periodo_academico_id } = req.query;

      const estadoCuenta = await PagoTransporte.getEstadoCuenta(
        parseInt(estudiante_id),
        periodo_academico_id ? parseInt(periodo_academico_id) : null
      );

      if (!estadoCuenta) {
        return res.status(404).json({
          success: false,
          message: 'No se encontró información de transporte para este estudiante'
        });
      }

      res.json({
        success: true,
        data: { estadoCuenta }
      });
    } catch (error) {
      console.error('Error al obtener estado de cuenta:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener estado de cuenta: ' + error.message
      });
    }
  }

  // Calcular recargos por mora
  static async calcularRecargos(req, res) {
    try {
      const { porcentaje = 0.05 } = req.body;

      const resultado = await PagoTransporte.calcularRecargos(porcentaje);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'calcular_recargos',
        modulo: 'transporte',
        tabla_afectada: 'pago_transporte',
        registro_id: null,
        datos_nuevos: resultado,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Recargos calculados: ${resultado.cantidad_actualizados} pagos - Bs. ${resultado.monto_total_recargos}`
      });

      res.json({
        success: true,
        message: `Recargos aplicados a ${resultado.cantidad_actualizados} pagos`,
        data: resultado
      });
    } catch (error) {
      console.error('Error al calcular recargos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al calcular recargos: ' + error.message
      });
    }
  }

  // Centralizar pago (registrar en tabla ingreso)
  static async centralizarPago(req, res) {
    try {
      const { id } = req.params;

      const pago = await PagoTransporte.findById(id);
      if (!pago) {
        return res.status(404).json({
          success: false,
          message: 'Pago no encontrado'
        });
      }

      if (pago.estado !== 'pagado') {
        return res.status(400).json({
          success: false,
          message: 'Solo se pueden centralizar pagos con estado "pagado"'
        });
      }

      const ingreso_id = await Ingreso.centralizarPagoTransporte(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'centralizar_pago',
        modulo: 'transporte',
        tabla_afectada: 'ingreso',
        registro_id: ingreso_id,
        datos_nuevos: { pago_transporte_id: id },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Pago centralizado: ${pago.codigo_pago}`
      });

      res.json({
        success: true,
        message: 'Pago centralizado exitosamente',
        data: { ingreso_id }
      });
    } catch (error) {
      console.error('Error al centralizar pago:', error);

      if (error.message.includes('ya está centralizado')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al centralizar pago: ' + error.message
      });
    }
  }
}

export default PagoTransporteController;