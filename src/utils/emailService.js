// src/utils/emailService.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true', 
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    this.fromName = process.env.EMAIL_FROM_NAME || 'Unidad Educativa Particular La Voz de Cristo';
    this.fromAddress = process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER;
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  /**
   * Método genérico para enviar emails
   */
  async enviarEmail({ to, subject, html, text }) {
    try {
      const mailOptions = {
        from: `"${this.fromName}" <${this.fromAddress}>`,
        to,
        subject,
        html,
        text: text || this.stripHtml(html), // Fallback a texto plano
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email enviado:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Error al enviar email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Notificar cambio de estado de preinscripción
   */
  async notificarCambioEstado(preinscripcion, estadoAnterior) {
    const { estudiante, tutor } = preinscripcion;
    
    // Lista de destinatarios
    const destinatarios = [];
    
    // Agregar email del estudiante si existe
    if (estudiante?.email) {
      destinatarios.push(estudiante.email);
    }
    
    // Agregar email del tutor/padre si existe
    if (tutor?.email) {
      destinatarios.push(tutor.email);
    }

    // Si no hay emails, no enviar
    if (destinatarios.length === 0) {
      console.log('⚠️ No hay emails registrados para esta preinscripción');
      return { success: false, message: 'No hay emails para notificar' };
    }

    const estadoInfo = this.obtenerInfoEstado(preinscripcion.estado);
    const nombreCompleto = `${estudiante.nombres} ${estudiante.apellido_paterno} ${estudiante.apellido_materno || ''}`.trim();

    const subject = `${estadoInfo.emoji} ${estadoInfo.titulo} - Preinscripción ${preinscripcion.codigo_inscripcion}`;
    
    const html = this.generarTemplateEstado({
      nombreEstudiante: nombreCompleto,
      nombreTutor: tutor ? `${tutor.nombres} ${tutor.apellido_paterno}` : 'Padre/Tutor',
      codigoInscripcion: preinscripcion.codigo_inscripcion,
      estadoAnterior,
      estadoNuevo: preinscripcion.estado,
      estadoInfo,
      observaciones: preinscripcion.observaciones,
      motivoRechazo: preinscripcion.motivo_rechazo,
      fechaCambio: new Date().toLocaleString('es-BO', { 
        dateStyle: 'full', 
        timeStyle: 'short' 
      })
    });

    return await this.enviarEmail({
      to: destinatarios.join(', '),
      subject,
      html
    });
  }

  /**
   * Notificar conversión exitosa a estudiante oficial
   */
  async notificarConversion(datosConversion) {
    const { estudiante, credenciales, tutor, matricula } = datosConversion;
    
    const destinatarios = [];
    if (tutor?.email) destinatarios.push(tutor.email);
    if (estudiante?.email) destinatarios.push(estudiante.email);

    if (destinatarios.length === 0) {
      return { success: false, message: 'No hay emails para notificar' };
    }

    const subject = `🎉 ¡Inscripción Aprobada! - ${estudiante.nombres} ${estudiante.apellido_paterno}`;
    
    const html = this.generarTemplateConversion({
      nombreEstudiante: `${estudiante.nombres} ${estudiante.apellido_paterno}`,
      nombreTutor: tutor ? `${tutor.nombres} ${tutor.apellido_paterno}` : 'Padre/Tutor',
      codigoEstudiante: estudiante.codigo,
      numeroMatricula: matricula.numero_matricula,
      credencialesEstudiante: credenciales.estudiante,
      credencialesPadre: credenciales.padre
    });

    return await this.enviarEmail({
      to: destinatarios.join(', '),
      subject,
      html
    });
  }

  /**
   * Obtener información del estado
   */
  obtenerInfoEstado(estado) {
    const estados = {
      'iniciada': {
        emoji: '📝',
        titulo: 'Preinscripción Iniciada',
        color: '#3b82f6',
        mensaje: 'Tu solicitud de preinscripción ha sido registrada correctamente.'
      },
      'datos_completos': {
        emoji: '✅',
        titulo: 'Datos Completos',
        color: '#10b981',
        mensaje: 'Hemos recibido toda tu información. Procederemos a revisarla.'
      },
      'documentos_pendientes': {
        emoji: '📄',
        titulo: 'Documentos Pendientes',
        color: '#f59e0b',
        mensaje: 'Faltan documentos por subir. Por favor, completa la documentación.'
      },
      'en_revision': {
        emoji: '🔍',
        titulo: 'En Revisión',
        color: '#8b5cf6',
        mensaje: 'Estamos revisando tu solicitud y documentos.'
      },
      'documentos_aprobados': {
        emoji: '✅',
        titulo: 'Documentos Aprobados',
        color: '#10b981',
        mensaje: 'Tus documentos han sido aprobados.'
      },
      'entrevista_pendiente': {
        emoji: '📅',
        titulo: 'Entrevista Pendiente',
        color: '#f59e0b',
        mensaje: 'Te contactaremos pronto para programar una entrevista.'
      },
      'entrevista_programada': {
        emoji: '📅',
        titulo: 'Entrevista Programada',
        color: '#3b82f6',
        mensaje: 'Tu entrevista ha sido programada. Revisa los detalles.'
      },
      'entrevista_completada': {
        emoji: '✅',
        titulo: 'Entrevista Completada',
        color: '#10b981',
        mensaje: 'La entrevista se realizó exitosamente.'
      },
      'aprobada': {
        emoji: '🎉',
        titulo: '¡Preinscripción Aprobada!',
        color: '#10b981',
        mensaje: '¡Felicitaciones! Tu solicitud ha sido aprobada.'
      },
      'rechazada': {
        emoji: '❌',
        titulo: 'Preinscripción Rechazada',
        color: '#ef4444',
        mensaje: 'Lamentablemente tu solicitud no ha sido aprobada.'
      },
      'convertida': {
        emoji: '🎓',
        titulo: '¡Inscripción Completada!',
        color: '#10b981',
        mensaje: 'Has sido oficialmente inscrito como estudiante.'
      },
      'expirada': {
        emoji: '⏰',
        titulo: 'Preinscripción Expirada',
        color: '#6b7280',
        mensaje: 'El plazo de inscripción ha vencido.'
      },
      'cancelada': {
        emoji: '🚫',
        titulo: 'Preinscripción Cancelada',
        color: '#6b7280',
        mensaje: 'La preinscripción ha sido cancelada.'
      }
    };

    return estados[estado] || {
      emoji: '📋',
      titulo: 'Actualización de Estado',
      color: '#6b7280',
      mensaje: 'El estado de tu preinscripción ha cambiado.'
    };
  }

  /**
   * Template HTML para cambio de estado
   */
  generarTemplateEstado(data) {
    const { nombreEstudiante, nombreTutor, codigoInscripcion, estadoNuevo, estadoInfo, observaciones, motivoRechazo, fechaCambio } = data;

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${estadoInfo.titulo}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f3f4f6;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: white;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, ${estadoInfo.color} 0%, ${estadoInfo.color}dd 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
      font-weight: 700;
    }
    .emoji {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 18px;
      color: #1f2937;
      margin-bottom: 20px;
    }
    .info-box {
      background: #f9fafb;
      border-left: 4px solid ${estadoInfo.color};
      padding: 20px;
      margin: 20px 0;
      border-radius: 8px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin: 10px 0;
      font-size: 14px;
    }
    .info-label {
      font-weight: 600;
      color: #6b7280;
    }
    .info-value {
      color: #1f2937;
      font-weight: 500;
    }
    .message {
      background: #eff6ff;
      border: 1px solid #dbeafe;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
      color: #1e40af;
      font-size: 15px;
      line-height: 1.6;
    }
    .warning {
      background: #fef3c7;
      border: 1px solid #fde68a;
      color: #92400e;
    }
    .error {
      background: #fee2e2;
      border: 1px solid #fecaca;
      color: #991b1b;
    }
    .button {
      display: inline-block;
      background: ${estadoInfo.color};
      color: white;
      padding: 14px 28px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      margin: 20px 0;
      transition: all 0.3s;
    }
    .button:hover {
      opacity: 0.9;
      transform: translateY(-2px);
    }
    .footer {
      background: #f9fafb;
      padding: 30px;
      text-align: center;
      color: #6b7280;
      font-size: 13px;
      line-height: 1.6;
    }
    .contact-info {
      margin: 15px 0;
    }
    .contact-info a {
      color: ${estadoInfo.color};
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="emoji">${estadoInfo.emoji}</div>
      <h1>${estadoInfo.titulo}</h1>
      <p style="margin: 0; opacity: 0.95;">Código: ${codigoInscripcion}</p>
    </div>
    
    <div class="content">
      <p class="greeting">Estimado/a <strong>${nombreTutor}</strong>,</p>
      
      <p>Te informamos que el estado de la preinscripción de <strong>${nombreEstudiante}</strong> ha sido actualizado.</p>
      
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">📋 Código de Preinscripción:</span>
          <span class="info-value">${codigoInscripcion}</span>
        </div>
        <div class="info-row">
          <span class="info-label">👤 Estudiante:</span>
          <span class="info-value">${nombreEstudiante}</span>
        </div>
        <div class="info-row">
          <span class="info-label">📊 Estado Actual:</span>
          <span class="info-value" style="color: ${estadoInfo.color}; font-weight: 700;">${estadoInfo.titulo}</span>
        </div>
        <div class="info-row">
          <span class="info-label">📅 Fecha de Actualización:</span>
          <span class="info-value">${fechaCambio}</span>
        </div>
      </div>
      
      <div class="message ${estadoNuevo === 'rechazada' ? 'error' : estadoNuevo === 'documentos_pendientes' ? 'warning' : ''}">
        <strong>${estadoInfo.mensaje}</strong>
      </div>
      
      ${observaciones ? `
        <div class="message">
          <strong>📝 Observaciones:</strong><br>
          ${observaciones}
        </div>
      ` : ''}
      
      ${motivoRechazo ? `
        <div class="message error">
          <strong>❌ Motivo del Rechazo:</strong><br>
          ${motivoRechazo}
        </div>
      ` : ''}
      
      ${estadoNuevo === 'en_revision' || estadoNuevo === 'aprobada' ? `
        <p>Puedes consultar el estado de tu preinscripción en cualquier momento desde nuestro portal web.</p>
      ` : ''}
      
      ${estadoNuevo === 'documentos_pendientes' ? `
        <p><strong>⚠️ Acción Requerida:</strong> Por favor, completa la carga de documentos lo antes posible para continuar con el proceso.</p>
      ` : ''}
    </div>
    
    <div class="footer">
      <p><strong>Colegio La Voz de Cristo High School</strong></p>
      <div class="contact-info">
        📍 Avenida Argentina Nro 200 entre Calle Trujillo y Luis Espinal<br>
        📞 +591 69624189 • 76162425 • 68420862<br>
        ✉️ <a href="mailto:lavozdecristohighschool@gmail.com">lavozdecristohighschool@gmail.com</a>
      </div>
      <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">
        Este es un correo automático, por favor no responder. Si tienes preguntas, contáctanos por nuestros canales oficiales.
      </p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Template HTML para conversión exitosa
   */
  generarTemplateConversion(data) {
    const { nombreEstudiante, nombreTutor, codigoEstudiante, numeroMatricula, credencialesEstudiante, credencialesPadre } = data;

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>¡Inscripción Completada!</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f3f4f6;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: white;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 32px;
      font-weight: 700;
    }
    .emoji {
      font-size: 64px;
      margin-bottom: 10px;
      animation: bounce 1s infinite;
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
    .content {
      padding: 40px 30px;
    }
    .congratulations {
      text-align: center;
      font-size: 20px;
      color: #10b981;
      font-weight: 700;
      margin-bottom: 30px;
    }
    .info-box {
      background: #f0fdf4;
      border: 2px solid #10b981;
      padding: 25px;
      margin: 20px 0;
      border-radius: 12px;
    }
    .info-row {
      margin: 12px 0;
      font-size: 15px;
    }
    .info-label {
      font-weight: 600;
      color: #065f46;
    }
    .info-value {
      color: #1f2937;
      font-weight: 500;
      font-size: 16px;
    }
    .credentials-box {
      background: #eff6ff;
      border: 2px solid #3b82f6;
      padding: 20px;
      margin: 20px 0;
      border-radius: 12px;
    }
    .credentials-box h3 {
      color: #1e40af;
      margin: 0 0 15px 0;
      font-size: 18px;
    }
    .credential-item {
      background: white;
      padding: 12px;
      margin: 8px 0;
      border-radius: 6px;
      font-family: 'Courier New', monospace;
      font-size: 14px;
    }
    .credential-label {
      color: #6b7280;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .credential-value {
      color: #1f2937;
      font-size: 16px;
      font-weight: 700;
      margin-top: 4px;
    }
    .warning-box {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin: 20px 0;
      border-radius: 8px;
      color: #92400e;
      font-size: 14px;
    }
    .footer {
      background: #f9fafb;
      padding: 30px;
      text-align: center;
      color: #6b7280;
      font-size: 13px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="emoji">🎉</div>
      <h1>¡Felicitaciones!</h1>
      <p style="margin: 0; font-size: 18px;">Inscripción Completada Exitosamente</p>
    </div>
    
    <div class="content">
      <p class="congratulations">
        ¡Bienvenido/a ${nombreEstudiante} a nuestra familia educativa!
      </p>
      
      <p>Estimado/a <strong>${nombreTutor}</strong>,</p>
      <p>Nos complace informarte que <strong>${nombreEstudiante}</strong> ha sido oficialmente inscrito/a como estudiante.</p>
      
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">🎓 Código de Estudiante:</span><br>
          <span class="info-value">${codigoEstudiante}</span>
        </div>
        <div class="info-row">
          <span class="info-label">📋 Número de Matrícula:</span><br>
          <span class="info-value">${numeroMatricula}</span>
        </div>
        <div class="info-row">
          <span class="info-label">👤 Estudiante:</span><br>
          <span class="info-value">${nombreEstudiante}</span>
        </div>
      </div>
      
      ${credencialesEstudiante ? `
        <div class="credentials-box">
          <h3>🔐 Credenciales de Acceso - Estudiante</h3>
          <div class="credential-item">
            <div class="credential-label">Usuario</div>
            <div class="credential-value">${credencialesEstudiante.username}</div>
          </div>
          <div class="credential-item">
            <div class="credential-label">Contraseña Temporal</div>
            <div class="credential-value">${credencialesEstudiante.password}</div>
          </div>
          <div class="credential-item">
            <div class="credential-label">Correo Electrónico</div>
            <div class="credential-value">${credencialesEstudiante.email}</div>
          </div>
        </div>
      ` : ''}
      
      ${credencialesPadre ? `
        <div class="credentials-box">
          <h3>🔐 Credenciales de Acceso - Padre/Tutor</h3>
          <div class="credential-item">
            <div class="credential-label">Usuario</div>
            <div class="credential-value">${credencialesPadre.username}</div>
          </div>
          <div class="credential-item">
            <div class="credential-label">Contraseña Temporal</div>
            <div class="credential-value">${credencialesPadre.password}</div>
          </div>
          <div class="credential-item">
            <div class="credential-label">Correo Electrónico</div>
            <div class="credential-value">${credencialesPadre.email}</div>
          </div>
        </div>
      ` : ''}
      
      ${credencialesEstudiante || credencialesPadre ? `
        <div class="warning-box">
          <strong>⚠️ IMPORTANTE - Seguridad:</strong>
          <ul style="margin: 10px 0 0 0; padding-left: 20px;">
            <li>Estas son contraseñas temporales</li>
            <li>Debes cambiarlas en tu primer inicio de sesión</li>
            <li>No compartas tus credenciales con nadie</li>
            <li>Guarda este correo en un lugar seguro</li>
          </ul>
        </div>
      ` : ''}
      
      <p style="margin-top: 30px;">
        <strong>Próximos pasos:</strong>
      </p>
      <ol style="line-height: 1.8; color: #4b5563;">
        <li>Accede al portal con tus credenciales</li>
        <li>Cambia tu contraseña temporal</li>
        <li>Completa tu perfil si es necesario</li>
        <li>Revisa el calendario académico</li>
      </ol>
    </div>
    
    <div class="footer">
      <p><strong>Colegio La Voz de Cristo High School</strong></p>
      <div style="margin: 15px 0;">
        📍 Avenida Argentina Nro 200 entre Calle Trujillo y Luis Espinal<br>
        📞 +591 69624189 • 76162425 • 68420862<br>
        ✉️ <a href="mailto:lavozdecristohighschool@gmail.com" style="color: #10b981; text-decoration: none;">lavozdecristohighschool@gmail.com</a>
      </div>
      <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">
        Este es un correo automático. Si tienes preguntas, contáctanos por nuestros canales oficiales.
      </p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Remover tags HTML para texto plano
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Verificar configuración
   */
  async verificarConfiguracion() {
    try {
      await this.transporter.verify();
      console.log('✅ Servicio de email configurado correctamente');
      return true;
    } catch (error) {
      console.error('❌ Error en configuración de email:', error);
      return false;
    }
  }
}

export default new EmailService();