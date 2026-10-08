// controllers/reservaCupoController.js
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import ReservaCupo from '../models/ReservaCupo.js';
import ReservaCupoHermano from '../models/ReservaCupoHermano.js';
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
   * 🔍 CONSULTAR DISPONIBILIDAD DE CUPO PARA HERMANO (Público)
   * GET /api/reserva-cupo/disponibilidad-hermano
   */
  static async consultarDisponibilidadHermano(req, res) {
    try {
      const { grado_id, turno_id, periodo_id } = req.query;

      if (!grado_id || !turno_id) {
        return res.status(400).json({
          success: false,
          message: 'Debe especificar grado_id y turno_id'
        });
      }

      const resultado = await ReservaCupoHermano.consultarDisponibilidad({
        gradoId: parseInt(grado_id, 10),
        turnoId: parseInt(turno_id, 10),
        periodoId: periodo_id ? parseInt(periodo_id, 10) : null
      });

      res.json({
        success: true,
        data: resultado
      });

    } catch (error) {
      console.error('Error al consultar disponibilidad para hermano:', error);
      res.status(500).json({
        success: false,
        message: 'Error al consultar disponibilidad: ' + error.message
      });
    }
  }

  /**
   * ✅ CONFIRMAR RESERVA DE CUPO (REGULARES Y HERMANOS NUEVOS)
   * POST /api/reserva-cupo/confirmar
   * Público
   */
  static async confirmarReserva(req, res) {
    try {
      const {
        estudiantes, // Array de { estudiante_id, grado_actual_id, grado_destino_id, turno_destino_id, continua, confirma_continuidad, motivo_no_continua }
        hermanos,    // Array de { hermano_regular_id, grado_solicitado_id, turno_solicitado_id, nombres, apellido_paterno, apellido_materno, ci, fecha_nacimiento, genero, observaciones }
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

      // Normalizar lista de estudiantes regulares
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
      }

      const listaHermanos = Array.isArray(hermanos) ? hermanos : [];

      if (listaEstudiantes.length === 0 && listaHermanos.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Debe especificar al menos un estudiante regular o un hermano nuevo para registrar'
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
        hermanos: listaHermanos,
        periodo_academico_id: periodoId,
        tutor_nombre,
        tutor_ci,
        tutor_parentesco,
        tutor_telefono,
        observaciones
      });

      // Registro de actividad
      const reqInfo = RequestInfo.extract(req);
      const totalRegistrados = (resultado.reservas?.length || 0) + (resultado.hermanos?.length || 0);
      const codigosCreados = [
        ...(resultado.reservas || []).map(r => r.codigo_reserva),
        ...(resultado.hermanos || []).map(h => h.codigo_reserva)
      ];

      ActividadLog.create({
        usuario_id: null,
        accion: 'reserva_cupo_multiple_confirmada',
        modulo: 'reserva_cupo',
        tabla_afectada: 'reserva_cupo',
        registro_id: resultado.reservas[0]?.id || resultado.hermanos[0]?.id || null,
        datos_nuevos: {
          cantidad_regulares: resultado.cantidad_regulares,
          cantidad_hermanos: resultado.cantidad_hermanos,
          codigos: codigosCreados,
          tutor_nombre,
          tutor_telefono
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Reserva para ${totalRegistrados} hijo(s) (${resultado.cantidad_regulares} regulares, ${resultado.cantidad_hermanos} hermanos) por ${tutor_nombre} (${tutor_parentesco})`
      }).catch(err => console.error('Error log reserva:', err));

      res.status(201).json({
        success: true,
        message: resultado.mensaje,
        data: {
          reservas: resultado.reservas,
          hermanos: resultado.hermanos,
          reserva_principal: resultado.reservas[0] || resultado.hermanos[0]
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
   * 📄 CONSULTAR RESERVA POR CÓDIGO (REGULAR O HERMANO)
   * GET /api/reserva-cupo/consultar/:codigo
   */
  static async consultarPorCodigo(req, res) {
    try {
      const { codigo } = req.params;
      let reserva = await ReservaCupo.obtenerPorCodigo(codigo);

      if (!reserva) {
        reserva = await ReservaCupoHermano.obtenerPorCodigo(codigo);
      }

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
   * 🖨️ GENERAR RECIBO EN PDF (REGULAR O HERMANO)
   * GET /api/reserva-cupo/recibo/:codigo/pdf
   */
  static async generarReciboPDF(req, res) {
    try {
      const { codigo } = req.params;
      const { preview = 'false' } = req.query;

      let reserva = await ReservaCupo.obtenerPorCodigo(codigo);
      if (!reserva) {
        reserva = await ReservaCupoHermano.obtenerPorCodigo(codigo);
      }

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
   * 🛑 SOLICITAR ANULACIÓN DE RESERVA (Público - por el padre/tutor)
   * POST /api/reserva-cupo/solicitar-anulacion
   */
  static async solicitarAnulacion(req, res) {
    try {
      const { codigo, motivo, tutor_ci, estudiante_ci, ci } = req.body;

      if (!codigo || !codigo.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Debe ingresar el código de reserva o recibo'
        });
      }

      if (!motivo || !motivo.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Debe ingresar el motivo de la anulación'
        });
      }

      const resultado = await ReservaCupo.solicitarAnulacion({
        codigo: codigo.trim(),
        motivo: motivo.trim(),
        estudiante_ci: estudiante_ci ? estudiante_ci.trim() : undefined,
        ci: ci ? ci.trim() : undefined,
        tutor_ci: tutor_ci ? tutor_ci.trim() : undefined
      });

      // Registro de actividad
      const reqInfo = RequestInfo.extract(req);
      ActividadLog.create({
        usuario_id: null,
        accion: 'solicitud_anulacion_reserva',
        modulo: 'reserva_cupo',
        tabla_afectada: 'reserva_cupo',
        registro_id: resultado.id,
        datos_nuevos: { codigo, motivo },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Solicitud de anulación para reserva ${resultado.codigo_reserva} (${resultado.estudiante_nombre_completo})`
      }).catch(err => console.error('Error log anulación:', err));

      res.json({
        success: true,
        message: 'Su solicitud de anulación ha sido registrada exitosamente. Será procesada por Dirección / Secretaría.',
        data: resultado
      });

    } catch (error) {
      console.error('Error al solicitar anulación:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * ❌ ANULAR RESERVA DEFINITIVAMENTE (Panel Admin)
   * POST /api/reserva-cupo/admin/:id/anular
   */
  static async anularReservaAdmin(req, res) {
    try {
      const { id } = req.params;
      const { motivo } = req.body;
      const usuarioId = req.user?.id || null;

      const resultado = await ReservaCupo.anularReserva(parseInt(id, 10), {
        motivo,
        usuario_id: usuarioId
      });

      // Registro de actividad
      const reqInfo = RequestInfo.extract(req);
      ActividadLog.create({
        usuario_id: usuarioId,
        accion: 'anulacion_reserva_admin',
        modulo: 'reserva_cupo',
        tabla_afectada: 'reserva_cupo',
        registro_id: resultado.id,
        datos_nuevos: { motivo },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Reserva ${resultado.codigo_reserva} anulada por administración`
      }).catch(err => console.error('Error log anulación admin:', err));

      res.json({
        success: true,
        message: 'Reserva anulada exitosamente.',
        data: resultado
      });

    } catch (error) {
      console.error('Error al anular reserva admin:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * 🔄 REACTIVAR / RESTITUIR RESERVA (Panel Admin)
   * POST /api/reserva-cupo/admin/:id/reactivar
   */
  static async reactivarReservaAdmin(req, res) {
    try {
      const { id } = req.params;
      const { motivo } = req.body;
      const usuarioId = req.user?.id || null;

      const resultado = await ReservaCupo.reactivarReserva(parseInt(id, 10), {
        motivo,
        usuario_id: usuarioId
      });

      // Registro de actividad
      const reqInfo = RequestInfo.extract(req);
      ActividadLog.create({
        usuario_id: usuarioId,
        accion: 'reactivacion_reserva_admin',
        modulo: 'reserva_cupo',
        tabla_afectada: 'reserva_cupo',
        registro_id: resultado.id,
        datos_nuevos: { motivo },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Reserva ${resultado.codigo_reserva} reactivada por administración`
      }).catch(err => console.error('Error log reactivación admin:', err));

      res.json({
        success: true,
        message: 'Reserva reactivada y confirmada exitosamente.',
        data: resultado
      });

    } catch (error) {
      console.error('Error al reactivar reserva admin:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
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

    const esHermano = Boolean(
      reserva.hermano_regular_id || 
      (reserva.codigo_reserva && (reserva.codigo_reserva.startsWith('HER-') || reserva.codigo_reserva.startsWith('ESP-')))
    );
    const esEspera = reserva.estado === 'en_espera';
    const esNoContinua = reserva.estado === 'no_continua';
    const esSolicitudAnulacion = reserva.estado === 'solicitud_anulacion';
    const esAnulada = reserva.estado === 'anulada' || reserva.estado === 'cancelada';

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
    const topBarColor = esNoContinua ? '#b91c1c' : (esEspera ? '#d97706' : darkBlue);
    const topBorderColor = esNoContinua ? '#fca5a5' : (esEspera ? '#fde68a' : yellowBorder);
    doc.rect(startX, startY, pageWidth, 4).fill(topBarColor);
    doc.rect(startX, startY + 4, pageWidth, 2).fill(topBorderColor);

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
    const boxReciboX = 370;
    const boxReciboY = startY + 10;
    const boxReciboW = 207;
    const boxReciboH = 38;

    doc.rect(boxReciboX, boxReciboY, boxReciboW, boxReciboH)
      .fillAndStroke(bgLight, esNoContinua ? '#b91c1c' : (esEspera ? '#d97706' : darkBlue));

    let tituloReciboBox = 'RECIBO DE RESERVA DE CUPO';
    if (esHermano) {
      tituloReciboBox = esEspera ? 'LISTA DE ESPERA FAMILIAR' : 'RESERVA PRIORITARIA HERMANO';
    } else if (esNoContinua) {
      tituloReciboBox = 'CONSTANCIA DE NO CONTINUIDAD';
    } else if (esAnulada) {
      tituloReciboBox = 'RESERVA ANULADA';
    }

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(esNoContinua ? '#b91c1c' : (esEspera ? '#d97706' : darkBlue))
      .text(tituloReciboBox, boxReciboX, boxReciboY + 6, { width: boxReciboW, align: 'center' });
    doc.fontSize(11).font('Helvetica-Bold').fillColor(esNoContinua ? '#b91c1c' : (esEspera ? '#d97706' : '#dc2626'))
      .text(reserva.codigo_recibo || reserva.codigo_reserva, boxReciboX, boxReciboY + 19, { width: boxReciboW, align: 'center' });

    // 4. Metadata
    const metaY = startY + 54;
    doc.rect(startX, metaY, pageWidth, 16).fill('#f1f5f9');

    doc.fontSize(7).font('Helvetica-Bold').fillColor(darkGray)
      .text(`FECHA DE EMISIÓN: `, startX + 10, metaY + 4, { continued: true })
      .font('Helvetica').text(`${reserva.fecha_reserva_formateada} hrs.`);

    doc.font('Helvetica-Bold').text(`CÓDIGO: `, startX + 245, metaY + 4, { continued: true })
      .font('Helvetica').fillColor(darkBlue).text(reserva.codigo_reserva);

    let estadoTexto = 'CONFIRMADO';
    let estadoColor = '#16a34a';

    if (esHermano && esEspera) {
      estadoTexto = `EN ESPERA (PUESTO #${reserva.posicion_espera || 1})`;
      estadoColor = '#d97706';
    } else if (esNoContinua) {
      estadoTexto = 'NO CONTINUARÁ';
      estadoColor = '#b91c1c';
    } else if (esSolicitudAnulacion) {
      estadoTexto = 'SOLICITUD ANULACIÓN';
      estadoColor = '#d97706';
    } else if (esAnulada) {
      estadoTexto = 'ANULADA';
      estadoColor = '#b91c1c';
    }

    doc.font('Helvetica-Bold').fillColor(darkGray).text(`ESTADO: `, startX + 415, metaY + 4, { continued: true })
      .font('Helvetica-Bold').fillColor(estadoColor).text(estadoTexto);

    // 5. Sección 1: Estudiante o Hermano
    const sec1Y = metaY + 22;
    doc.rect(startX, sec1Y, pageWidth, 14).fill(topBarColor);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff')
      .text(esHermano ? '1. INFORMACIÓN DEL HERMANO POSTULANTE (PRIORIDAD FAMILIAR)' : '1. INFORMACIÓN DEL ESTUDIANTE REGULAR', startX + 8, sec1Y + 3);

    const cont1Y = sec1Y + 14;
    doc.rect(startX, cont1Y, pageWidth, 42).stroke(borderGray);

    if (esHermano) {
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(darkGray)
        .text('Nombre del Postulante:', startX + 10, cont1Y + 6)
        .font('Helvetica').text(reserva.nombre_completo || reserva.nombres || 'N/A', startX + 115, cont1Y + 6);

      doc.font('Helvetica-Bold')
        .text('Carnet / Certificado:', startX + 320, cont1Y + 6)
        .font('Helvetica').text(reserva.ci || 'Sin CI registrado', startX + 420, cont1Y + 6);

      doc.font('Helvetica-Bold')
        .text('Hermano Regular LVC:', startX + 10, cont1Y + 19)
        .font('Helvetica-Bold').fillColor(darkBlue).text(`${reserva.regular_nombre_completo || 'Estudiante Regular'} (Cód: ${reserva.regular_codigo || 'N/A'})`, startX + 115, cont1Y + 19);

      doc.font('Helvetica-Bold').fillColor(darkGray)
        .text('Fecha Nacimiento:', startX + 320, cont1Y + 19)
        .font('Helvetica').text(reserva.fecha_nacimiento_formateada || String(reserva.fecha_nacimiento || 'N/A'), startX + 420, cont1Y + 19);

      doc.font('Helvetica-Bold')
        .text('Tipo de Postulante:', startX + 10, cont1Y + 31)
        .font('Helvetica-Bold').fillColor('#059669').text('HERMANO DE ESTUDIANTE ACTIVO (Prioridad Familiar Institucional)', startX + 115, cont1Y + 31);
    } else {
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
    }

    // 6. Sección 2: Cupo o Declaración
    const sec2Y = cont1Y + 48;
    doc.rect(startX, sec2Y, pageWidth, 14).fill(topBarColor);
    let sec2Titulo = `2. DETALLE DEL CUPO RESERVADO (${reserva.periodo_nombre || 'GESTIÓN 2027'})`;
    if (esHermano) {
      sec2Titulo = esEspera
        ? `2. SOLICITUD EN LISTA DE ESPERA PRIORITARIA (${reserva.periodo_nombre || 'GESTIÓN 2027'})`
        : `2. DETALLE DEL CUPO RESERVADO PARA HERMANO (${reserva.periodo_nombre || 'GESTIÓN 2027'})`;
    } else if (esNoContinua) {
      sec2Titulo = `2. DECLARACIÓN DE NO CONTINUIDAD (${reserva.periodo_nombre || 'GESTIÓN 2027'})`;
    }

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff')
      .text(sec2Titulo, startX + 8, sec2Y + 3);

    const cont2Y = sec2Y + 14;
    doc.rect(startX, cont2Y, pageWidth, 42).stroke(borderGray);

    if (esHermano) {
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(darkGray)
        .text('Gestión Académica:', startX + 10, cont2Y + 6)
        .font('Helvetica-Bold').fillColor(darkBlue).text(reserva.periodo_nombre || 'Gestión 2027', startX + 100, cont2Y + 6);

      doc.font('Helvetica-Bold').fillColor(darkGray)
        .text('Nivel Académico:', startX + 280, cont2Y + 6)
        .font('Helvetica').text(reserva.nivel_solicitado_nombre || reserva.nivel_destino_nombre || 'Nivel Escolar', startX + 370, cont2Y + 6);

      doc.font('Helvetica-Bold').fillColor(darkGray)
        .text('Grado Solicitado:', startX + 10, cont2Y + 19)
        .font('Helvetica-Bold').fillColor(esEspera ? '#d97706' : '#16a34a').text(reserva.grado_solicitado_nombre || reserva.grado_destino_nombre, startX + 100, cont2Y + 19);

      doc.font('Helvetica-Bold').fillColor(darkGray)
        .text('Turno Solicitado:', startX + 280, cont2Y + 19)
        .font('Helvetica').text(reserva.turno_solicitado_nombre || reserva.turno_destino_nombre || 'Mañana', startX + 370, cont2Y + 19);

      doc.font('Helvetica-Bold').fillColor(darkGray)
        .text('Condición:', startX + 10, cont2Y + 31)
        .font('Helvetica').fillColor(lightGray).text(
          esEspera
            ? `En Lista de Espera (Puesto #${reserva.posicion_espera || 1}) sujeta a liberación de cupos al cierre de plazo.`
            : `Cupo confirmado directo con prioridad familiar por vacante nativa disponible.`,
          startX + 100, cont2Y + 31
        );

    } else if (esNoContinua) {
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(darkGray)
        .text('Decisión Declarada:', startX + 10, cont2Y + 6)
        .font('Helvetica-Bold').fillColor('#b91c1c').text('NO CONTINUARÁ EN LA INSTITUCIÓN', startX + 105, cont2Y + 6);

      doc.font('Helvetica-Bold').fillColor(darkGray)
        .text('Grado Proyectado:', startX + 310, cont2Y + 6)
        .font('Helvetica').text(`${reserva.grado_destino_nombre} (${reserva.nivel_destino_nombre})`, startX + 395, cont2Y + 6);

      doc.font('Helvetica-Bold').fillColor(darkGray)
        .text('Motivo de No Continuidad:', startX + 10, cont2Y + 19)
        .font('Helvetica').fillColor('#7f1d1d').text(reserva.motivo_no_continua || reserva.observaciones || 'Declaración voluntaria del tutor.', startX + 125, cont2Y + 19);

      doc.font('Helvetica-Bold').fillColor(darkGray)
        .text('Cupo escolar:', startX + 10, cont2Y + 31)
        .font('Helvetica').fillColor(lightGray).text('Liberado formalmente para disposición de la institución educativa.', startX + 105, cont2Y + 31);
    } else {
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
        .text('Turno Asignado:', startX + 280, cont2Y + 19)
        .font('Helvetica').text(reserva.turno_destino_nombre || 'Mañana', startX + 370, cont2Y + 19);

      doc.font('Helvetica-Bold').fillColor(darkGray)
        .text('Observaciones:', startX + 10, cont2Y + 31)
        .font('Helvetica').fillColor(lightGray).text(reserva.observaciones || 'Sin observaciones.', startX + 100, cont2Y + 31);
    }

    // 7. Sección 3: Tutor
    const sec3Y = cont2Y + 48;
    doc.rect(startX, sec3Y, pageWidth, 14).fill(topBarColor);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff')
      .text('3. DATOS DE LA PERSONA QUE REALIZA EL TRÁMITE', startX + 8, sec3Y + 3);

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
    const qrData = esHermano
      ? `LVC-HER:${reserva.codigo_reserva}|HERMANO:${reserva.nombre_completo || reserva.nombres || ''}|REGULAR:${reserva.regular_ci || ''}|ESTADO:${reserva.estado}`
      : `LVC-${esNoContinua ? 'NOC' : 'RES'}:${reserva.codigo_reserva}|EST:${reserva.estudiante_ci}|ESTADO:${reserva.estado}|TUTOR:${reserva.tutor_nombre}|GESTION:${reserva.periodo_nombre}`;

    try {
      const qrDataUrl = await QRCode.toDataURL(qrData, { errorCorrectionLevel: 'M', margin: 1, width: 65 });
      const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
      doc.image(qrBuffer, startX + 10, qrSectionY, { width: 55, height: 55 });
    } catch (qrErr) {
      console.error('Error QR:', qrErr);
    }

    if (esHermano) {
      if (esEspera) {
        doc.rect(startX + 75, qrSectionY, pageWidth - 75, 55).fillAndStroke('#fffbeb', '#fcd34d');
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#b45309')
          .text(`SOLICITUD EN LISTA DE ESPERA PRIORITARIA (PUESTO #${reserva.posicion_espera || 1}):`, startX + 83, qrSectionY + 6);
        doc.font('Helvetica').fillColor('#92400e')
          .text(`• Este comprobante certifica la solicitud de cupo prioritario para hermano nuevo en ${reserva.periodo_nombre || 'Gestión 2027'}.`, startX + 83, qrSectionY + 16)
          .text('• Los hermanos cuentan con la máxima prioridad familiar al cierre del periodo oficial de reserva.', startX + 83, qrSectionY + 26)
          .text('• Secretaría se contactará con el tutor para formalizar la matrícula una vez liberadas las vacantes.', startX + 83, qrSectionY + 36)
          .text('• Verificación oficial mediante escaneo del código QR de la U.E.P. La Voz de Cristo.', startX + 83, qrSectionY + 46);
      } else {
        doc.rect(startX + 75, qrSectionY, pageWidth - 75, 55).fillAndStroke('#f0fdf4', '#86efac');
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#166534')
          .text('CONSTANCIA OFICIAL DE RESERVA DE CUPO PARA HERMANO:', startX + 83, qrSectionY + 6);
        doc.font('Helvetica').fillColor('#14532d')
          .text(`• Este comprobante certifica la asignación oficial de cupo prioritario para la ${reserva.periodo_nombre || 'Gestión 2027'}.`, startX + 83, qrSectionY + 16)
          .text('• El cupo escolar queda reservado con base en la Prioridad Familiar institucional del colegio.', startX + 83, qrSectionY + 26)
          .text('• Conserve este recibo digital o impreso para la formalización de la matrícula en Secretaría.', startX + 83, qrSectionY + 36)
          .text('• Verificación oficial mediante escaneo del código QR de la U.E.P. La Voz de Cristo.', startX + 83, qrSectionY + 46);
      }
    } else if (esNoContinua) {
      doc.rect(startX + 75, qrSectionY, pageWidth - 75, 55).fillAndStroke('#fef2f2', '#fca5a5');
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#991b1b')
        .text('CONSTANCIA OFICIAL DE NO RENOVACIÓN DE CUPO:', startX + 83, qrSectionY + 6);
      doc.font('Helvetica').fillColor('#7f1d1d')
        .text(`• Este comprobante certifica la declaración voluntaria del tutor de NO renovar cupo para la ${reserva.periodo_nombre}.`, startX + 83, qrSectionY + 16)
        .text('• El cupo del estudiante queda oficialmente liberado para ser asignado por el colegio.', startX + 83, qrSectionY + 26)
        .text('• Si la familia cambia de opinión, cualquier reincorporación requerirá trámite presencial en Secretaría.', startX + 83, qrSectionY + 36)
        .text('• Verificación oficial mediante escaneo del código QR de la U.E.P. La Voz de Cristo.', startX + 83, qrSectionY + 46);
    } else if (esAnulada) {
      doc.rect(startX + 75, qrSectionY, pageWidth - 75, 55).fillAndStroke('#fef2f2', '#fca5a5');
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#991b1b')
        .text('RESERVA DE CUPO ANULADA:', startX + 83, qrSectionY + 6);
      doc.font('Helvetica').fillColor('#7f1d1d')
        .text('• La reserva para este estudiante fue anulada formalmente en Dirección / Secretaría.', startX + 83, qrSectionY + 16)
        .text(`• Motivo: ${reserva.motivo_anulacion || 'Anulación solicitada por el tutor/administración'}.`, startX + 83, qrSectionY + 26)
        .text('• Para restituir o reactivar el cupo, debe apersonarse presencialmente a la institución.', startX + 83, qrSectionY + 36)
        .text('• Verificación oficial mediante escaneo del código QR institucional.', startX + 83, qrSectionY + 46);
    } else {
      doc.rect(startX + 75, qrSectionY, pageWidth - 75, 55).fillAndStroke('#fefce8', '#fde047');
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#854d0e')
        .text('CONSTANCIA OFICIAL DE RESERVA DE CUPO:', startX + 83, qrSectionY + 6);
      doc.font('Helvetica').fillColor('#713f12')
        .text(`• Este comprobante certifica la reserva oficial del cupo escolar para la ${reserva.periodo_nombre}.`, startX + 83, qrSectionY + 16)
        .text('• Como estudiante regular, su cupo queda asegurado para la siguiente gestión escolar.', startX + 83, qrSectionY + 26)
        .text('• Conserve este recibo digital o impreso para la formalización de la matrícula en Secretaría.', startX + 83, qrSectionY + 36)
        .text('• Verificación en línea mediante escaneo del código QR oficial de la U.E.P. La Voz de Cristo.', startX + 83, qrSectionY + 46);
    }
  }

  /**
   * 👥 LISTAR HERMANOS REGISTRADOS (Panel Administrativo)
   * GET /api/reserva-cupo/admin/hermanos
   */
  static async listarHermanosAdmin(req, res) {
    try {
      const {
        periodo_academico_id,
        grado_solicitado_id,
        turno_solicitado_id,
        estado,
        search,
        page,
        limit
      } = req.query;

      const resultado = await ReservaCupoHermano.listarAdmin({
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id, 10) : undefined,
        grado_solicitado_id: grado_solicitado_id ? parseInt(grado_solicitado_id, 10) : undefined,
        turno_solicitado_id: turno_solicitado_id ? parseInt(turno_solicitado_id, 10) : undefined,
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
      console.error('Error al listar hermanos admin:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar hermanos: ' + error.message
      });
    }
  }

  /**
   * ⭐ PROMOVER HERMANO DE LISTA DE ESPERA A CONFIRMADO (Panel Administrativo)
   * POST /api/reserva-cupo/admin/hermanos/:id/promover
   */
  static async promoverHermanoAdmin(req, res) {
    try {
      const { id } = req.params;
      const { motivo } = req.body;

      const resultado = await ReservaCupoHermano.promoverAConfirmado(parseInt(id, 10), {
        motivo_reasignacion: motivo,
        usuario_id: req.user?.id || null
      });

      res.json({
        success: true,
        message: `¡El hermano ${resultado.nombre_completo} ha sido promovido exitosamente a Cupo Confirmado (${resultado.codigo_reserva})!`,
        data: resultado
      });

    } catch (error) {
      console.error('Error al promover hermano:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * ❌ ANULAR RESERVA DE HERMANO (Panel Administrativo)
   * POST /api/reserva-cupo/admin/hermanos/:id/anular
   */
  static async anularHermanoAdmin(req, res) {
    try {
      const { id } = req.params;
      const { motivo } = req.body;
      const usuarioId = req.user?.id || null;

      const resultado = await ReservaCupoHermano.anularReserva(parseInt(id, 10), {
        motivo,
        usuario_id: usuarioId
      });

      res.json({
        success: true,
        message: `Reserva del hermanito ${resultado.nombre_completo} (${resultado.codigo_reserva}) anulada exitosamente. El cupo ha quedado libre.`,
        data: resultado
      });
    } catch (error) {
      console.error('Error al anular reserva de hermano:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * 🔄 REACTIVAR RESERVA DE HERMANO (Panel Administrativo)
   * POST /api/reserva-cupo/admin/hermanos/:id/reactivar
   */
  static async reactivarHermanoAdmin(req, res) {
    try {
      const { id } = req.params;
      const { motivo } = req.body;
      const usuarioId = req.user?.id || null;

      const resultado = await ReservaCupoHermano.reactivarReserva(parseInt(id, 10), {
        motivo,
        usuario_id: usuarioId
      });

      res.json({
        success: true,
        message: `Reserva del hermanito ${resultado.nombre_completo} reactivada en estado "${resultado.estado}".`,
        data: resultado
      });
    } catch (error) {
      console.error('Error al reactivar reserva de hermano:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
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
        turno_destino_id,
        estado,
        search
      } = req.query;

      const resultado = await ReservaCupo.listar({
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id, 10) : undefined,
        grado_destino_id: grado_destino_id ? parseInt(grado_destino_id, 10) : undefined,
        nivel_destino_id: nivel_destino_id ? parseInt(nivel_destino_id, 10) : undefined,
        turno_destino_id: turno_destino_id ? parseInt(turno_destino_id, 10) : undefined,
        estado,
        search,
        page: 1,
        limit: 5000
      });

      const reservas = resultado.reservas || [];

      const stats = await ReservaCupo.obtenerEstadisticas(
        periodo_academico_id ? parseInt(periodo_academico_id, 10) : null
      );

      // Metadatos para encabezados (obtenidos del primer registro o a través del modelo)
      let gradoNombre = null;
      let turnoNombre = null;

      if (reservas.length > 0) {
        if (grado_destino_id) gradoNombre = reservas[0].grado_destino_nombre;
        if (turno_destino_id) turnoNombre = reservas[0].turno_destino_nombre;
      }

      if ((!gradoNombre && grado_destino_id) || (!turnoNombre && turno_destino_id) || nivel_destino_id) {
        const paramsMeta = await ReservaCupo.obtenerNombresParametricos({
          grado_id: grado_destino_id,
          turno_id: turno_destino_id,
          nivel_id: nivel_destino_id,
        });
        if (!gradoNombre) gradoNombre = paramsMeta.gradoNombre;
        if (!turnoNombre) turnoNombre = paramsMeta.turnoNombre;
      }

      const meta = { gradoNombre, turnoNombre };

      if (formato === 'excel') {
        return await ReservaCupoController._excelReservas(res, reservas, stats.resumen, meta);
      } else {
        return ReservaCupoController._pdfReservas(res, reservas, stats.resumen, meta);
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
  static _pdfReservas(res, reservas, resumen, meta = {}) {
    const pdf = new PDFGenerator({ margin: 35, landscape: true, title: 'Reporte de Reservas de Cupos 2027' });
    const fechaStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Reservas_Cupos_2027_${fechaStr}.pdf`);
    pdf.pipe(res);

    const subtituloPartes = ['Gestión Académica 2027', 'Estudiantes Regulares'];
    if (meta.gradoNombre) subtituloPartes.push(meta.gradoNombre);
    if (meta.turnoNombre) subtituloPartes.push(`Turno ${meta.turnoNombre}`);
    subtituloPartes.push('U.E.P. La Voz de Cristo');

    pdf.drawHeader(
      'REPORTE OFICIAL DE RESERVAS Y NO CONTINUIDAD',
      subtituloPartes.join(' · ')
    );

    const infoItems = [
      { label: 'Gestión Destino', value: 'Gestión 2027' },
      { label: 'Fecha de Emisión', value: formatearFecha(new Date(), 'largo') },
    ];
    if (meta.gradoNombre) {
      infoItems.push({ label: 'Grado Destino', value: meta.gradoNombre });
    }
    if (meta.turnoNombre) {
      infoItems.push({ label: 'Turno', value: `Turno ${meta.turnoNombre}` });
    } else {
      infoItems.push({ label: 'Turnos', value: 'Consolidado Global (Mañana y Tarde)' });
    }
    infoItems.push({ label: 'Total Registros', value: (reservas.length).toString() });
    infoItems.push({ label: 'Confirmadas', value: (resumen?.total_confirmadas || 0).toString() });
    infoItems.push({ label: 'No Continuarán', value: (resumen?.total_no_continua || 0).toString() });

    pdf.drawInfoBox(infoItems, 2);

    pdf.drawSection('RESUMEN DE REGISTROS');
    pdf.drawStatsGrid([
      { label: 'Reservas Confirmadas', value: resumen?.total_confirmadas || 0 },
      { label: 'No Continuarán', value: resumen?.total_no_continua || 0 },
      { label: 'Solicitud Anulación', value: resumen?.total_solicitud_anulacion || 0 },
      { label: 'Anuladas', value: resumen?.total_anuladas || 0 },
    ], 4);

    pdf.drawSection('DETALLE DE ESTUDIANTES');
    const headers = ['#', 'Nº Recibo', 'Cód. Reserva', 'Estudiante', 'CI', 'Grado 2027', 'Turno', 'Decisión / Estado', 'Persona que Tramitó', 'Teléfono'];
    const colWidths = [20, 60, 60, 130, 50, 85, 55, 75, 100, 55];

    const formatearEstado = (est) => {
      switch (est) {
        case 'confirmada': return 'CONFIRMADA';
        case 'no_continua': return 'NO CONTINÚA';
        case 'solicitud_anulacion': return 'SOL. ANULACIÓN';
        case 'anulada': return 'ANULADA';
        case 'cancelada': return 'CANCELADA';
        default: return (est || '').toUpperCase();
      }
    };

    const rows = reservas.map((r, idx) => [
      (idx + 1).toString(),
      r.codigo_recibo || '—',
      r.codigo_reserva || '—',
      r.estudiante_nombre_completo || '—',
      r.estudiante_ci || '—',
      r.grado_destino_nombre || '—',
      r.turno_destino_nombre ? `Turno ${r.turno_destino_nombre}` : '—',
      formatearEstado(r.estado),
      `${r.tutor_nombre} (${r.tutor_parentesco})`,
      r.tutor_telefono || '—'
    ]);

    pdf.drawTable(headers, rows, { columnWidths: colWidths });
    pdf.end();
  }

  /**
   * Generación de Excel con estilos institucionales
   */
  static async _excelReservas(res, reservas, resumen, meta = {}) {
    const excel = new ExcelGenerator();
    const ws = excel.createSheet('Reservas de Cupos 2027', { landscape: true });

    const subtituloExcel = ['Gestión Académica 2027', 'Estudiantes Regulares'];
    if (meta.gradoNombre) subtituloExcel.push(meta.gradoNombre);
    if (meta.turnoNombre) subtituloExcel.push(`Turno ${meta.turnoNombre}`);
    subtituloExcel.push('U.E.P. La Voz de Cristo');

    excel.addTitle(
      ws,
      'REPORTE OFICIAL DE RESERVAS Y NO CONTINUIDAD',
      subtituloExcel.join(' · ')
    );

    const infoBoxItems = [
      { label: 'Gestión', value: 'Gestión 2027' },
      { label: 'Fecha de Emisión', value: formatearFecha(new Date(), 'largo') },
    ];
    if (meta.gradoNombre) {
      infoBoxItems.push({ label: 'Grado Destino', value: meta.gradoNombre });
    }
    if (meta.turnoNombre) {
      infoBoxItems.push({ label: 'Turno', value: `Turno ${meta.turnoNombre}` });
    }
    infoBoxItems.push({ label: 'Total Registros', value: reservas.length });
    infoBoxItems.push({ label: 'Confirmadas', value: resumen?.total_confirmadas || 0 });
    infoBoxItems.push({ label: 'No Continuarán', value: resumen?.total_no_continua || 0 });

    excel.addInfoBox(ws, infoBoxItems);

    excel.addStats(ws, [
      { label: 'Confirmadas', value: resumen?.total_confirmadas || 0 },
      { label: 'No Continuarán', value: resumen?.total_no_continua || 0 },
      { label: 'Solicitud Anulación', value: resumen?.total_solicitud_anulacion || 0 },
      { label: 'Anuladas', value: resumen?.total_anuladas || 0 },
    ], 4);

    const formatearEstado = (est) => {
      switch (est) {
        case 'confirmada': return 'Confirmada';
        case 'no_continua': return 'No Continuará';
        case 'solicitud_anulacion': return 'Solicitud Anulación';
        case 'anulada': return 'Anulada';
        case 'cancelada': return 'Cancelada';
        default: return est || '—';
      }
    };

    const headers = ['#', 'Nº Recibo', 'Cód. Reserva', 'Estudiante', 'CI', 'Grado Actual', 'Grado Destino (2027)', 'Turno Destino', 'Estado / Decisión', 'Motivo Detallado', 'Persona que Tramitó', 'Parentesco', 'CI Tutor', 'Teléfono / WhatsApp', 'Fecha Registro'];
    const rows = reservas.map((r, idx) => [
      idx + 1,
      r.codigo_recibo,
      r.codigo_reserva,
      r.estudiante_nombre_completo,
      r.estudiante_ci,
      r.grado_actual_nombre || '—',
      r.grado_destino_nombre,
      r.turno_destino_nombre ? `Turno ${r.turno_destino_nombre}` : '—',
      formatearEstado(r.estado),
      r.motivo_no_continua || r.motivo_anulacion || r.observaciones || '—',
      r.tutor_nombre,
      r.tutor_parentesco,
      r.tutor_ci,
      r.tutor_telefono,
      r.fecha_reserva_formateada
    ]);

    excel.addTable(ws, headers, rows, {
      sectionTitle: 'LISTA DE ESTUDIANTES REGULARES (GESTIÓN 2027)',
      columnWidths: [6, 16, 16, 28, 14, 18, 20, 16, 18, 26, 24, 14, 14, 16, 18]
    });

    excel.addFooter(ws);

    const fechaStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Reservas_Cupos_2027_${fechaStr}.xlsx`);
    await excel.write(res);
    res.end();
  }

  /**
   * 📊 EXPORTAR REPORTE DE HERMANOS EN PDF O EXCEL (Prioridad Familiar)
   * GET /api/reserva-cupo/admin/hermanos/exportar
   */
  static async exportarHermanos(req, res) {
    try {
      const {
        formato = 'pdf',
        periodo_academico_id,
        grado_solicitado_id,
        turno_solicitado_id,
        estado,
        search
      } = req.query;

      const resultado = await ReservaCupoHermano.listarAdmin({
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id, 10) : undefined,
        grado_solicitado_id: grado_solicitado_id ? parseInt(grado_solicitado_id, 10) : undefined,
        turno_solicitado_id: turno_solicitado_id ? parseInt(turno_solicitado_id, 10) : undefined,
        estado: estado || undefined,
        search: search || undefined,
        page: 1,
        limit: 5000
      });

      const hermanos = resultado.hermanos || [];
      const resumen = await ReservaCupoHermano.obtenerEstadisticas(
        periodo_academico_id ? parseInt(periodo_academico_id, 10) : null
      );

      if (formato === 'excel') {
        return await ReservaCupoController._excelHermanos(res, hermanos, resumen);
      } else {
        return ReservaCupoController._pdfHermanos(res, hermanos, resumen);
      }

    } catch (error) {
      console.error('Error al exportar hermanos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al exportar reporte de hermanos: ' + error.message
      });
    }
  }

  /**
   * Generación de PDF oficial para hermanos postulantes (Prioridad Familiar)
   */
  static _pdfHermanos(res, hermanos, resumen) {
    const pdf = new PDFGenerator({ margin: 35, landscape: true, title: 'Reporte de Hermanos Postulantes 2027' });
    const fechaStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Hermanos_Postulantes_2027_${fechaStr}.pdf`);
    pdf.pipe(res);

    pdf.drawHeader(
      'PADRÓN OFICIAL DE HERMANOS POSTULANTES 2027',
      'Gestión Académica 2027 · Prioridad Familiar Institucional · U.E.P. La Voz de Cristo'
    );

    pdf.drawInfoBox([
      { label: 'Gestión Destino', value: 'Gestión 2027' },
      { label: 'Fecha de Emisión', value: formatearFecha(new Date(), 'largo') },
      { label: 'Total Postulantes', value: (hermanos.length).toString() },
      { label: 'Cupos Confirmados', value: (resumen?.total_confirmadas || 0).toString() },
      { label: 'En Lista de Espera', value: (resumen?.total_en_espera || 0).toString() },
    ], 2);

    pdf.drawSection('RESUMEN DE PRIORIDAD FAMILIAR');
    pdf.drawStatsGrid([
      { label: 'Confirmadas (Cupo Directo)', value: resumen?.total_confirmadas || 0 },
      { label: 'En Lista de Espera', value: resumen?.total_en_espera || 0 },
      { label: 'Solicitud Anulación', value: resumen?.total_solicitud_anulacion || 0 },
      { label: 'Anuladas / Canceladas', value: resumen?.total_anuladas || 0 },
    ], 4);

    pdf.drawSection('DETALLE DE HERMANOS POSTULANTES');
    const headers = [
      '#',
      'Nº Recibo',
      'Cód. Reserva',
      'Hermanito(a) Postulante',
      'CI',
      'Grado Solicitado',
      'Turno',
      'Hermano Regular Respaldo',
      'Estado / Condición',
      'Tutor / Familiar',
      'Teléfono'
    ];
    const colWidths = [20, 60, 60, 110, 48, 70, 45, 115, 75, 90, 50];

    const formatearEstado = (h) => {
      if (h.estado === 'confirmada') return 'CONFIRMADA';
      if (h.estado === 'en_espera') return `EN ESPERA (#${h.posicion_espera || 1})`;
      if (h.estado === 'solicitud_anulacion') return 'SOL. ANULACIÓN';
      if (h.estado === 'anulada') return 'ANULADA';
      return (h.estado || '').toUpperCase();
    };

    const rows = hermanos.map((h, idx) => [
      (idx + 1).toString(),
      h.codigo_recibo || '—',
      h.codigo_reserva || '—',
      h.nombre_completo || `${h.nombres} ${h.apellido_paterno}`,
      h.ci || 'Sin CI',
      h.grado_solicitado_nombre || '—',
      h.turno_solicitado_nombre || '—',
      `${h.regular_nombre_completo || '—'} (${h.regular_codigo || '—'})`,
      formatearEstado(h),
      `${h.tutor_nombre} (${h.tutor_parentesco})`,
      h.tutor_telefono || '—'
    ]);

    pdf.drawTable(headers, rows, { columnWidths: colWidths });
    pdf.end();
  }

  /**
   * Generación de Excel con estilos institucionales para hermanos
   */
  static async _excelHermanos(res, hermanos, resumen) {
    const excel = new ExcelGenerator();
    const ws = excel.createSheet('Hermanos Postulantes 2027', { landscape: true });

    excel.addTitle(
      ws,
      'PADRÓN OFICIAL DE HERMANOS POSTULANTES 2027',
      'Gestión Académica 2027 · Prioridad Familiar Institucional · U.E.P. La Voz de Cristo'
    );

    excel.addInfoBox(ws, [
      { label: 'Gestión', value: 'Gestión 2027' },
      { label: 'Fecha de Emisión', value: formatearFecha(new Date(), 'largo') },
      { label: 'Total Postulantes', value: hermanos.length },
      { label: 'Cupos Confirmados', value: resumen?.total_confirmadas || 0 },
      { label: 'En Lista de Espera', value: resumen?.total_en_espera || 0 },
    ]);

    excel.addStats(ws, [
      { label: 'Confirmadas (Cupo Directo)', value: resumen?.total_confirmadas || 0 },
      { label: 'En Lista de Espera', value: resumen?.total_en_espera || 0 },
      { label: 'Solicitud Anulación', value: resumen?.total_solicitud_anulacion || 0 },
      { label: 'Anuladas / Canceladas', value: resumen?.total_anuladas || 0 },
    ], 4);

    const formatearEstado = (h) => {
      if (h.estado === 'confirmada') return 'Confirmada (Cupo Directo)';
      if (h.estado === 'en_espera') return `En Espera (Puesto #${h.posicion_espera || 1})`;
      if (h.estado === 'solicitud_anulacion') return 'Solicitud Anulación';
      if (h.estado === 'anulada') return 'Anulada';
      return h.estado || '—';
    };

    const headers = [
      '#',
      'Nº Recibo',
      'Cód. Reserva',
      'Hermanito(a) Postulante',
      'CI Postulante',
      'Fecha Nacimiento',
      'Grado Solicitado',
      'Turno Solicitado',
      'Estado / Condición',
      'Puesto Espera',
      'Hermano Regular (Colegio)',
      'CI Hermano Regular',
      'Cód Hermano Regular',
      'Tutor / Familiar',
      'Parentesco',
      'CI Tutor',
      'Teléfono / WhatsApp',
      'Fecha Registro'
    ];

    const rows = hermanos.map((h, idx) => [
      idx + 1,
      h.codigo_recibo || '—',
      h.codigo_reserva || '—',
      h.nombre_completo || `${h.nombres} ${h.apellido_paterno}`,
      h.ci || 'Sin CI',
      h.fecha_nacimiento_formateada || h.fecha_nacimiento || '—',
      h.grado_solicitado_nombre || '—',
      h.turno_solicitado_nombre || '—',
      formatearEstado(h),
      h.posicion_espera ? `#${h.posicion_espera}` : '0',
      h.regular_nombre_completo || '—',
      h.regular_ci || '—',
      h.regular_codigo || '—',
      h.tutor_nombre || '—',
      h.tutor_parentesco || '—',
      h.tutor_ci || '—',
      h.tutor_telefono || '—',
      h.fecha_reserva_formateada || '—'
    ]);

    excel.addTable(ws, headers, rows, {
      sectionTitle: 'PADRÓN DE POSTULANTES CON PRIORIDAD FAMILIAR (HERMANOS 2027)',
      columnWidths: [6, 16, 16, 26, 14, 16, 18, 16, 22, 14, 26, 14, 16, 24, 14, 14, 16, 18]
    });

    excel.addFooter(ws);

    const fechaStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Hermanos_Postulantes_2027_${fechaStr}.xlsx`);
    await excel.write(res);
    res.end();
  }

  /**
   * 📊 BALANCE DE CUPOS ASEGURADOS (CONTINUIDAD REGULAR)
   * GET /api/reserva-cupo/admin/cupos-asegurados
   */
  static async obtenerBalanceCuposAsegurados(req, res) {
    try {
      const anioDestino = parseInt(req.query.anio_destino || '2027', 10);
      const balance = await ReservaCupo.obtenerBalanceCuposAsegurados({ anioDestino });
      res.json({
        success: true,
        data: balance
      });
    } catch (error) {
      console.error('Error al obtener balance de cupos asegurados:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener balance de cupos asegurados',
        error: error.message
      });
    }
  }

  /**
   * 📋 DETALLE DE ESTUDIANTES CON CUPO ASEGURADO
   * GET /api/reserva-cupo/admin/cupos-asegurados/estudiantes
   */
  static async obtenerEstudiantesCuposAsegurados(req, res) {
    try {
      const {
        grado_destino_id,
        turno_destino_id,
        estado_confirmacion,
        busqueda,
        limite,
        pagina
      } = req.query;

      const resultado = await ReservaCupo.obtenerEstudiantesCuposAsegurados({
        grado_destino_id: grado_destino_id ? parseInt(grado_destino_id, 10) : undefined,
        turno_id: turno_destino_id ? parseInt(turno_destino_id, 10) : undefined,
        estado_filtro: estado_confirmacion === 'confirmados' ? 'confirmada' : estado_confirmacion === 'pendientes' ? 'pendiente' : estado_confirmacion === 'no_continua' ? 'no_continua' : undefined,
        search: busqueda,
        limite: limite ? parseInt(limite, 10) : 100,
        pagina: pagina ? parseInt(pagina, 10) : 1,
        anioDestino: 2027
      });

      res.json({
        success: true,
        data: resultado
      });
    } catch (error) {
      console.error('Error al obtener estudiantes con cupo asegurado:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener estudiantes con cupo asegurado',
        error: error.message
      });
    }
  }
}

export default ReservaCupoController;
