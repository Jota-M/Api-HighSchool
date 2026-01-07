// controllers/inscripcionVacacionalPDFController.js
import PDFDocument from 'pdfkit';
import { InscripcionVacacional } from '../models/CursoVacacional.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class InscripcionVacacionalPDFController {
  static async generarPDF(req, res) {
    try {
      const { id } = req.params;

      const inscripcion = await InscripcionVacacional.findById(id);

      if (!inscripcion) {
        return res.status(404).json({
          success: false,
          message: 'Inscripción no encontrada'
        });
      }

      // Obtener todas las inscripciones del mismo grupo
      const inscripcionesGrupo = await InscripcionVacacional.findByCodigoGrupo(
        inscripcion.codigo_grupo
      );

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=Comprobante_${inscripcion.recibo_interno || inscripcion.codigo_grupo}_${inscripcion.nombres}_${inscripcion.apellido_paterno}.pdf`
      );

      doc.pipe(res);

      await InscripcionVacacionalPDFController.generatePDFContent(
        doc, 
        inscripcion, 
        inscripcionesGrupo
      );

      doc.end();

      // Log de actividad
      if (req.user) {
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: req.user.id,
          accion: 'generar_pdf_inscripcion',
          modulo: 'curso_vacacional',
          tabla_afectada: 'inscripcion_vacacional',
          registro_id: parseInt(id),
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'exitoso',
          mensaje: `PDF generado para inscripción ${inscripcion.codigo_inscripcion}`
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

  static async verPDFPreview(req, res) {
    try {
      const { id } = req.params;

      const inscripcion = await InscripcionVacacional.findById(id);

      if (!inscripcion) {
        return res.status(404).json({
          success: false,
          message: 'Inscripción no encontrada'
        });
      }

      const inscripcionesGrupo = await InscripcionVacacional.findByCodigoGrupo(
        inscripcion.codigo_grupo
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename=Comprobante_${inscripcion.recibo_interno || inscripcion.codigo_grupo}.pdf`
      );

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      doc.pipe(res);

      await InscripcionVacacionalPDFController.generatePDFContent(
        doc, 
        inscripcion, 
        inscripcionesGrupo
      );

      doc.end();

      if (req.user) {
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: req.user.id,
          accion: 'ver_pdf_preview_inscripcion',
          modulo: 'curso_vacacional',
          tabla_afectada: 'inscripcion_vacacional',
          registro_id: parseInt(id),
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'exitoso',
          mensaje: `PDF preview visualizado para inscripción ${inscripcion.codigo_inscripcion}`
        });
      }

    } catch (error) {
      console.error('Error al generar preview:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error al generar preview: ' + error.message
        });
      }
    }
  }

  static async generatePDFContent(doc, inscripcion, inscripcionesGrupo) {
    const darkBlue = '#1e3a8a';
    const lightBlue = '#3b82f6';
    const yellowBorder = '#fbbf24';
    const darkGray = '#1f2937';
    const lightGray = '#6b7280';

    // Función para dibujar marca de agua
    const drawWatermark = () => {
      const watermarkPath = path.join(__dirname, '../public/logo.png');
      
      if (fs.existsSync(watermarkPath)) {
        try {
          doc.save();
          doc.opacity(0.08)
             .image(watermarkPath, 140, 220, { 
               width: 350,
               height: 350,
               align: 'center',
               valign: 'center'
             });
          doc.restore();
        } catch (error) {
          console.log('No se pudo cargar la marca de agua:', error);
        }
      }
    };

    drawWatermark();

    // BORDE SUPERIOR DECORATIVO (Azul y Amarillo)
    doc.rect(50, 40, 512, 8)
       .fill(darkBlue);
    
    doc.rect(50, 48, 512, 3)
       .fill(yellowBorder);

    // LOGO Y ENCABEZADO
    const logoPath = path.join(__dirname, '../public/logo.png');
    let logoExists = false;

    if (fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, 60, 65, { width: 60, height: 60 });
        logoExists = true;
      } catch (error) {
        console.log('No se pudo cargar el logo:', error);
      }
    }

    const textStartX = logoExists ? 135 : 60;

    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor(darkBlue)
       .text('Unidad Educativa Particular', textStartX, 70);

    doc.fontSize(11)
       .text('La Voz de Cristo', textStartX, 88);

    doc.fontSize(9)
       .font('Helvetica')
       .fillColor(lightGray)
       .text('Potosí - Bolivia', textStartX, 106);

    // NÚMERO DE COMPROBANTE (Estilo similar a la imagen)
    const numeroRecibo = inscripcion.recibo_interno || inscripcion.codigo_grupo;
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#ef4444')
       .text(`N° ${numeroRecibo}`, 450, 70);

    // TÍTULO PRINCIPAL
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor(darkBlue)
       .text('COMPROBANTE DE INSCRIPCIÓN', 50, 145, { 
         align: 'center', 
         width: 512 
       });

    // Línea decorativa bajo el título
    doc.moveTo(150, 170)
       .lineTo(462, 170)
       .lineWidth(2)
       .strokeColor(yellowBorder)
       .stroke();

    let currentY = 195;

    // SECCIÓN: FECHA Y MONTO
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor(lightGray)
       .text('Fecha:', 60, currentY);

    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor(darkGray)
       .text(new Date(inscripcion.created_at).toLocaleDateString('es-BO', {
         day: '2-digit',
         month: '2-digit', 
         year: 'numeric'
       }), 60, currentY + 15, { underline: true });

    // Monto en la parte derecha con formato destacado
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor(lightGray)
       .text('Monto:', 400, currentY);

    const montoTexto = `Bs. ${parseFloat(inscripcion.monto_pagado).toFixed(2)}`;
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fillColor(darkBlue)
       .text(montoTexto, 400, currentY + 12);

    // Dólares (si aplica)
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor(lightGray)
       .text('', 500, currentY + 16);

    currentY += 50;

    // RECIBÍ DE
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor(lightGray)
       .text('Recibí de:', 60, currentY);

    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor(darkGray)
       .text(inscripcion.nombre_tutor, 60, currentY + 15, { underline: true, width: 450 });

    currentY += 45;

    // LA SUMA DE
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor(lightGray)
       .text('La suma de:', 60, currentY);

    // Convertir el monto a texto (función auxiliar al final)
    const montoEnTexto = this.numeroATexto(inscripcion.monto_pagado);
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor(darkGray)
       .text(montoEnTexto, 60, currentY + 15, { 
         underline: true, 
         width: 480,
         align: 'left'
       });

    currentY += 50;

    // POR CONCEPTO DE
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor(lightGray)
       .text('Por concepto de:', 60, currentY);

    currentY += 15;

    // Listar cursos inscritos
    inscripcionesGrupo.forEach((insc, index) => {
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor(darkGray)
         .text(`• ${insc.curso_nombre}`, 60, currentY, { 
           underline: true,
           width: 480 
         });
      currentY += 18;
    });

    // Información adicional del periodo
    if (inscripcion.periodo_nombre) {
      doc.fontSize(9)
         .font('Helvetica-Oblique')
         .fillColor(lightGray)
         .text(`Periodo: ${inscripcion.periodo_nombre} - ${inscripcion.periodo_tipo?.toUpperCase() || ''}`, 
           60, currentY, { width: 480 });
      currentY += 15;
    }

    // Método de pago
    const metodoPagoTexto = {
      'transferencia': 'Transferencia bancaria',
      'efectivo': 'Efectivo',
      'qr': 'Código QR',
      'tarjeta': 'Tarjeta de crédito/débito'
    };

    doc.fontSize(9)
       .font('Helvetica')
       .fillColor(lightGray)
       .text(`Método de pago: ${metodoPagoTexto[inscripcion.metodo_pago] || inscripcion.metodo_pago}`, 
         60, currentY);

    if (inscripcion.numero_comprobante) {
      doc.text(` | N° Comprobante: ${inscripcion.numero_comprobante}`, { continued: true });
    }

    currentY += 40;

    // SECCIÓN TOTALES (estilo similar a la imagen)
    const totalBoxY = currentY;
    
    // Caja de Total
    doc.rect(60, totalBoxY, 120, 35)
       .strokeColor(lightGray)
       .lineWidth(1)
       .stroke();

    doc.fontSize(9)
       .font('Helvetica')
       .fillColor(lightGray)
       .text('Total', 75, totalBoxY + 8);
    
    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor(darkBlue)
       .text(montoTexto, 75, totalBoxY + 20);

    // Caja de A cuenta
    doc.rect(200, totalBoxY, 140, 35)
       .strokeColor(lightGray)
       .lineWidth(1)
       .stroke();

    doc.fontSize(9)
       .font('Helvetica')
       .fillColor(lightGray)
       .text('A cuenta', 215, totalBoxY + 8);
    
    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor(darkGray)
       .text(montoTexto, 215, totalBoxY + 20);

    // Caja de Saldo
    doc.rect(360, totalBoxY, 140, 35)
       .strokeColor(lightGray)
       .lineWidth(1)
       .stroke();

    doc.fontSize(9)
       .font('Helvetica')
       .fillColor(lightGray)
       .text('Saldo', 375, totalBoxY + 8);
    
    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor('#10b981')
       .text('Bs. 0.00', 375, totalBoxY + 20);

    currentY = totalBoxY + 65;

    // DATOS DEL ESTUDIANTE
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor(darkBlue)
       .text('DATOS DEL ESTUDIANTE', 60, currentY);

    currentY += 15;

    doc.fontSize(9)
       .font('Helvetica')
       .fillColor(lightGray)
       .text('Nombre y Apellido:', 60, currentY);

    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor(darkGray)
       .text(`${inscripcion.nombres} ${inscripcion.apellido_paterno} ${inscripcion.apellido_materno || ''}`.trim(), 
         170, currentY, { width: 330 });

    currentY += 20;

    doc.fontSize(9)
       .font('Helvetica')
       .fillColor(lightGray)
       .text('C.I.:', 60, currentY);

    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor(darkGray)
       .text(inscripcion.ci || 'N/A', 170, currentY);

    currentY += 45;

    // FIRMAS
    const firmaY = currentY > 620 ? currentY : 620;

    // Sección ENTREGUÉ CONFORME
    doc.fontSize(8)
       .font('Helvetica-Oblique')
       .fillColor(lightGray)
       .text('ENTREGUÉ CONFORME', 80, firmaY);

    doc.moveTo(80, firmaY + 40)
       .lineTo(240, firmaY + 40)
       .lineWidth(1)
       .strokeColor(darkGray)
       .stroke();

    doc.fontSize(8)
       .font('Helvetica')
       .fillColor(lightGray)
       .text('Nombre y Apellido:', 80, firmaY + 45);
    doc.fontSize(8)
       .font('Helvetica-Bold')
       .fillColor(darkGray)
       .text("Patricia Ramírez Villca", 80, firmaY + 56, { width: 160 });

    doc.fontSize(7)
       .text('C.I.: 5070770', 80, firmaY + 68);

    // Sección RECIBÍ CONFORME
    doc.fontSize(8)
       .font('Helvetica-Oblique')
       .fillColor(lightGray)
       .text('RECIBÍ CONFORME', 360, firmaY);

    doc.moveTo(360, firmaY + 40)
       .lineTo(520, firmaY + 40)
       .lineWidth(1)
       .strokeColor(darkGray)
       .stroke();

    doc.fontSize(8)
       .font('Helvetica')
       .fillColor(lightGray)
       .text('Nombre y Apellido:', 360, firmaY + 45);

    doc.fontSize(8)
       .font('Helvetica-Bold')
       .fillColor(darkGray)
       .text(inscripcion.nombre_tutor, 360, firmaY + 56, { width: 160 });

    doc.fontSize(7)
       .font('Helvetica')
       .fillColor(lightGray)
       .text(`C.I.: ${inscripcion.email_tutor || ''}`, 360, firmaY + 68);

    // PIE DE PÁGINA
    const footerY = 730;

    doc.fontSize(7)
       .font('Helvetica')
       .fillColor(lightGray)
       .text(
         `Documento generado el ${new Date().toLocaleDateString('es-BO', { 
           day: '2-digit', 
           month: 'long', 
           year: 'numeric' 
         })} a las ${new Date().toLocaleTimeString('es-BO', { 
           hour: '2-digit', 
           minute: '2-digit' 
         })}`,
         50,
         footerY,
         { align: 'center', width: 512 }
       );

    // Borde inferior decorativo
    doc.rect(50, 750, 512, 3)
       .fill(yellowBorder);
    
    doc.rect(50, 753, 512, 8)
       .fill(darkBlue);
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

export default InscripcionVacacionalPDFController;