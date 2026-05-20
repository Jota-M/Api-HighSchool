// controllers/pagoMensualidadPDFController.js - SISTEMA 10 MESES - CON SOPORTE PAGO ANUAL
import PDFDocument from 'pdfkit';
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
      } catch (error) {}
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
    // FIRMAS CON CI
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
}

export default PagoMensualidadPDFController;