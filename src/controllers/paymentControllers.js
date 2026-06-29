// controllers/paymentControllers.js
import { CostoMensualidad, Mensualidad, PagoMensualidad, PagoAnualCompleto } from '../models/Payment.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import { pool } from '../db/pool.js';

// =============================================
// CONTROLADOR: CostoMensualidadController
// =============================================
class CostoMensualidadController {
  // GET /api/costo-mensualidad - Listar costos
  static async listar(req, res) {
    try {
      const { periodo_academico_id, nivel_academico_id, activo } = req.query;

      const costos = await CostoMensualidad.findAll({
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
        nivel_academico_id: nivel_academico_id ? parseInt(nivel_academico_id) : undefined,
        activo: activo !== undefined ? activo === 'true' : undefined
      });

      res.json({
        success: true,
        data: { costos }
      });
    } catch (error) {
      console.error('Error al listar costos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar costos de mensualidad: ' + error.message
      });
    }
  }

  // GET /api/costo-mensualidad/:id - Obtener por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const costo = await CostoMensualidad.findById(id);

      if (!costo) {
        return res.status(404).json({
          success: false,
          message: 'Configuración de costo no encontrada'
        });
      }

      res.json({
        success: true,
        data: { costo }
      });
    } catch (error) {
      console.error('Error al obtener costo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener costo: ' + error.message
      });
    }
  }

  // POST /api/costo-mensualidad - Crear costo
  static async crear(req, res) {
    try {
      const data = req.body;

      // Verificar que no exista ya un costo activo para ese período/nivel
      const existente = await CostoMensualidad.findByPeriodoNivel(
        data.periodo_academico_id,
        data.nivel_academico_id
      );

      if (existente) {
        return res.status(409).json({
          success: false,
          message: 'Ya existe una configuración de costo activa para este período y nivel académico'
        });
      }

      const costo = await CostoMensualidad.create(data);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'costo_mensualidad',
        tabla_afectada: 'costo_mensualidad',
        registro_id: costo.id,
        datos_nuevos: costo,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Costo de mensualidad creado: ${costo.monto_base} Bs`
      });

      res.status(201).json({
        success: true,
        message: 'Costo de mensualidad creado exitosamente',
        data: { costo }
      });
    } catch (error) {
      console.error('Error al crear costo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear costo de mensualidad: ' + error.message
      });
    }
  }

  // PUT /api/costo-mensualidad/:id - Actualizar costo
  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;

      const costoExistente = await CostoMensualidad.findById(id);
      if (!costoExistente) {
        return res.status(404).json({
          success: false,
          message: 'Configuración de costo no encontrada'
        });
      }

      const costo = await CostoMensualidad.update(id, data);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'costo_mensualidad',
        tabla_afectada: 'costo_mensualidad',
        registro_id: costo.id,
        datos_anteriores: costoExistente,
        datos_nuevos: costo,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Costo actualizado a ${costo.monto_base} Bs`
      });

      res.json({
        success: true,
        message: 'Costo actualizado exitosamente',
        data: { costo }
      });
    } catch (error) {
      console.error('Error al actualizar costo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar costo: ' + error.message
      });
    }
  }

  // DELETE /api/costo-mensualidad/:id - Desactivar costo
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const costo = await CostoMensualidad.findById(id);
      if (!costo) {
        return res.status(404).json({
          success: false,
          message: 'Configuración de costo no encontrada'
        });
      }

      await CostoMensualidad.delete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'costo_mensualidad',
        tabla_afectada: 'costo_mensualidad',
        registro_id: parseInt(id),
        datos_anteriores: costo,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: 'Costo de mensualidad desactivado'
      });

      res.json({
        success: true,
        message: 'Costo desactivado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar costo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar costo: ' + error.message
      });
    }
  }
}

