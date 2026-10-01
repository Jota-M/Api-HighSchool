// controllers/verificarReciboController.js
import { PagoMensualidad } from '../models/Payment.js';

class VerificarReciboController {
  /**
   * Verificar la autenticidad y estado de un recibo de pago mediante su código
   * GET /api/publico/verificar-recibo/:codigo
   */
  static async verificar(req, res) {
    try {
      const { codigo } = req.params;

      if (!codigo || codigo.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'El código de pago es requerido'
        });
      }

      const pago = await PagoMensualidad.findByCodigo(codigo.trim().toUpperCase());

      if (!pago) {
        return res.status(404).json({
          success: false,
          valido: false,
          message: 'El código de recibo no corresponde a ningún pago registrado en el sistema'
        });
      }

      const pagosGrupo = pago.pagos_grupo && pago.pagos_grupo.length > 0 ? pago.pagos_grupo : [pago];
      const montoTotal = pagosGrupo.reduce((acc, p) => acc + parseFloat(p.monto_pagado || 0), 0);

      const items = pagosGrupo.map(p => ({
        id: p.id,
        codigo_pago: p.codigo_pago,
        mes_correspondiente: p.mes_correspondiente,
        numero_cuota: p.numero_cuota,
        monto_pagado: parseFloat(p.monto_pagado),
        estudiante_codigo: p.estudiante_codigo,
        estudiante_nombre: `${p.nombres || ''} ${p.apellidos || ''}`.trim(),
        grado: p.grado_nombre,
        paralelo: p.paralelo_nombre
      }));

      return res.json({
        success: true,
        valido: !pago.anulado,
        data: {
          codigo_pago: pago.codigo_pago,
          fecha_pago: pago.fecha_pago,
          estado: pago.anulado ? 'ANULADO' : 'PAGADO / VÁLIDO',
          anulado: pago.anulado,
          motivo_anulacion: pago.observaciones && pago.anulado ? pago.observaciones : null,
          metodo_pago: pago.metodo_pago,
          numero_comprobante: pago.numero_comprobante,
          numero_factura: pago.numero_factura,
          monto_total: montoTotal,
          moneda: 'BOB (Bs.)',
          estudiante: {
            codigo: pago.estudiante_codigo,
            nombre_completo: `${pago.nombres || ''} ${pago.apellidos || ''}`.trim(),
            matricula: pago.numero_matricula,
            grado: pago.grado_nombre || 'N/A',
            paralelo: pago.paralelo_nombre || 'N/A',
            periodo: pago.periodo_nombre || 'Gestión Actual'
          },
          items,
          emisor: {
            institucion: 'Unidad Educativa Particular La Voz de Cristo',
            ciudad: 'Potosí, Bolivia',
            tipo_sistema: 'Sistema de Gestión Académica y Cobranzas'
          }
        }
      });

    } catch (error) {
      console.error('Error al verificar recibo:', error);
      return res.status(500).json({
        success: false,
        message: 'Error interno al consultar la verificación del recibo'
      });
    }
  }
}

export default VerificarReciboController;
