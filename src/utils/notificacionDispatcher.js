// src/utils/notificacionDispatcher.js
// Orquesta el envío multicanal de notificaciones institucionales
// Consume whatsappService y emailService — no sabe CÓMO envían, solo LES dice que envíen

import whatsappService from './whatsappService.js';
import emailService    from './emailService.js';
import NotificacionInstitucional from '../models/Notificacion.js';

class NotificacionDispatcher {

  // ─── Punto de entrada principal ──────────────────────────────
  async despachar(notificacion_id) {
    // 1. Cargar notificación completa
    const notif = await NotificacionInstitucional.findById(notificacion_id);
    if (!notif) throw new Error('Notificación no encontrada');
    if (notif.estado === 'enviada') throw new Error('Esta notificación ya fue enviada');

    // 2. Marcar como "enviando"
    await NotificacionInstitucional.marcarEstado(notificacion_id, 'enviando');

    try {
      // 3. Resolver quiénes son los destinatarios
      const destinatarios = await NotificacionInstitucional.resolverDestinatarios(notif);
      console.log(`📬 ${destinatarios.length} destinatarios resueltos para "${notif.titulo}"`);

      if (destinatarios.length === 0) {
        await NotificacionInstitucional.marcarEstado(notificacion_id, 'enviada');
        return { total: 0, canales: {} };
      }

      // 4. Determinar canales activos
      const canales = [];
      if (notif.enviar_whatsapp) canales.push('whatsapp');
      if (notif.enviar_email)    canales.push('email');
      if (notif.enviar_interno)  canales.push('interno');

      // 5. Insertar destinatarios en BD (estado: pendiente/omitido)
      const registros = await NotificacionInstitucional.insertarDestinatarios(
        notificacion_id, destinatarios, canales
      );
      console.log(`📝 ${registros.length} registros de destinatario insertados`);

      // 6. Despachar por cada canal
      // WhatsApp va secuencial (delay anti-baneo), email en paralelo
      const promesas = [];
      if (notif.enviar_whatsapp) promesas.push(this._enviarWhatsApp(notif, registros));
      if (notif.enviar_email)    promesas.push(this._enviarEmail(notif, registros));

      await Promise.allSettled(promesas);

      // 7. Marcar como enviada
      await NotificacionInstitucional.marcarEstado(notificacion_id, 'enviada');

      // 8. Obtener resumen final
      const resumen = await NotificacionInstitucional.getResumenEnvios(notificacion_id);
      console.log(`✅ Notificación "${notif.titulo}" despachada`);

      return { total: destinatarios.length, resumen };
    } catch (err) {
      await NotificacionInstitucional.marcarEstado(notificacion_id, 'fallida');
      throw err;
    }
  }

