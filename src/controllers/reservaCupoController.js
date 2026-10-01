// controllers/reservaCupoController.js
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import ReservaCupo from '../models/ReservaCupo.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import PDFGenerator from '../services/reportes/pdfGenerator.js';
import ExcelGenerator from '../services/reportes/excelGenerator.js';
import { formatearFecha } from '../services/reportes/reportStyles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ReservaCupoController {
  /**
   * 🔍 VALIDAR ESTUDIANTE REGULAR SOLO POR CI
   * POST /api/reserva-cupo/validar-estudiante
   * Público
   */
  static async validarEstudiante(req, res) {
    try {
      const { ci } = req.body;

      if (!ci || !ci.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Debe ingresar el Carnet de Identidad (CI) del estudiante'
        });
      }

      const resultado = await ReservaCupo.validarEstudiantePorCI(ci);

      if (!resultado.valido) {
        return res.status(400).json({
          success: false,
          error_tipo: resultado.error_tipo,
          message: resultado.mensaje
        });
      }

      res.json({
        success: true,
        data: resultado
      });

    } catch (error) {
      console.error('Error al validar estudiante para reserva:', error);
      res.status(500).json({
        success: false,
        message: 'Error al validar estudiante: ' + error.message
      });
    }
  }

  /**
   * ✅ CONFIRMAR RESERVA DE CUPO (1 O MÚLTIPLES ESTUDIANTES)
   * POST /api/reserva-cupo/confirmar
   * Público
   */
  static async confirmarReserva(req, res) {
    try {
      const {
        estudiantes, // Array de { estudiante_id, grado_actual_id, grado_destino_id, turno_destino_id }
        estudiante_id, // Si vino individual
        periodo_academico_id,
        grado_actual_id,
        grado_destino_id,
        turno_destino_id,
        tutor_nombre,
        tutor_ci,
        tutor_parentesco,
        tutor_telefono,
        observaciones
      } = req.body;

      if (!tutor_nombre || !tutor_ci || !tutor_parentesco || !tutor_telefono) {
        return res.status(400).json({
          success: false,
          message: 'Debe completar los datos de la persona que realiza la reserva (Nombre, CI, Parentesco y Celular)'
        });
      }

      // Normalizar lista de estudiantes
      let listaEstudiantes = [];
      if (Array.isArray(estudiantes) && estudiantes.length > 0) {
        listaEstudiantes = estudiantes;
      } else if (estudiante_id && grado_destino_id && turno_destino_id) {
        listaEstudiantes = [{
          estudiante_id,
          grado_actual_id: grado_actual_id || null,
          grado_destino_id,
          turno_destino_id
        }];
      } else {
        return res.status(400).json({
          success: false,
          message: 'Debe especificar al menos un estudiante con su grado y turno de destino'
        });
      }

      // Si no viene periodo_academico_id, obtener el de 2027
      let periodoId = periodo_academico_id;
      if (!periodoId) {
        const periodo2027 = await ReservaCupo.obtenerPeriodoSiguiente();
        periodoId = periodo2027?.id;
      }

      const resultado = await ReservaCupo.crearReservaMultiple({
        estudiantes: listaEstudiantes,
        periodo_academico_id: periodoId,
        tutor_nombre,
        tutor_ci,
        tutor_parentesco,
        tutor_telefono,
        observaciones
      });

      // Registro de actividad
      const reqInfo = RequestInfo.extract(req);
      ActividadLog.create({
        usuario_id: null,
        accion: 'reserva_cupo_multiple_confirmada',
        modulo: 'reserva_cupo',
        tabla_afectada: 'reserva_cupo',
        registro_id: resultado.reservas[0]?.id || null,
        datos_nuevos: {
          cantidad: resultado.cantidad,
          codigos: resultado.reservas.map(r => r.codigo_reserva),
          tutor_nombre,
          tutor_telefono
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Reserva para ${resultado.cantidad} estudiante(s) por ${tutor_nombre} (${tutor_parentesco})`
      }).catch(err => console.error('Error log reserva:', err));

      res.status(201).json({
        success: true,
        message: resultado.mensaje,
        data: {
          reservas: resultado.reservas,
          reserva_principal: resultado.reservas[0]
        }
      });

    } catch (error) {
      console.error('Error al confirmar reserva:', error);
      res.status(500).json({
        success: false,
        message: 'Error al confirmar la reserva: ' + error.message
      });
    }
  }

  /**
   * 📄 CONSULTAR RESERVA POR CÓDIGO
   * GET /api/reserva-cupo/consultar/:codigo
   */
  static async consultarPorCodigo(req, res) {
    try {
      const { codigo } = req.params;
      const reserva = await ReservaCupo.obtenerPorCodigo(codigo);

      if (!reserva) {
        return res.status(404).json({
          success: false,
          message: 'No se encontró ninguna reserva con el código especificado'
        });
      }

      res.json({
        success: true,
        data: reserva
      });

    } catch (error) {
      console.error('Error al consultar reserva:', error);
      res.status(500).json({
        success: false,
        message: 'Error al consultar reserva: ' + error.message
      });
    }
  }

  /**
   * 🖨️ GENERAR RECIBO EN PDF (Formato Oficial Media Hoja)
   * GET /api/reserva-cupo/recibo/:codigo/pdf
   */
  static async generarReciboPDF(req, res) {
    try {
      const { codigo } = req.params;
      const { preview = 'false' } = req.query;

      const reserva = await ReservaCupo.obtenerPorCodigo(codigo);

      if (!reserva) {
        return res.status(404).json({
          success: false,
          message: 'Reserva no encontrada'
        });
      }

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 25, bottom: 25, left: 35, right: 35 }
      });

      const disposition = preview === 'true' ? 'inline' : 'attachment';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename=Recibo_Reserva_${reserva.codigo_reserva}.pdf`
      );

      doc.pipe(res);

      await ReservaCupoController.dibujarContenidoRecibo(doc, reserva);

      doc.end();

    } catch (error) {
      console.error('Error al generar PDF de reserva:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error al generar el recibo en PDF: ' + error.message
        });
      }
    }
  }

  /**
   * Dibuja el recibo institucional
   */
  static async dibujarContenidoRecibo(doc, reserva) {
    const darkBlue = '#1e3a8a';
    const yellowBorder = '#fbbf24';
    const darkGray = '#1f2937';
    const lightGray = '#6b7280';
    const bgLight = '#f8fafc';
    const borderGray = '#e2e8f0';

    const pageWidth = 542;
    const startX = 35;
    const startY = 25;

    // 1. Marca de agua
    const watermarkPath = path.join(__dirname, '../public/logo.png');
    if (fs.existsSync(watermarkPath)) {
      try {
        doc.save();
        doc.opacity(0.05).image(watermarkPath, 200, 75, { width: 170, height: 170 });
        doc.restore();
      } catch (err) {
        console.log('Marca de agua no cargada');
      }
    }

    // 2. Líneas superiores
    doc.rect(startX, startY, pageWidth, 4).fill(darkBlue);
    doc.rect(startX, startY + 4, pageWidth, 2).fill(yellowBorder);

    // 3. Header con logo y título
    let logoX = startX + 10;
    if (fs.existsSync(watermarkPath)) {
      try {
        doc.image(watermarkPath, logoX, startY + 12, { width: 34, height: 34 });
        logoX += 42;
      } catch (e) { }
    }

    doc.fontSize(10).font('Helvetica-Bold').fillColor(darkBlue)
      .text('U.E.P. LA VOZ DE CRISTO', logoX, startY + 14);
    doc.fontSize(7).font('Helvetica').fillColor(lightGray)
      .text('Educación Cristiana Integral · Inicial - Primaria - Secundaria', logoX, startY + 27);
    doc.text('Potosí - Bolivia', logoX, startY + 36);

    // Caja de Número de Recibo
    const boxReciboX = 390;
    const boxReciboY = startY + 10;
    const boxReciboW = 187;
    const boxReciboH = 38;

    doc.rect(boxReciboX, boxReciboY, boxReciboW, boxReciboH)
      .fillAndStroke(bgLight, darkBlue);

    doc.fontSize(8).font('Helvetica-Bold').fillColor(darkBlue)
      .text('RECIBO DE RESERVA DE CUPO', boxReciboX, boxReciboY + 6, { width: boxReciboW, align: 'center' });
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#dc2626')
      .text(reserva.codigo_recibo || reserva.codigo_reserva, boxReciboX, boxReciboY + 19, { width: boxReciboW, align: 'center' });

    // 4. Metadata
    const metaY = startY + 54;
    doc.rect(startX, metaY, pageWidth, 16).fill('#f1f5f9');

    doc.fontSize(7).font('Helvetica-Bold').fillColor(darkGray)
      .text(`FECHA DE EMISIÓN: `, startX + 10, metaY + 4, { continued: true })
      .font('Helvetica').text(`${reserva.fecha_reserva_formateada} hrs.`);

    doc.font('Helvetica-Bold').text(`CÓDIGO DE RESERVA: `, startX + 260, metaY + 4, { continued: true })
      .font('Helvetica').fillColor(darkBlue).text(reserva.codigo_reserva);

    doc.font('Helvetica-Bold').fillColor(darkGray).text(`ESTADO: `, startX + 440, metaY + 4, { continued: true })
      .font('Helvetica-Bold').fillColor('#16a34a').text('CONFIRMADO');

    // 5. Sección 1: Estudiante
    const sec1Y = metaY + 22;
    doc.rect(startX, sec1Y, pageWidth, 14).fill(darkBlue);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff')
      .text('1. INFORMACIÓN DEL ESTUDIANTE REGULAR', startX + 8, sec1Y + 3);

    const cont1Y = sec1Y + 14;
    doc.rect(startX, cont1Y, pageWidth, 42).stroke(borderGray);

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(darkGray)
      .text('Nombre Completo:', startX + 10, cont1Y + 6)
      .font('Helvetica').text(reserva.estudiante_nombre_completo, startX + 90, cont1Y + 6);

    doc.font('Helvetica-Bold')
      .text('Código Estudiante:', startX + 10, cont1Y + 19)
      .font('Helvetica').text(reserva.estudiante_codigo, startX + 90, cont1Y + 19);

    doc.font('Helvetica-Bold')
      .text('Carnet de Identidad (CI):', startX + 220, cont1Y + 19)
      .font('Helvetica').text(reserva.estudiante_ci || 'N/A', startX + 325, cont1Y + 19);

    doc.font('Helvetica-Bold')
      .text('Grado Actual:', startX + 10, cont1Y + 31)
      .font('Helvetica').text(reserva.grado_actual_nombre || 'N/A', startX + 90, cont1Y + 31);

    // 6. Sección 2: Cupo Reservado
    const sec2Y = cont1Y + 48;
    doc.rect(startX, sec2Y, pageWidth, 14).fill(darkBlue);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff')
      .text('2. DETALLE DEL CUPO RESERVADO (GESTIÓN 2027)', startX + 8, sec2Y + 3);

    const cont2Y = sec2Y + 14;
    doc.rect(startX, cont2Y, pageWidth, 42).stroke(borderGray);

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(darkGray)
      .text('Gestión Académica:', startX + 10, cont2Y + 6)
      .font('Helvetica-Bold').fillColor(darkBlue).text(reserva.periodo_nombre, startX + 100, cont2Y + 6);

    doc.font('Helvetica-Bold').fillColor(darkGray)
      .text('Nivel Académico:', startX + 280, cont2Y + 6)
      .font('Helvetica').text(reserva.nivel_destino_nombre, startX + 370, cont2Y + 6);

    doc.font('Helvetica-Bold').fillColor(darkGray)
      .text('Grado Proyectado:', startX + 10, cont2Y + 19)
      .font('Helvetica-Bold').fillColor('#16a34a').text(reserva.grado_destino_nombre, startX + 100, cont2Y + 19);

    doc.font('Helvetica-Bold').fillColor(darkGray)
      .text('Observaciones:', startX + 10, cont2Y + 31)
      .font('Helvetica').fillColor(lightGray).text(reserva.observaciones || 'Sin observaciones.', startX + 100, cont2Y + 31);

    // 7. Sección 3: Tutor
    const sec3Y = cont2Y + 48;
    doc.rect(startX, sec3Y, pageWidth, 14).fill(darkBlue);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff')
      .text('3. DATOS DE LA PERSONA QUE REALIZA LA RESERVA', startX + 8, sec3Y + 3);

    const cont3Y = sec3Y + 14;
    doc.rect(startX, cont3Y, pageWidth, 36).stroke(borderGray);

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(darkGray)
      .text('Nombre del Tutor:', startX + 10, cont3Y + 7)
      .font('Helvetica').text(reserva.tutor_nombre, startX + 95, cont3Y + 7);

    doc.font('Helvetica-Bold')
      .text('Parentesco:', startX + 310, cont3Y + 7)
      .font('Helvetica-Bold').fillColor(darkBlue).text(reserva.tutor_parentesco, startX + 375, cont3Y + 7);

    doc.font('Helvetica-Bold')
      .text('Carnet (CI):', startX + 10, cont3Y + 21)
      .font('Helvetica').text(reserva.tutor_ci, startX + 95, cont3Y + 21);

    doc.font('Helvetica-Bold')
      .text('Celular / WhatsApp:', startX + 310, cont3Y + 21)
      .font('Helvetica').fillColor('#059669').text(reserva.tutor_telefono, startX + 405, cont3Y + 21);

    // 8. QR y Nota
    const qrSectionY = cont3Y + 43;
    const qrData = `LVC-RESERVA:${reserva.codigo_reserva}|EST:${reserva.estudiante_ci}|GRADO:${reserva.grado_destino_nombre}|TURNO:${reserva.turno_destino_nombre}|TUTOR:${reserva.tutor_nombre}|GESTION:${reserva.periodo_nombre}`;
    try {
      const qrDataUrl = await QRCode.toDataURL(qrData, { errorCorrectionLevel: 'M', margin: 1, width: 65 });
      const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
      doc.image(qrBuffer, startX + 10, qrSectionY, { width: 55, height: 55 });
    } catch (qrErr) {
      console.error('Error QR:', qrErr);
    }

    doc.rect(startX + 75, qrSectionY, pageWidth - 75, 55).fillAndStroke('#fefce8', '#fde047');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#854d0e')
      .text('CONSTANCIA OFICIAL DE RESERVA DE CUPO:', startX + 83, qrSectionY + 6);
    doc.font('Helvetica').fillColor('#713f12')
      .text(`• Este comprobante certifica la reserva oficial del cupo escolar para la ${reserva.periodo_nombre}.`, startX + 83, qrSectionY + 16)
      .text('• Como estudiante regular, su cupo queda asegurado para la siguiente gestión escolar.', startX + 83, qrSectionY + 26)
      .text('• Conserve este recibo digital o impreso para la formalización de la matrícula en Secretaría.', startX + 83, qrSectionY + 36)
      .text('• Verificación en línea mediante escaneo del código QR oficial de la U.E.P. La Voz de Cristo.', startX + 83, qrSectionY + 46);

    // 9. Firmas
  }

  /**
   * 📊 LISTAR RESERVAS (Panel Administrativo)
   * GET /api/reserva-cupo/admin/listado
   */
  static async listarAdmin(req, res) {
    try {
      const {
        periodo_academico_id,
        grado_destino_id,
        nivel_destino_id,
        turno_destino_id,
        estado,
        search,
        page,
        limit
      } = req.query;

      const resultado = await ReservaCupo.listar({
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id, 10) : undefined,
        grado_destino_id: grado_destino_id ? parseInt(grado_destino_id, 10) : undefined,
        nivel_destino_id: nivel_destino_id ? parseInt(nivel_destino_id, 10) : undefined,
        turno_destino_id: turno_destino_id ? parseInt(turno_destino_id, 10) : undefined,
        estado,
        search,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20
      });

      res.json({
        success: true,
        data: resultado
      });

    } catch (error) {
      console.error('Error al listar reservas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar reservas: ' + error.message
      });
    }
  }

  /**
   * 📈 ESTADÍSTICAS DE RESERVAS (Panel Administrativo)
   * GET /api/reserva-cupo/admin/estadisticas
   */
  static async obtenerEstadisticas(req, res) {
    try {
      const { periodo_academico_id } = req.query;
      const stats = await ReservaCupo.obtenerEstadisticas(
        periodo_academico_id ? parseInt(periodo_academico_id, 10) : null
      );

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Error al obtener estadísticas de reservas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener estadísticas: ' + error.message
      });
    }
  }

  /**
   * 📊 EXPORTAR REPORTE DE RESERVAS EN PDF O EXCEL (Estilo Docentes / Reportes)
   * GET /api/reserva-cupo/admin/exportar
   */
  static async exportarReservas(req, res) {
    try {
      const {
        formato = 'pdf',
        periodo_academico_id,
        grado_destino_id,
        nivel_destino_id,
        search
      } = req.query;

      const resultado = await ReservaCupo.listar({
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id, 10) : undefined,
        grado_destino_id: grado_destino_id ? parseInt(grado_destino_id, 10) : undefined,
        nivel_destino_id: nivel_destino_id ? parseInt(nivel_destino_id, 10) : undefined,
        search,
        page: 1,
        limit: 2000
      });

      const reservas = resultado.reservas || [];

      const stats = await ReservaCupo.obtenerEstadisticas(
        periodo_academico_id ? parseInt(periodo_academico_id, 10) : null
      );

      if (formato === 'excel') {
        return await ReservaCupoController._excelReservas(res, reservas, stats.resumen);
      } else {
        return ReservaCupoController._pdfReservas(res, reservas, stats.resumen);
      }

    } catch (error) {
      console.error('Error al exportar reservas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al exportar reporte: ' + error.message
      });
    }
  }

  /**
   * Generación de PDF institucional tipo Docente / Calificaciones
   */
  static _pdfReservas(res, reservas, resumen) {
    const pdf = new PDFGenerator({ margin: 35, landscape: true, title: 'Reporte de Reservas de Cupos 2027' });
    const fechaStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Reservas_Cupos_2027_${fechaStr}.pdf`);
    pdf.pipe(res);

    pdf.drawHeader(
      'REPORTE OFICIAL DE RESERVAS DE CUPOS',
      'Gestión Académica 2027 · Estudiantes Regulares · U.E.P. La Voz de Cristo'
    );

    pdf.drawInfoBox([
      { label: 'Gestión Destino', value: 'Gestión 2027' },
      { label: 'Fecha de Emisión', value: formatearFecha(new Date(), 'largo') },
      { label: 'Total Reservas', value: (reservas.length).toString() },
      { label: 'Estado General', value: 'Confirmadas para Inscripción' },
    ], 2);

    pdf.drawSection('RESUMEN POR NIVELES ACADÉMICOS');
    pdf.drawStatsGrid([
      { label: 'Total Reservados', value: resumen?.total_reservas || reservas.length },
      { label: 'Nivel Inicial', value: resumen?.total_inicial || 0 },
      { label: 'Nivel Primaria', value: resumen?.total_primaria || 0 },
      { label: 'Nivel Secundaria', value: resumen?.total_secundaria || 0 },
    ], 4);

    pdf.drawSection('DETALLE DE ESTUDIANTES CON CUPO RESERVADO');
    const headers = ['#', 'Nº Recibo', 'Cód. Reserva', 'Estudiante', 'CI', 'Grado 2027', 'Persona que Reservó', 'Teléfono'];
    const colWidths = [22, 68, 65, 140, 55, 95, 115, 60];

    const rows = reservas.map((r, idx) => [
      (idx + 1).toString(),
      r.codigo_recibo || '—',
      r.codigo_reserva || '—',
      r.estudiante_nombre_completo || '—',
      r.estudiante_ci || '—',
      r.grado_destino_nombre || '—',
      `${r.tutor_nombre} (${r.tutor_parentesco})`,
      r.tutor_telefono || '—'
    ]);

    pdf.drawTable(headers, rows, { columnWidths: colWidths });
    pdf.end();
  }

  /**
   * Generación de Excel con estilos institucionales
   */
  static async _excelReservas(res, reservas, resumen) {
    const excel = new ExcelGenerator();
    const ws = excel.createSheet('Reservas de Cupos 2027', { landscape: true });

    excel.addTitle(
      ws,
      'REPORTE OFICIAL DE RESERVAS DE CUPOS',
      'Gestión Académica 2027 · Estudiantes Regulares · U.E.P. La Voz de Cristo'
    );

    excel.addInfoBox(ws, [
      { label: 'Gestión', value: 'Gestión 2027' },
      { label: 'Fecha de Emisión', value: formatearFecha(new Date(), 'largo') },
      { label: 'Total Registros', value: reservas.length },
    ]);

    excel.addStats(ws, [
      { label: 'Total Reservas', value: resumen?.total_reservas || reservas.length },
      { label: 'Nivel Inicial', value: resumen?.total_inicial || 0 },
      { label: 'Nivel Primaria', value: resumen?.total_primaria || 0 },
      { label: 'Nivel Secundaria', value: resumen?.total_secundaria || 0 },
    ], 4);

    const headers = ['#', 'Nº Recibo', 'Cód. Reserva', 'Estudiante', 'CI', 'Grado Actual', 'Grado Destino (2027)', 'Persona que Reservó', 'Parentesco', 'CI Tutor', 'Teléfono / WhatsApp', 'Fecha Registro'];
    const rows = reservas.map((r, idx) => [
      idx + 1,
      r.codigo_recibo,
      r.codigo_reserva,
      r.estudiante_nombre_completo,
      r.estudiante_ci,
      r.grado_actual_nombre || '—',
      r.grado_destino_nombre,
      r.tutor_nombre,
      r.tutor_parentesco,
      r.tutor_ci,
      r.tutor_telefono,
      r.fecha_reserva_formateada
    ]);

    excel.addTable(ws, headers, rows, {
      sectionTitle: 'LISTA DE ESTUDIANTES CON CUPO RESERVADO',
      columnWidths: [6, 16, 16, 28, 14, 18, 20, 24, 14, 14, 16, 18]
    });

    excel.addFooter(ws);

    const fechaStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Reservas_Cupos_2027_${fechaStr}.xlsx`);
    await excel.write(res);
    res.end();
  }
}

export default ReservaCupoController;