// =============================================
// CONTROLADOR: MensualidadController
// =============================================
class MensualidadController {
  // GET /api/mensualidad - Listar mensualidades
  static async listar(req, res) {
    try {
      const { periodo_academico_id, estado, grado_id, paralelo_id, mes_correspondiente } = req.query;

      const mensualidades = await Mensualidad.findAll({
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
        estado,
        grado_id: grado_id ? parseInt(grado_id) : undefined,
        paralelo_id: paralelo_id ? parseInt(paralelo_id) : undefined,
        mes_correspondiente
      });

      res.json({
        success: true,
        data: {
          mensualidades,
          total: mensualidades.length
        }
      });
    } catch (error) {
      console.error('Error al listar mensualidades:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar mensualidades: ' + error.message
      });
    }
  }

  // GET /api/mensualidad/:id - Obtener por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const mensualidad = await Mensualidad.findById(id);

      if (!mensualidad) {
        return res.status(404).json({
          success: false,
          message: 'Mensualidad no encontrada'
        });
      }

      // Obtener historial de pagos
      const pagos = await PagoMensualidad.findByMensualidad(id);

      res.json({
        success: true,
        data: { mensualidad, pagos }
      });
    } catch (error) {
      console.error('Error al obtener mensualidad:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener mensualidad: ' + error.message
      });
    }
  }

  // GET /api/mensualidad/matricula/:matricula_id - Obtener por matrícula
  static async obtenerPorMatricula(req, res) {
    try {
      const { matricula_id } = req.params;
      const mensualidades = await Mensualidad.findByMatricula(matricula_id);

      res.json({
        success: true,
        data: {
          mensualidades,
          total: mensualidades.length
        }
      });
    } catch (error) {
      console.error('Error al obtener mensualidades:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener mensualidades: ' + error.message
      });
    }
  }

  // POST /api/mensualidad/generar - Generar mensualidades
  static async generar(req, res) {
    try {
      const { matricula_id, periodo_academico_id, nivel_academico_id, porcentaje_beca } = req.body;

      // Verificar que no existan ya mensualidades para esta matrícula
      const existentes = await Mensualidad.findByMatricula(matricula_id);
      if (existentes.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Ya existen mensualidades generadas para esta matrícula'
        });
      }

      const mensualidades = await Mensualidad.generar(
        matricula_id,
        periodo_academico_id,
        nivel_academico_id,
        porcentaje_beca || 0
      );

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'mensualidad',
        tabla_afectada: 'mensualidad',
        registro_id: matricula_id,
        datos_nuevos: { mensualidades_generadas: mensualidades.length },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `10 mensualidades generadas para matrícula ${matricula_id}`
      });

      res.status(201).json({
        success: true,
        message: '10 mensualidades generadas exitosamente',
        data: { mensualidades }
      });
    } catch (error) {
      console.error('Error al generar mensualidades:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar mensualidades: ' + error.message
      });
    }
  }

  // PATCH /api/mensualidad/:id/anular - Anular mensualidad
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

      const mensualidadExistente = await Mensualidad.findById(id);
      if (!mensualidadExistente) {
        return res.status(404).json({
          success: false,
          message: 'Mensualidad no encontrada'
        });
      }

      const mensualidad = await Mensualidad.anular(id, motivo);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'anular',
        modulo: 'mensualidad',
        tabla_afectada: 'mensualidad',
        registro_id: parseInt(id),
        datos_anteriores: mensualidadExistente,
        datos_nuevos: mensualidad,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Mensualidad anulada: ${motivo}`
      });

      res.json({
        success: true,
        message: 'Mensualidad anulada exitosamente',
        data: { mensualidad }
      });
    } catch (error) {
      console.error('Error al anular mensualidad:', error);
      res.status(500).json({
        success: false,
        message: 'Error al anular mensualidad: ' + error.message
      });
    }
  }

  // GET /api/mensualidad/vencidas - Listar vencidas
  static async listarVencidas(req, res) {
    try {
      const { periodo_academico_id } = req.query;

      const mensualidades = await Mensualidad.findVencidas(
        periodo_academico_id ? parseInt(periodo_academico_id) : null
      );

      res.json({
        success: true,
        data: {
          mensualidades,
          total: mensualidades.length
        }
      });
    } catch (error) {
      console.error('Error al listar vencidas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar mensualidades vencidas: ' + error.message
      });
    }
  }
}

// =============================================
// CONTROLADOR: PagoMensualidadController
// =============================================
class PagoMensualidadController {
  // GET /api/pago-mensualidad - Listar pagos
  static async listar(req, res) {
    try {
      const {
        page,
        limit,
        estudiante_id,
        periodo_academico_id,
        metodo_pago,
        fecha_desde,
        fecha_hasta,
        anulado
      } = req.query;

      const result = await PagoMensualidad.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        estudiante_id: estudiante_id ? parseInt(estudiante_id) : undefined,
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
        metodo_pago,
        fecha_desde,
        fecha_hasta,
        anulado: anulado !== undefined ? anulado === 'true' : undefined
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

  // GET /api/pago-mensualidad/:id - Obtener por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const pago = await PagoMensualidad.findById(id);

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

  // POST /api/pago-mensualidad - Registrar pago
  static async crear(req, res) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const data = req.body;
      data.registrado_por = req.user.id;

      // Validar que la mensualidad existe y no está pagada/anulada
      const mensualidad = await Mensualidad.findById(data.mensualidad_id);

      if (!mensualidad) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Mensualidad no encontrada'
        });
      }

      if (mensualidad.estado === 'pagado') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Esta mensualidad ya está completamente pagada'
        });
      }

      if (mensualidad.estado === 'anulado') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'No se puede registrar pagos en una mensualidad anulada'
        });
      }

      // Verificar que el monto no exceda el saldo pendiente
      const saldoPendiente = mensualidad.saldo_pendiente || mensualidad.monto_final;
      if (parseFloat(data.monto_pagado) > parseFloat(saldoPendiente)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `El monto excede el saldo pendiente (${saldoPendiente} Bs)`
        });
      }

      const pago = await PagoMensualidad.create(data);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'pago_mensualidad',
        tabla_afectada: 'pago_mensualidad',
        registro_id: pago.id,
        datos_nuevos: pago,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Pago registrado: ${pago.codigo_pago} - ${pago.monto_pagado} Bs`
      });

      await client.query('COMMIT');

      // Obtener el pago con todos los detalles
      const pagoCompleto = await PagoMensualidad.findById(pago.id);

      res.status(201).json({
        success: true,
        message: 'Pago registrado exitosamente',
        data: { pago: pagoCompleto }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al registrar pago:', error);
      res.status(500).json({
        success: false,
        message: 'Error al registrar pago: ' + error.message
      });
    } finally {
      client.release();
    }
  }

  // PUT /api/pago-mensualidad/:id - Actualizar pago
  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;

      const pagoExistente = await PagoMensualidad.findById(id);
      if (!pagoExistente) {
        return res.status(404).json({
          success: false,
          message: 'Pago no encontrado'
        });
      }

      if (pagoExistente.anulado) {
        return res.status(400).json({
          success: false,
          message: 'No se puede actualizar un pago anulado'
        });
      }

      const pago = await PagoMensualidad.update(id, data);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'pago_mensualidad',
        tabla_afectada: 'pago_mensualidad',
        registro_id: pago.id,
        datos_anteriores: pagoExistente,
        datos_nuevos: pago,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Pago actualizado: ${pago.codigo_pago}`
      });

      res.json({
        success: true,
        message: 'Pago actualizado exitosamente',
        data: { pago }
      });
    } catch (error) {
      console.error('Error al actualizar pago:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar pago: ' + error.message
      });
    }
  }

  // PATCH /api/pago-mensualidad/:id/anular - Anular pago
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

      const pagoExistente = await PagoMensualidad.findById(id);
      if (!pagoExistente) {
        return res.status(404).json({
          success: false,
          message: 'Pago no encontrado'
        });
      }

      if (pagoExistente.anulado) {
        return res.status(400).json({
          success: false,
          message: 'Este pago ya está anulado'
        });
      }

      const pago = await PagoMensualidad.anular(id, motivo, req.user.id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'anular',
        modulo: 'pago_mensualidad',
        tabla_afectada: 'pago_mensualidad',
        registro_id: parseInt(id),
        datos_anteriores: pagoExistente,
        datos_nuevos: pago,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Pago anulado: ${motivo}`
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
}

// =============================================
// CONTROLADOR: PagoAnualCompletoController
// =============================================
class PagoAnualCompletoController {
  // POST /api/pago-anual - Registrar pago anual
  static async registrar(req, res) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const data = req.body;
      data.registrado_por = req.user.id;

