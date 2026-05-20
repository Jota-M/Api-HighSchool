// // src/utils/whatsappService.js
// import twilio from 'twilio';
// import dotenv from 'dotenv';
// import { pool } from '../db/pool.js';

// dotenv.config();

// class WhatsAppService {
//   constructor() {
//     this.client = twilio(
//       process.env.TWILIO_ACCOUNT_SID,
//       process.env.TWILIO_AUTH_TOKEN
//     );
//     this.from = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886';
//   }

//   // ─── Normalizar número boliviano ─────────────────────────────
//   // Acepta: "70000000", "591-70000000", "+59170000000", "0070000000"
//   // Devuelve: "+59170000000"
//   normalizarNumero(numero) {
//     if (!numero) return null;
//     // Quitar todo excepto dígitos
//     const solo = numero.replace(/\D/g, '');
//     // Si ya tiene el código de país 591
//     if (solo.startsWith('591') && solo.length >= 11) {
//       return `+${solo}`;
//     }
//     // Si empieza con 00 (formato europeo)
//     if (solo.startsWith('00591')) {
//       return `+${solo.slice(2)}`;
//     }
//     // Número local boliviano (7 u 8 dígitos)
//     if (solo.length >= 7 && solo.length <= 8) {
//       return `+591${solo}`;
//     }
//     // Fallback: agregar +591 si no tiene código
//     return `+591${solo}`;
//   }

//   // ─── Método genérico de envío ─────────────────────────────────
//   async enviarMensaje({ to, body }) {
//   const numeroNormalizado = this.normalizarNumero(to);
//   if (!numeroNormalizado) {
//     return { success: false, error: 'Número inválido' };
//   }

//   try {
//     // Timeout de 15 segundos para no colgar el dispatcher
//     const timeoutPromise = new Promise((_, reject) =>
//       setTimeout(() => reject(new Error('Timeout Twilio (15s)')), 15_000)
//     );

//     const message = await Promise.race([
//       this.client.messages.create({
//         from: this.from,
//         to: `whatsapp:${numeroNormalizado}`,
//         body,
//       }),
//       timeoutPromise,
//     ]);

//     console.log(`✅ WhatsApp enviado a ${numeroNormalizado}:`, message.sid);
//     return { success: true, sid: message.sid };
//   } catch (error) {
//     console.error(`❌ Error WhatsApp a ${numeroNormalizado}:`, error.message);
//     return { success: false, error: error.message };
//   }
// }

//   // ─── Consultar padres a notificar dado un estudiante_id ───────
//   // Usa la tabla estudiante_tutor (recibe_notificaciones = true)
//   // y toma el celular de padre_familia
//   async obtenerPadresANotificar(estudiante_id) {
//     const query = `
//       SELECT
//         pf.id             AS padre_id,
//         pf.nombres        AS padre_nombres,
//         pf.apellido_paterno AS padre_apellido,
//         pf.celular,
//         pf.telefono,
//         et.es_tutor_principal,
//         et.prioridad_contacto
//       FROM estudiante_tutor et
//       INNER JOIN padre_familia pf ON et.padre_familia_id = pf.id
//       WHERE et.estudiante_id       = $1
//         AND et.recibe_notificaciones = true
//         AND pf.celular IS NOT NULL
//         AND pf.deleted_at IS NULL
//       ORDER BY et.prioridad_contacto ASC, et.es_tutor_principal DESC
//     `;
//     const result = await pool.query(query, [estudiante_id]);
//     return result.rows;
//   }

//   // ─── Obtener datos del estudiante dado matricula_id ───────────
//   async obtenerDatosEstudiante(matricula_id) {
//     const query = `
//       SELECT
//         e.id              AS estudiante_id,
//         e.nombres,
//         e.apellidos,
//         e.codigo          AS estudiante_codigo,
//         p.nombre          AS paralelo_nombre,
//         g.nombre          AS grado_nombre,
//         n.nombre          AS nivel_nombre,
//         t.nombre          AS turno_nombre
//       FROM matricula m
//       INNER JOIN estudiante e         ON m.estudiante_id = e.id
//       INNER JOIN paralelo p           ON m.paralelo_id = p.id
//       INNER JOIN grado g              ON p.grado_id = g.id
//       INNER JOIN nivel_academico n    ON g.nivel_academico_id = n.id
//       INNER JOIN turno t              ON p.turno_id = t.id
//       WHERE m.id = $1
//         AND m.deleted_at IS NULL
//     `;
//     const result = await pool.query(query, [matricula_id]);
//     return result.rows[0] || null;
//   }

