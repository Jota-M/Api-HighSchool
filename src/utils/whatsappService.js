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
        if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_INSTANCE_TOKEN) {
            throw new Error('Variables EVOLUTION_API_URL o EVOLUTION_INSTANCE_TOKEN no configuradas');
        }

        const response = await fetch(`${process.env.EVOLUTION_API_URL}/send/text`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.EVOLUTION_INSTANCE_TOKEN,
            },
            body: JSON.stringify({
                number: numero,
                text: texto,
            }),
        });

        const text = await response.text();
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { raw: text };
        }
        if (!response.ok) {
            throw new Error(data.message || data.error || `HTTP ${response.status}`);
        }
        return data;
    }

    // ─── Enviar imagen con caption ────────────────────────────────
    async _enviarImagen(numero, imageUrl, caption = '') {
        if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_INSTANCE_TOKEN) {
            throw new Error('Variables EVOLUTION_API_URL o EVOLUTION_INSTANCE_TOKEN no configuradas');
        }

        const response = await fetch(`${process.env.EVOLUTION_API_URL}/send/media`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.EVOLUTION_INSTANCE_TOKEN,
            },
            body: JSON.stringify({
                number: numero,
                type: 'image',   // ← era "mediatype"
                url: imageUrl,  // ← era "media"
                caption: caption,
            }),
        });

        const text = await response.text();
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { raw: text };
        }
        if (!response.ok) {
            throw new Error(data.message || data.error || `HTTP ${response.status}`);
        }
        return data;
    }

    // ─── Enviar documento (PDF, etc.) ─────────────────────────────
    async _enviarDocumento(numero, documentUrlOrBase64, fileName = 'comprobante.pdf', caption = '') {
        if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_INSTANCE_TOKEN) {
            throw new Error('Variables EVOLUTION_API_URL o EVOLUTION_INSTANCE_TOKEN no configuradas');
        }

        // Si viene con prefijo Data URI 'data:...;base64,', extraer sólo la cadena base64 pura
        let mediaPayload = documentUrlOrBase64;
        if (typeof mediaPayload === 'string' && mediaPayload.includes(';base64,')) {
            mediaPayload = mediaPayload.split(';base64,')[1];
        }

        const response = await fetch(`${process.env.EVOLUTION_API_URL}/send/media`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.EVOLUTION_INSTANCE_TOKEN,
            },
            body: JSON.stringify({
                number: numero,
                type: 'document',
                url: mediaPayload,
                fileName: fileName,
                mimetype: 'application/pdf',
                caption: caption,
            }),
        });

        const text = await response.text();
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { raw: text };
        }
        if (!response.ok) {
            throw new Error(data.message || data.error || `HTTP ${response.status}`);
        }
        return data;
    }

    // ─── Enviar Documento Genérico ────────────────────────────────
    async enviarDocumento({ to, documentUrlOrBase64, fileName = 'comprobante.pdf', caption = '' }) {
        const numero = this.normalizarNumero(to);
        if (!numero) {
            return { success: false, error: 'Número inválido' };
        }

        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout Evolution (25s)')), 25_000)
            );

            const result = await Promise.race([
                this._enviarDocumento(numero, documentUrlOrBase64, fileName, caption),
                timeoutPromise,
            ]);

            console.log(`✅ WhatsApp Documento (${fileName}) enviado a ${numero}`);
            return { success: true, data: result };
        } catch (error) {
            console.error(`❌ Error WhatsApp Documento a ${numero}:`, error.message);
            return { success: false, error: error.message };
        }
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
            grado: `${estudiante.grado_nombre} ${estudiante.paralelo_nombre}`,
            materia: materia_nombre,
            fecha,
            turno: estudiante.turno_nombre,
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
                    matricula_id: reg.matricula_id,
                    estado: reg.estado,
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
        const fechaFormateada = (() => {
            if (!fecha) return '—';
            const str = String(fecha).trim();
            const datePart = str.split('T')[0];
            if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
                const [y, m, dNum] = datePart.split('-').map(Number);
                return new Date(y, m - 1, dNum, 12, 0, 0).toLocaleDateString('es-BO', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                });
            }
            const d = new Date(str);
            return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-BO', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            });
        })();

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
    // ─── Obtener celular del tutor principal de una preinscripción ───
    obtenerCelularTutor(preinscripcion) {
        const tutor = preinscripcion?.tutor;
        if (!tutor) return null;
        return tutor.celular || tutor.telefono || null;
    }

    // ─── Notificación: preinscripción recibida ─────────────────────
    async notificarPreinscripcionCreada(preinscripcion) {
        const celular = this.obtenerCelularTutor(preinscripcion);
        if (!celular) {
            console.log('⚠️ Sin celular de tutor para notificar creación');
            return { success: false, message: 'Sin celular registrado' };
        }
        const body = this.generarMensajeCreacion(preinscripcion);
        return await this.enviarMensaje({ to: celular, body });
    }

    // ─── Notificación: cambio de estado ────────────────────────────
    async notificarCambioEstado(preinscripcion, estadoAnterior) {
        const celular = this.obtenerCelularTutor(preinscripcion);
        if (!celular) {
            console.log('⚠️ Sin celular de tutor para notificar cambio de estado');
            return { success: false, message: 'Sin celular registrado' };
        }
        const body = this.generarMensajeCambioEstado(preinscripcion, estadoAnterior);
        return await this.enviarMensaje({ to: celular, body });
    }

    // ─── Templates ──────────────────────────────────────────────────

    _obtenerInfoEstadoSimple(estado) {
        const estados = {
            'iniciada': { emoji: '📝', titulo: 'Preinscripción Iniciada' },
            'datos_completos': { emoji: '✅', titulo: 'Datos Completos Recibidos' },
            'documentos_pendientes': { emoji: '📄', titulo: 'Documentos Pendientes' },
            'en_revision': { emoji: '🔍', titulo: 'En Revisión' },
            'documentos_aprobados': { emoji: '✅', titulo: 'Documentos Aprobados' },
            'entrevista_pendiente': { emoji: '📅', titulo: 'Entrevista Pendiente' },
            'entrevista_programada': { emoji: '📅', titulo: 'Entrevista Programada' },
            'entrevista_completada': { emoji: '✅', titulo: 'Entrevista Completada' },
            'aprobada': { emoji: '🎉', titulo: '¡Preinscripción Aprobada!' },
            'rechazada': { emoji: '❌', titulo: 'Preinscripción Rechazada' },
            'convertida': { emoji: '🎓', titulo: '¡Inscripción Completada!' },
            'expirada': { emoji: '⏰', titulo: 'Preinscripción Expirada' },
            'cancelada': { emoji: '🚫', titulo: 'Preinscripción Cancelada' },
        };
        return estados[estado] || { emoji: '📋', titulo: 'Actualización de Estado' };
    }

    generarMensajeCreacion(preinscripcion) {
        const estudiante = preinscripcion.estudiante || {};
        const tutor = preinscripcion.tutor || {};
        const nombreEstudiante = `${estudiante.nombres || ''} ${estudiante.apellido_paterno || ''}`.trim();
        const nombreTutor = `${tutor.nombres || ''} ${tutor.apellido_paterno || ''}`.trim();

        return [
            `📝 *¡Gracias por registrarte!*`,
            `🏫 Unidad Educativa La Voz de Cristo`,
            ``,
            `Hola ${nombreTutor || 'Padre/Tutor'},`,
            ``,
            `Hemos recibido correctamente la preinscripción de *${nombreEstudiante}*.`,
            ``,
            `📋 Código: *${preinscripcion.codigo_inscripcion}*`,
            ``,
            `Guarda este código para dar seguimiento a tu solicitud.`,
            `Te avisaremos por este medio sobre cualquier novedad. ¡Gracias por confiar en nosotros!`,
            ``,
            `📞 _Colegio: +591 69624189_`,
            `_Este es un mensaje automático._`,
        ].join('\n');
    }

    generarMensajeCambioEstado(preinscripcion, estadoAnterior) {
        const estudiante = preinscripcion.estudiante || {};
        const tutor = preinscripcion.tutor || {};
        const nombreEstudiante = `${estudiante.nombres || ''} ${estudiante.apellido_paterno || ''}`.trim();
        const nombreTutor = `${tutor.nombres || ''} ${tutor.apellido_paterno || ''}`.trim();
        const info = this._obtenerInfoEstadoSimple(preinscripcion.estado);

        const lineas = [
            `${info.emoji} *${info.titulo}*`,
            `🏫 Unidad Educativa La Voz de Cristo`,
            ``,
            `Hola ${nombreTutor || 'Padre/Tutor'},`,
            ``,
            `La preinscripción de *${nombreEstudiante}* (código *${preinscripcion.codigo_inscripcion}*) ha cambiado de estado:`,
            ``,
            `📊 Nuevo estado: *${info.titulo}*`,
        ];

        if (preinscripcion.observaciones) {
            lineas.push(``, `📝 Observaciones: ${preinscripcion.observaciones}`);
        }

        if (preinscripcion.estado === 'documentos_pendientes') {
            lineas.push(``, `⚠️ *Acción requerida:* completa la carga de documentos lo antes posible.`);
        }

        if (preinscripcion.estado === 'aprobada') {
            lineas.push(``, `🎉 ¡Felicitaciones! Pronto recibirás más información sobre los siguientes pasos.`);
        }

        if (preinscripcion.estado === 'rechazada' && preinscripcion.motivo_rechazo) {
            lineas.push(``, `❌ Motivo: ${preinscripcion.motivo_rechazo}`);
        }

        lineas.push(
            ``,
            `📞 _Colegio: +591 69624189_`,
            `_Este es un mensaje automático._`,
        );

        return lineas.join('\n');
    }

    _obtenerBaseUrlRecibo() {
        return process.env.PUBLIC_API_URL || process.env.CALLBACK_URL || 'https://api.uepclavozdecristo.site';
    }

    // ─── Mensaje de Confirmación de Reserva de Cupos (Múltiple o Individual) ───
    generarMensajeReservaCupo({ reservas = [], hermanos = [], tutor_nombre = null }) {
        const totalEstudiantes = reservas.length + hermanos.length;
        const nombreTutor = tutor_nombre?.trim() || 'Padre/Madre/Tutor';
        const periodo = reservas[0]?.periodo_nombre || hermanos[0]?.periodo_nombre || 'Gestión 2027';
        const baseUrl = this._obtenerBaseUrlRecibo();

        const lineas = [
            `🎟️ *¡Confirmación de Trámite de Cupo Escolar!*`,
            `🏫 *Unidad Educativa Particular La Voz de Cristo*`,
            ``,
            `Hola *${nombreTutor}*,`,
            `Hemos registrado correctamente el trámite de cupo escolar para la *${periodo}*.`,
            ``
        ];

        if (totalEstudiantes > 1) {
            lineas.push(`👥 *Detalle de Hijos Registrados (${totalEstudiantes}):*`);
        } else {
            lineas.push(`📋 *Detalle del Estudiante Registrado:*`);
        }
        lineas.push(``);

        // Estudiantes Regulares
        reservas.forEach((r, idx) => {
            const nombreEst = r.estudiante_nombre_completo ||
                `${r.estudiante_nombres || ''} ${r.estudiante_apellido_paterno || ''}`.trim() ||
                `Hijo #${idx + 1}`;
            const esContinua = r.estado === 'confirmada';
            const esNoContinua = r.estado === 'no_continua';

            if (esContinua) {
                lineas.push(`✅ *${nombreEst}*`);
                lineas.push(`   • Código de Reserva: *${r.codigo_reserva}*`);
                if (r.codigo_recibo) lineas.push(`   • Nº Recibo: *${r.codigo_recibo}*`);
                lineas.push(`   • Grado Destino: ${r.grado_destino_nombre || 'Por asignar'} (${r.turno_destino_nombre ? `Turno ${r.turno_destino_nombre}` : 'Turno asignado'})`);
                lineas.push(`   • Estado: *Cupo Confirmado* ✨`);
                lineas.push(`   • 📄 *Recibo PDF:* ${baseUrl}/api/reserva-cupo/recibo/${r.codigo_reserva}/pdf`);
            } else if (esNoContinua) {
                lineas.push(`📄 *${nombreEst}*`);
                lineas.push(`   • Código Constancia: *${r.codigo_reserva}*`);
                lineas.push(`   • Trámite: *Constancia de No Continuidad Formalizada*`);
                lineas.push(`   • 📄 *Constancia PDF:* ${baseUrl}/api/reserva-cupo/recibo/${r.codigo_reserva}/pdf`);
            } else {
                lineas.push(`📋 *${nombreEst}*`);
                lineas.push(`   • Código: *${r.codigo_reserva}*`);
                lineas.push(`   • Estado: ${r.estado}`);
                lineas.push(`   • 📄 *Recibo PDF:* ${baseUrl}/api/reserva-cupo/recibo/${r.codigo_reserva}/pdf`);
            }
            lineas.push(``);
        });

        // Hermanos (Prioridad Familiar)
        hermanos.forEach((h, idx) => {
            const nombreHerm = `${h.nombres || ''} ${h.apellido_paterno || ''} ${h.apellido_materno || ''}`.trim() ||
                `Hermano #${idx + 1}`;
            const esEspera = h.estado === 'en_espera';

            if (esEspera) {
                lineas.push(`⏳ *${nombreHerm}* (Nuevo Ingreso)`);
                lineas.push(`   • Código Solicitud: *${h.codigo_reserva}*`);
                lineas.push(`   • Grado Solicitado: ${h.grado_solicitado_nombre || h.grado_destino_nombre || 'Nivel correspondiente'}`);
                lineas.push(`   • Estado: *Lista de Espera con Prioridad Familiar* (Puesto #${h.posicion_espera || 1})`);
                lineas.push(`   • 📄 *Comprobante PDF:* ${baseUrl}/api/reserva-cupo/recibo/${h.codigo_reserva}/pdf`);
            } else {
                lineas.push(`🎉 *${nombreHerm}* (Hermano con Prioridad Familiar)`);
                lineas.push(`   • Código de Reserva: *${h.codigo_reserva}*`);
                if (h.codigo_recibo) lineas.push(`   • Nº Recibo: *${h.codigo_recibo}*`);
                lineas.push(`   • Grado: ${h.grado_solicitado_nombre || h.grado_destino_nombre || 'Nivel correspondiente'} (${h.turno_solicitado_nombre || h.turno_destino_nombre ? `Turno ${h.turno_solicitado_nombre || h.turno_destino_nombre}` : 'Turno solicitado'})`);
                lineas.push(`   • Estado: *Cupo Confirmado* ✨`);
                lineas.push(`   • 📄 *Recibo PDF:* ${baseUrl}/api/reserva-cupo/recibo/${h.codigo_reserva}/pdf`);
            }
            lineas.push(``);
        });

        lineas.push(
            `📌 *Importante:* Conserve este comprobante y sus códigos oficiales para el proceso de formalización e inscripción de matrícula.`,
            ``,
            `📞 _Secretaría del Colegio: +591 69624189_`,
            `_Este es un mensaje oficial emitido automáticamente por el sistema._`
        );

        return lineas.join('\n');
    }

    // ─── Mensaje Individual para una Reserva ───────────────────────
    generarMensajeReservaIndividual(reserva, nombreDestinatario = null) {
        const nombreTutor = nombreDestinatario || reserva.tutor_nombre || 'Padre/Madre/Tutor';
        const nombreEst = reserva.estudiante_nombre_completo ||
            `${reserva.estudiante_nombres || reserva.nombres || ''} ${reserva.estudiante_apellido_paterno || reserva.apellido_paterno || ''}`.trim();
        const periodo = reserva.periodo_nombre || 'Gestión 2027';
        const esNoContinua = reserva.estado === 'no_continua';
        const esEspera = reserva.estado === 'en_espera';
        const esHermano = Boolean(reserva.hermano_regular_id || reserva.codigo_reserva?.startsWith('HER-') || reserva.codigo_reserva?.startsWith('ESP-'));
        const baseUrl = this._obtenerBaseUrlRecibo();

        const lineas = [
            `🎟️ *¡Comprobante Oficial de Reserva de Cupo!*`,
            `🏫 *Unidad Educativa Particular La Voz de Cristo*`,
            ``,
            `Hola *${nombreTutor}*,`,
            `Compartimos el comprobante oficial de su registro para la *${periodo}*:`,
            ``,
            `🎓 *Estudiante:* ${nombreEst}`,
            `📌 *CI:* ${reserva.estudiante_ci || reserva.ci || 'Registrado en sistema'}`,
            `📋 *Código de Registro:* *${reserva.codigo_reserva}*`,
        ];

        if (reserva.codigo_recibo) {
            lineas.push(`🧾 *Nº Recibo:* *${reserva.codigo_recibo}*`);
        }

        if (esNoContinua) {
            lineas.push(`ℹ️ *Estado:* *Constancia de No Continuidad Registrada*`);
        } else if (esEspera) {
            lineas.push(`📚 *Grado Solicitado:* ${reserva.grado_destino_nombre || reserva.grado_solicitado_nombre || ''}`);
            lineas.push(`⏳ *Estado:* *Lista de Espera con Prioridad Familiar (Puesto #${reserva.posicion_espera || 1})*`);
        } else if (esHermano) {
            lineas.push(`📚 *Grado:* ${reserva.grado_destino_nombre || reserva.grado_solicitado_nombre || ''}`);
            lineas.push(`🎉 *Estado:* *Cupo Asegurado (Hermano - Prioridad Familiar)*`);
        } else {
            lineas.push(`📚 *Grado:* ${reserva.grado_destino_nombre || ''} (${reserva.turno_destino_nombre ? `Turno ${reserva.turno_destino_nombre}` : ''})`);
            lineas.push(`✅ *Estado:* *Cupo Regular Confirmado*`);
        }

        lineas.push(
            ``,
            `📄 *Descargar Recibo Oficial (PDF):*`,
            `${baseUrl}/api/reserva-cupo/recibo/${reserva.codigo_reserva}/pdf`,
            ``,
            `📌 Conserve este mensaje y código oficial para la formalización de matrícula escolar.`,
            ``,
            `📞 _Secretaría del Colegio: +591 69624189_`,
            `_Mensaje automático oficial._`
        );

        return lineas.join('\n');
    }

    // ─── Notificar Creación de Reserva de Cupos (a Tutor) ───────────
    async notificarReservaCupoCreada({ reservas = [], hermanos = [], tutor_nombre, tutor_telefono }) {
        if (!tutor_telefono) {
            console.log('⚠️ Sin celular de tutor para notificar reserva de cupo');
            return { success: false, message: 'Sin número de celular registrado' };
        }

        const body = this.generarMensajeReservaCupo({ reservas, hermanos, tutor_nombre });
        const resultado = await this.enviarMensaje({ to: tutor_telefono, body });

        if (resultado.success) {
            console.log(`📱 WhatsApp de confirmación de reserva enviado a ${tutor_telefono}`);
        } else {
            console.warn(`⚠️ Error al enviar WhatsApp de reserva a ${tutor_telefono}:`, resultado.error);
        }

        return resultado;
    }

    // ─── Notificar una Reserva Individual ───────────────────────────
    async notificarReservaCupoIndividual(reserva, telefonoDestino = null) {
        const telefono = telefonoDestino || reserva.tutor_telefono;
        if (!telefono) {
            return { success: false, message: 'Sin número de celular de tutor' };
        }

        const body = this.generarMensajeReservaIndividual(reserva);
        const resultado = await this.enviarMensaje({ to: telefono, body });
        return resultado;
    }
}

export default new WhatsAppService();