  // ─── Canal WhatsApp ───────────────────────────────────────────
  async _enviarWhatsApp(notif, registros) {
    const pendientes = registros.filter(
      r => r.canal === 'whatsapp' && r.estado_envio === 'pendiente'
    );
    console.log(`📱 WhatsApp: ${pendientes.length} mensajes a enviar`);

    const esEnvioMasivo = pendientes.length > 1;

    for (let i = 0; i < pendientes.length; i++) {
      const dest = pendientes[i];
      console.log(`⏳ Enviando a ${dest.celular_snapshot}... (${i + 1}/${pendientes.length})`);

      const body = this._formatearMensajeWhatsApp(notif);
      const resultado = await whatsappService.enviarMensaje({
        to:       dest.celular_snapshot,
        body,
        foto_url: notif.foto_url || null,
      });

      console.log(`📬 Resultado para ${dest.celular_snapshot}:`, resultado);

      await NotificacionInstitucional.actualizarEstadoDestinatario(dest.id, {
        estado_envio:  resultado.success ? 'enviado' : 'fallido',
        error_mensaje: resultado.success ? null : resultado.error,
      });

      // Delay anti-baneo solo en envíos masivos y si no es el último
      if (esEnvioMasivo && i < pendientes.length - 1) {
        const delay = Math.floor(Math.random() * 2000) + 2000; // 2-4 segundos
        console.log(`⏱️ Esperando ${(delay / 1000).toFixed(1)}s antes del siguiente...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // ─── Canal Email ──────────────────────────────────────────────
  async _enviarEmail(notif, registros) {
    const pendientes = registros.filter(
      r => r.canal === 'email' && r.estado_envio === 'pendiente'
    );
    console.log(`📧 Email: ${pendientes.length} mensajes a enviar`);

    for (const dest of pendientes) {
      if (!dest.email_snapshot) {
        await NotificacionInstitucional.actualizarEstadoDestinatario(dest.id, {
          estado_envio:  'omitido',
          error_mensaje: 'Sin email registrado',
        });
        continue;
      }

      const { subject, html } = this._formatearEmail(notif);
      const resultado = await emailService.enviarEmail({
        to:      dest.email_snapshot,
        subject,
        html,
      });

      await NotificacionInstitucional.actualizarEstadoDestinatario(dest.id, {
        estado_envio:  resultado.success ? 'enviado' : 'fallido',
        error_mensaje: resultado.success ? null : resultado.error,
      });
    }
  }

  // ─── Templates ───────────────────────────────────────────────

  _formatearMensajeWhatsApp(notif) {
    const iconos = {
      aviso_general:           '📢',
      pago_vencido:            '💳',
      comunicado_grado:        '📚',
      notificacion_individual: '📩',
    };
    const prioridadLabel = {
      urgente: '🚨 *URGENTE*\n',
      alta:    '⚠️ *IMPORTANTE*\n',
      normal:  '',
      baja:    '',
    };

    const icono     = iconos[notif.tipo]     || '📋';
    const prioridad = prioridadLabel[notif.prioridad] || '';

    return [
      `${prioridad}${icono} *${notif.titulo}*`,
      `🏫 Unidad Educativa La Voz de Cristo`,
      ``,
      notif.mensaje,
      ``,
      notif.adjunto_url ? `📎 Adjunto: ${notif.adjunto_url}` : null,
      ``,
      `📞 _Colegio: +591 69624189_`,
      `_Este es un comunicado oficial. No responder a este mensaje._`,
    ]
      .filter(l => l !== null)
      .join('\n');
  }

  _formatearEmail(notif) {
    const coloresTipo = {
      aviso_general:           '#3b82f6',
      pago_vencido:            '#ef4444',
      comunicado_grado:        '#8b5cf6',
      notificacion_individual: '#10b981',
    };
    const iconosTipo = {
      aviso_general:           '📢',
      pago_vencido:            '💳',
      comunicado_grado:        '📚',
      notificacion_individual: '📩',
    };

    const color   = coloresTipo[notif.tipo] || '#3b82f6';
    const icono   = iconosTipo[notif.tipo]  || '📋';
    const subject = `${icono} ${notif.titulo} — Unidad Educativa La Voz de Cristo`;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin:0; padding:0; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; background:#f3f4f6; }
    .container { max-width:600px; margin:40px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 6px rgba(0,0,0,.1); }
    .header { background:${color}; color:#fff; padding:36px 30px; text-align:center; }
    .header h1 { margin:0 0 8px; font-size:24px; font-weight:700; }
    .emoji { font-size:40px; margin-bottom:12px; }
    .badge { display:inline-block; background:rgba(255,255,255,.2); border-radius:20px; padding:4px 14px; font-size:12px; margin-top:8px; }
    .content { padding:36px 30px; }
    .message { font-size:15px; line-height:1.7; color:#374151; white-space:pre-wrap; }
    .adjunto { background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:14px 18px; margin:20px 0; display:flex; align-items:center; gap:10px; font-size:14px; color:#374151; }
    .footer { background:#f9fafb; padding:28px 30px; text-align:center; color:#6b7280; font-size:13px; line-height:1.6; }
    .footer a { color:${color}; text-decoration:none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="emoji">${icono}</div>
      <h1>${notif.titulo}</h1>
      ${notif.prioridad === 'urgente' ? '<span class="badge">🚨 URGENTE</span>'    : ''}
      ${notif.prioridad === 'alta'    ? '<span class="badge">⚠️ IMPORTANTE</span>' : ''}
    </div>
    <div class="content">
      <div class="message">${notif.mensaje.replace(/\n/g, '<br>')}</div>
      ${notif.foto_url ? `
        <div style="margin:20px 0;text-align:center;">
          <img src="${notif.foto_url}" alt="Imagen adjunta" style="max-width:100%;border-radius:8px;">
        </div>
      ` : ''}
      ${notif.adjunto_url ? `
        <div class="adjunto">
          📎 <a href="${notif.adjunto_url}" target="_blank">${notif.adjunto_nombre || 'Ver adjunto'}</a>
        </div>
      ` : ''}
    </div>
    <div class="footer">
      <strong>Unidad Educativa Particular La Voz de Cristo</strong><br>
      📍 Av. Argentina Nro 200 entre Trujillo y Luis Espinal<br>
      📞 +591 69624189 · 76162425 · 68420862<br>
      ✉️ <a href="mailto:lavozdecristohighschool@gmail.com">lavozdecristohighschool@gmail.com</a>
      <p style="margin-top:16px;font-size:12px;color:#9ca3af;">
        Comunicado oficial. Por favor no responder a este correo.
      </p>
    </div>
  </div>
</body>
</html>`;

    return { subject, html };
  }
}

export default new NotificacionDispatcher();