//   // ─── Notificación de asistencia: ausente o tardanza ──────────
//   async notificarAsistencia({ matricula_id, estado, materia_nombre, fecha, asignacion_docente_id }) {
//     // Solo notificar para ausente o tardanza
//     if (!['ausente', 'tardanza'].includes(estado)) return;

//     const estudiante = await this.obtenerDatosEstudiante(matricula_id);
//     if (!estudiante) {
//       console.warn(`⚠️ No se encontró estudiante para matrícula ${matricula_id}`);
//       return;
//     }

//     const padres = await this.obtenerPadresANotificar(estudiante.estudiante_id);
//     if (padres.length === 0) {
//       console.log(`⚠️ Sin padres con celular registrado para ${estudiante.nombres}`);
//       return;
//     }

//     const body = this.generarMensajeAsistencia({
//       estado,
//       nombreEstudiante: `${estudiante.nombres} ${estudiante.apellidos}`.trim(),
//       grado: `${estudiante.grado_nombre} ${estudiante.paralelo_nombre}`,
//       materia: materia_nombre,
//       fecha,
//       turno: estudiante.turno_nombre,
//     });

//     // Enviar a todos los padres con recibe_notificaciones = true
//     const resultados = await Promise.allSettled(
//       padres.map(padre =>
//         this.enviarMensaje({ to: padre.celular, body })
//       )
//     );

//     const enviados = resultados.filter(r => r.status === 'fulfilled' && r.value.success).length;
//     console.log(`📱 Notificaciones asistencia: ${enviados}/${padres.length} enviadas para ${estudiante.nombres}`);

//     return resultados;
//   }

//   // ─── Notificación masiva (pase de lista completo) ─────────────
//   // Llama a notificarAsistencia para cada registro ausente/tardanza
//   async notificarAsistenciaMasiva(registros, { asignacion_docente_id, fecha, materia_nombre }) {
//     const aNotificar = registros.filter(r =>
//       ['ausente', 'tardanza'].includes(r.estado)
//     );

//     if (aNotificar.length === 0) {
//       console.log('ℹ️ Sin ausentes/tardanzas en el pase de lista');
//       return;
//     }

//     console.log(`📨 Enviando ${aNotificar.length} notificaciones de asistencia...`);

//     // Enviar en paralelo pero con control (no saturar Twilio)
//     const resultados = await Promise.allSettled(
//       aNotificar.map(reg =>
//         this.notificarAsistencia({
//           matricula_id: reg.matricula_id,
//           estado: reg.estado,
//           materia_nombre,
//           fecha,
//           asignacion_docente_id,
//         })
//       )
//     );

//     return resultados;
//   }

//   // ─── Template del mensaje ─────────────────────────────────────
//   generarMensajeAsistencia({ estado, nombreEstudiante, grado, materia, fecha, turno }) {
//     const fechaFormateada = new Date(fecha + 'T12:00:00').toLocaleDateString('es-BO', {
//       weekday: 'long',
//       year: 'numeric',
//       month: 'long',
//       day: 'numeric',
//     });

//     const esAusente = estado === 'ausente';

//     return [
//       `${esAusente ? '⚠️' : '🕐'} *${esAusente ? 'Inasistencia' : 'Tardanza'} registrada*`,
//       `🏫 Unidad Educativa La Voz de Cristo`,
//       ``,
//       `👤 Estudiante: *${nombreEstudiante}*`,
//       `📚 Grado: ${grado} — Turno ${turno}`,
//       materia ? `📖 Materia: ${materia}` : null,
//       `📅 Fecha: ${fechaFormateada}`,
//       ``,
//       esAusente
//         ? `Su hijo/a *no asistió* a clases el día de hoy.`
//         : `Su hijo/a llegó con *tardanza* a clases el día de hoy.`,
//       ``,
//       `Si esto es un error o ya fue justificado, comuníquese con el docente o administración.`,
//       ``,
//       `📞 _Colegio: +591 69624189_`,
//       `_Este es un mensaje automático._`,
//     ]
//       .filter(l => l !== null)
//       .join('\n');
//   }
// }