      // Verificar que no exista ya un pago anual para esta matrícula
      const existePago = await PagoAnualCompleto.existePagoAnual(data.matricula_id);
      if (existePago) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Ya existe un pago anual completo registrado para esta matrícula'
        });
      }

      // Verificar que haya mensualidades pendientes
      const mensualidades = await Mensualidad.findByMatricula(data.matricula_id);
      const pendientes = mensualidades.filter(m => m.estado === 'pendiente' || m.estado === 'vencido');

      if (pendientes.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'No hay mensualidades pendientes para esta matrícula'
        });
      }

      const pago = await PagoAnualCompleto.registrar(data);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'pago_anual_completo',
        tabla_afectada: 'pago_anual_completo',
        registro_id: pago.id,
        datos_nuevos: pago,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Pago anual registrado: ${pago.codigo_pago} - ${pago.monto_pagado} Bs con descuento de ${pago.monto_descuento} Bs`
      });

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Pago anual completo registrado exitosamente',
        data: { pago }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al registrar pago anual:', error);
      res.status(500).json({
        success: false,
        message: 'Error al registrar pago anual: ' + error.message
      });
    } finally {
      client.release();
    }
  }

  // GET /api/pago-anual - Listar pagos anuales
  static async listar(req, res) {
    try {
      const { periodo_academico_id, metodo_pago } = req.query;

      const pagos = await PagoAnualCompleto.findAll({
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
        metodo_pago
      });

      res.json({
        success: true,
        data: {
          pagos,
          total: pagos.length
        }
      });
    } catch (error) {
      console.error('Error al listar pagos anuales:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar pagos anuales: ' + error.message
      });
    }
  }

  // GET /api/pago-anual/:id - Obtener por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const pago = await PagoAnualCompleto.findById(id);

      if (!pago) {
        return res.status(404).json({
          success: false,
          message: 'Pago anual no encontrado'
        });
      }

      res.json({
        success: true,
        data: { pago }
      });
    } catch (error) {
      console.error('Error al obtener pago anual:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener pago anual: ' + error.message
      });
    }
  }
}

// =============================================
// CONTROLADOR: ReportesPagosController
// =============================================
class ReportesPagosController {
  // GET /api/reportes-pagos/estado-estudiantes - Estado de pagos
  static async estadoEstudiantes(req, res) {
    try {
      const { periodo_academico_id, grado_id, paralelo_id } = req.query;

      // 🔧 CORREGIDO: Construir query directamente sin usar la vista problemática
      let whereConditions = ['mat.estado = \'activo\'', 'mat.deleted_at IS NULL'];
      let queryParams = [];
      let paramCounter = 1;

      if (periodo_academico_id) {
        whereConditions.push(`mat.periodo_academico_id = $${paramCounter}`);
        queryParams.push(parseInt(periodo_academico_id));
        paramCounter++;
      }

      if (grado_id) {
        whereConditions.push(`g.id = $${paramCounter}`);
        queryParams.push(parseInt(grado_id));
        paramCounter++;
      }

      if (paralelo_id) {
        whereConditions.push(`p.id = $${paramCounter}`);
        queryParams.push(parseInt(paralelo_id));
        paramCounter++;
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // 🔧 QUERY CORREGIDA: Sin vista, calculando todo directamente
      const query = `
        SELECT 
          e.id as estudiante_id,
          e.codigo as estudiante_codigo,
          e.nombres,
          e.apellidos,
          g.nombre as grado,
          p.nombre as paralelo,
          mat.es_becado,
          mat.porcentaje_beca,
          mat.periodo_academico_id,
          g.id as grado_id,
          p.id as paralelo_id,
          
          -- Total de mensualidades
          COUNT(m.id) as total_mensualidades,
          
          -- Mensualidades pagadas
          COUNT(CASE WHEN m.estado = 'pagado' THEN 1 END) as mensualidades_pagadas,
          
          -- Mensualidades pendientes
          COUNT(CASE WHEN m.estado IN ('pendiente', 'vencido') THEN 1 END) as mensualidades_pendientes,
          
          -- Mensualidades vencidas
          COUNT(CASE WHEN m.estado = 'vencido' THEN 1 END) as mensualidades_vencidas,
          
          -- Monto total
          COALESCE(SUM(m.monto_final), 0) as monto_total,
          
          -- Monto pagado
          COALESCE(SUM(
            CASE WHEN m.estado = 'pagado' 
            THEN m.monto_final 
            ELSE 0 
            END
          ), 0) as monto_pagado,
          
          -- Monto pendiente
          COALESCE(SUM(
            CASE WHEN m.estado IN ('pendiente', 'vencido') 
            THEN m.monto_final 
            ELSE 0 
            END
          ), 0) as monto_pendiente
          
        FROM estudiante e
        INNER JOIN matricula mat ON e.id = mat.estudiante_id
        INNER JOIN paralelo p ON mat.paralelo_id = p.id
        INNER JOIN grado g ON p.grado_id = g.id
        LEFT JOIN mensualidad m ON mat.id = m.matricula_id
        ${whereClause}
        GROUP BY 
          e.id, e.codigo, e.nombres, e.apellidos,
          g.nombre, p.nombre, mat.es_becado, mat.porcentaje_beca,
          mat.periodo_academico_id, g.id, p.id
        ORDER BY e.apellidos ASC, e.nombres ASC
      `;

      const result = await pool.query(query, queryParams);

      res.json({
        success: true,
        data: {
          estudiantes: result.rows,
          total: result.rows.length
        }
      });
    } catch (error) {
      console.error('Error al obtener estado de pagos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener estado de pagos: ' + error.message
      });
    }
  }

  // GET /api/reportes-pagos/ingresos - Ingresos por período
  static async ingresos(req, res) {
    try {
      const { periodo_academico_id, mes_inicio, mes_fin } = req.query;

      let whereConditions = ['NOT pm.anulado'];
      let queryParams = [];
      let paramCounter = 1;

      if (periodo_academico_id) {
        whereConditions.push(`mat.periodo_academico_id = $${paramCounter}`);
        queryParams.push(parseInt(periodo_academico_id));
        paramCounter++;
      }

      if (mes_inicio) {
        whereConditions.push(`pm.fecha_pago >= $${paramCounter}::date`);
        queryParams.push(mes_inicio);
        paramCounter++;
      }

      if (mes_fin) {
        whereConditions.push(`pm.fecha_pago <= $${paramCounter}::date`);
        queryParams.push(mes_fin);
        paramCounter++;
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // 🔧 QUERY CORREGIDA: Agrupar por mes
      const query = `
        SELECT 
          DATE_TRUNC('month', pm.fecha_pago) as mes,
          TO_CHAR(pm.fecha_pago, 'YYYY-MM') as mes_formato,
          TO_CHAR(pm.fecha_pago, 'TMMonth YYYY') as mes_nombre,
          COUNT(pm.id) as cantidad_pagos,
          SUM(pm.monto_pagado) as total_ingreso,
          COUNT(DISTINCT mat.estudiante_id) as estudiantes_distintos
        FROM pago_mensualidad pm
        INNER JOIN mensualidad m ON pm.mensualidad_id = m.id
        INNER JOIN matricula mat ON m.matricula_id = mat.id
        ${whereClause}
        GROUP BY DATE_TRUNC('month', pm.fecha_pago), TO_CHAR(pm.fecha_pago, 'YYYY-MM'), TO_CHAR(pm.fecha_pago, 'TMMonth YYYY')
        ORDER BY mes DESC
      `;

      const result = await pool.query(query, queryParams);

      // Calcular totales
      const totales = result.rows.reduce((acc, row) => {
        acc.cantidad_pagos += parseInt(row.cantidad_pagos);
        acc.total_ingreso += parseFloat(row.total_ingreso);
        return acc;
      }, { cantidad_pagos: 0, total_ingreso: 0 });

      res.json({
        success: true,
        data: {
          ingresos: result.rows,
          totales,
          total_registros: result.rows.length
        }
      });
    } catch (error) {
      console.error('Error al obtener ingresos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener ingresos: ' + error.message
      });
    }
  }

  // GET /api/reportes-pagos/morosos - Lista de morosos
  static async morosos(req, res) {
    try {
      const { grado_id, paralelo_id, dias_mora_minimo, periodo_academico_id } = req.query;

      let whereConditions = [
        'm.estado IN (\'pendiente\', \'vencido\')',
        'm.fecha_vencimiento < CURRENT_DATE',
        'mat.estado = \'activo\'',
        'mat.deleted_at IS NULL'
      ];
      let queryParams = [];
      let paramCounter = 1;

      if (periodo_academico_id) {
        whereConditions.push(`mat.periodo_academico_id = $${paramCounter}`);
        queryParams.push(parseInt(periodo_academico_id));
        paramCounter++;
      }

      if (grado_id) {
        whereConditions.push(`g.id = $${paramCounter}`);
        queryParams.push(parseInt(grado_id));
        paramCounter++;
      }

      if (paralelo_id) {
        whereConditions.push(`p.id = $${paramCounter}`);
        queryParams.push(parseInt(paralelo_id));
        paramCounter++;
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // 🔧 QUERY CORREGIDA: Calcular días de mora directamente
      const query = `
        SELECT 
          e.id as estudiante_id,
          e.codigo,
          e.nombres,
          e.apellidos,
          g.nombre as grado,
          p.nombre as paralelo,
          m.numero_cuota,
          m.mes_correspondiente,
          m.fecha_vencimiento,
          m.monto_final,
          m.estado,
          g.id as grado_id,
          p.id as paralelo_id,
          CURRENT_DATE - m.fecha_vencimiento as dias_mora,
          
          -- Calcular saldo pendiente
          (m.monto_final - COALESCE((
            SELECT SUM(pm.monto_pagado)
            FROM pago_mensualidad pm
            WHERE pm.mensualidad_id = m.id
              AND NOT pm.anulado
          ), 0)) as saldo_pendiente
          
        FROM mensualidad m
        INNER JOIN matricula mat ON m.matricula_id = mat.id
        INNER JOIN estudiante e ON mat.estudiante_id = e.id
        INNER JOIN paralelo p ON mat.paralelo_id = p.id
        INNER JOIN grado g ON p.grado_id = g.id
        ${whereClause}
        ORDER BY dias_mora DESC, e.apellidos ASC
      `;

      let result = await pool.query(query, queryParams);

      // 🔧 Filtrar por días de mora DESPUÉS de la query (porque usamos CURRENT_DATE)
      if (dias_mora_minimo) {
        const minDias = parseInt(dias_mora_minimo);
        result.rows = result.rows.filter(row => row.dias_mora >= minDias);
      }

      // Calcular deuda total
      const deudaTotal = result.rows.reduce((acc, row) => {
        return acc + parseFloat(row.saldo_pendiente || row.monto_final);
      }, 0);

      res.json({
        success: true,
        data: {
          morosos: result.rows,
          total_morosos: result.rows.length,
          deuda_total: deudaTotal
        }
      });
    } catch (error) {
      console.error('Error al obtener morosos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener lista de morosos: ' + error.message
      });
    }
  }

  // GET /api/reportes-pagos/resumen - Resumen general (este está OK)
  static async resumen(req, res) {
    try {
      const { periodo_academico_id } = req.query;

      if (!periodo_academico_id) {
        return res.status(400).json({
          success: false,
          message: 'El periodo_academico_id es requerido'
        });
      }

      // Consultas paralelas para mejor performance
      const [
        totalEstudiantes,
        totalMensualidades,
        mensualidadesPagadas,
        mensualidadesPendientes,
        mensualidadesVencidas,
        totalIngresos,
        pagosPorMetodo,
        pagosAnuales
      ] = await Promise.all([
        pool.query(`
          SELECT COUNT(DISTINCT mat.estudiante_id) as total
          FROM matricula mat
          WHERE mat.periodo_academico_id = $1
            AND mat.estado = 'activo'
            AND mat.deleted_at IS NULL
        `, [periodo_academico_id]),

        pool.query(`
          SELECT COUNT(*) as total, COALESCE(SUM(monto_final), 0) as monto_total
          FROM mensualidad m
          INNER JOIN matricula mat ON m.matricula_id = mat.id
          WHERE mat.periodo_academico_id = $1
            AND mat.deleted_at IS NULL
        `, [periodo_academico_id]),

        pool.query(`
          SELECT COUNT(*) as total, COALESCE(SUM(monto_final), 0) as monto_total
          FROM mensualidad m
          INNER JOIN matricula mat ON m.matricula_id = mat.id
          WHERE mat.periodo_academico_id = $1
            AND m.estado = 'pagado'
            AND mat.deleted_at IS NULL
        `, [periodo_academico_id]),

        pool.query(`
          SELECT COUNT(*) as total, COALESCE(SUM(monto_final), 0) as monto_total
          FROM mensualidad m
          INNER JOIN matricula mat ON m.matricula_id = mat.id
          WHERE mat.periodo_academico_id = $1
            AND m.estado = 'pendiente'
            AND mat.deleted_at IS NULL
        `, [periodo_academico_id]),

        pool.query(`
          SELECT COUNT(*) as total, COALESCE(SUM(monto_final), 0) as monto_total
          FROM mensualidad m
          INNER JOIN matricula mat ON m.matricula_id = mat.id
          WHERE mat.periodo_academico_id = $1
            AND m.estado IN ('pendiente', 'vencido')
            AND m.fecha_vencimiento < CURRENT_DATE
            AND mat.deleted_at IS NULL
        `, [periodo_academico_id]),

        pool.query(`
          SELECT COALESCE(SUM(pm.monto_pagado), 0) as total
          FROM pago_mensualidad pm
          INNER JOIN mensualidad m ON pm.mensualidad_id = m.id
          INNER JOIN matricula mat ON m.matricula_id = mat.id
          WHERE mat.periodo_academico_id = $1
            AND NOT pm.anulado
        `, [periodo_academico_id]),

        pool.query(`
          SELECT pm.metodo_pago, COUNT(*) as cantidad, COALESCE(SUM(pm.monto_pagado), 0) as total
          FROM pago_mensualidad pm
          INNER JOIN mensualidad m ON pm.mensualidad_id = m.id
          INNER JOIN matricula mat ON m.matricula_id = mat.id
          WHERE mat.periodo_academico_id = $1
            AND NOT pm.anulado
          GROUP BY pm.metodo_pago
        `, [periodo_academico_id]),

        pool.query(`
          SELECT COUNT(*) as total, COALESCE(SUM(monto_pagado), 0) as monto_total
          FROM pago_anual_completo pac
          INNER JOIN matricula mat ON pac.matricula_id = mat.id
          WHERE mat.periodo_academico_id = $1
        `, [periodo_academico_id])
      ]);

      const resumen = {
        estudiantes: {
          total: parseInt(totalEstudiantes.rows[0].total)
        },
        mensualidades: {
          total: parseInt(totalMensualidades.rows[0].total),
          monto_total: parseFloat(totalMensualidades.rows[0].monto_total),
          pagadas: parseInt(mensualidadesPagadas.rows[0].total),
          monto_pagado: parseFloat(mensualidadesPagadas.rows[0].monto_total),
          pendientes: parseInt(mensualidadesPendientes.rows[0].total),
          monto_pendiente: parseFloat(mensualidadesPendientes.rows[0].monto_total),
          vencidas: parseInt(mensualidadesVencidas.rows[0].total),
          monto_vencido: parseFloat(mensualidadesVencidas.rows[0].monto_total)
        },
        ingresos: {
          total: parseFloat(totalIngresos.rows[0].total),
          por_metodo: pagosPorMetodo.rows
        },
        pagos_anuales: {
          total: parseInt(pagosAnuales.rows[0].total),
          monto_total: parseFloat(pagosAnuales.rows[0].monto_total)
        },
        porcentajes: {
          mensualidades_pagadas: totalMensualidades.rows[0].total > 0
            ? (mensualidadesPagadas.rows[0].total / totalMensualidades.rows[0].total * 100).toFixed(2)
            : 0,
          mensualidades_pendientes: totalMensualidades.rows[0].total > 0
            ? (mensualidadesPendientes.rows[0].total / totalMensualidades.rows[0].total * 100).toFixed(2)
            : 0,
          morosidad: totalMensualidades.rows[0].total > 0
            ? (mensualidadesVencidas.rows[0].total / totalMensualidades.rows[0].total * 100).toFixed(2)
            : 0
        }
      };

      res.json({
        success: true,
        data: { resumen }
      });
    } catch (error) {
      console.error('Error al obtener resumen:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener resumen de pagos: ' + error.message
      });
    }
  }
}

class PagoMultipleController {
  /**
   * POST /api/pago-multiple
   * Registrar pago para múltiples mensualidades de uno o varios estudiantes
   * 
   * Body esperado:
   * {
   *   mensualidades: [
   *     { mensualidad_id: 1, monto_pagado: 500 },
   *     { mensualidad_id: 2, monto_pagado: 300 },
   *     ...
   *   ],
   *   metodo_pago: 'transferencia',
   *   numero_comprobante: '12345',
   *   banco_origen: 'BCP',
   *   numero_referencia: 'REF123',
   *   entrego_factura: true,
   *   numero_factura: 'FAC-001',
   *   observaciones: 'Pago de hermanos Juan y María'
   * }
   */
  static async registrarMultiple(req, res) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const {
        mensualidades, // Array de { mensualidad_id, monto_pagado }
        metodo_pago,
        numero_comprobante,
        banco_origen,
        numero_referencia,
        entrego_factura,
        numero_factura,
        observaciones
      } = req.body;

      // Validaciones
      if (!mensualidades || !Array.isArray(mensualidades) || mensualidades.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar al menos una mensualidad'
        });
      }

      if (!metodo_pago) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'El método de pago es requerido'
        });
      }

      // Validar cada mensualidad
      const mensualidadesValidadas = [];
      let montoTotal = 0;

      for (const item of mensualidades) {
        const { mensualidad_id, monto_pagado } = item;

        if (!mensualidad_id || !monto_pagado) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Cada mensualidad debe tener mensualidad_id y monto_pagado'
          });
        }

        // Obtener mensualidad
        const mensualidad = await Mensualidad.findById(mensualidad_id);

        if (!mensualidad) {
          await client.query('ROLLBACK');
          return res.status(404).json({
            success: false,
            message: `Mensualidad ${mensualidad_id} no encontrada`
          });
        }

        if (mensualidad.estado === 'pagado') {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `La mensualidad ${mensualidad_id} (${mensualidad.mes_correspondiente}) ya está pagada`
          });
        }

        if (mensualidad.estado === 'anulado') {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `No se puede pagar la mensualidad anulada ${mensualidad_id}`
          });
        }

        // Calcular saldo pendiente
        const saldoPendiente = parseFloat(mensualidad.saldo_pendiente || mensualidad.monto_final);
        const montoPagar = parseFloat(monto_pagado);

        if (montoPagar > saldoPendiente) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `El monto para ${mensualidad.mes_correspondiente} excede el saldo pendiente (Bs ${saldoPendiente.toFixed(2)})`
          });
        }

        mensualidadesValidadas.push({
          mensualidad_id,
          mensualidad,
          monto_pagado: montoPagar,
          saldo_pendiente: saldoPendiente
        });

        montoTotal += montoPagar;
      }

      // Registrar pagos
      const pagosRegistrados = [];

      for (const item of mensualidadesValidadas) {
        const pago = await PagoMensualidad.create({
          mensualidad_id: item.mensualidad_id,
          monto_pagado: item.monto_pagado,
          metodo_pago,
          numero_comprobante,
          banco_origen,
          numero_referencia,
          entrego_factura: entrego_factura || false,
          numero_factura,
          registrado_por: req.user.id,
          observaciones: observaciones || `Pago múltiple - ${mensualidades.length} mensualidades`
        });

        pagosRegistrados.push({
          pago_id: pago.id,
          codigo_pago: pago.codigo_pago,
          mensualidad_id: item.mensualidad_id,
          mes: item.mensualidad.mes_correspondiente,
          estudiante: `${item.mensualidad.nombres} ${item.mensualidad.apellidos}`,
          monto_pagado: item.monto_pagado
        });
      }

      // Log de actividad
      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'pago_multiple',
        tabla_afectada: 'pago_mensualidad',
        registro_id: pagosRegistrados[0].pago_id,
        datos_nuevos: {
          cantidad_pagos: pagosRegistrados.length,
          monto_total: montoTotal,
          pagos: pagosRegistrados
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Pago múltiple registrado: ${pagosRegistrados.length} mensualidades - Bs ${montoTotal.toFixed(2)}`
      });

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: `${pagosRegistrados.length} pagos registrados exitosamente`,
        data: {
          cantidad_pagos: pagosRegistrados.length,
          monto_total: montoTotal,
          pagos: pagosRegistrados
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al registrar pago múltiple:', error);
      res.status(500).json({
        success: false,
        message: 'Error al registrar pago múltiple: ' + error.message
      });
    } finally {
      client.release();
    }
  }

  /**
   * GET /api/pago-multiple/resumen
   * Obtener resumen de mensualidades pendientes para pago múltiple
   */
  static async obtenerResumenPendientes(req, res) {
    try {
      const { matricula_ids } = req.query; // Array de IDs separados por coma

      if (!matricula_ids) {
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar matricula_ids'
        });
      }

      const idsArray = matricula_ids.split(',').map(id => parseInt(id));

      const query = `
        SELECT 
          m.id as mensualidad_id,
          m.numero_cuota,
          m.mes_correspondiente,
          m.fecha_vencimiento,
          m.monto_final,
          m.estado,
          mat.id as matricula_id,
          mat.numero_matricula,
          e.id as estudiante_id,
          e.codigo as estudiante_codigo,
          e.nombres,
          e.apellidos,
          g.nombre as grado,
          p.nombre as paralelo,
          -- Calcular saldo pendiente
          (m.monto_final - COALESCE((
            SELECT SUM(pm.monto_pagado)
            FROM pago_mensualidad pm
            WHERE pm.mensualidad_id = m.id
              AND NOT pm.anulado
          ), 0)) as saldo_pendiente,
          -- Total pagado
          COALESCE((
            SELECT SUM(pm.monto_pagado)
            FROM pago_mensualidad pm
            WHERE pm.mensualidad_id = m.id
              AND NOT pm.anulado
          ), 0) as total_pagado
        FROM mensualidad m
        INNER JOIN matricula mat ON m.matricula_id = mat.id
        INNER JOIN estudiante e ON mat.estudiante_id = e.id
        INNER JOIN paralelo p ON mat.paralelo_id = p.id
        INNER JOIN grado g ON p.grado_id = g.id
        WHERE mat.id = ANY($1)
          AND m.estado IN ('pendiente', 'vencido', 'pagado_parcial')
          AND mat.deleted_at IS NULL
        ORDER BY e.apellidos ASC, m.numero_cuota ASC
      `;

      const result = await pool.query(query, [idsArray]);

      // Agrupar por estudiante
      const porEstudiante = result.rows.reduce((acc, row) => {
        const key = row.estudiante_id;
        if (!acc[key]) {
          acc[key] = {
            estudiante_id: row.estudiante_id,
            estudiante_codigo: row.estudiante_codigo,
            nombres: row.nombres,
            apellidos: row.apellidos,
            grado: row.grado,
            paralelo: row.paralelo,
            matricula_id: row.matricula_id,
            mensualidades: []
          };
        }
        acc[key].mensualidades.push({
          mensualidad_id: row.mensualidad_id,
          numero_cuota: row.numero_cuota,
          mes_correspondiente: row.mes_correspondiente,
          fecha_vencimiento: row.fecha_vencimiento,
          monto_final: parseFloat(row.monto_final),
          saldo_pendiente: parseFloat(row.saldo_pendiente),
          total_pagado: parseFloat(row.total_pagado),
          estado: row.estado
        });
        return acc;
      }, {});

      const estudiantes = Object.values(porEstudiante);

      res.json({
        success: true,
        data: {
          estudiantes,
          total_estudiantes: estudiantes.length,
          total_mensualidades: result.rows.length
        }
      });

    } catch (error) {
      console.error('Error al obtener resumen:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener resumen: ' + error.message
      });
    }
  }
}
class PagoDistribuidoController {
  /**
   * POST /api/pago-distribuido
   * Registrar pago con distribución automática entre mensualidades
   * 
   * Body esperado:
   * {
   *   matricula_id: 123,
   *   monto_total: 600,
   *   metodo_pago: 'efectivo',
   *   numero_comprobante: '12345',
   *   observaciones: 'Pago de marzo completo + 150 de abril',
   *   // ... otros campos opcionales
   * }
   */
  static async registrarPagoDistribuido(req, res) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const {
        matricula_id,
        monto_total,
        metodo_pago,
        numero_comprobante,
        banco_origen,
        numero_referencia,
        entrego_factura,
        numero_factura,
        observaciones
      } = req.body;

