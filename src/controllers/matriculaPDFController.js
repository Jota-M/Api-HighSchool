// controllers/matriculaPDFController.js
import PDFDocument from 'pdfkit';
import { Matricula } from '../models/Matricula.js';
import { Estudiante } from '../models/Estudiantes.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MatriculaPDFController {
  static async generarPDF(req, res) {
    try {
      const { id } = req.params;

      const matricula = await Matricula.findByIdCompleto(id);

      if (!matricula) {
        return res.status(404).json({
          success: false,
          message: 'Matrícula no encontrada'
        });
      }

      const tutores = await Estudiante.getTutores(matricula.estudiante_id);

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=Matricula_${matricula.numero_matricula}_${matricula.estudiante_nombres}_${matricula.estudiante_apellido_paterno}.pdf`
      );

      doc.pipe(res);

      await MatriculaPDFController.generatePDFContent(doc, matricula, tutores);

      doc.end();

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'generar_pdf',
        modulo: 'matricula',
        tabla_afectada: 'matricula',
        registro_id: parseInt(id),
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `PDF generado para matrícula ${matricula.numero_matricula}`
      });

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

      const matricula = await Matricula.findByIdCompleto(id);

      if (!matricula) {
        return res.status(404).json({
          success: false,
          message: 'Matrícula no encontrada'
        });
      }

      const tutores = await Estudiante.getTutores(matricula.estudiante_id);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename=Matricula_${matricula.numero_matricula}.pdf`
      );

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      doc.pipe(res);

      await MatriculaPDFController.generatePDFContent(doc, matricula, tutores);

      doc.end();

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'ver_pdf_preview',
        modulo: 'matricula',
        tabla_afectada: 'matricula',
        registro_id: parseInt(id),
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `PDF preview visualizado para matrícula ${matricula.numero_matricula}`
      });

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

  static async generatePDFContent(doc, matricula, tutores) {
    const darkGray = '#1f2937';
    const lightGray = '#6b7280';
    const borderGray = '#d1d5db';

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
    const logoPath = path.join(__dirname, '../public/logo.png');
   let logoExists = false;

   if (fs.existsSync(logoPath)) {
   try {
      doc.image(logoPath, 50, 50, { width: 70, height: 70 });
      logoExists = true;
   } catch (error) {
      console.log('No se pudo cargar el logo:', error);
   }
   }
    const textStartX = logoExists ? 135 : 50;

    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor(darkGray)
       .text('Unidad Educativa Particular', textStartX, 55);

    doc.fontSize(11)
       .text('La Voz de Cristo', textStartX, 78);

    doc.fontSize(10)
       .font('Helvetica')
       .fillColor(lightGray)
       .text('Potosi - Bolivia', textStartX, 100);

    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fillColor(darkGray)
       .text('MATRÍCULA ', 50, 135, { align: 'center', width: 512 });

    doc.moveTo(50, 160)
       .lineTo(562, 160)
       .lineWidth(1)
       .strokeColor(borderGray)
       .stroke();

    doc.y = 180;

    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor(darkGray)
       .text('DATOS DE MATRÍCULA', 50, doc.y);

    doc.y += 20;

    const drawField = (label, value, x, y, width) => {
      if (width === undefined) width = 200;
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor(lightGray)
         .text(label, x, y);
      
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor(darkGray)
         .text(value || 'N/A', x, y + 12, { width: width });
    };

    let currentY = doc.y;

    drawField('N° Matrícula', matricula.numero_matricula, 50, currentY);
    drawField('Fecha', new Date(matricula.fecha_matricula).toLocaleDateString('es-BO'), 230, currentY);
    drawField('Estado', matricula.estado.toUpperCase(), 410, currentY);

    currentY += 35;

    drawField('Período Académico', matricula.periodo_nombre, 50, currentY, 250);
    drawField('Usuario Registrador', matricula.usuario_registrador || 'Sistema', 330, currentY, 230);

    currentY += 40;

    doc.moveTo(50, currentY)
       .lineTo(562, currentY)
       .lineWidth(0.5)
       .strokeColor(borderGray)
       .stroke();

    currentY += 20;

    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor(darkGray)
       .text('DATOS DEL ESTUDIANTE', 50, currentY);

    currentY += 20;

    drawField('Código', matricula.estudiante_codigo, 50, currentY);
    drawField('Cédula de Identidad', matricula.estudiante_ci || 'Trámite', 230, currentY);
    drawField('Teléfono', matricula.estudiante_telefono || 'N/A', 410, currentY);

    currentY += 35;

    drawField(
      'Nombre Completo',
      `${matricula.estudiante_nombres} ${matricula.estudiante_apellido_paterno} ${matricula.estudiante_apellido_materno || ''}`.trim(),
      50,
      currentY,
      512
    );

    currentY += 35;

    drawField('Fecha de Nacimiento', new Date(matricula.estudiante_fecha_nacimiento).toLocaleDateString('es-BO'), 50, currentY);
    drawField('Direccion', matricula.estudiante_direccion || 'N/A', 230, currentY, 280);
    
    const edad = new Date().getFullYear() - new Date(matricula.estudiante_fecha_nacimiento).getFullYear();
    drawField('Edad', `${edad} años`, 230, currentY);
    
    drawField('Usuario Sistema', matricula.estudiante_username || 'Sin usuario', 410, currentY);

    currentY += 40;

    doc.moveTo(50, currentY)
       .lineTo(562, currentY)
       .lineWidth(0.5)
       .strokeColor(borderGray)
       .stroke();

    currentY += 20;

    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor(darkGray)
       .text('INFORMACIÓN ACADÉMICA', 50, currentY);

    currentY += 20;

    drawField('Nivel Académico', matricula.nivel_nombre, 50, currentY);
    drawField('Grado', matricula.grado_nombre, 230, currentY);
    drawField('Paralelo', matricula.paralelo_nombre, 410, currentY);

    currentY += 35;

    drawField('Turno', matricula.turno_nombre, 50, currentY);
    drawField('Aula', matricula.aula || 'Por asignar', 230, currentY);

    currentY += 35;

    if (matricula.es_becado || matricula.es_repitente) {
      const badges = [];
      if (matricula.es_becado) {
        badges.push(`Becado: ${matricula.porcentaje_beca || 0}%${matricula.tipo_beca ? ` (${matricula.tipo_beca})` : ''}`);
      }
      if (matricula.es_repitente) {
        badges.push('Repite grado');
      }

      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor(darkGray)
         .text(badges.join(' | '), 50, currentY);

      currentY += 25;
    }

    currentY += 15;

    doc.moveTo(50, currentY)
       .lineTo(562, currentY)
       .lineWidth(0.5)
       .strokeColor(borderGray)
       .stroke();

    currentY += 20;

    if (tutores && tutores.length > 0) {
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor(darkGray)
         .text('DATOS DE TUTORES / PADRES DE FAMILIA', 50, currentY);

      currentY += 20;

      tutores.forEach((tutor, index) => {
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor(darkGray)
           .text(`Tutor ${index + 1}${tutor.es_tutor_principal ? ' (PRINCIPAL)' : ''}`, 50, currentY);

        currentY += 15;

        drawField(
          'Nombre Completo',
          `${tutor.nombres} ${tutor.apellido_paterno} ${tutor.apellido_materno || ''}`.trim(),
          50,
          currentY,
          512
        );

        currentY += 30;

        drawField('CI', tutor.ci, 50, currentY);
        drawField('Parentesco', tutor.parentesco, 180, currentY);
        drawField('Teléfono', tutor.telefono || 'N/A', 310, currentY);
        drawField('Celular', tutor.celular || 'N/A', 440, currentY);

        currentY += 35;

        drawField('Ocupación', tutor.ocupacion || 'N/A', 50, currentY);
        drawField('Lugar de Trabajo', tutor.lugar_trabajo || 'N/A', 230, currentY);
        drawField('Dirección', tutor.direccion || 'N/A', 410, currentY, 280);
        drawField('Usuario Sistema', tutor.username || 'Sin usuario', 410, currentY);

        currentY += 30;

        currentY += 10;
      });

      currentY += 5;

      doc.moveTo(50, currentY)
         .lineTo(562, currentY)
         .lineWidth(0.5)
         .strokeColor(borderGray)
         .stroke();

      currentY += 20;
    }

    if (matricula.observaciones) {
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor(darkGray)
         .text('OBSERVACIONES', 50, currentY);

      currentY += 15;

      doc.fontSize(9)
         .font('Helvetica')
         .fillColor(darkGray)
         .text(matricula.observaciones, 50, currentY, {
           width: 512,
           align: 'justify'
         });

      currentY = doc.y + 20;
    }

    if (currentY > 650) {
      doc.addPage();
      currentY = 80;
      drawWatermark();
    } else {
      currentY = Math.max(currentY, 620);
    }

    doc.moveTo(80, currentY)
       .lineTo(240, currentY)
       .lineWidth(1)
       .strokeColor(borderGray)
       .stroke();

    doc.moveTo(360, currentY)
       .lineTo(520, currentY)
       .lineWidth(1)
       .strokeColor(borderGray)
       .stroke();

    doc.fontSize(8)
       .font('Helvetica')
       .fillColor(lightGray)
       .text('Firma del Padre/Madre/Tutor', 80, currentY + 10, { width: 160, align: 'center' });

    doc.text('Sello y Firma de la Institución', 360, currentY + 10, { width: 160, align: 'center' });

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

    doc.fontSize(6)
       .text('Este documento es válido únicamente con sello y firma de la institución educativa', 50, footerY + 12, {
         align: 'center',
         width: 512
       });
  }
}

export default MatriculaPDFController;