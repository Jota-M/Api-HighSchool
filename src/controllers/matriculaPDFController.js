// controllers/matriculaPDFController.js - OPTIMIZADO PARA MEDIA HOJA
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
        margins: { top: 30, bottom: 30, left: 40, right: 40 }
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
        margins: { top: 30, bottom: 30, left: 40, right: 40 }
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
    const darkBlue = '#1e3a8a';
    const yellowBorder = '#fbbf24';
    const darkGray = '#1f2937';
    const lightGray = '#6b7280';
    const blueAccent = '#3b82f6';

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
       .text('Potosí - Bolivia', logoX, 56);

    doc.fontSize(7).font('Helvetica-Bold').fillColor('#ef4444')
       .text(`N° ${matricula.numero_matricula}`, 480, 44);
    doc.fontSize(6).font('Helvetica').fillColor(lightGray)
       .text(matricula.estado.toUpperCase(), 480, 56);

    // ═══════════════════════════════════════════════════
    // TÍTULO
    // ═══════════════════════════════════════════════════
    let y = 78;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(darkBlue)
       .text('MATRÍCULA ESCOLAR', 40, y, { align: 'center', width: 532 });
    y += 14;

    doc.moveTo(180, y).lineTo(432, y).lineWidth(1).strokeColor(yellowBorder).stroke();
    y += 10;

    // ═══════════════════════════════════════════════════
    // PERÍODO Y FECHA
    // ═══════════════════════════════════════════════════
    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Período:', 50, y);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkGray)
       .text(matricula.periodo_nombre, 90, y);

    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Fecha:', 380, y);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkGray)
       .text(new Date(matricula.fecha_matricula).toLocaleDateString('es-BO', {
         day: '2-digit', month: '2-digit', year: 'numeric'
       }), 420, y);

    y += 18;

    // ═══════════════════════════════════════════════════
    // 1. INFORMACIÓN ACADÉMICA (PRIMERO)
    // ═══════════════════════════════════════════════════
    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkBlue)
       .text('INFORMACIÓN ACADÉMICA', 50, y);
    y += 12;

    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Nivel:', 55, y);
    doc.fontSize(7).font('Helvetica-Bold').fillColor(darkGray)
       .text(matricula.nivel_nombre, 85, y);

    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Grado:', 200, y);
    doc.fontSize(7).font('Helvetica-Bold').fillColor(darkGray)
       .text(matricula.grado_nombre, 235, y);

    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Paralelo:', 340, y);
    doc.fontSize(7).font('Helvetica-Bold').fillColor(darkGray)
       .text(matricula.paralelo_nombre, 380, y);

    doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Turno:', 460, y);
    doc.fontSize(7).font('Helvetica-Bold').fillColor(darkGray)
       .text(matricula.turno_nombre, 490, y);

    y += 14;

    // Badges (Becado/Repitente)
    if (matricula.es_becado || matricula.es_repitente) {
      const badges = [];
      if (matricula.es_becado) {
        badges.push(`✓ Becado ${matricula.porcentaje_beca || 0}%`);
      }
      if (matricula.es_repitente) {
        badges.push('⚠ Repite grado');
      }

      doc.fontSize(6).font('Helvetica-Bold').fillColor('#10b981')
         .text(badges.join('  |  '), 55, y);
      y += 12;
    }

    y += 6;

    // ═══════════════════════════════════════════════════
    // 2. DATOS DEL ESTUDIANTE (SEGUNDO)
    // ═══════════════════════════════════════════════════
    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkBlue)
       .text('DATOS DEL ESTUDIANTE', 50, y);
    y += 12;

    const nombreCompleto = `${matricula.estudiante_nombres} ${matricula.estudiante_apellido_paterno} ${matricula.estudiante_apellido_materno || ''}`.trim();
    
    // Nombre y Código
    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkGray)
       .text(nombreCompleto, 50, y, { width: 320 });
    
    doc.fontSize(7).font('Helvetica').fillColor(lightGray)
       .text(`Código: `, 390, y);
    doc.fontSize(7).font('Helvetica-Bold').fillColor(darkGray)
       .text(matricula.estudiante_codigo, 430, y);

    y += 13;

    // CI, Edad, Teléfono
    doc.fontSize(6).font('Helvetica').fillColor(lightGray)
       .text('CI:', 55, y);
    doc.fontSize(6).font('Helvetica-Bold').fillColor(darkGray)
       .text(matricula.estudiante_ci || 'Trámite', 70, y);
    
    const fechaNac = new Date(matricula.estudiante_fecha_nacimiento);
    const edad = new Date().getFullYear() - fechaNac.getFullYear();
    
    doc.fontSize(6).font('Helvetica').fillColor(lightGray)
       .text('Edad:', 140, y);
    doc.fontSize(6).font('Helvetica-Bold').fillColor(darkGray)
       .text(`${edad} años`, 165, y);

    if (matricula.estudiante_telefono) {
      doc.fontSize(6).font('Helvetica').fillColor(lightGray)
         .text('Tel:', 220, y);
      doc.fontSize(6).font('Helvetica-Bold').fillColor(darkGray)
         .text(matricula.estudiante_telefono, 240, y);
    }

    y += 12;

    // USUARIO DEL ESTUDIANTE - DESTACADO
    if (matricula.estudiante_username) {
      doc.rect(50, y, 250, 14).fill('#eff6ff');
      
      doc.fontSize(6).font('Helvetica').fillColor(lightGray)
         .text('Usuario Sistema:', 55, y + 3);
      
      doc.fontSize(7).font('Helvetica-Bold').fillColor(blueAccent)
         .text(matricula.estudiante_username, 135, y + 3);
      
      y += 16;
    } else {
      y += 4;
    }

    y += 6;

    // ═══════════════════════════════════════════════════
    // 3. TUTORES (TERCERO)
    // ═══════════════════════════════════════════════════
    if (tutores && tutores.length > 0) {
      doc.fontSize(8).font('Helvetica-Bold').fillColor(darkBlue)
         .text('TUTORES / PADRES DE FAMILIA', 50, y);
      y += 12;

      tutores.forEach((tutor, index) => {
        const nombreTutor = `${tutor.nombres} ${tutor.apellido_paterno} ${tutor.apellido_materno || ''}`.trim();
        const esPrincipal = tutor.es_tutor_principal;

        y += 11;

        // Datos en línea
        doc.fontSize(6).font('Helvetica').fillColor(lightGray)
           .text('Parentesco:', 60, y);
        doc.fontSize(6).font('Helvetica-Bold').fillColor(darkGray)
           .text(tutor.parentesco, 105, y);

        doc.fontSize(6).font('Helvetica').fillColor(lightGray)
           .text('CI:', 180, y);
        doc.fontSize(6).font('Helvetica-Bold').fillColor(darkGray)
           .text(tutor.ci, 195, y);

        doc.fontSize(6).font('Helvetica').fillColor(lightGray)
           .text('Cel:', 270, y);
        doc.fontSize(6).font('Helvetica-Bold').fillColor(darkGray)
           .text(tutor.celular || tutor.telefono || 'N/A', 290, y);

        y += 11;

        // USUARIO DEL TUTOR - DESTACADO
        if (tutor.username) {
          doc.rect(55, y, 250, 13).fill('#eff6ff');
          
          doc.fontSize(6).font('Helvetica').fillColor(lightGray)
             .text('Usuario Sistema:', 60, y + 2);
          
          doc.fontSize(7).font('Helvetica-Bold').fillColor(blueAccent)
             .text(tutor.username, 140, y + 2);
          
          y += 15;
        }

        y += 8;
      });

      y += 2;
    }

    // ═══════════════════════════════════════════════════
    // OBSERVACIONES (SI EXISTEN)
    // ═══════════════════════════════════════════════════
    if (matricula.observaciones) {
      doc.fontSize(7).font('Helvetica-Bold').fillColor(darkBlue)
         .text('OBSERVACIONES:', 50, y);
      y += 10;

      doc.fontSize(6).font('Helvetica').fillColor(darkGray)
         .text(matricula.observaciones, 50, y, {
           width: 522,
           align: 'justify'
         });

      y = doc.y + 10;
    }

    // ═══════════════════════════════════════════════════
    // FIRMAS
    // ═══════════════════════════════════════════════════
    y = Math.max(y + 10, 300); // Asegurar espacio mínimo

    // LADO IZQUIERDO - DATOS DEL TUTOR PRINCIPAL
    const tutorPrincipal = tutores && tutores.length > 0 
      ? tutores.find(t => t.es_tutor_principal) || tutores[0]
      : null;

    doc.fontSize(6).font('Helvetica-Oblique').fillColor(lightGray)
       .text('FIRMA PADRE/MADRE/TUTOR', 70, y);

    doc.moveTo(70, y + 30)
       .lineTo(200, y + 30)
       .lineWidth(0.5)
       .strokeColor(darkGray)
       .stroke();

    if (tutorPrincipal) {
      const nombreTutor = `${tutorPrincipal.nombres} ${tutorPrincipal.apellido_paterno} ${tutorPrincipal.apellido_materno || ''}`.trim();
      
      doc.fontSize(6).font('Helvetica').fillColor(lightGray)
         .text('Nombre:', 70, y + 35);
      
      doc.fontSize(7).font('Helvetica-Bold').fillColor(darkGray)
         .text(nombreTutor, 100, y + 35, { width: 100 });

      doc.fontSize(6).font('Helvetica').fillColor(lightGray)
         .text('C.I.:', 70, y + 50);
      
      doc.fontSize(7).font('Helvetica-Bold').fillColor(darkGray)
         .text(tutorPrincipal.ci, 100, y + 50);
    } else {
      doc.fontSize(6).font('Helvetica').fillColor(lightGray)
         .text('Nombre: _______________________', 70, y + 35);
      
      doc.fontSize(6).font('Helvetica').fillColor(lightGray)
         .text('C.I.: _______________________', 70, y + 50);
    }

    // LADO DERECHO - SOLO SELLO
    doc.fontSize(6).font('Helvetica-Oblique').fillColor(lightGray)
       .text('SELLO INSTITUCIÓN', 410, y);

    doc.moveTo(380, y + 30)
       .lineTo(510, y + 30)
       .lineWidth(0.5)
       .strokeColor(darkGray)
       .stroke();

    // ═══════════════════════════════════════════════════
    // PIE DE PÁGINA
    // ═══════════════════════════════════════════════════
    const footerY = 380;

    doc.fontSize(5).font('Helvetica').fillColor(lightGray)
       .text(
         `Generado: ${new Date().toLocaleDateString('es-BO')} ${new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })} | Usuario: ${matricula.usuario_registrador || 'Sistema'}`,
         40,
         footerY,
         { align: 'center', width: 532 }
       );

    doc.fontSize(5).font('Helvetica').fillColor(lightGray)
       .text('Documento válido únicamente con sello y firma institucional', 40, footerY + 8, {
         align: 'center',
         width: 532
       });

    doc.rect(40, 393, 532, 2).fill(yellowBorder);
    doc.rect(40, 395, 532, 4).fill(darkBlue);
  }
}

export default MatriculaPDFController;