      // Validaciones
      if (!matricula_id || !monto_total || !metodo_pago) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'matricula_id, monto_total y metodo_pago son requeridos'
        });
      }

      if (parseFloat(monto_total) <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'El monto debe ser mayor a 0'
        });
      }

      // Obtener mensualidades pendientes ordenadas
      const queryMensualidades = `
        SELECT 
          m.id,
          m.numero_cuota,
          m.mes_correspondiente,
          m.monto_final,
          m.estado,
          (m.monto_final - COALESCE((
            SELECT SUM(pm.monto_pagado)
            FROM pago_mensualidad pm
            WHERE pm.mensualidad_id = m.id AND NOT pm.anulado
          ), 0)) as saldo_pendiente
        FROM mensualidad m
        WHERE m.matricula_id = $1
          AND m.estado IN ('pendiente', 'vencido', 'pagado_parcial')
        ORDER BY m.numero_cuota ASC
      `;

      const resultMens = await client.query(queryMensualidades, [matricula_id]);
      const mensualidades = resultMens.rows;

      if (mensualidades.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'No hay mensualidades pendientes para esta matrícula'
        });
      }

      // ALGORITMO DE DISTRIBUCIÓN AUTOMÁTICA
      const distribucion = [];
      let montoRestante = parseFloat(monto_total);
      let mensualidadesCompletas = 0;
      let mensualidadesParciales = 0;

      for (const mens of mensualidades) {
        if (montoRestante <= 0) break;

        const saldoPendiente = parseFloat(mens.saldo_pendiente);
        const montoAPagar = Math.min(montoRestante, saldoPendiente);
        const saldoRestante = saldoPendiente - montoAPagar;
        const esPagoCompleto = montoAPagar >= saldoPendiente;

        if (esPagoCompleto) {
          mensualidadesCompletas++;
        } else if (montoAPagar > 0) {
          mensualidadesParciales++;
        }

        distribucion.push({
          mensualidad_id: mens.id,
          numero_cuota: mens.numero_cuota,
          mes_correspondiente: mens.mes_correspondiente,
          saldo_pendiente_original: saldoPendiente,
          monto_a_pagar: montoAPagar,
          saldo_restante: saldoRestante,
          es_pago_completo: esPagoCompleto
        });

        montoRestante -= montoAPagar;
      }

      const montoDistribuido = parseFloat(monto_total) - montoRestante;

      // Registrar los pagos
      const pagosRegistrados = [];

      for (const item of distribucion) {
        if (item.monto_a_pagar <= 0) continue;

        // Generar código de pago
        const sequenceResult = await client.query(
          'SELECT NEXTVAL(\'pago_mensualidad_id_seq\')'
        );
        const year = new Date().getFullYear();
        const numero = String(sequenceResult.rows[0].nextval).padStart(6, '0');
        const codigo_pago = `PAG-${year}-${numero}`;

        // Insertar pago
        const queryInsertPago = `
          INSERT INTO pago_mensualidad (
            codigo_pago, mensualidad_id, monto_pagado, metodo_pago,
            numero_comprobante, banco_origen, numero_referencia,
            entrego_factura, numero_factura, registrado_por, observaciones
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *
        `;

        const observacionesPago = observaciones
          ? `${observaciones} | ${item.es_pago_completo ? 'Pago completo' : 'Pago parcial'} - ${item.mes_correspondiente}`
          : `${item.es_pago_completo ? 'Pago completo' : 'Pago parcial'} - ${item.mes_correspondiente}`;

        const resultPago = await client.query(queryInsertPago, [
          codigo_pago,
          item.mensualidad_id,
          item.monto_a_pagar,
          metodo_pago,
          numero_comprobante,
          banco_origen,
          numero_referencia,
          entrego_factura || false,
          numero_factura,
          req.user.id,
          observacionesPago
        ]);

        pagosRegistrados.push({
          ...resultPago.rows[0],
          mensualidad_info: {
            numero_cuota: item.numero_cuota,
            mes: item.mes_correspondiente,
            saldo_restante: item.saldo_restante,
            es_pago_completo: item.es_pago_completo
          }
        });
      }

      // Log de actividad
      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'pago_distribuido',
        tabla_afectada: 'pago_mensualidad',
        registro_id: pagosRegistrados[0]?.id,
        datos_nuevos: {
          matricula_id,
          monto_total: parseFloat(monto_total),
          monto_distribuido: montoDistribuido,
          monto_sobrante: montoRestante,
          cantidad_pagos: pagosRegistrados.length,
          mensualidades_completas: mensualidadesCompletas,
          mensualidades_parciales: mensualidadesParciales,
          distribucion: distribucion.map(d => ({
            mes: d.mes_correspondiente,
            monto: d.monto_a_pagar
          }))
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Pago distribuido: ${mensualidadesCompletas} completas + ${mensualidadesParciales} parciales = Bs ${montoDistribuido.toFixed(2)}`
      });

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: `Pago distribuido registrado: ${pagosRegistrados.length} cuota(s)`,
        data: {
          monto_total_ingresado: parseFloat(monto_total),
          monto_distribuido: montoDistribuido,
          monto_sobrante: montoRestante,
          mensualidades_completas: mensualidadesCompletas,
          mensualidades_parciales: mensualidadesParciales,
          cantidad_pagos: pagosRegistrados.length,
          distribucion: distribucion,
          pagos: pagosRegistrados
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al registrar pago distribuido:', error);
      res.status(500).json({
        success: false,
        message: 'Error al registrar pago distribuido: ' + error.message
      });
    } finally {
      client.release();
    }
  }

  /**
   * POST /api/pago-distribuido/calcular
   * Calcular distribución SIN registrar el pago (preview)
   */
  static async calcularDistribucion(req, res) {
    try {
      const { matricula_id, monto_total } = req.body;

      if (!matricula_id || !monto_total) {
        return res.status(400).json({
          success: false,
          message: 'matricula_id y monto_total son requeridos'
        });
      }

      if (parseFloat(monto_total) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'El monto debe ser mayor a 0'
        });
      }

      // Obtener mensualidades pendientes
      const query = `
        SELECT 
          m.id,
          m.numero_cuota,
          m.mes_correspondiente,
          m.monto_final,
          (m.monto_final - COALESCE((
            SELECT SUM(pm.monto_pagado)
            FROM pago_mensualidad pm
            WHERE pm.mensualidad_id = m.id AND NOT pm.anulado
          ), 0)) as saldo_pendiente
        FROM mensualidad m
        WHERE m.matricula_id = $1
          AND m.estado IN ('pendiente', 'vencido', 'pagado_parcial')
        ORDER BY m.numero_cuota ASC
      `;

      const result = await pool.query(query, [matricula_id]);
      const mensualidades = result.rows;

      if (mensualidades.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No hay mensualidades pendientes'
        });
      }

      // Calcular distribución
      const distribucion = [];
      let montoRestante = parseFloat(monto_total);
      let mensualidadesCompletas = 0;
      let mensualidadesParciales = 0;

      for (const mens of mensualidades) {
        if (montoRestante <= 0) break;

        const saldoPendiente = parseFloat(mens.saldo_pendiente);
        const montoAPagar = Math.min(montoRestante, saldoPendiente);
        const porcentajePago = (montoAPagar / saldoPendiente) * 100;
        const esPagoCompleto = montoAPagar >= saldoPendiente;

        if (esPagoCompleto) mensualidadesCompletas++;
        else if (montoAPagar > 0) mensualidadesParciales++;

        distribucion.push({
          mensualidad_id: mens.id,
          numero_cuota: mens.numero_cuota,
          mes_correspondiente: mens.mes_correspondiente,
          saldo_pendiente: saldoPendiente,
          monto_a_pagar: montoAPagar,
          saldo_restante: saldoPendiente - montoAPagar,
          porcentaje_pago: porcentajePago,
          es_pago_completo: esPagoCompleto,
          es_pago_parcial: !esPagoCompleto && montoAPagar > 0
        });

        montoRestante -= montoAPagar;
      }

      const advertencias = [];
      if (montoRestante > 0.01) {
        advertencias.push(`Sobran Bs ${montoRestante.toFixed(2)} - No hay más mensualidades pendientes`);
      }
      if (mensualidadesParciales > 0) {
        advertencias.push(`Se realizarán ${mensualidadesParciales} pago(s) parcial(es)`);
      }

      res.json({
        success: true,
        data: {
          monto_total: parseFloat(monto_total),
          monto_distribuido: parseFloat(monto_total) - montoRestante,
          monto_sobrante: montoRestante,
          mensualidades_completas: mensualidadesCompletas,
          mensualidades_parciales: mensualidadesParciales,
          distribucion: distribucion.filter(d => d.monto_a_pagar > 0),
          advertencias
        }
      });

    } catch (error) {
      console.error('Error al calcular distribución:', error);
      res.status(500).json({
        success: false,
        message: 'Error al calcular distribución: ' + error.message
      });
    }
  }
}
class AjusteCostoMensualidadController {
  // POST /api/ajuste-costo/previsualizar
  static async previsualizar(req, res) {
    try {
      const { periodo_academico_id, nivel_academico_id, nuevo_monto_base, fecha_corte, grado_id, paralelo_id } = req.body;

      if (!periodo_academico_id || !nivel_academico_id || !nuevo_monto_base) {
        return res.status(400).json({
          success: false,
          message: 'periodo_academico_id, nivel_academico_id y nuevo_monto_base son requeridos'
        });
      }

      const resultado = await AjusteCostoMensualidad.previsualizar({
        periodo_academico_id,
        nivel_academico_id,
        nuevo_monto_base,
        fecha_corte: fecha_corte || new Date().toISOString().slice(0, 10),
        grado_id,
        paralelo_id
      });

      res.json({ success: true, data: resultado });
    } catch (error) {
      console.error('Error al previsualizar ajuste de costo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al previsualizar ajuste de costo: ' + error.message
      });
    }
  }

  // POST /api/ajuste-costo/aplicar
  static async aplicar(req, res) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { periodo_academico_id, nivel_academico_id, nuevo_monto_base, fecha_corte, grado_id, paralelo_id } = req.body;

      if (!periodo_academico_id || !nivel_academico_id || !nuevo_monto_base) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'periodo_academico_id, nivel_academico_id y nuevo_monto_base son requeridos'
        });
      }

      const fechaCorte = fecha_corte || new Date().toISOString().slice(0, 10);

      let whereConditions = [
        `mat.periodo_academico_id = $1`,
        `g.nivel_academico_id = $2`,
        `mat.estado = 'activo'`,
        `mat.deleted_at IS NULL`,
        `m.estado IN ('pendiente', 'pagado_parcial')`,
        `m.fecha_vencimiento >= $3::date`
      ];
      let queryParams = [periodo_academico_id, nivel_academico_id, fechaCorte];
      let paramCounter = 4;

      if (grado_id) {
        whereConditions.push(`g.id = $${paramCounter}`);
        queryParams.push(grado_id);
        paramCounter++;
      }

      if (paralelo_id) {
        whereConditions.push(`p.id = $${paramCounter}`);
        queryParams.push(paralelo_id);
        paramCounter++;
      }

      const whereClause = whereConditions.join(' AND ');

      // 1. Bloquear y traer exactamente las filas que se van a tocar (evita carreras con pagos simultáneos)
      const selectQuery = `
        SELECT m.id, m.monto_final as monto_anterior, mat.porcentaje_beca
        FROM mensualidad m
        INNER JOIN matricula mat ON m.matricula_id = mat.id
        INNER JOIN paralelo p ON mat.paralelo_id = p.id
        INNER JOIN grado g ON p.grado_id = g.id
        WHERE ${whereClause}
        FOR UPDATE OF m
      `;

      const selectResult = await client.query(selectQuery, queryParams);

      if (selectResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'No hay cuotas no vencidas que cumplan los filtros para ajustar'
        });
      }

      const ids = selectResult.rows.map(r => r.id);

      // 2. Actualizar solo esas filas, recalculando con la beca de cada matrícula
      const updateQuery = `
        UPDATE mensualidad m
        SET monto_final = ROUND($1::numeric * (1 - COALESCE(mat.porcentaje_beca, 0) / 100), 2),
            updated_at = CURRENT_TIMESTAMP
        FROM matricula mat
        WHERE m.matricula_id = mat.id
          AND m.id = ANY($2::int[])
        RETURNING m.id, m.numero_cuota, m.mes_correspondiente, m.monto_final
      `;

      const updateResult = await client.query(updateQuery, [nuevo_monto_base, ids]);

      const montoAnteriorTotal = selectResult.rows.reduce((acc, r) => acc + parseFloat(r.monto_anterior), 0);
      const montoNuevoTotal = updateResult.rows.reduce((acc, r) => acc + parseFloat(r.monto_final), 0);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'ajuste_costo_mensualidad',
        tabla_afectada: 'mensualidad',
        registro_id: null,
        datos_anteriores: { monto_total: montoAnteriorTotal, cantidad: selectResult.rows.length },
        datos_nuevos: { monto_total: montoNuevoTotal, cantidad: updateResult.rows.length, nuevo_monto_base, fecha_corte: fechaCorte },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Ajuste de costo aplicado a ${updateResult.rows.length} cuota(s) no vencidas: Bs ${montoAnteriorTotal.toFixed(2)} → Bs ${montoNuevoTotal.toFixed(2)}`
      });

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Ajuste aplicado a ${updateResult.rows.length} cuota(s)`,
        data: {
          total_cuotas: updateResult.rows.length,
          monto_anterior_total: montoAnteriorTotal,
          monto_nuevo_total: montoNuevoTotal,
          cuotas: updateResult.rows
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al aplicar ajuste de costo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al aplicar ajuste de costo: ' + error.message
      });
    } finally {
      client.release();
    }
  }
}

export {
  CostoMensualidadController,
  MensualidadController,
  PagoMensualidadController,
  PagoAnualCompletoController,
  ReportesPagosController,
  PagoMultipleController,
  PagoDistribuidoController,
  AjusteCostoMensualidadController
}