// export default new WhatsAppService();
// src/utils/whatsappService.js
// Adaptador Evolution API — migrado desde Twilio
// Mantiene la misma interfaz pública para no romper dispatcher ni asistencia

import { pool } from '../db/pool.js';

class WhatsAppService {

  // ─── Normalizar número boliviano ──────────────────────────────
  normalizarNumero(numero) {
    if (!numero) return null;

    const solo = numero.replace(/\D/g, '');

    if (solo.startsWith('00591')) return solo.slice(2);
    if (solo.startsWith('591') && solo.length >= 11) return solo;
    if (solo.length >= 7 && solo.length <= 8) return `591${solo}`;
    return `591${solo}`;
  }

  // ─── Enviar texto plano ───────────────────────────────────────
  async _enviarTexto(numero, texto) {
    const response = await fetch(`${process.env.EVOLUTION_API_URL}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.EVOLUTION_INSTANCE_TOKEN,
      },
      body: JSON.stringify({
        number: numero,
        text:   texto,
      }),
    });

    const text = await response.text();
    const data = JSON.parse(text);
    if (!response.ok) {
      throw new Error(data.message || data.error || `HTTP ${response.status}`);
    }
    return data;
  }

  // ─── Enviar imagen con caption ────────────────────────────────
  async _enviarImagen(numero, imageUrl, caption = '') {
  const response = await fetch(`${process.env.EVOLUTION_API_URL}/send/media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.EVOLUTION_INSTANCE_TOKEN,
    },
    body: JSON.stringify({
      number:  numero,
      type:    'image',   // ← era "mediatype"
      url:     imageUrl,  // ← era "media"
      caption: caption,
    }),
  });

  const text = await response.text();
  const data = JSON.parse(text);
  if (!response.ok) {
    throw new Error(data.message || data.error || `HTTP ${response.status}`);
  }
  return data;
}

  // ─── Método genérico de envío ─────────────────────────────────
  async enviarMensaje({ to, body, foto_url = null }) {
    const numero = this.normalizarNumero(to);

    if (!numero) {
      return { success: false, error: 'Número inválido' };
    }

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout Evolution (15s)')), 15_000)
      );

      if (foto_url) {
        await Promise.race([
          this._enviarImagen(numero, foto_url, body),
          timeoutPromise,
        ]);
      } else {
        await Promise.race([
          this._enviarTexto(numero, body),
          timeoutPromise,
        ]);
      }

      console.log(`✅ WhatsApp enviado a ${numero}`);
      return { success: true };

    } catch (error) {
      console.error(`❌ Error WhatsApp a ${numero}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // ─── Consultar padres a notificar dado un estudiante_id ───────
  async obtenerPadresANotificar(estudiante_id) {
    const query = `
      SELECT
        pf.id               AS padre_id,
        pf.nombres          AS padre_nombres,
        pf.apellido_paterno AS padre_apellido,
        pf.celular,
        pf.telefono,
        et.es_tutor_principal,
        et.prioridad_contacto
      FROM estudiante_tutor et
      INNER JOIN padre_familia pf ON et.padre_familia_id = pf.id
      WHERE et.estudiante_id         = $1
        AND et.recibe_notificaciones = true
        AND pf.celular IS NOT NULL
        AND pf.deleted_at IS NULL
      ORDER BY et.prioridad_contacto ASC, et.es_tutor_principal DESC
    `;
    const result = await pool.query(query, [estudiante_id]);
    return result.rows;
  }

  // ─── Obtener datos del estudiante dado matricula_id ───────────
  async obtenerDatosEstudiante(matricula_id) {
    const query = `
      SELECT
        e.id          AS estudiante_id,
        e.nombres,
        e.apellidos,
        e.codigo      AS estudiante_codigo,
        p.nombre      AS paralelo_nombre,
        g.nombre      AS grado_nombre,
        n.nombre      AS nivel_nombre,
        t.nombre      AS turno_nombre
      FROM matricula m
      INNER JOIN estudiante e      ON m.estudiante_id = e.id
      INNER JOIN paralelo p        ON m.paralelo_id = p.id
      INNER JOIN grado g           ON p.grado_id = g.id
      INNER JOIN nivel_academico n ON g.nivel_academico_id = n.id
      INNER JOIN turno t           ON p.turno_id = t.id
      WHERE m.id = $1
        AND m.deleted_at IS NULL
    `;
    const result = await pool.query(query, [matricula_id]);
    return result.rows[0] || null;
  }

  // ─── Notificación de asistencia: ausente o tardanza ──────────
  async notificarAsistencia({ matricula_id, estado, materia_nombre, fecha, asignacion_docente_id }) {
    if (!['ausente', 'tardanza'].includes(estado)) return;

    const estudiante = await this.obtenerDatosEstudiante(matricula_id);
    if (!estudiante) {
      console.warn(`⚠️ No se encontró estudiante para matrícula ${matricula_id}`);
      return;
    }

    const padres = await this.obtenerPadresANotificar(estudiante.estudiante_id);
    if (padres.length === 0) {
      console.log(`⚠️ Sin padres con celular registrado para ${estudiante.nombres}`);
      return;
    }

    const body = this.generarMensajeAsistencia({
      estado,
      nombreEstudiante: `${estudiante.nombres} ${estudiante.apellidos}`.trim(),
      grado:   `${estudiante.grado_nombre} ${estudiante.paralelo_nombre}`,
      materia: materia_nombre,
      fecha,
      turno:   estudiante.turno_nombre,
    });

    const resultados = await Promise.allSettled(
      padres.map(padre => this.enviarMensaje({ to: padre.celular, body }))
    );

    const enviados = resultados.filter(
      r => r.status === 'fulfilled' && r.value.success
    ).length;

    console.log(
      `📱 Notificaciones asistencia: ${enviados}/${padres.length} enviadas para ${estudiante.nombres}`
    );

    return resultados;
  }

  // ─── Notificación masiva (pase de lista completo) ─────────────
  async notificarAsistenciaMasiva(registros, { asignacion_docente_id, fecha, materia_nombre }) {
    const aNotificar = registros.filter(r =>
      ['ausente', 'tardanza'].includes(r.estado)
    );

    if (aNotificar.length === 0) {
      console.log('ℹ️ Sin ausentes/tardanzas en el pase de lista');
      return;
    }

    console.log(`📨 Enviando ${aNotificar.length} notificaciones de asistencia...`);

    const resultados = await Promise.allSettled(
      aNotificar.map(reg =>
        this.notificarAsistencia({
          matricula_id:        reg.matricula_id,
          estado:              reg.estado,
          materia_nombre,
          fecha,
          asignacion_docente_id,
        })
      )
    );

    return resultados;
  }

  // ─── Template del mensaje de asistencia ──────────────────────
  generarMensajeAsistencia({ estado, nombreEstudiante, grado, materia, fecha, turno }) {
    const fechaFormateada = new Date(fecha + 'T12:00:00').toLocaleDateString('es-BO', {
      weekday: 'long',
      year:    'numeric',
      month:   'long',
      day:     'numeric',
    });

    const esAusente = estado === 'ausente';

    return [
      `${esAusente ? '⚠️' : '🕐'} *${esAusente ? 'Inasistencia' : 'Tardanza'} registrada*`,
      `🏫 Unidad Educativa La Voz de Cristo`,
      ``,
      `👤 Estudiante: *${nombreEstudiante}*`,
      `📚 Grado: ${grado} — Turno ${turno}`,
      materia ? `📖 Materia: ${materia}` : null,
      `📅 Fecha: ${fechaFormateada}`,
      ``,
      esAusente
        ? `Su hijo/a *no asistió* a clases el día de hoy.`
        : `Su hijo/a llegó con *tardanza* a clases el día de hoy.`,
      ``,
      `Si esto es un error o ya fue justificado, comuníquese con el docente o administración.`,
      ``,
      `📞 _Colegio: +591 69624189_`,
      `_Este es un mensaje automático._`,
    ]
      .filter(l => l !== null)
      .join('\n');
  }
}

export default new WhatsAppService();