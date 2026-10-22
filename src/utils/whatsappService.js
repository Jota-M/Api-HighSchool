// src/utils/whatsappService.js
// Adaptador Evolution API / Evolution Go con arquitectura Anti-Baneo Avanzada
// Incluye: Cola secuencial (FIFO), Throttling con Jitter humano, Simulación de digitación (typing),
// normalización estricta de números y micro-variaciones (Spintax) para mitigar huella de spam.

import { pool } from '../db/pool.js';

class WhatsAppService {
    constructor() {
        // ─── Cola de Envíos Anti-Baneo ──────────────────────────────
        this.colaEnvio = [];
        this.procesandoCola = false;

        // Rango de pausa aleatoria entre envíos sucesivos (3.0s a 6.0s)
        this.minDelayMs = 3000;
        this.maxDelayMs = 6000;

        // ─── Cola y Estado de Campaña Masiva Anti-Baneo ──────────────
        this.estadoCampana = {
            activo: false,
            detenerSolicitado: false,
            id_campana: null,
            total: 0,
            enviados: 0,
            fallidos: 0,
            en_cola: 0,
            estudiante_actual: null,
            iniciado_at: null,
            finalizado_at: null,
            ultimo_envio_at: null,
            mensajes_consecutivos: 0,
            delay_min_seg: 7,
            delay_max_seg: 14
        };
    }

