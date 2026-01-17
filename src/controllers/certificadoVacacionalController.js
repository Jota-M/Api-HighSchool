// controllers/certificadoVacacionalController.js
import PDFDocument from 'pdfkit';
import { InscripcionVacacional } from '../models/CursoVacacional.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CertificadoVacacionalController {
  /**
   * Genera el certificado de una inscripción completada
   */
  static async generarCertificado(req, res) {
    try {
      const { id } = req.params;

      const inscripcion = await InscripcionVacacional.findById(id);

      if (!inscripcion) {
        return res.status(404).json({
          success: false,
          message: 'Inscripción no encontrada'
        });
      }

      if (inscripcion.estado !== 'completado') {
        return res.status(400).json({
          success: false,
          message: 'Solo se pueden generar certificados para cursos completados'
        });
      }

      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 30, bottom: 30, left: 30, right: 30 }
      });

      const nombreArchivo = `Certificado_${inscripcion.nombres}_${inscripcion.apellido_paterno}_${inscripcion.codigo_inscripcion}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);

      doc.pipe(res);

      await CertificadoVacacionalController.generarContenidoCertificado(doc, inscripcion);

      doc.end();

      if (req.user) {
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: req.user.id,
          accion: 'generar_certificado_vacacional',
          modulo: 'curso_vacacional',
          tabla_afectada: 'inscripcion_vacacional',
          registro_id: parseInt(id),
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'exitoso',
          mensaje: `Certificado generado para ${inscripcion.nombres} ${inscripcion.apellido_paterno}`
        });
      }

    } catch (error) {
      console.error('Error al generar certificado:', error);
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error al generar certificado: ' + error.message
        });
      }
    }
  }

  /**
   * Ver certificado en el navegador (preview)
   */
  static async verCertificadoPreview(req, res) {
    try {
      const { id } = req.params;

      const inscripcion = await InscripcionVacacional.findById(id);

      if (!inscripcion) {
        return res.status(404).json({
          success: false,
          message: 'Inscripción no encontrada'
        });
      }

      if (inscripcion.estado !== 'completado') {
        return res.status(400).json({
          success: false,
          message: 'Solo se pueden generar certificados para cursos completados'
        });
      }

      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 30, bottom: 30, left: 30, right: 30 }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');

      doc.pipe(res);

      await CertificadoVacacionalController.generarContenidoCertificado(doc, inscripcion);

      doc.end();

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

  /**
   * Genera el contenido visual del certificado - DISEÑO LIMPIO Y ESTRUCTURADO
   */
  static async generarContenidoCertificado(doc, inscripcion) {
    // Colores del colegio: Azul y Amarillo
    const azulPrimario = '#1e40af'; // Azul fuerte del colegio
    const azulOscuro = '#1e3a8a'; // Azul más oscuro
    const azulClaro = '#3b82f6'; // Azul claro
    const amarillo = '#fbbf24'; // Amarillo del colegio
    const amarilloOscuro = '#f59e0b'; // Amarillo más oscuro
    const grisOscuro = '#374151';
    const grisClaro = '#9ca3af';

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const centerX = pageWidth / 2;
    const logoPath = path.join(__dirname, '../public/logo.png');

    // ==========================================
    // FONDO SUTIL
    // ==========================================
    doc.rect(0, 0, pageWidth, pageHeight)
       .fillColor('#fafafa')
       .fill();

    // ==========================================
    // MARCO AZUL Y AMARILLO ELEGANTE
    // ==========================================
    const margin = 25;
    
    // Marco exterior azul
    doc.rect(margin, margin, pageWidth - (margin * 2), pageHeight - (margin * 2))
       .lineWidth(6)
       .strokeColor(azulPrimario)
       .stroke();

    // Marco interior amarillo
    doc.rect(margin + 10, margin + 10, pageWidth - (margin * 2) - 20, pageHeight - (margin * 2) - 20)
       .lineWidth(2)
       .strokeColor(amarillo)
       .stroke();

    // ==========================================
    // HEADER: LOGO + NOMBRE INSTITUCIÓN
    // ==========================================
    let currentY = 55;

    // Logo a la izquierda
    if (fs.existsSync(logoPath)) {
      try {
        const logoSize = 65;
        const logoX = 65;
        doc.image(logoPath, logoX, currentY, { 
          width: logoSize, 
          height: logoSize 
        });
        
        // Marco circular azul
        doc.save();
        doc.circle(logoX + logoSize / 2, currentY + logoSize / 2, logoSize / 2 + 5)
           .lineWidth(2.5)
           .strokeColor(azulPrimario)
           .stroke();
        doc.restore();
      } catch (error) {
        console.log('No se pudo cargar el logo');
      }
    }

    // Nombre de la institución en el centro
    doc.fontSize(10)
       .fillColor(grisClaro)
       .font('Helvetica')
       .text('UNIDAD EDUCATIVA PARTICULAR', centerX - 200, currentY + 5, {
         width: 400,
         align: 'center',
         characterSpacing: 2
       });

    doc.fontSize(24)
       .fillColor(azulOscuro)
       .font('Helvetica-Bold')
       .text('LA VOZ DE CRISTO', centerX - 200, currentY + 22, {
         width: 400,
         align: 'center',
         characterSpacing: 3
       });

    doc.fontSize(8)
       .fillColor(grisClaro)
       .font('Helvetica')
       .text('Potosí - Bolivia', centerX - 200, currentY + 52, {
         width: 400,
         align: 'center'
       });

    currentY += 90;

    // Línea divisoria con degradado azul-amarillo
    doc.moveTo(150, currentY)
       .lineTo(centerX - 30, currentY)
       .lineWidth(2)
       .strokeColor(azulPrimario)
       .stroke();
    
    doc.moveTo(centerX - 30, currentY)
       .lineTo(centerX + 30, currentY)
       .lineWidth(2)
       .strokeColor(amarillo)
       .stroke();
    
    doc.moveTo(centerX + 30, currentY)
       .lineTo(pageWidth - 150, currentY)
       .lineWidth(2)
       .strokeColor(azulPrimario)
       .stroke();

    currentY += 30;

    // ==========================================
    // TÍTULO "CERTIFICADO" CON ESTILO ELEGANTE
    // ==========================================
    // Título principal con estilo cursivo simulado
    doc.save();
    doc.fontSize(52)
       .fillColor(azulPrimario)
       .font('Times-BoldItalic')
       .text('Certificado', centerX - 300, currentY, {
         width: 600,
         align: 'center',
         characterSpacing: 2
       });

    // Efecto de sombra amarilla
    doc.opacity(0.3);
    doc.fontSize(52)
       .fillColor(amarillo)
       .font('Times-BoldItalic')
       .text('Certificado', centerX - 297, currentY + 2, {
         width: 600,
         align: 'center',
         characterSpacing: 2
       });
    doc.restore();

    currentY += 65;

    // Subtítulo
    doc.fontSize(11)
       .fillColor(grisOscuro)
       .font('Helvetica')
       .text('Otorgado a:', centerX - 200, currentY, {
         width: 400,
         align: 'center'
       });

    currentY += 25;

    // ==========================================
    // NOMBRE DEL ESTUDIANTE
    // ==========================================
    const nombreCompleto = `${inscripcion.nombres} ${inscripcion.apellido_paterno} ${inscripcion.apellido_materno || ''}`.trim();

    // Caja decorativa para el nombre con colores del colegio
    doc.save();
    doc.rect(120, currentY - 8, pageWidth - 240, 40)
       .fillColor('#eff6ff') // Azul muy claro
       .fill();
    
    // Borde azul-amarillo
    doc.rect(120, currentY - 8, pageWidth - 240, 40)
       .lineWidth(2)
       .strokeColor(azulPrimario)
       .stroke();
    
    // Línea amarilla en la parte superior de la caja
    doc.moveTo(120, currentY - 8)
       .lineTo(pageWidth - 120, currentY - 8)
       .lineWidth(3)
       .strokeColor(amarillo)
       .stroke();
    doc.restore();

    doc.fontSize(24)
       .fillColor(azulOscuro)
       .font('Times-Bold')
       .text(nombreCompleto.toUpperCase(), 130, currentY, {
         width: pageWidth - 260,
         align: 'center',
         characterSpacing: 1.5
       });

    currentY += 55;

    // ==========================================
    // DESCRIPCIÓN DEL CURSO
    // ==========================================
    const fechaInicio = inscripcion.curso_fecha_inicio 
      ? new Date(inscripcion.curso_fecha_inicio).toLocaleDateString('es-BO', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
      : '';
    const fechaFin = inscripcion.curso_fecha_fin 
      ? new Date(inscripcion.curso_fecha_fin).toLocaleDateString('es-BO', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
      : '';

    doc.fontSize(11)
       .fillColor(grisOscuro)
       .font('Helvetica')
       .text('Por haber aprobado satisfactoriamente el curso:', 100, currentY, {
         width: pageWidth - 200,
         align: 'center'
       });

    currentY += 25;

    // Nombre del curso destacado con colores del colegio
    doc.fontSize(17)
       .fillColor(azulPrimario)
       .font('Times-Bold')
       .text(inscripcion.curso_nombre.toUpperCase(), 100, currentY, {
         width: pageWidth - 200,
         align: 'center',
         characterSpacing: 2
       });

    currentY += 28;

    // Periodo y fechas
    if (inscripcion.periodo_nombre) {
      doc.fontSize(10)
         .fillColor(grisOscuro)
         .font('Helvetica')
         .text(`Periodo: ${inscripcion.periodo_nombre}`, 100, currentY, {
           width: pageWidth - 200,
           align: 'center'
         });
      currentY += 18;
    }

    if (fechaInicio && fechaFin) {
      doc.fontSize(9)
         .fillColor(grisClaro)
         .font('Helvetica-Oblique')
         .text(`Del ${fechaInicio} al ${fechaFin}`, 100, currentY, {
           width: pageWidth - 200,
           align: 'center'
         });
      currentY += 15;
    }

    doc.fontSize(9)
       .fillColor(grisOscuro)
       .font('Helvetica')
       .text('Cumpliendo con todos los requisitos académicos establecidos por la institución.', 100, currentY, {
         width: pageWidth - 200,
         align: 'center'
       });

    // ==========================================
    // FECHA Y LUGAR
    // ==========================================
    const fechaEmision = new Date().toLocaleDateString('es-BO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const fechaY = pageHeight - 130;

    doc.fontSize(10)
       .fillColor(grisOscuro)
       .font('Helvetica-Oblique')
       .text(`Potosí, ${fechaEmision}`, centerX - 200, fechaY, {
         width: 400,
         align: 'center'
       });

    // ==========================================
    // FIRMAS CON COLORES DEL COLEGIO
    // ==========================================
    const firmasY = pageHeight - 95;
    const espaciadoFirmas = 200;

    const firmas = [
      { 
        titulo: 'DIRECTORA', 
        nombre: 'Lic. Natalia Valencia Vargas', 
        x: centerX - espaciadoFirmas 
      },
      { 
        titulo: 'ADMINISTRADOR', 
        nombre: 'Ing. Oswaldo Bohorquez', 
        x: centerX 
      },
      { 
        titulo: 'PASTOR', 
        nombre: 'Ivan Mamani', 
        x: centerX + espaciadoFirmas 
      }
    ];

    firmas.forEach(firma => {
      // Línea de firma azul
      doc.moveTo(firma.x - 70, firmasY)
         .lineTo(firma.x + 70, firmasY)
         .lineWidth(1.5)
         .strokeColor(azulPrimario)
         .stroke();

      // Nombre
      doc.fontSize(9)
         .fillColor(azulOscuro)
         .font('Helvetica-Bold')
         .text(firma.nombre, firma.x - 90, firmasY + 8, {
           width: 180,
           align: 'center'
         });

      // Cargo en amarillo
      doc.fontSize(7)
         .fillColor(amarilloOscuro)
         .font('Helvetica')
         .text(firma.titulo, firma.x - 90, firmasY + 21, {
           width: 180,
           align: 'center'
         });
    });

    // ==========================================
    // FOOTER: QR Y CÓDIGO CON COLORES DEL COLEGIO
    // ==========================================
    const footerY = pageHeight - 50;

    // Código a la izquierda
    doc.fontSize(7)
       .fillColor(grisClaro)
       .font('Helvetica')
       .text(`Código: ${inscripcion.codigo_inscripcion}`, 50, footerY, {
         width: 250,
         align: 'left'
       });

    // QR a la derecha con marco azul-amarillo
    try {
      const urlVerificacion = `${process.env.FRONTEND_URL || 'https://lavozdecristo.edu.bo'}/verificar-certificado/${inscripcion.codigo_inscripcion}`;
      
      const qrBuffer = await QRCode.toBuffer(urlVerificacion, {
        width: 50,
        margin: 1,
        color: {
          dark: azulOscuro,
          light: '#ffffff'
        }
      });

      const qrX = pageWidth - 95;
      const qrY = footerY - 25;

      // Marco azul para QR
      doc.save();
      doc.rect(qrX - 4, qrY - 4, 58, 58)
         .lineWidth(2)
         .strokeColor(azulPrimario)
         .stroke();
      
      // Detalle amarillo en esquinas
      doc.rect(qrX - 4, qrY - 4, 10, 10)
         .fillColor(amarillo)
         .fill();
      doc.rect(qrX + 48, qrY - 4, 10, 10)
         .fillColor(amarillo)
         .fill();
      doc.rect(qrX - 4, qrY + 48, 10, 10)
         .fillColor(amarillo)
         .fill();
      doc.rect(qrX + 48, qrY + 48, 10, 10)
         .fillColor(amarillo)
         .fill();
      doc.restore();

      doc.image(qrBuffer, qrX, qrY, {
        width: 50,
        height: 50
      });

      doc.fontSize(6)
         .fillColor(grisClaro)
         .font('Helvetica')
         .text('Verificar', qrX - 4, qrY + 53, {
           width: 58,
           align: 'center'
         });
    } catch (qrError) {
      console.error('Error generando QR:', qrError);
    }
  }

  /**
   * Listar inscripciones completadas (candidatas para certificado)
   */
  static async listarCompletadas(req, res) {
    try {
      const { page, limit, search, periodo_vacacional_id } = req.query;

      const result = await InscripcionVacacional.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search,
        periodo_vacacional_id: periodo_vacacional_id ? parseInt(periodo_vacacional_id) : undefined,
        estado: 'completado'
      });

      res.json({
        success: true,
        data: result.inscripciones,
        paginacion: result.paginacion
      });
    } catch (error) {
      console.error('Error al listar completadas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar: ' + error.message
      });
    }
  }
}

export default CertificadoVacacionalController;