// controllers/pagoMensualidadPDFController.js - SISTEMA 10 MESES - CON SOPORTE PAGO ANUAL
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { PagoMensualidad } from '../models/Payment.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { pool } from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PagoMensualidadPDFController {
  /**
   * Generar PDF para un pago individual
   * GET /api/pago-mensualidad/:id/pdf
   */
  static async generarPDFIndividual(req, res) {
    try {
      const { id } = req.params;
      const { nombre_entrega, ci_entrega, quien_recibe, preview } = req.query;

      const pago = await PagoMensualidad.findById(id);

      if (!pago) {
        return res.status(404).json({
          success: false,
          message: 'Pago no encontrado'
        });
      }

      const datosEntrega = {
        nombre: nombre_entrega || 'Sin especificar',
        ci: ci_entrega || 'N/A'
      };

      const personasQueReciben = {
        patricia: { nombre: 'Patricia Ramírez Villca', ci: '5070770' },
        oswaldo: { nombre: 'Oswaldo Esteban Bohorquez Velasco', ci: '5071886' }
      };

      const datosRecibe = personasQueReciben[quien_recibe] || personasQueReciben.patricia;

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const disposition = preview === 'true' ? 'inline' : 'attachment';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename=Recibo_${pago.codigo_pago}.pdf`
      );

      doc.pipe(res);

      await PagoMensualidadPDFController.generatePDFContent(
        doc,
        [pago],
        datosEntrega,
        datosRecibe
      );

      doc.end();

      if (req.user) {
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: req.user.id,
          accion: preview === 'true' ? 'ver_pdf_pago' : 'generar_pdf_pago',
          modulo: 'pago_mensualidad',
          tabla_afectada: 'pago_mensualidad',
          registro_id: parseInt(id),
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'exitoso',
          mensaje: `PDF generado para pago ${pago.codigo_pago}`
        });
      }

    } catch (error) {
      console.error('Error al generar PDF:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error al generar PDF: ' + error.message
        });
      }
    }
  }

  /**
   * Generar PDF público a partir del código de pago
   * GET /api/publico/recibo-pdf/:codigo
   */
  static async generarPDFPublicoPorCodigo(req, res) {
    try {
      const { codigo } = req.params;
      const { preview = 'true' } = req.query;

      const pago = await PagoMensualidad.findByCodigo(codigo);

      if (!pago) {
        return res.status(404).json({
          success: false,
          message: 'Recibo de pago no encontrado'
        });
      }

      const datosEntrega = {
        nombre: pago.nombre_entrega || `${pago.nombres} ${pago.apellidos}`,
        ci: pago.ci_entrega || 'N/A'
      };

      const datosRecibe = {
        nombre: 'Patricia Ramírez Villca',
        ci: '5070770'
      };

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const disposition = preview === 'false' ? 'attachment' : 'inline';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename=Recibo_${pago.codigo_pago}.pdf`
      );

      doc.pipe(res);

      const pagosArray = pago.pagos_grupo && pago.pagos_grupo.length > 0 ? pago.pagos_grupo : [pago];

      await PagoMensualidadPDFController.generatePDFContent(
        doc,
        pagosArray,
        datosEntrega,
        datosRecibe
      );

      doc.end();
    } catch (error) {
      console.error('Error al generar PDF público:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error al generar PDF: ' + error.message
        });
      }
    }
  }

  /**
   * Generar PDF para múltiples pagos
   * POST /api/pago-mensualidad/pdf-multiple
   */
  static async generarPDFMultiple(req, res) {
    try {
      const { pago_ids, nombre_entrega, ci_entrega, quien_recibe, preview } = req.body;

      if (!pago_ids || !Array.isArray(pago_ids) || pago_ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar al menos un ID de pago'
        });
      }

      const pagosPromises = pago_ids.map(id => PagoMensualidad.findById(id));
      const pagos = await Promise.all(pagosPromises);
      const pagosValidos = pagos.filter(p => p !== null && p !== undefined);

      if (pagosValidos.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No se encontraron pagos válidos'
        });
      }

      const datosEntrega = {
        nombre: nombre_entrega || 'Sin especificar',
        ci: ci_entrega || 'N/A'
      };

      const personasQueReciben = {
        patricia: { nombre: 'Patricia Ramírez Villca', ci: '5070770' },
        oswaldo: { nombre: 'Oswaldo Esteban Bohorquez Velasco', ci: '5071886' }
      };

      const datosRecibe = personasQueReciben[quien_recibe] || personasQueReciben.patricia;

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 30, bottom: 30, left: 40, right: 40 }
      });

      const year = new Date().getFullYear();
      const disposition = preview ? 'inline' : 'attachment';

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename=Recibo_Multiple_${year}_${pagosValidos.length}pagos.pdf`
      );

      doc.pipe(res);

      await PagoMensualidadPDFController.generatePDFContent(
        doc,
        pagosValidos,
        datosEntrega,
        datosRecibe
      );

      doc.end();

      if (req.user) {
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: req.user.id,
          accion: preview ? 'ver_pdf_pago_multiple' : 'generar_pdf_pago_multiple',
          modulo: 'pago_mensualidad',
          tabla_afectada: 'pago_mensualidad',
          registro_id: pagosValidos[0].id,
          datos_nuevos: { cantidad_pagos: pagosValidos.length, pago_ids },
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'exitoso',
          mensaje: `PDF múltiple generado para ${pagosValidos.length} pago(s) - Sistema 10 meses`
        });
      }

    } catch (error) {
      console.error('Error al generar PDF múltiple:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error al generar PDF: ' + error.message
        });
      }
    }
  }
  static async generarPDFDirecto(req, res) {
    try {
      const { pagos, nombre_entrega, ci_entrega, quien_recibe, preview } = req.body;

      if (!pagos || !Array.isArray(pagos) || pagos.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar al menos un pago'
        });
      }

      const datosEntrega = {
        nombre: nombre_entrega || 'Sin especificar',
        ci: ci_entrega || 'N/A'
      };

      const personasQueReciben = {
        patricia: { nombre: 'Patricia Ramírez Villca', ci: '5070770' },
        oswaldo: { nombre: 'Oswaldo Esteban Bohorquez Velasco', ci: '5071886' }
      };

      const datosRecibe = personasQueReciben[quien_recibe] || personasQueReciben.patricia;

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 30, bottom: 30, left: 40, right: 40 }
      });

      const year = new Date().getFullYear();
      const disposition = preview ? 'inline' : 'attachment';

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename=Recibo_${pagos[0].codigo_pago}.pdf`
      );

      doc.pipe(res);

      await PagoMensualidadPDFController.generatePDFContent(
        doc,
        pagos, // Usar los datos directamente
        datosEntrega,
        datosRecibe
      );

      doc.end();

    } catch (error) {
      console.error('Error al generar PDF directo:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error al generar PDF: ' + error.message
        });
      }
    }
  }

  /**
   * 🔧 OPTIMIZADO PARA MEDIA HOJA - Sistema 10 Meses - CON SOPORTE PAGO ANUAL
   */
  static async generatePDFContent(doc, todosPagos, datosEntrega, datosRecibe) {
    const darkBlue = '#1e3a8a';
    const yellowBorder = '#fbbf24';
    const darkGray = '#1f2937';
    const lightGray = '#6b7280';

    // 🆕 Detectar si es pago anual
    const esPagoAnual = todosPagos.length === 1 &&
      (todosPagos[0].mes_correspondiente === 'Pago Anual Completo (10 meses)' ||
        !todosPagos[0].numero_cuota);

    // Agrupar pagos por estudiante
    const pagosPorEstudiante = {};
    todosPagos.forEach(pago => {
      const key = pago.estudiante_codigo;
      if (!pagosPorEstudiante[key]) {
        pagosPorEstudiante[key] = {
          estudiante_codigo: pago.estudiante_codigo,
          nombres: pago.nombres,
          apellidos: pago.apellidos,
          pagos: []
        };
      }
      pagosPorEstudiante[key].pagos.push(pago);
    });

    const estudiantes = Object.values(pagosPorEstudiante);
    const esMultiEstudiante = estudiantes.length > 1;
    const montoTotal = todosPagos.reduce((sum, p) => sum + parseFloat(p.monto_pagado), 0);

    // ═══════════════════════════════════════════════════
    // MARCA DE AGUA
    // ═══════════════════════════════════════════════════
    const watermarkPath = path.join(__dirname, '../public/logo.png');
    if (fs.existsSync(watermarkPath)) {
      try {
        doc.save();
        doc.opacity(0.04).image(watermarkPath, 200, 80, { width: 180, height: 180 });
        doc.restore();
      } catch (error) {
        console.log('Marca de agua no cargada');
      }
    }

    // ═══════════════════════════════════════════════════
    // HEADER ULTRA COMPACTO
    // ═══════════════════════════════════════════════════
    doc.rect(40, 30, 532, 4).fill(darkBlue);
    doc.rect(40, 34, 532, 2).fill(yellowBorder);

    const logoPath = path.join(__dirname, '../public/logo.png');
    let logoX = 50;
    if (fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, 50, 42, { width: 28, height: 28 });
        logoX = 85;
      } catch (error) { }
    }

    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkBlue)
      .text('U.E.P. La Voz de Cristo', logoX, 44);
    doc.fontSize(6).font('Helvetica').fillColor(lightGray)
      .text('Potosí - Bolivia | Sistema 10 Meses', logoX, 56);

    const codigoRecibo = todosPagos[0].codigo_pago.split('-')[1];
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#ef4444')
      .text(`N° ${codigoRecibo}-${String(todosPagos[0].id).padStart(4, '0')}`, 480, 44);

    // ═══════════════════════════════════════════════════
    // TÍTULO Y FECHA/MONTO
    // ═══════════════════════════════════════════════════
    let y = 78;

    // 🆕 Título dinámico según tipo de pago
    let titulo = 'RECIBO DE PAGO';
    if (esPagoAnual) {
      titulo = 'RECIBO PAGO ANUAL COMPLETO';
    } else if (esMultiEstudiante) {
      titulo = 'RECIBO PAGO MÚLTIPLE';
    }

    doc.fontSize(11).font('Helvetica-Bold').fillColor(darkBlue)
      .text(titulo, 40, y, { align: 'center', width: 532 });

    // 🆕 Badge especial para pago anual
    if (esPagoAnual) {
      y += 14;
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#10b981')
        .text('★ PAGO COMPLETO - 1 MES GRATIS ★', 40, y, { align: 'center', width: 532 });
    }

    y += 16;

    doc.moveTo(180, y).lineTo(432, y).lineWidth(1).strokeColor(yellowBorder).stroke();
    y += 10;

    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Fecha:', 50, y);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkGray)
      .text(new Date(todosPagos[0].fecha_pago).toLocaleDateString('es-BO', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      }), 80, y);

    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Monto:', 430, y);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(darkBlue)
      .text(`Bs. ${montoTotal.toFixed(2)}`, 465, y);

    y += 18;

    // ═══════════════════════════════════════════════════
    // RECIBÍ DE
    // ═══════════════════════════════════════════════════
    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Recibí de:', 50, y);
    y += 10;

    if (esMultiEstudiante) {
      doc.fontSize(8).font('Helvetica-Bold').fillColor(darkGray)
        .text('Padres/Tutores de los estudiantes', 50, y);
    } else {
      const nombreCompleto = estudiantes[0].apellidos
        ? `${estudiantes[0].nombres} ${estudiantes[0].apellidos}`
        : estudiantes[0].nombres;
      doc.fontSize(8).font('Helvetica-Bold').fillColor(darkGray)
        .text(nombreCompleto, 50, y, { width: 522 });
    }

    y += 16;

    // ═══════════════════════════════════════════════════
    // LA SUMA DE
    // ═══════════════════════════════════════════════════
    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('La suma de:', 50, y);
    y += 10;

    const montoEnTexto = this.numeroATexto(montoTotal);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkGray)
      .text(montoEnTexto, 50, y, { width: 522 });

    y += 16;

    // ═══════════════════════════════════════════════════
    // POR CONCEPTO DE
    // ═══════════════════════════════════════════════════
    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Por concepto de:', 50, y);
    y += 10;

    // 🆕 Concepto dinámico
    const concepto = esPagoAnual
      ? 'Pago Anual Completo - 10 Meses de Mensualidades Escolares (con 10% descuento)'
      : 'Pago de Mensualidades Escolares (Sistema 10 Meses)';

    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkGray)
      .text(concepto, 50, y, { width: 522 });

    y += esPagoAnual ? 18 : 14;

    // ═══════════════════════════════════════════════════
    // DETALLES DE PAGOS - TABLA COMPACTA
    // ═══════════════════════════════════════════════════

    if (esMultiEstudiante || !esPagoAnual) {
      doc.fontSize(7).font('Helvetica-Bold').fillColor(lightGray)
        .text('Estudiante', 55, y)
        .text('Mensualidad', 250, y)
        .text('Monto', 500, y);
      y += 12;
      doc.moveTo(50, y).lineTo(572, y).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
      y += 5;
    }

    estudiantes.forEach((est, idx) => {
      const nombreCompleto = est.apellidos
        ? `${est.nombres.split(' ')[0]} ${est.apellidos.split(' ')[0]}`
        : est.nombres.split(' ')[0];

      if ((esMultiEstudiante || !esPagoAnual) && idx > 0) {
        y += 3;
      }

      est.pagos.forEach((pago, pagoIdx) => {
        const estiloNombre = pagoIdx === 0 && (esMultiEstudiante || !esPagoAnual);
        const xNombre = (esMultiEstudiante || !esPagoAnual) ? 55 : 60;
        const xMes = (esMultiEstudiante || !esPagoAnual) ? 250 : 55;
        const xMonto = 500;

        if (estiloNombre && !esPagoAnual) {
          doc.fontSize(7).font('Helvetica-Bold').fillColor(darkGray)
            .text(`${nombreCompleto} (${est.estudiante_codigo})`, xNombre, y, { width: 180 });
        }

        // 🆕 Formato de mes dinámico
        let mesTexto;
        if (esPagoAnual) {
          mesTexto = 'Año Completo - 10 Meses (Febrero a Noviembre)';
        } else if (pago.numero_cuota) {
          mesTexto = `${pago.mes_correspondiente} - Cuota ${pago.numero_cuota}/10`;
        } else {
          mesTexto = pago.mes_correspondiente;
        }

        if (esPagoAnual) {
          // Para pago anual, mostrar en formato destacado
          doc.fontSize(8).font('Helvetica-Bold').fillColor(darkGray)
            .text(mesTexto, 50, y, { width: 420 });
        } else {
          doc.fontSize(7).font('Helvetica').fillColor(darkGray)
            .text((esMultiEstudiante || !esPagoAnual) ? mesTexto : `• ${mesTexto}`, xMes, y);
        }

        doc.fontSize(7).font('Helvetica-Bold').fillColor(darkBlue)
          .text(`Bs. ${parseFloat(pago.monto_pagado).toFixed(2)}`, xMonto, y);

        y += esPagoAnual ? 14 : 10;
      });
    });

    y += 5;

    // 🆕 Nota especial para pago anual
    if (esPagoAnual) {
      doc.fontSize(6).font('Helvetica-Oblique').fillColor('#10b981')
        .text('✓ Este pago incluye descuento del 10% por pago completo', 50, y);
      y += 12;
    }

    // ═══════════════════════════════════════════════════
    // MÉTODO DE PAGO
    // ═══════════════════════════════════════════════════
    const metodoPagoTexto = {
      'transferencia': 'Transferencia',
      'efectivo': 'Efectivo',
      'qr': 'QR',
      'tarjeta': 'Tarjeta'
    };

    doc.fontSize(6).font('Helvetica').fillColor(lightGray)
      .text(`Método: ${metodoPagoTexto[todosPagos[0].metodo_pago] || todosPagos[0].metodo_pago}`, 50, y);

    if (todosPagos[0].numero_comprobante) {
      doc.text(` | Comprobante: ${todosPagos[0].numero_comprobante}`, { continued: true });
    }

    y += 14;

    // ═══════════════════════════════════════════════════
    // TOTALES EN CAJAS
    // ═══════════════════════════════════════════════════
    const boxWidth = 110;
    const boxHeight = 25;
    const boxY = y;

    doc.rect(50, boxY, boxWidth, boxHeight).strokeColor(lightGray).lineWidth(0.5).stroke();
    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Total', 60, boxY + 5);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(darkBlue)
      .text(`Bs. ${montoTotal.toFixed(2)}`, 60, boxY + 14);

    doc.rect(175, boxY, boxWidth, boxHeight).strokeColor(lightGray).lineWidth(0.5).stroke();
    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('A cuenta', 185, boxY + 5);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(darkGray)
      .text(`Bs. ${montoTotal.toFixed(2)}`, 185, boxY + 14);

    doc.rect(300, boxY, boxWidth, boxHeight).strokeColor(lightGray).lineWidth(0.5).stroke();
    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Saldo', 310, boxY + 5);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#10b981')
      .text('Bs. 0.00', 310, boxY + 14);

    y = boxY + boxHeight + 12;

    // ═══════════════════════════════════════════════════
    // DATOS DE ESTUDIANTES COMPACTOS
    // ═══════════════════════════════════════════════════
    doc.fontSize(7).font('Helvetica-Bold').fillColor(darkBlue)
      .text(esMultiEstudiante ? 'ESTUDIANTES:' : 'ESTUDIANTE:', 50, y);
    y += 10;

    estudiantes.forEach((est, idx) => {
      const nombreCompleto = est.apellidos ? `${est.nombres} ${est.apellidos}` : est.nombres;
      doc.fontSize(6).font('Helvetica').fillColor(darkGray)
        .text(
          esMultiEstudiante
            ? `${idx + 1}. ${nombreCompleto} (${est.estudiante_codigo})`
            : `${nombreCompleto} - Código: ${est.estudiante_codigo}`,
          50,
          y
        );
      y += 8;
    });

    y += 6;

    // ═══════════════════════════════════════════════════
    // FIRMAS CON CI Y QR DE VERIFICACIÓN
    // ═══════════════════════════════════════════════════
    const firmaY = y;

    // LADO IZQUIERDO - ENTREGUÉ CONFORME
    doc.fontSize(6).font('Helvetica-Oblique').fillColor(lightGray)
      .text('ENTREGUÉ CONFORME', 70, firmaY);

    doc.moveTo(70, firmaY + 30)
      .lineTo(200, firmaY + 30)
      .lineWidth(0.5)
      .strokeColor(darkGray)
      .stroke();

    doc.fontSize(6).font('Helvetica').fillColor(lightGray)
      .text('Nombre:', 70, firmaY + 35);

    doc.fontSize(7).font('Helvetica-Bold').fillColor(darkGray)
      .text(datosEntrega.nombre, 95, firmaY + 35, { width: 110 });

    doc.fontSize(6).font('Helvetica').fillColor(lightGray)
      .text('C.I.:', 70, firmaY + 50);

    doc.fontSize(7).font('Helvetica-Bold').fillColor(darkGray)
      .text(datosEntrega.ci, 95, firmaY + 50);

    // CENTRO - QR DE VERIFICACIÓN DIGITAL
    try {
      const codigoVerif = todosPagos[0]?.codigo_pago || '';
      if (codigoVerif) {
        const frontendBaseUrl = process.env.FRONTEND_URL || 'https://uepclavozdecristo.site';
        const urlVerificacion = `${frontendBaseUrl}/verificar-recibo/${codigoVerif}`;
        const qrBuffer = await QRCode.toBuffer(urlVerificacion, {
          width: 54,
          margin: 1,
          color: {
            dark: darkBlue,
            light: '#ffffff'
          }
        });

        const qrX = 279;
        const qrY = firmaY - 5;

        // Marco del QR
        doc.save();
        doc.rect(qrX - 2, qrY - 2, 58, 58)
          .lineWidth(0.8)
          .strokeColor(yellowBorder)
          .stroke();
        doc.restore();

        doc.image(qrBuffer, qrX, qrY, { width: 54, height: 54 });

        doc.fontSize(5).font('Helvetica-Bold').fillColor(darkBlue)
          .text('VERIFICAR RECIBO', qrX - 20, qrY + 56, { width: 94, align: 'center' });
        doc.fontSize(4.5).font('Helvetica').fillColor(lightGray)
          .text('Escanee con su celular', qrX - 20, qrY + 63, { width: 94, align: 'center' });
      }
    } catch (qrErr) {
      console.error('Error generando QR de recibo:', qrErr);
    }

    // LADO DERECHO - RECIBÍ CONFORME
    doc.fontSize(6).font('Helvetica-Oblique').fillColor(lightGray)
      .text('RECIBÍ CONFORME', 380, firmaY);

    doc.moveTo(380, firmaY + 30)
      .lineTo(510, firmaY + 30)
      .lineWidth(0.5)
      .strokeColor(darkGray)
      .stroke();

    doc.fontSize(6).font('Helvetica').fillColor(lightGray)
      .text('Nombre:', 380, firmaY + 35);

    doc.fontSize(7).font('Helvetica-Bold').fillColor(darkGray)
      .text(datosRecibe.nombre, 405, firmaY + 35, { width: 110 });

    doc.fontSize(6).font('Helvetica').fillColor(lightGray)
      .text('C.I.:', 380, firmaY + 50);

    doc.fontSize(7).font('Helvetica-Bold').fillColor(darkGray)
      .text(datosRecibe.ci, 405, firmaY + 50);

    // ═══════════════════════════════════════════════════
    // PIE DE PÁGINA
    // ═══════════════════════════════════════════════════
    const footerY = 380;

    const tipoRecibo = esPagoAnual ? 'Pago Anual Completo' : 'Sistema 10 Meses';
    doc.fontSize(5).font('Helvetica').fillColor(lightGray)
      .text(
        `${tipoRecibo} | Generado: ${new Date().toLocaleDateString('es-BO')} ${new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}`,
        40,
        footerY,
        { align: 'center', width: 532 }
      );

    doc.rect(40, 393, 532, 2).fill(yellowBorder);
    doc.rect(40, 395, 532, 4).fill(darkBlue);
  }

  // Función auxiliar para convertir números a texto
  static numeroATexto(numero) {
    const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const especiales = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
    const decenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    const entero = Math.floor(numero);
    const decimal = Math.round((numero - entero) * 100);

    let texto = '';

    if (entero === 0) {
      texto = 'CERO';
    } else if (entero === 100) {
      texto = 'CIEN';
    } else if (entero < 10) {
      texto = unidades[entero];
    } else if (entero < 20) {
      texto = especiales[entero - 10];
    } else if (entero < 100) {
      const dec = Math.floor(entero / 10);
      const uni = entero % 10;
      texto = decenas[dec];
      if (uni > 0) {
        texto += (entero < 30 && entero > 20) ? 'I' : ' Y ';
        texto += unidades[uni];
      }
    } else if (entero < 1000) {
      const cen = Math.floor(entero / 100);
      const resto = entero % 100;
      texto = centenas[cen];
      if (resto > 0) {
        texto += ' ' + this.numeroATexto(resto).split(' ')[0];
      }
    } else if (entero < 1000000) {
      const miles = Math.floor(entero / 1000);
      const resto = entero % 1000;
      if (miles === 1) {
        texto = 'MIL';
      } else {
        texto = this.numeroATexto(miles).split(' ')[0] + ' MIL';
      }
      if (resto > 0) {
        texto += ' ' + this.numeroATexto(resto).split(' ')[0];
      }
    }

    texto = `${texto} BOLIVIANOS ${decimal.toString().padStart(2, '0')}/100`;

    return texto;
  }

  /**
   * Comprobante digital para el PADRE - GET /api/padre-p/pago/:id/recibo-pdf
   * Resuelve automáticamente todo el grupo de cuotas que comparten
   * transaccion_id (pago agrupado / familiar) y arma un solo PDF.
   */
  static async generarReciboPadre(req, res) {
    try {
      const { id } = req.params;

      // 1. Verificar que el pago pertenece a un hijo del padre autenticado
      //    (mismo join que ya usa solicitarFactura — la verificación
      //    anterior contra pago.padre_usuario_id no hacía nada porque
      //    ese campo nunca viene en el SELECT de PagoMensualidad.findById)
      const resultVerif = await pool.query(
        `SELECT pm.id, pm.transaccion_id
           FROM pago_mensualidad pm
           INNER JOIN mensualidad m       ON pm.mensualidad_id    = m.id
           INNER JOIN matricula mat       ON m.matricula_id       = mat.id
           INNER JOIN estudiante e        ON mat.estudiante_id    = e.id
           INNER JOIN estudiante_tutor et ON e.id                 = et.estudiante_id
           INNER JOIN padre_familia pf    ON et.padre_familia_id  = pf.id
           WHERE pm.id         = $1
             AND pf.usuario_id = $2
             AND pm.anulado    = false`,
        [id, req.user?.id]
      );

      if (resultVerif.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Acceso denegado' });
      }

      const { transaccion_id } = resultVerif.rows[0];

      // 2. Resolver el grupo completo de cuotas (o solo esta, si no
      //    comparte transacción con ninguna otra)
      let idsGrupo = [id];
      if (transaccion_id) {
        const resultHermanos = await pool.query(
          `SELECT id FROM pago_mensualidad
             WHERE transaccion_id = $1 AND anulado = false
             ORDER BY id ASC`,
          [transaccion_id]
        );
        if (resultHermanos.rows.length > 1) {
          idsGrupo = resultHermanos.rows.map(r => r.id);
        }
      }

      // 3. Traer el detalle completo de cada cuota del grupo
      const pagos = (await Promise.all(idsGrupo.map(pid => PagoMensualidad.findById(pid))))
        .filter(Boolean);

      if (pagos.length === 0) {
        return res.status(404).json({ success: false, message: 'Pago no encontrado' });
      }

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 30, bottom: 30, left: 40, right: 40 },
      });

      const nombreArchivo = pagos.length > 1
        ? `Comprobante_${pagos[0].codigo_pago}_y_${pagos.length - 1}mas.pdf`
        : `Comprobante_${pagos[0].codigo_pago}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=${nombreArchivo}`);

      doc.pipe(res);
      // ✅ FIX: la clase se llama PagoMensualidadPDFController (no "...Padre...")
      PagoMensualidadPDFController.generarContenido(doc, pagos);
      doc.end();

    } catch (error) {
      console.error('Error al generar recibo para padre:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Error al generar recibo: ' + error.message });
      }
    }
  }

  // pagos: array de 1 o más filas de PagoMensualidad.findById (todas las
  // cuotas del grupo, o solo una si el pago no comparte transaccion_id)
  static generarContenido(doc, pagos) {
    // ─── Paleta (misma que el admin) ──────────────────────────────────────────
    const darkBlue = '#1e3a8a';
    const yellowBorder = '#fbbf24';
    const darkGray = '#1f2937';
    const lightGray = '#6b7280';
    const green = '#10b981';

    const pagoPrincipal = pagos[0];
    const esGrupo = pagos.length > 1;
    const montoTotal = pagos.reduce((sum, p) => sum + parseFloat(p.monto_pagado), 0);

    // Fecha del comprobante: la más reciente del grupo
    const fechaMasReciente = pagos.reduce((max, p) => {
      const f = p.fecha_pago ? new Date(p.fecha_pago).getTime() : 0;
      return f > max ? f : max;
    }, 0);

    // ─── Marca de agua ────────────────────────────────────────────────────────
    const watermarkPath = path.join(__dirname, '../public/logo.png');
    if (fs.existsSync(watermarkPath)) {
      try {
        doc.save();
        doc.opacity(0.04).image(watermarkPath, 200, 80, { width: 180, height: 180 });
        doc.restore();
      } catch (_) { }
    }

    // ─── Header ───────────────────────────────────────────────────────────────
    doc.rect(40, 30, 532, 4).fill(darkBlue);
    doc.rect(40, 34, 532, 2).fill(yellowBorder);

    const logoPath = path.join(__dirname, '../public/logo.png');
    let logoX = 50;
    if (fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, 50, 42, { width: 28, height: 28 });
        logoX = 85;
      } catch (_) { }
    }

    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkBlue)
      .text('U.E.P. La Voz de Cristo', logoX, 44);
    doc.fontSize(6).font('Helvetica').fillColor(lightGray)
      .text('Potosí - Bolivia | Sistema 10 Meses', logoX, 56);

    const codigoShort = pagoPrincipal.codigo_pago.split('-')[1];
    const referenciaHeader = esGrupo
      ? `N° ${codigoShort}-${String(pagoPrincipal.id).padStart(4, '0')} (+${pagos.length - 1})`
      : `N° ${codigoShort}-${String(pagoPrincipal.id).padStart(4, '0')}`;
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#ef4444')
      .text(referenciaHeader, 480, 44);

    // ─── Título ───────────────────────────────────────────────────────────────
    let y = 78;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(darkBlue)
      .text('COMPROBANTE DE PAGO DIGITAL', 40, y, { align: 'center', width: 532 });

    y += 14;
    // Badge "Verificado" — reemplaza las firmas
    doc.fontSize(7).font('Helvetica-Bold').fillColor(green)
      .text(
        esGrupo ? `✓ PAGO REGISTRADO Y VERIFICADO — ${pagos.length} CUOTAS` : '✓ PAGO REGISTRADO Y VERIFICADO',
        40, y, { align: 'center', width: 532 }
      );

    y += 16;
    doc.moveTo(180, y).lineTo(432, y).lineWidth(1).strokeColor(yellowBorder).stroke();
    y += 10;

    // Fecha y monto en la misma línea
    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Fecha:', 50, y);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkGray)
      .text(
        fechaMasReciente
          ? new Date(fechaMasReciente).toLocaleDateString('es-BO', {
            day: '2-digit', month: '2-digit', year: 'numeric',
          })
          : '—',
        80, y
      );
    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Monto:', 430, y);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(darkBlue)
      .text(`Bs. ${montoTotal.toFixed(2)}`, 460, y);

    y += 18;

    // ─── Datos del estudiante ─────────────────────────────────────────────────
    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Estudiante:', 50, y);
    y += 10;
    const nombreCompleto = pagoPrincipal.apellidos
      ? `${pagoPrincipal.nombres} ${pagoPrincipal.apellidos}`
      : pagoPrincipal.nombres;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(darkGray)
      .text(nombreCompleto, 50, y, { width: 532 });
    y += 12;
    doc.fontSize(7).font('Helvetica').fillColor(lightGray)
      .text(`Código: ${pagoPrincipal.estudiante_codigo}`, 50, y);
    y += 18;

    // ─── Concepto ─────────────────────────────────────────────────────────────
    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Por concepto de:', 50, y);
    y += 10;

    const esPagoAnual = pagos.length === 1 &&
      (pagoPrincipal.mes_correspondiente === 'Pago Anual Completo (10 meses)' || !pagoPrincipal.numero_cuota);
    const concepto = esPagoAnual
      ? 'Pago Anual Completo - 10 Meses de Mensualidades Escolares (con 10% descuento)'
      : esGrupo
        ? `Pago de ${pagos.length} Mensualidades Escolares (Sistema 10 Meses)`
        : 'Pago de Mensualidades Escolares (Sistema 10 Meses)';
    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkGray)
      .text(concepto, 50, y, { width: 432 });
    y += 18;

    // ─── Detalle del pago — una fila por cuota ─────────────────────────────────
    doc.fontSize(7).font('Helvetica-Bold').fillColor(lightGray)
      .text('Mensualidad', 50, y)
      .text('Monto', 500, y);
    y += 12;
    doc.moveTo(50, y).lineTo(572, y).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
    y += 6;

    for (const pago of pagos) {
      const montoFila = parseFloat(pago.monto_pagado);
      const mesTexto = esPagoAnual
        ? 'Año Completo - 10 Meses (Febrero a Noviembre)'
        : pago.numero_cuota
          ? `${pago.mes_correspondiente} - Cuota ${pago.numero_cuota}/10`
          : pago.mes_correspondiente;

      doc.fontSize(7).font('Helvetica').fillColor(darkGray).text(mesTexto, 50, y);
      doc.fontSize(7).font('Helvetica-Bold').fillColor(darkBlue)
        .text(`Bs. ${montoFila.toFixed(2)}`, 500, y);
      y += 14;
    }

    if (esGrupo) {
      doc.moveTo(50, y).lineTo(572, y).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
      y += 8;
      doc.fontSize(7).font('Helvetica-Bold').fillColor(lightGray).text('Total', 50, y);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(darkBlue)
        .text(`Bs. ${montoTotal.toFixed(2)}`, 500, y);
      y += 14;
    }

    if (esPagoAnual) {
      doc.fontSize(6).font('Helvetica-Oblique').fillColor(green)
        .text('✓ Incluye descuento del 10% por pago anual completo', 50, y);
      y += 12;
    }

    // ─── Método de pago ───────────────────────────────────────────────────────
    const metodoPagoTexto = {
      transferencia: 'Transferencia Bancaria',
      efectivo: 'Efectivo',
      qr: 'Pago QR',
      tarjeta: 'Tarjeta',
    };
    doc.fontSize(6).font('Helvetica').fillColor(lightGray)
      .text(`Método de pago: ${metodoPagoTexto[pagoPrincipal.metodo_pago] || pagoPrincipal.metodo_pago}`, 50, y);
    if (pagoPrincipal.numero_comprobante) {
      doc.text(` | Comprobante: ${pagoPrincipal.numero_comprobante}`, { continued: true });
    }
    y += 14;

    const monto = montoTotal;

    // ─── Cajas de totales ─────────────────────────────────────────────────────
    const boxY = y;
    const boxH = 25;

    doc.rect(50, boxY, 110, boxH).strokeColor(lightGray).lineWidth(0.5).stroke();
    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Total pagado', 60, boxY + 5);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(darkBlue)
      .text(`Bs. ${monto.toFixed(2)}`, 60, boxY + 14);

    doc.rect(175, boxY, 110, boxH).strokeColor(lightGray).lineWidth(0.5).stroke();
    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Saldo pendiente', 185, boxY + 5);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(green).text('Bs. 0.00', 185, boxY + 14);

    y = boxY + boxH + 18;

    // ─── Monto en texto ───────────────────────────────────────────────────────
    doc.fontSize(6).font('Helvetica').fillColor(lightGray).text('Monto en texto:', 50, y);
    y += 9;
    // ✅ FIX: la clase se llama PagoMensualidadPDFController (no "...Padre...")
    doc.fontSize(7).font('Helvetica-Bold').fillColor(darkGray)
      .text(PagoMensualidadPDFController.numeroATexto(monto), 50, y, { width: 522 });
    y += 18;

    // ─── Sello digital (reemplaza las firmas) ─────────────────────────────────
    // Caja verde redondeada centrada — indica autenticidad sin necesitar firma física
    const selloW = 260;
    const selloH = 52;
    const selloX = (612 - selloW) / 2; // centrado en página LETTER
    const selloY = y;

    doc.roundedRect(selloX, selloY, selloW, selloH, 8)
      .strokeColor(green).lineWidth(1).stroke();

    doc.fontSize(8).font('Helvetica-Bold').fillColor(green)
      .text('COMPROBANTE DIGITAL VÁLIDO', selloX, selloY + 7, { width: selloW, align: 'center' });

    doc.fontSize(6).font('Helvetica').fillColor(lightGray)
      .text(
        `Generado: ${new Date().toLocaleDateString('es-BO')} ${new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}`,
        selloX, selloY + 20, { width: selloW, align: 'center' }
      );

    doc.fontSize(6).font('Helvetica').fillColor(lightGray)
      .text(
        esGrupo
          ? `Ref: ${pagoPrincipal.codigo_pago} +${pagos.length - 1} más | ID: ${String(pagoPrincipal.id).padStart(6, '0')}`
          : `Ref: ${pagoPrincipal.codigo_pago} | ID: ${String(pagoPrincipal.id).padStart(6, '0')}`,
        selloX, selloY + 32, { width: selloW, align: 'center' }
      );

    // Nota informativa debajo del sello
    y = selloY + selloH + 10;
    doc.fontSize(5.5).font('Helvetica-Oblique').fillColor(lightGray)
      .text(
        'Este comprobante es generado automáticamente por el sistema LVC. No requiere firma física.',
        40, y, { align: 'center', width: 532 }
      );

    // ─── Footer ───────────────────────────────────────────────────────────────
    doc.fontSize(5).font('Helvetica').fillColor(lightGray)
      .text(
        `Sistema 10 Meses | U.E.P. La Voz de Cristo | ${new Date().getFullYear()}`,
        40, 380, { align: 'center', width: 532 }
      );

    doc.rect(40, 393, 532, 2).fill(yellowBorder);
    doc.rect(40, 395, 532, 4).fill(darkBlue);
  }
}

export default PagoMensualidadPDFController;