    // ─── Utilidad: Pausa Asíncrona ────────────────────────────────
    _esperar(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── Utilidad: Delay Aleatorio (Jitter Humano) ─────────────────
    _obtenerDelayAleatorio(min = this.minDelayMs, max = this.maxDelayMs) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // ─── Despachador de Cola Secuencial ───────────────────────────
    async _ejecutarEnCola(tareaFn) {
        return new Promise((resolve, reject) => {
            this.colaEnvio.push({ tareaFn, resolve, reject });
            this._procesarCola();
        });
    }

    async _procesarCola() {
        if (this.procesandoCola || this.colaEnvio.length === 0) return;

        this.procesandoCola = true;

        while (this.colaEnvio.length > 0) {
            const { tareaFn, resolve, reject } = this.colaEnvio.shift();

            try {
                const resultado = await tareaFn();
                resolve(resultado);
            } catch (error) {
                reject(error);
            }

            // Si aún quedan mensajes en la cola, pausar con cadencia humana
            if (this.colaEnvio.length > 0) {
                const pausa = this._obtenerDelayAleatorio();
                console.log(`⏳ [Anti-Ban WA] Pausa humana de ${(pausa / 1000).toFixed(1)}s antes del próximo envío (${this.colaEnvio.length} en espera)...`);
                await this._esperar(pausa);
            }
        }

        this.procesandoCola = false;
    }

    // ─── Normalizar y Validar número boliviano/internacional ──────
    normalizarNumero(numero) {
        if (!numero) return null;

        const solo = String(numero).replace(/\D/g, '');

        // Descartar números sospechosos, vacíos o cadenas de ceros
        if (!solo || solo.length < 7 || /^0+$/.test(solo)) {
            return null;
        }

        if (solo.startsWith('00591')) return solo.slice(2);
        if (solo.startsWith('591') && solo.length >= 11) return solo;

        // Celular boliviano típico (8 dígitos, usualmente inicia con 6 o 7)
        if (solo.length >= 7 && solo.length <= 8) {
            return `591${solo}`;
        }

        // Número internacional válido (> 9 dígitos)
        if (solo.length >= 9) {
            return solo;
        }

        return `591${solo}`;
    }

    // ─── Enviar texto plano con simulación de escritura ───────────
    async _enviarTexto(numero, texto) {
        if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_INSTANCE_TOKEN) {
            throw new Error('Variables EVOLUTION_API_URL o EVOLUTION_INSTANCE_TOKEN no configuradas');
        }

        // Simulación de tiempo de tipeo humano (entre 1.2s y 2.4s)
        const delayTyping = Math.floor(Math.random() * 1200) + 1200;

        const response = await fetch(`${process.env.EVOLUTION_API_URL}/send/text`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.EVOLUTION_INSTANCE_TOKEN,
            },
            body: JSON.stringify({
                number: numero,
                text: texto,
                delay: delayTyping,
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

        const delayTyping = Math.floor(Math.random() * 1000) + 1200;

        const response = await fetch(`${process.env.EVOLUTION_API_URL}/send/media`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.EVOLUTION_INSTANCE_TOKEN,
            },
            body: JSON.stringify({
                number: numero,
                type: 'image',
                url: imageUrl,
                caption: caption,
                delay: delayTyping,
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

        let mediaPayload = documentUrlOrBase64;
        if (typeof mediaPayload === 'string' && mediaPayload.includes(';base64,')) {
            mediaPayload = mediaPayload.split(';base64,')[1];
        }

        const delayTyping = Math.floor(Math.random() * 1000) + 1500;

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
                delay: delayTyping,
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

    // ─── Enviar Documento Genérico (Protegido por Cola Anti-Ban) ───
    async enviarDocumento({ to, documentUrlOrBase64, fileName = 'comprobante.pdf', caption = '' }) {
        const numero = this.normalizarNumero(to);
        if (!numero) {
            return { success: false, error: 'Número inválido o no reconocido' };
        }

        return await this._ejecutarEnCola(async () => {
            try {
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout Evolution (25s)')), 25_000)
                );

                const result = await Promise.race([
                    this._enviarDocumento(numero, documentUrlOrBase64, fileName, caption),
                    timeoutPromise,
                ]);

                console.log(`✅ [Anti-Ban WA] Documento (${fileName}) enviado a ${numero}`);
                return { success: true, data: result };
            } catch (error) {
                console.error(`❌ [Anti-Ban WA] Error documento a ${numero}:`, error.message);
                return { success: false, error: error.message };
            }
        });
    }

    // ─── Método genérico de envío (Protegido por Cola Anti-Ban) ────
    async enviarMensaje({ to, body, foto_url = null }) {
        const numero = this.normalizarNumero(to);
        if (!numero) {
            return { success: false, error: 'Número inválido o no reconocido' };
        }

        return await this._ejecutarEnCola(async () => {
            try {
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout Evolution (20s)')), 20_000)
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

                console.log(`✅ [Anti-Ban WA] Mensaje entregado a ${numero}`);
                return { success: true };
            } catch (error) {
                console.error(`❌ [Anti-Ban WA] Error envío a ${numero}:`, error.message);
                return { success: false, error: error.message };
            }
        });
    }

    // ─── Helpers de Spintax Anti-Hash de Spam ──────────────────────
    _obtenerSaludoAleatorio(nombre) {
        const nom = (nombre || '').trim();
        const tieneNombre = Boolean(nom && nom.toLowerCase() !== 'padre/tutor' && nom.toLowerCase() !== 'padre/madre/tutor');
        const destinatario = tieneNombre ? `*${nom}*` : 'estimado padre/tutor de familia';

        const saludos = [
            `Hola ${destinatario},`,
            `Estimado/a ${destinatario},`,
            `Apreciado/a ${destinatario},`,
            `Reciba un cordial saludo, ${destinatario}:`,
            `Buen día, ${destinatario}:`,
        ];
        return saludos[Math.floor(Math.random() * saludos.length)];
    }

    _obtenerDespedidaAntiReporte() {
        const avisos = [
            `ℹ️ _Si cambió de número o no reconoce este aviso, por favor respóndanos a este chat._`,
            `ℹ️ _Comunicado oficial. Si recibió este mensaje por error, infórmenos por esta vía._`,
            `ℹ️ _Por favor guarde nuestro contacto oficial para recibir novedades académicas._`,
        ];
        return avisos[Math.floor(Math.random() * avisos.length)];
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

        // Despacho secuencial protegido por cola
        const resultados = [];
        for (const padre of padres) {
            const res = await this.enviarMensaje({ to: padre.celular, body });
            resultados.push({ status: 'fulfilled', value: res });
        }

        const enviados = resultados.filter(r => r.value?.success).length;
        console.log(`📱 Notificaciones asistencia: ${enviados}/${padres.length} para ${estudiante.nombres}`);

        return resultados;
    }

    // ─── Notificación masiva (pase de lista completo con Throttling) ─
    async notificarAsistenciaMasiva(registros, { asignacion_docente_id, fecha, materia_nombre }) {
        const aNotificar = registros.filter(r =>
            ['ausente', 'tardanza'].includes(r.estado)
        );

        if (aNotificar.length === 0) {
            console.log('ℹ️ Sin ausentes/tardanzas en el pase de lista');
            return [];
        }

        console.log(`📨 [Anti-Ban] Encolando ${aNotificar.length} notificaciones de asistencia con despacho regulado...`);

        const resultados = [];
        for (const reg of aNotificar) {
            try {
                const res = await this.notificarAsistencia({
                    matricula_id: reg.matricula_id,
                    estado: reg.estado,
                    materia_nombre,
                    fecha,
                    asignacion_docente_id,
                });
                resultados.push({ status: 'fulfilled', value: res });
            } catch (err) {
                resultados.push({ status: 'rejected', reason: err });
            }
        }

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
        const avisoAntiReporte = this._obtenerDespedidaAntiReporte();

        return [
            `${esAusente ? '⚠️' : '🕐'} *${esAusente ? 'Inasistencia' : 'Tardanza'} registrada*`,
            `🏫 *Unidad Educativa Particular La Voz de Cristo*`,
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
            avisoAntiReporte,
            `📞 _Secretaría: +591 69624189_`,
            `_Mensaje institucional automático._`,
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
        const grado = preinscripcion.grado_nombre || estudiante.grado_solicitado || '';
        const turno = preinscripcion.turno_nombre || estudiante.turno_solicitado || '';
        const periodo = preinscripcion.periodo_nombre || '';
        const saludo = this._obtenerSaludoAleatorio(nombreTutor);
        const avisoAntiReporte = this._obtenerDespedidaAntiReporte();

        const lineas = [
            `📝 *¡Registro de Preinscripción Recibido!*`,
            `🏫 *Unidad Educativa Particular La Voz de Cristo*`,
            ``,
            saludo,
            ``,
            `Hemos recibido correctamente la postulación de:`,
            `👤 Estudiante: *${nombreEstudiante}*`,
            `📋 Código de seguimiento: *${preinscripcion.codigo_inscripcion}*`,
        ];

        if (grado) {
            lineas.push(`📚 Curso / Grado: *${grado}*`);
        }
        if (turno) {
            lineas.push(`⏰ Turno solicitado: *${turno}*`);
        }
        if (periodo) {
            lineas.push(`📅 Gestión académica: *${periodo}*`);
        }

        lineas.push(
            ``,
            `📌 *Próximos pasos:*`,
            `Una vez revisada la información enviada, nos contactaremos con usted por este medio (WhatsApp) para la entrevista correspondiente.`,
            ``,
            `🗓️ Las entrevistas se realizarán a partir del *20 de octubre*. La fecha y hora exacta le será enviada por este medio.`,
            ``,
            avisoAntiReporte,
            `📞 _Secretaría: +591 69624189_`,
            `_Mensaje institucional automático._`,
        );

        return lineas.join('\n');
    }

    generarMensajeCambioEstado(preinscripcion, estadoAnterior) {
        const estudiante = preinscripcion.estudiante || {};
        const tutor = preinscripcion.tutor || {};
        const nombreEstudiante = `${estudiante.nombres || ''} ${estudiante.apellido_paterno || ''}`.trim();
        const nombreTutor = `${tutor.nombres || ''} ${tutor.apellido_paterno || ''}`.trim();
        const grado = preinscripcion.grado_nombre || estudiante.grado_solicitado || '';
        const turno = preinscripcion.turno_nombre || estudiante.turno_solicitado || '';
        const info = this._obtenerInfoEstadoSimple(preinscripcion.estado);
        const saludo = this._obtenerSaludoAleatorio(nombreTutor);
        const avisoAntiReporte = this._obtenerDespedidaAntiReporte();

        const lineas = [
            `${info.emoji} *${info.titulo}*`,
            `🏫 *Unidad Educativa Particular La Voz de Cristo*`,
            ``,
            saludo,
            ``,
            `La preinscripción de *${nombreEstudiante}* ha sido actualizada:`,
            `📋 Código: *${preinscripcion.codigo_inscripcion}*`,
        ];

        if (grado) {
            lineas.push(`📚 Curso postulado: *${grado}*`);
        }
        if (turno) {
            lineas.push(`⏰ Turno: *${turno}*`);
        }

        lineas.push(
            ``,
            `📊 Estado actual: *${info.titulo}*`,
        );

        if (preinscripcion.observaciones) {
            let obs = String(preinscripcion.observaciones).trim();

            // Si contiene fecha sin formato WhatsApp (*), resaltarla automáticamente en negrilla
            if (obs.includes('- Fecha:') && !obs.includes('*')) {
                obs = obs.replace(
                    /- Fecha:\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/g,
                    '- 📅 Fecha y Hora: *$1* a horas *$2*'
                );
            }

            if (obs.startsWith('Entrevista agendada') || obs.startsWith('Entrevista completada')) {
                lineas.push(``, obs);
            } else {
                lineas.push(``, `📝 Observaciones: ${obs}`);
            }
        }

        if (preinscripcion.estado === 'documentos_pendientes') {
            lineas.push(``, `⚠️ *Acción requerida:* Por favor suba los documentos faltantes a la brevedad.`);
        }

        if (preinscripcion.estado === 'entrevista_pendiente') {
            lineas.push(
                ``,
                `🗓️ *Entrevistas:* Se realizarán a partir del *20 de octubre*. Nos comunicaremos por este medio (WhatsApp) para coordinar la fecha y hora exacta.`
            );
        }

        if (preinscripcion.estado === 'aprobada') {
            lineas.push(``, `🎉 ¡Felicitaciones! Su solicitud ha sido aprobada. Pronto recibirá las indicaciones para formalizar la matrícula.`);
        }

        if (preinscripcion.estado === 'entrevista_programada') {
            const obsStr = (preinscripcion.observaciones || '').toLowerCase();
            const tieneAsistencia = obsStr.includes('asistencia') || obsStr.includes('tutor') || obsStr.includes('padre');
            if (!tieneAsistencia) {
                lineas.push(
                    ``,
                    `👥 *Asistencia Requerida (Obligatoria):*`,
                    `Para la entrevista es indispensable la presencia del *Padre y/o Madre o Tutor* junto con el *hijo o los hijos postulantes*.`
                );
            }

            const esVirtual = obsStr.includes('modalidad: virtual');
            if (!esVirtual) {
                lineas.push(
                    ``,
                    `📍 *Ubicación del Colegio (Google Maps):*`,
                    `https://maps.app.goo.gl/dWapCMNPguGBMUTv9`
                );
            }
        }

        if (preinscripcion.estado === 'rechazada' && preinscripcion.motivo_rechazo) {
            lineas.push(``, `❌ Motivo: ${preinscripcion.motivo_rechazo}`);
        }

        lineas.push(
            ``,
            avisoAntiReporte,
            `📞 _Secretaría: +591 69624189_`,
            `_Mensaje institucional automático._`,
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
        const saludo = this._obtenerSaludoAleatorio(nombreTutor);
        const avisoAntiReporte = this._obtenerDespedidaAntiReporte();

        const lineas = [
            `🎟️ *¡Confirmación de Trámite de Cupo Escolar!*`,
            `🏫 *Unidad Educativa Particular La Voz de Cristo*`,
            ``,
            saludo,
            `Hemos registrado el trámite de cupo escolar para la *${periodo}*.`,
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
            avisoAntiReporte,
            `📞 _Secretaría: +591 69624189_`,
            `_Mensaje institucional automático._`
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
        const saludo = this._obtenerSaludoAleatorio(nombreTutor);
        const avisoAntiReporte = this._obtenerDespedidaAntiReporte();

        const lineas = [
            `🎟️ *¡Comprobante Oficial de Reserva de Cupo!*`,
            `🏫 *Unidad Educativa Particular La Voz de Cristo*`,
            ``,
            saludo,
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
            avisoAntiReporte,
            `📞 _Secretaría: +591 69624189_`,
            `_Mensaje institucional automático._`
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

    // ─── Generar Mensaje de Recordatorio de Continuidad (Cupo Asegurado) ─
    generarMensajeRecordatorioContinuidad({
        estudiante_nombre,
        estudiante_ci,
        grado_destino_nombre,
        turno_destino_nombre,
        tutor_nombre = null,
        anio_destino = 2027
    }) {
        const nomTutor = tutor_nombre?.trim() || 'Padre/Madre/Tutor';
        const saludo = this._obtenerSaludoAleatorio(nomTutor);
        const avisoAntiReporte = this._obtenerDespedidaAntiReporte();
        const frontUrl = process.env.FRONTEND_URL || 'https://uepclavozdecristo.site';
        const linkReserva = `${frontUrl}/reserva-cupo`;

        const lineas = [
            `📢 *¡Recordatorio Oficial de Cupo Asegurado!*`,
            `🏫 *Unidad Educativa Particular La Voz de Cristo*`,
            ``,
            saludo,
            `Le recordamos cordialmente que su hijo(a) cuenta con su *CUPO ASEGURADO* para la *Gestión ${anio_destino}*:`,
            ``,
            `🎓 *Estudiante:* *${estudiante_nombre}*`,
            estudiante_ci ? `📌 *CI:* ${estudiante_ci}` : null,
            grado_destino_nombre ? `📚 *Curso Proyectado:* *${grado_destino_nombre}*` : null,
            turno_destino_nombre ? `⏰ *Turno:* *${turno_destino_nombre}*` : null,
            `⏳ *Estado Actual:* *PENDIENTE DE CONFIRMACIÓN*`,
            ``,
            `⚠️ *Aviso Importante:*`,
            `Para asegurar la correcta planificación escolar y asignación de vacantes, le solicitamos ingresar a la brevedad para:`,
            `  ✅ *Validar y confirmar* su cupo definitivo para 2027, o`,
            `  ❌ *Anular / registrar constancia de no continuidad* en caso de que no continúe en la institución, permitiendo así liberar la vacante.`,
            ``,
            `🔗 *Acceda al portal de reserva de cupo aquí:*`,
            linkReserva,
            ``,
            `📌 _Solo necesitará ingresar el número de carnet de identidad (CI) del estudiante._`,
            ``,
            avisoAntiReporte,
            `📞 _Consultas / Secretaría: +591 69624189_`,
            `_Mensaje institucional automático._`
        ].filter(Boolean);

        return lineas.join('\n');
    }

    // ─── Notificar Recordatorio de Continuidad a Tutor ──────────────
    async notificarRecordatorioContinuidad({
        estudiante,
        telefonoDestino = null,
        tutor_nombre = null,
        mensaje_personalizado = null,
        anio_destino = 2027
    }) {
        const telefono = telefonoDestino || estudiante?.tutor_telefono;
        if (!telefono) {
            return { success: false, error: 'Sin número de celular o WhatsApp de contacto registrado' };
        }

        const body = mensaje_personalizado || this.generarMensajeRecordatorioContinuidad({
            estudiante_nombre: estudiante.nombre_completo || estudiante.estudiante_nombre_completo,
            estudiante_ci: estudiante.ci || estudiante.estudiante_ci,
            grado_destino_nombre: estudiante.grado_destino_nombre,
            turno_destino_nombre: estudiante.turno_destino_nombre,
            tutor_nombre: tutor_nombre || estudiante.tutor_nombre,
            anio_destino
        });

        const resultado = await this.enviarMensaje({ to: telefono, body });
        return resultado;
    }

    // ─── Generador con Spintax Anti-Spam para Campañas Masivas ────
    generarMensajeRecordatorioContinuidadConSpintax({
        estudiante_nombre,
        estudiante_ci,
        grado_destino_nombre,
        turno_destino_nombre,
        tutor_nombre = null,
        anio_destino = 2027
    }) {
        const nomTutor = tutor_nombre?.trim() || 'Padre/Madre/Tutor';
        const saludo = this._obtenerSaludoAleatorio(nomTutor);
        const avisoAntiReporte = this._obtenerDespedidaAntiReporte();
        const frontUrl = process.env.FRONTEND_URL || 'https://uepclavozdecristo.site';
        const linkReserva = `${frontUrl}/reserva-cupo`;

        // Variaciones dinámicas de título para romper la firma hash de spam de Meta
        const encabezados = [
            `📢 *¡Recordatorio Oficial de Cupo Asegurado!*`,
            `📋 *Comunicado Institucional: Continuidad y Reserva de Cupo*`,
            `🎓 *Aviso de Continuidad Escolar - Gestión ${anio_destino}*`,
            `🏫 *La Voz de Cristo - Confirmación de Cupo Escolar*`,
        ];
        const encabezado = encabezados[Math.floor(Math.random() * encabezados.length)];

        // Variaciones de apertura
        const intros = [
            `Le recordamos cordialmente que su hijo(a) cuenta con su *CUPO ASEGURADO* para la *Gestión ${anio_destino}*:`,
            `Nos comunicamos para informarle que su hijo(a) tiene asignado su *CUPO ASEGURADO* correspondiente a la *Gestión ${anio_destino}*:`,
            `Por medio del presente aviso oficial le recordamos que su hijo(a) dispone de su *CUPO ASEGURADO* para el ciclo escolar *${anio_destino}*:`,
        ];
        const intro = intros[Math.floor(Math.random() * intros.length)];

        // Código de control único aleatorio para garantizar un hash de texto 100% distinto
        const codigoControl = Math.random().toString(36).substring(2, 7).toUpperCase();

        const lineas = [
            encabezado,
            `🏫 *Unidad Educativa Particular La Voz de Cristo*`,
            ``,
            saludo,
            intro,
            ``,
            `🎓 *Estudiante:* *${estudiante_nombre}*`,
            estudiante_ci ? `📌 *CI:* ${estudiante_ci}` : null,
            grado_destino_nombre ? `📚 *Curso Proyectado:* *${grado_destino_nombre}*` : null,
            turno_destino_nombre ? `⏰ *Turno:* *${turno_destino_nombre}*` : null,
            `⏳ *Estado Actual:* *PENDIENTE DE CONFIRMACIÓN*`,
            ``,
            `⚠️ *Aviso Importante:*`,
            `Para garantizar la correcta planificación escolar y asignación de vacantes, le solicitamos ingresar a la brevedad para:`,
            `  ✅ *Validar y confirmar* su cupo definitivo para ${anio_destino}, o`,
            `  ❌ *Anular / registrar constancia de no continuidad* en caso de que no continúe en el colegio, permitiendo así liberar la vacante.`,
            ``,
            `🔗 *Acceda al portal de reserva de cupo aquí:*`,
            linkReserva,
            ``,
            `📌 _Solo necesitará ingresar el número de carnet de identidad (CI) del estudiante._`,
            ``,
            avisoAntiReporte,
            `📞 _Consultas / Secretaría: +591 69624189_`,
            `_Ref: LVC-REC-${codigoControl}_`
        ].filter(Boolean);

        return lineas.join('\n');
    }

    // ─── Motor de Campaña Masiva Anti-Baneo ────────────────────────
    /**
     * Ejecuta una campaña masiva con arquitectura Anti-Baneo de alta seguridad:
     * - Pausa humana aleatoria (Jitter) de 7 a 14 segundos entre envíos.
     * - Micro-descanso preventivo de 30 a 50 segundos cada 8 mensajes.
     * - Simulación de digitación previa (typing de 2.0 a 3.8s).
     * - Spintax y hash de referencia único por mensaje.
     * - Cancelación segura y control de progreso en tiempo real.
     */
    async ejecutarCampanaMasivaContinuidad({
        estudiantes = [],
        delayMinMs = 7000,
        delayMaxMs = 14000,
        tamanoLotePausa = 8,
        pausaLoteMs = 35000,
        anio_destino = 2027
    }) {
        if (this.estadoCampana.activo) {
            throw new Error('Ya existe una campaña de envíos en ejecución. Espere a que termine o deténgala.');
        }

        const validos = estudiantes.filter(e => {
            const num = this.normalizarNumero(e.tutor_telefono);
            return Boolean(num);
        });

        if (validos.length === 0) {
            throw new Error('No hay estudiantes con números de teléfono válidos para notificar.');
        }

        const idCampana = `CAMP-${Date.now()}`;
        this.estadoCampana = {
            activo: true,
            detenerSolicitado: false,
            id_campana: idCampana,
            total: validos.length,
            enviados: 0,
            fallidos: 0,
            en_cola: validos.length,
            estudiante_actual: null,
            iniciado_at: new Date().toISOString(),
            finalizado_at: null,
            ultimo_envio_at: null,
            mensajes_consecutivos: 0,
            delay_min_seg: Math.round(delayMinMs / 1000),
            delay_max_seg: Math.round(delayMaxMs / 1000)
        };

        // Despachar en segundo plano sin bloquear el hilo principal
        setImmediate(async () => {
            console.log(`🚀 [Anti-Ban WA] Iniciando campaña masiva ${idCampana} para ${validos.length} tutores...`);

            for (let i = 0; i < validos.length; i++) {
                if (this.estadoCampana.detenerSolicitado) {
                    console.log(`🛑 [Anti-Ban WA] Campaña ${idCampana} cancelada por el administrador.`);
                    break;
                }

                const est = validos[i];
                const telefono = this.normalizarNumero(est.tutor_telefono);
                const nombreEst = est.nombre_completo || `${est.estudiante_nombres || ''} ${est.estudiante_apellido_paterno || ''}`.trim();
                this.estadoCampana.estudiante_actual = nombreEst;

                try {
                    const mensaje = this.generarMensajeRecordatorioContinuidadConSpintax({
                        estudiante_nombre: nombreEst,
                        estudiante_ci: est.ci || est.estudiante_ci,
                        grado_destino_nombre: est.grado_destino_nombre,
                        turno_destino_nombre: est.turno_destino_nombre,
                        tutor_nombre: est.tutor_nombre,
                        anio_destino
                    });

                    // Simular presencia humana con typing en Evolution API
                    const delayTyping = Math.floor(Math.random() * 1800) + 2000;

                    const res = await fetch(`${process.env.EVOLUTION_API_URL}/send/text`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': process.env.EVOLUTION_INSTANCE_TOKEN,
                        },
                        body: JSON.stringify({
                            number: telefono,
                            text: mensaje,
                            delay: delayTyping,
                        }),
                    });

                    if (res.ok) {
                        this.estadoCampana.enviados++;
                        console.log(`✅ [Anti-Ban WA] [${this.estadoCampana.enviados}/${validos.length}] Entregado a ${nombreEst} (${telefono})`);
                    } else {
                        const errText = await res.text();
                        this.estadoCampana.fallidos++;
                        console.warn(`⚠️ [Anti-Ban WA] Error entregando a ${telefono}:`, errText);
                    }
                } catch (err) {
                    this.estadoCampana.fallidos++;
                    console.error(`❌ [Anti-Ban WA] Excepción enviando a ${telefono}:`, err.message);
                }

                this.estadoCampana.en_cola = validos.length - (this.estadoCampana.enviados + this.estadoCampana.fallidos);
                this.estadoCampana.ultimo_envio_at = new Date().toISOString();
                this.estadoCampana.mensajes_consecutivos++;

                // Pausas entre envíos sucesivos si aún quedan mensajes
                if (i < validos.length - 1 && !this.estadoCampana.detenerSolicitado) {
                    // ¿Toca micro-descanso por lote para romper patrones de bot?
                    if (this.estadoCampana.mensajes_consecutivos >= tamanoLotePausa) {
                        const descanso = Math.floor(Math.random() * 15000) + pausaLoteMs;
                        console.log(`☕ [Anti-Ban WA] Micro-descanso preventivo de ${(descanso / 1000).toFixed(0)}s tras ${tamanoLotePausa} mensajes...`);
                        this.estadoCampana.mensajes_consecutivos = 0;
                        await this._esperar(descanso);
                    } else {
                        // Pausa con Jitter aleatorio
                        const pausa = Math.floor(Math.random() * (delayMaxMs - delayMinMs + 1)) + delayMinMs;
                        console.log(`⏳ [Anti-Ban WA] Pausa humana de ${(pausa / 1000).toFixed(1)}s (${this.estadoCampana.en_cola} en cola)...`);
                        await this._esperar(pausa);
                    }
                }
            }

            this.estadoCampana.activo = false;
            this.estadoCampana.finalizado_at = new Date().toISOString();
            this.estadoCampana.estudiante_actual = null;
            console.log(`🏁 [Anti-Ban WA] Campaña finalizada. Enviados: ${this.estadoCampana.enviados}, Fallidos: ${this.estadoCampana.fallidos}`);
        });

        return {
            success: true,
            id_campana: idCampana,
            total_programados: validos.length,
            message: `Campaña iniciada para ${validos.length} tutores con protección anti-baneo activa (pausas de ${Math.round(delayMinMs / 1000)}s a ${Math.round(delayMaxMs / 1000)}s y micro-descansos automáticos).`
        };
    }

    obtenerEstadoCampana() {
        const total = this.estadoCampana.total;
        const procesados = this.estadoCampana.enviados + this.estadoCampana.fallidos;
        return {
            ...this.estadoCampana,
            porcentaje: total > 0 ? Math.round((procesados / total) * 100) : 0
        };
    }

    detenerCampana() {
        if (!this.estadoCampana.activo) {
            return { success: false, message: 'No hay ninguna campaña activa en este momento.' };
        }
        this.estadoCampana.detenerSolicitado = true;
        return { success: true, message: 'Se solicitó detener la campaña. Los envíos se pausarán inmediatamente.' };
    }

    // ─── Generar Mensaje de Citación a Entrevista (Hermano o Familia con varios Hermanos) ───
    generarMensajeEntrevistaHermano({
        hermano,
        hermanos = [],
        fecha_texto,
        hora_texto,
        modalidad = 'presencial',
        lugar = 'Dirección del Colegio - Oficina Principal',
        enlace = null,
        observaciones = null,
    }) {
        const listaHermanos = hermanos && hermanos.length > 0 ? hermanos : (hermano ? [hermano] : []);
        const esMultiple = listaHermanos.length > 1;
        const primerHermano = listaHermanos[0] || {};
        const nombreTutor = primerHermano.tutor_nombre?.trim() || 'Padre/Madre/Tutor';
        const regularNom = primerHermano.regular_nombre_completo ||
            [primerHermano.regular_nombres, primerHermano.regular_apellidos].filter(Boolean).join(' ') || '';
        const saludo = this._obtenerSaludoAleatorio(nombreTutor);
        const avisoAntiReporte = this._obtenerDespedidaAntiReporte();

        const lineas = [
            esMultiple
                ? `📅 *Citación Oficial a Entrevista Familiar Única - Prioridad Hermanos*`
                : `📅 *Citación Oficial a Entrevista - Prioridad Familiar*`,
            `🏫 *Unidad Educativa Particular La Voz de Cristo*`,
            ``,
            saludo,
            esMultiple
                ? `Nos comunicamos referente a la postulación de sus *${listaHermanos.length} hijos* con *Prioridad Hermano*:`
                : `Nos comunicamos referente a la postulación de su hijo(a) con *Prioridad Hermano*:`,
            ``,
        ];

        if (esMultiple) {
            lineas.push(`👥 *Hijos Postulantes Convocados a la misma cita:*`);
            listaHermanos.forEach((h, idx) => {
                const nom = h.nombre_completo || `${h.nombres || ''} ${h.apellido_paterno || ''} ${h.apellido_materno || ''}`.trim();
                const cur = h.grado_solicitado_nombre || h.grado_nombre || '';
                const tur = h.turno_solicitado_nombre || h.turno_nombre || '';
                lineas.push(`  ${idx + 1}. *${nom}* - Curso: *${cur}* (${tur}) · Cód: *${h.codigo_reserva}*`);
            });
            if (regularNom) {
                lineas.push(``, `🔗 Hermanos del estudiante regular: *${regularNom}*`);
            }
        } else {
            const h = primerHermano;
            const nom = h.nombre_completo || `${h.nombres || ''} ${h.apellido_paterno || ''} ${h.apellido_materno || ''}`.trim();
            const cur = h.grado_solicitado_nombre || h.grado_nombre || '';
            const tur = h.turno_solicitado_nombre || h.turno_nombre || '';
            lineas.push(
                `👤 Postulante: *${nom}*`,
                h.codigo_reserva ? `📋 Código de Reserva: *${h.codigo_reserva}*` : null,
                cur ? `📚 Curso Solicitado: *${cur}*` : null,
                tur ? `⏰ Turno: *${tur}*` : null,
                regularNom ? `🔗 Hermano(a) de: *${regularNom}*` : null,
            );
        }

        lineas.push(
            ``,
            esMultiple
                ? `📌 *Detalles de la Entrevista Familiar Única:*`
                : `📌 *Detalles de la Entrevista:*`,
            `- 📅 Fecha: *${fecha_texto}*`,
            `- ⏰ Hora: *${hora_texto}*`,
            `- 📌 Modalidad: *${modalidad === 'presencial' ? 'Presencial' : 'Virtual'}*`,
            modalidad === 'presencial'
                ? `- 📍 Lugar: *${lugar || 'Dirección del Colegio - Oficina Principal'}*`
                : (enlace ? `- 🌐 Enlace de Reunión: ${enlace}` : null),
            ``,
            `👥 *Asistencia Requerida (Obligatoria):*`,
            esMultiple
                ? `Para optimizar su tiempo, se realizará una *sola entrevista conjunta* para toda la familia. Es indispensable la presencia del *Padre, Madre o Tutor* junto con *los ${listaHermanos.length} postulantes citados*.`
                : `Es indispensable la presencia del *Padre, Madre o Tutor* junto con el *postulante*.`
        );

        if (observaciones) {
            lineas.push(``, `📝 *Instrucciones / Observaciones:*`, observaciones);
        }

        if (modalidad === 'presencial') {
            lineas.push(
                ``,
                `📍 *Ubicación del Colegio (Google Maps):*`,
                `https://maps.app.goo.gl/dWapCMNPguGBMUTv9`
            );
        }

        lineas.push(
            ``,
            avisoAntiReporte,
            `📞 _Secretaría / Consultas: +591 69624189_`,
            `_Mensaje institucional automático._`
        );

        return lineas.filter(Boolean).join('\n');
    }

    // ─── Notificar Citación a Entrevista para Hermano o Hermanos vía WhatsApp ───
    async notificarEntrevistaHermano({
        hermano,
        hermanos = [],
        fecha_texto,
        hora_texto,
        modalidad = 'presencial',
        lugar = 'Dirección del Colegio - Oficina Principal',
        enlace = null,
        observaciones = null,
        telefonoDestino = null,
    }) {
        const listaHermanos = hermanos && hermanos.length > 0 ? hermanos : (hermano ? [hermano] : []);
        const telefono = telefonoDestino || listaHermanos[0]?.tutor_telefono;
        if (!telefono) {
            return { success: false, message: 'Sin número de celular o WhatsApp de contacto registrado' };
        }

        const body = this.generarMensajeEntrevistaHermano({
            hermano: listaHermanos[0],
            hermanos: listaHermanos,
            fecha_texto,
            hora_texto,
            modalidad,
            lugar,
            enlace,
            observaciones,
        });

        return await this.enviarMensaje({ to: telefono, body });
    }
}

export default new WhatsAppService();
