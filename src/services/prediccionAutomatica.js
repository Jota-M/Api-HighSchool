// services/prediccionAutomatica.js — v8.6
//
// Cambios respecto a v8.5:
//   - CORREGIDO: separar "material ya asignado" de "notificación ya enviada".
//     Antes: si el material ya estaba asignado → xmax > 0 → silencio total,
//            aunque el estudiante volviera a sacar nota baja en otra evaluación.
//     Ahora: el material siempre se mantiene asignado (ON CONFLICT DO UPDATE),
//            pero la notificación al docente se controla por ventana de tiempo:
//            si ya se notificó sobre este estudiante+tema en las últimas
//            HORAS_ENTRE_NOTIFICACIONES horas → silencio.
//            Si pasó más tiempo (o nunca se notificó) → notificar siempre,
//            aunque el material ya estuviera asignado.
//   - NUEVO: constante HORAS_ENTRE_NOTIFICACIONES (default 24h, configurable
//            via env MATERIAL_NOTIF_COOLDOWN_HRS).
//   - MIGRADO v8.6: obtenerRecursosExternosGemini ya no llama a Gemini
//            directamente desde Node.js. En su lugar llama a
//            POST /materiales/recursos-externos en el ML service.
//            Se eliminan GEMINI_API_KEY, GEMINI_BASE y GEMINI_MODELS
//            de este archivo — ya no son necesarios aquí.
//
// Flujo dispararAsignacionMaterial (v8.6):
//   CalificacionController.registrar / registrarMasivo
//     ↓ fire-and-forget
//   dispararAsignacionMaterial({ evaluacion_id, matricula_id, puntaje_obtenido })
//     ↓
//   ¿nota normalizada < 60 Y evaluación tiene tema_id?
//     ↓ sí
//   ¿ya se notificó al docente sobre este matricula_id+tema_id en las últimas N horas?
//     ↓ sí → silencio (el material sigue asignado, solo evitamos spam)
//     ↓ no → continuar
//   Buscar materiales INTERNOS (fecha_publicacion IS NULL) para el tema
//     ↓ hay → INSERT/upsert (no duplica) + notificar docente
//     ↓ no hay → ML service → Gemini → recursos externos
//                → INSERT/upsert + notificar docente

import { pool }        from '../db/pool.js';
import whatsappService from '../utils/whatsappService.js';
import { buildPayloadCompleto } from '../services/ml-service.js';

const ML_BASE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000/api/v1';
const ML_TIMEOUT  = parseInt(process.env.ML_TIMEOUT_MS || '20000');

// Umbral de nota normalizada (sobre 100) para disparar la asignación
const UMBRAL_NOTA_BAJA = 60;

// Ventana de cooldown entre notificaciones al docente para el mismo estudiante+tema.
// Evita spam cuando el estudiante saca múltiples notas bajas en el mismo día,
// pero SÍ notifica si vuelve a fallar en una evaluación posterior (distinto día).
const HORAS_ENTRE_NOTIFICACIONES = parseInt(
  process.env.MATERIAL_NOTIF_COOLDOWN_HRS || '24'
);

// ─────────────────────────────────────────────────────────────
// HELPER: llamar al ML con timeout
// ─────────────────────────────────────────────────────────────
async function llamarML(endpoint, body) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), ML_TIMEOUT);
  try {
    const response = await fetch(`${ML_BASE_URL}/${endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
    if (!response.ok) throw new Error(`ML HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: obtener recursos externos via ML service (Gemini)
//
// MIGRADO v8.6: antes llamaba a Gemini directamente desde Node.js,
// manteniendo GEMINI_API_KEY aquí y duplicando la lógica de reintentos
// por modelo (gemini-2.0-flash-001 → gemini-2.0-flash → gemini-1.5-flash).
//
// Ahora delega al endpoint POST /materiales/recursos-externos del ML service,
// que usa el mismo cliente httpx y la misma GEMINI_API_KEY que el resto
// del sistema Python. La firma de la función no cambia → el resto del flujo
// (Rama B, INSERT, notificación) no necesita modificarse.
//
// Devuelve un array de hasta 3 objetos { titulo, url, origen_externo }
// o [] si el ML service no está disponible o Gemini falla.
// ─────────────────────────────────────────────────────────────
async function obtenerRecursosExternosGemini({
  temaTitulo,
  temaDescripcion,
  palabrasClave,
  nivelDificultad,
  objetivosUnidad,
  nivelEducativo,
}) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${ML_BASE_URL}/materiales/recursos-externos`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tema_titulo:      temaTitulo,
        tema_descripcion: temaDescripcion  || null,
        palabras_clave:   palabrasClave    || null,
        nivel_dificultad: nivelDificultad  || null,
        objetivos_unidad: objetivosUnidad  || null,
        nivel_educativo:  nivelEducativo   || null,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ML recursos-externos HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.gemini_disponible || data.total === 0) {
      console.info('[asignacionMaterial] ML service: Gemini no devolvió recursos externos');
      return [];
    }

    return data.recursos.map(r => ({
      titulo:         r.titulo,
      url:            r.url,
      origen_externo: r.origen_externo || 'web',
    }));

  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[asignacionMaterial] Timeout llamando a ML /materiales/recursos-externos');
    } else {
      console.warn('[asignacionMaterial] Error llamando a ML /materiales/recursos-externos:', err.message);
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER: obtener tutores del estudiante para notificar
// ─────────────────────────────────────────────────────────────
async function getTutoresParaNotificar(client, estudianteId, nivelRiesgo) {
  let condicionExtra = '';
  if (nivelRiesgo === 'medio') {
    condicionExtra = 'AND et.es_tutor_principal = true';
  } else if (nivelRiesgo === 'alto') {
    condicionExtra = 'AND et.es_tutor_principal = true';
  } else if (nivelRiesgo === 'critico') {
    condicionExtra = 'AND et.recibe_notificaciones = true';
  }

  const { rows } = await client.query(`
    SELECT
      pf.id             AS padre_familia_id,
      pf.usuario_id,
      pf.nombres || ' ' || pf.apellido_paterno AS nombre_completo,
      pf.celular,
      pf.telefono,
      pf.email,
      pf.parentesco,
      et.es_tutor_principal,
      et.prioridad_contacto
    FROM   estudiante_tutor et
    JOIN   padre_familia pf ON et.padre_familia_id = pf.id
    WHERE  et.estudiante_id         = $1
      AND  et.recibe_notificaciones = true
      ${condicionExtra}
    ORDER  BY et.es_tutor_principal DESC, et.prioridad_contacto ASC
  `, [estudianteId]);

  return rows;
}

// ─────────────────────────────────────────────────────────────
// HELPER: generar código de notificación
// ─────────────────────────────────────────────────────────────
async function generarCodigoNotificacion(client) {
  const anio = new Date().getFullYear();
  const { rows: [last] } = await client.query(
    `SELECT codigo FROM notificacion_institucional
     WHERE  codigo LIKE $1 ORDER BY codigo DESC LIMIT 1`,
    [`NOTIF-${anio}-%`]
  );
  const numero = last ? parseInt(last.codigo.split('-')[2], 10) + 1 : 1;
  return `NOTIF-${anio}-${String(numero).padStart(6, '0')}`;
}

// ─────────────────────────────────────────────────────────────
// HELPER: crear notificación para padre/tutor
// ─────────────────────────────────────────────────────────────
async function crearNotificacionPadre(
  client,
  { tutorUsuarioId, nombreTutor, celular, email,
    estudianteNombre, materia, nivelRiesgo, notaEstimada,
    creadorUsuarioId, periodoAcademicoId }
) {
  const codigo = await generarCodigoNotificacion(client);

  const mensajes = {
    medio:   `Estimado/a ${nombreTutor}, le informamos que ${estudianteNombre} presenta un rendimiento medio en ${materia}. Le recomendamos revisar sus tareas y asistencia. Nota estimada: ${notaEstimada}/100.`,
    alto:    `Estimado/a ${nombreTutor}, ${estudianteNombre} está en riesgo ALTO de reprobar ${materia}. Nota estimada: ${notaEstimada}/100. Por favor comuníquese con el docente a la brevedad.`,
    critico: `URGENTE: ${estudianteNombre} está en riesgo CRÍTICO de reprobar ${materia}. Nota estimada: ${notaEstimada}/100. Es fundamental una reunión con el docente esta semana.`,
  };

  const prioridades = { medio: 'normal', alto: 'alta', critico: 'urgente' };
  const titulo = nivelRiesgo === 'critico'
    ? `🚨 Alerta urgente — ${materia}`
    : `⚠️ Aviso de rendimiento — ${materia}`;

  const { rows: [notif] } = await client.query(`
    INSERT INTO notificacion_institucional (
      codigo, titulo, mensaje, tipo, prioridad, audiencia,
      periodo_academico_id, destinatario_usuario_id,
      enviar_whatsapp, enviar_email, enviar_interno,
      estado, creada_por
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING id, codigo
  `, [
    codigo, titulo,
    mensajes[nivelRiesgo] || mensajes.medio,
    'notificacion_individual',
    prioridades[nivelRiesgo] || 'normal',
    'individual',
    periodoAcademicoId || null,
    tutorUsuarioId || null,
    !!(celular && nivelRiesgo !== 'medio'),
    !!(email),
    true,
    'enviada',
    creadorUsuarioId,
  ]);

  if (tutorUsuarioId) {
    await client.query(`
      INSERT INTO notificacion_destinatario (
        notificacion_id, usuario_id, nombre_destinatario,
        celular_snapshot, email_snapshot,
        rol_destinatario, canal, estado_envio, enviado_en
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT (notificacion_id, usuario_id, canal) DO NOTHING
    `, [notif.id, tutorUsuarioId, nombreTutor,
        celular || null, email || null, 'padre', 'interno', 'enviado']);
  }

  if (celular && nivelRiesgo !== 'medio') {
    await client.query(`
      INSERT INTO notificacion_destinatario (
        notificacion_id, usuario_id, nombre_destinatario,
        celular_snapshot, rol_destinatario, canal, estado_envio
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (notificacion_id, usuario_id, canal) DO NOTHING
    `, [notif.id, tutorUsuarioId || null, nombreTutor,
        celular, 'padre', 'whatsapp', 'pendiente']);
  }

  return notif;
}

// ─────────────────────────────────────────────────────────────
// HELPER: crear notificación al docente por nota baja
// Distingue materiales internos vs externos en el mensaje
// ─────────────────────────────────────────────────────────────
async function crearNotificacionDocenteNotaBaja(client, {
  asignacionDocenteId,
  estudianteNombre,
  materia,
  temaTitulo,
  notaNormalizada,
  materialesAsignados,  // array de { titulo, tipo_codigo?, url?, origen_externo?, esExterno }
  creadorUsuarioId,
}) {
  const { rows: [docente] } = await client.query(`
    SELECT
      d.usuario_id,
      d.nombres || ' ' || d.apellido_paterno AS nombre_completo,
      d.celular,
      d.email,
      ad.periodo_academico_id
    FROM   asignacion_docente ad
    JOIN   docente d ON ad.docente_id = d.id
    WHERE  ad.id = $1
  `, [asignacionDocenteId]);

  if (!docente) return null;

  const codigo = await generarCodigoNotificacion(client);
  const titulo = `📚 Material asignado automáticamente — ${estudianteNombre}`;

  const internos  = materialesAsignados.filter(m => !m.esExterno);
  const externos  = materialesAsignados.filter(m =>  m.esExterno);

  const lineasMateriales = [];

  if (internos.length > 0) {
    lineasMateriales.push('Materiales del repositorio institucional:');
    internos.forEach(m => lineasMateriales.push(`  • ${m.titulo} (${m.tipo_codigo || 'documento'})`));
  }

  if (externos.length > 0) {
    lineasMateriales.push(internos.length > 0 ? '' : '');
    lineasMateriales.push('Recursos externos sugeridos por IA:');
    externos.forEach(m =>
      lineasMateriales.push(`  • ${m.titulo} [${m.origen_externo || 'web'}]\n    ${m.url}`)
    );
  }

  const mensaje = [
    `El sistema detectó una nota baja (${notaNormalizada}/100) de ${estudianteNombre}`,
    `en el tema "${temaTitulo}" de ${materia}.`,
    ``,
    `Se asignaron automáticamente los siguientes materiales de apoyo:`,
    ...lineasMateriales,
    ``,
    `El estudiante puede verlos en su sección de materiales asignados.`,
  ].join('\n');

  const { rows: [notif] } = await client.query(`
    INSERT INTO notificacion_institucional (
      codigo, titulo, mensaje, tipo, prioridad, audiencia,
      periodo_academico_id, destinatario_usuario_id,
      enviar_whatsapp, enviar_email, enviar_interno,
      estado, creada_por
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING id, codigo
  `, [
    codigo, titulo, mensaje,
    'notificacion_individual', 'normal', 'individual',
    docente.periodo_academico_id, docente.usuario_id,
    !!(docente.celular),
    !!(docente.email),
    true,
    'enviada',
    creadorUsuarioId || docente.usuario_id,
  ]);

  if (docente.usuario_id) {
    // Canal interno
    await client.query(`
      INSERT INTO notificacion_destinatario (
        notificacion_id, usuario_id, nombre_destinatario,
        celular_snapshot, email_snapshot,
        rol_destinatario, canal, estado_envio, enviado_en
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT (notificacion_id, usuario_id, canal) DO NOTHING
    `, [notif.id, docente.usuario_id, docente.nombre_completo,
        docente.celular || null, docente.email || null,
        'docente', 'interno', 'enviado']);

    // Canal WhatsApp
    if (docente.celular) {
      await client.query(`
        INSERT INTO notificacion_destinatario (
          notificacion_id, usuario_id, nombre_destinatario,
          celular_snapshot, rol_destinatario, canal, estado_envio
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (notificacion_id, usuario_id, canal) DO NOTHING
      `, [notif.id, docente.usuario_id, docente.nombre_completo,
          docente.celular, 'docente', 'whatsapp', 'pendiente']);
    }

    // Canal email
    if (docente.email) {
      await client.query(`
        INSERT INTO notificacion_destinatario (
          notificacion_id, usuario_id, nombre_destinatario,
          email_snapshot, rol_destinatario, canal, estado_envio
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (notificacion_id, usuario_id, canal) DO NOTHING
      `, [notif.id, docente.usuario_id, docente.nombre_completo,
          docente.email, 'docente', 'email', 'pendiente']);
    }
  }

  // WhatsApp real (best-effort)
  if (docente.celular) {
    const totalMateriales = materialesAsignados.length;
    const fuenteTexto = externos.length > 0 && internos.length === 0
      ? 'recursos externos (IA)'
      : externos.length > 0
        ? 'repositorio + IA'
        : 'repositorio institucional';

    const mensajeWA = [
      `📚 *Material asignado automáticamente*`,
      `Estudiante: ${estudianteNombre}`,
      `Tema: ${temaTitulo} — ${materia}`,
      `Nota obtenida: ${notaNormalizada}/100`,
      `Materiales asignados: ${totalMateriales} (${fuenteTexto})`,
    ].join('\n');

    whatsappService.enviarMensaje?.({
      telefono: docente.celular,
      mensaje:  mensajeWA,
    }).catch(err =>
      console.warn('[prediccionAuto] WhatsApp docente falló:', err.message)
    );
  }

  return { notificacionId: notif.id, codigo: notif.codigo };
}

// ─────────────────────────────────────────────────────────────
// dispararAsignacionMaterial — v8.6
//
// Flujo:
//   1. Nota < 60 y tema_id presente → continuar
//   2. Verificar cooldown de notificación (HORAS_ENTRE_NOTIFICACIONES)
//   3. Buscar materiales INTERNOS de refuerzo (fecha_publicacion IS NULL)
//   3a. Hay internos → upsert + notificar docente
//   3b. No hay internos → ML service → Gemini → recursos externos
//       → upsert + notificar docente
// ─────────────────────────────────────────────────────────────
export async function dispararAsignacionMaterial({
  evaluacionId,
  matriculaId,
  puntajeObtenido,
  estaAusente = false,
}) {
  if (estaAusente || puntajeObtenido == null) return;

  try {
    const client = await pool.connect();
    let evaluacion, notaNormalizada, estudiante;
    let materialesInternos = [];

    try {
      // 1. Obtener evaluación con tema y asignacion_docente
      const { rows: [ev] } = await client.query(`
        SELECT
          e.id,
          e.nombre                                        AS evaluacion_nombre,
          e.puntaje_maximo,
          e.tema_id,
          e.asignacion_docente_id,
          e.periodo_evaluacion_id,
          t.titulo                                        AS tema_titulo,
          t.descripcion                                   AS tema_descripcion,
          t.palabras_clave                                AS tema_palabras_clave,
          t.nivel_dificultad                              AS tema_nivel_dificultad,
          ut.objetivos                                    AS unidad_objetivos,
          de.codigo                                       AS dimension_codigo,
          g.nombre                                        AS grado_nombre,
          na.nombre                                       AS nivel_nombre,
          na.nombre || ' — ' || g.nombre                 AS nivel_educativo
        FROM   evaluacion e
        LEFT   JOIN tema t                  ON t.id   = e.tema_id
        LEFT   JOIN unidad_tematica ut      ON ut.id  = t.unidad_tematica_id
        JOIN   dimension_evaluacion de      ON de.id  = e.dimension_evaluacion_id
        JOIN   asignacion_docente ad        ON ad.id  = e.asignacion_docente_id
        JOIN   grado_materia gm             ON gm.id  = ad.grado_materia_id
        JOIN   grado g                      ON g.id   = gm.grado_id
        JOIN   nivel_academico na           ON na.id  = g.nivel_academico_id
        WHERE  e.id = $1 AND e.activo = true
      `, [evaluacionId]);

      if (!ev) {
        console.warn(`[asignacionMaterial] Evaluación ${evaluacionId} no encontrada`);
        return;
      }

      evaluacion = ev;

      // 2. Calcular nota normalizada
      const puntajeMaximo = parseFloat(ev.puntaje_maximo) || 100;
      notaNormalizada = Math.round((puntajeObtenido / puntajeMaximo) * 100 * 10) / 10;

      if (notaNormalizada >= UMBRAL_NOTA_BAJA) {
        console.info(
          `[asignacionMaterial] Nota ${notaNormalizada}/100 ≥ ${UMBRAL_NOTA_BAJA} — sin acción`
        );
        return;
      }

      if (!ev.tema_id) {
        console.info(
          `[asignacionMaterial] Evaluación ${evaluacionId} sin tema_id — sin acción`
        );
        return;
      }

      // 3. Datos del estudiante
      const { rows: [est] } = await client.query(`
        SELECT
          m.estudiante_id,
          e.nombres || ' ' || e.apellidos AS nombre_completo,
          m.id AS matricula_id
        FROM   matricula m
        JOIN   estudiante e ON e.id = m.estudiante_id
        WHERE  m.id = $1
      `, [matriculaId]);

      if (!est) {
        console.warn(`[asignacionMaterial] Matrícula ${matriculaId} no encontrada`);
        return;
      }

      estudiante = est;

      // 4a. Verificar cooldown: ¿ya se notificó al docente sobre este estudiante+tema
      //     en las últimas HORAS_ENTRE_NOTIFICACIONES horas?
      const { rows: [notifReciente] } = await client.query(`
        SELECT ni.id
        FROM   notificacion_institucional ni
        WHERE  ni.creada_por IS NOT DISTINCT FROM NULL
          AND  ni.tipo      = 'notificacion_individual'
          AND  ni.titulo    LIKE '%' || $1 || '%'
          AND  ni.created_at >= NOW() - ($2 || ' hours')::INTERVAL
          AND  EXISTS (
            SELECT 1 FROM notificacion_destinatario nd
            WHERE  nd.notificacion_id = ni.id
              AND  nd.rol_destinatario = 'docente'
          )
        LIMIT 1
      `, [estudiante.nombre_completo, HORAS_ENTRE_NOTIFICACIONES]);

      if (notifReciente) {
        console.info(
          `[asignacionMaterial] Cooldown activo (${HORAS_ENTRE_NOTIFICACIONES}h) — ` +
          `ya notificado sobre ${estudiante.nombre_completo} / tema ${ev.tema_id}. Sin acción.`
        );
        return;
      }

      // 4b. Buscar materiales INTERNOS de refuerzo para el tema
      const { rows: internos } = await client.query(`
        SELECT
          ma.id,
          ma.titulo,
          ma.descripcion,
          ma.url_archivo,
          ma.url_externa,
          ma.es_destacado,
          tm.nombre    AS tipo,
          tm.codigo    AS tipo_codigo,
          t.id         AS tema_id,
          t.titulo     AS tema_titulo
        FROM   material_academico ma
        JOIN   tipo_material  tm  ON ma.tipo_material_id  = tm.id
        JOIN   material_tema  mt  ON ma.id                = mt.material_academico_id
        JOIN   tema           t   ON mt.tema_id           = t.id
        WHERE  t.id                         = $1
          AND  ma.visible_para_estudiantes  = true
          AND  ma.activo                    = true
          AND  ma.deleted_at                IS NULL
          AND  ma.fecha_publicacion         IS NULL
        ORDER BY
          ma.es_destacado  DESC,
          ma.contador_vistas DESC
        LIMIT 5
      `, [ev.tema_id]);

      materialesInternos = internos;

    } finally {
      client.release();
    }

    // ── Asignar materiales y notificar ────────────────────────────────────
    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');

      const materialesAsignados = [];
      const mensajeDocente = [
        `Asignado automáticamente por nota baja (${notaNormalizada}/100)`,
        `en la evaluación "${evaluacion.evaluacion_nombre}"`,
        `del tema "${evaluacion.tema_titulo}".`,
      ].join(' ');

      if (materialesInternos.length > 0) {
        // ── RAMA A: materiales internos → upsert + notificar ─────────────
        for (const mat of materialesInternos) {
          const { rows: [reg] } = await client2.query(`
            INSERT INTO material_asignado_estudiante (
              material_academico_id,
              matricula_id,
              asignacion_docente_id,
              asignado_por,
              origen,
              mensaje_docente,
              activo,
              created_at,
              updated_at
            ) VALUES ($1, $2, $3, $4, 'automatico', $5, true, NOW(), NOW())
            ON CONFLICT (material_academico_id, matricula_id, asignacion_docente_id)
              WHERE material_academico_id IS NOT NULL
            DO UPDATE SET
              mensaje_docente = EXCLUDED.mensaje_docente,
              updated_at      = NOW()
            RETURNING id
          `, [
            mat.id,
            matriculaId,
            evaluacion.asignacion_docente_id,
            evaluacion.asignacion_docente_id,
            mensajeDocente,
          ]);
          materialesAsignados.push({
            ...mat,
            asignacion_id: reg.id,
            esExterno:     false,
          });
        }

        console.info(
          `[asignacionMaterial] Rama A — ${materialesAsignados.length} material(es) ` +
          `(re)asignado(s) a matrícula ${matriculaId}`
        );

      } else {
        // ── RAMA B: Sin materiales internos → ML service → Gemini ────────
        console.info(
          `[asignacionMaterial] Sin materiales internos para tema ${evaluacion.tema_id} ` +
          `— solicitando recursos externos al ML service`
        );

        const recursosGemini = await obtenerRecursosExternosGemini({
          temaTitulo:      evaluacion.tema_titulo,
          temaDescripcion: evaluacion.tema_descripcion,
          palabrasClave:   evaluacion.tema_palabras_clave,
          nivelDificultad: evaluacion.tema_nivel_dificultad,
          objetivosUnidad: evaluacion.unidad_objetivos,
          nivelEducativo:  evaluacion.nivel_educativo,
        });

        if (recursosGemini.length === 0) {
          console.warn(
            `[asignacionMaterial] ML service no devolvió recursos para tema "${evaluacion.tema_titulo}" — sin acción`
          );
          await client2.query('ROLLBACK');
          return;
        }

        for (const recurso of recursosGemini) {
          const { rows: [reg] } = await client2.query(`
            INSERT INTO material_asignado_estudiante (
              material_academico_id,
              url_recurso_externo,
              titulo_recurso_externo,
              origen_externo,
              matricula_id,
              asignacion_docente_id,
              asignado_por,
              origen,
              mensaje_docente,
              activo,
              created_at,
              updated_at
            ) VALUES (
              NULL, $1, $2, $3, $4, $5, $6, 'web_search', $7, true, NOW(), NOW()
            )
            ON CONFLICT (url_recurso_externo, matricula_id, asignacion_docente_id)
              WHERE url_recurso_externo IS NOT NULL
            DO UPDATE SET
              titulo_recurso_externo = EXCLUDED.titulo_recurso_externo,
              updated_at             = NOW()
            RETURNING id
          `, [
            recurso.url,
            recurso.titulo,
            recurso.origen_externo || 'web',
            matriculaId,
            evaluacion.asignacion_docente_id,
            evaluacion.asignacion_docente_id,
            mensajeDocente,
          ]);

          materialesAsignados.push({
            titulo:         recurso.titulo,
            url:            recurso.url,
            origen_externo: recurso.origen_externo || 'web',
            asignacion_id:  reg.id,
            esExterno:      true,
          });
        }

        console.info(
          `[asignacionMaterial] Rama B — ${materialesAsignados.length} recurso(s) externos ` +
          `(ML service/Gemini) asignado(s) a matrícula ${matriculaId}`
        );
      }

      // 6. Notificar al docente por los 3 canales
      await crearNotificacionDocenteNotaBaja(client2, {
        asignacionDocenteId:  evaluacion.asignacion_docente_id,
        estudianteNombre:     estudiante.nombre_completo,
        materia:              'la materia',
        temaTitulo:           evaluacion.tema_titulo,
        notaNormalizada,
        materialesAsignados,
        creadorUsuarioId:     null,
      });

      await client2.query('COMMIT');

      console.info(
        `[asignacionMaterial] ✅ ${materialesAsignados.length} material(es) asignado(s) ` +
        `a matrícula ${matriculaId} | Tema: ${evaluacion.tema_titulo} | ` +
        `Nota: ${notaNormalizada}/100`
      );

    } catch (err) {
      await client2.query('ROLLBACK');
      console.error('[asignacionMaterial] Error en transacción:', err.message);
    } finally {
      client2.release();
    }

  } catch (err) {
    console.error('[asignacionMaterial] Error general:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// dispararPrediccionAlCierre — sin cambios desde v8.3
// ─────────────────────────────────────────────────────────────
export async function dispararPrediccionAlCierre({
  matriculaId,
  gradoMateriaId,
  periodoEvaluacionId,
  asignacionDocenteId,
  cerradoPor,
}) {
  try {
    const { rows: [mat] } = await pool.query(`
      SELECT
        m.estudiante_id,
        e.nombres || ' ' || e.apellidos AS nombre_completo,
        ad.periodo_academico_id
      FROM   matricula m
      JOIN   estudiante e ON e.id = m.estudiante_id
      JOIN   asignacion_docente ad ON ad.id = $2
      WHERE  m.id = $1
    `, [matriculaId, asignacionDocenteId]);

    if (!mat) {
      console.warn(`[prediccionAuto] Matrícula ${matriculaId} no encontrada`);
      return;
    }

    const estudianteId       = mat.estudiante_id;
    const estudianteNombre   = mat.nombre_completo;
    const periodoAcademicoId = mat.periodo_academico_id;

    const client = await pool.connect();
    let mlRequest, materiaResult;

    try {
      const resultado = await buildPayloadCompleto(client, {
        matriculaId,
        asignacionDocenteId,
        periodoEvaluacionId,
        conMateriales: true,
      });

      mlRequest    = resultado.mlRequest;
      materiaResult = resultado.materia;

      mlRequest.semana = mlRequest.config_periodo.total_semanas;

    } finally {
      client.release();
    }

    if (!materiaResult) {
      console.warn(`[prediccionAuto] Materia no encontrada para asignación ${asignacionDocenteId}`);
      return;
    }

    const resultado = await llamarML('predecir?incluir_gemini=true', mlRequest);

    const nivelRiesgo   = resultado?.modelo?.nivel_riesgo;
    const notaEstimada  = resultado?.modelo?.nota_estimada_final;
    const mensajeAlerta = resultado?.analisis?.mensaje_alerta;

    console.info(
      `[prediccionAuto] Matrícula ${matriculaId} | ${mlRequest.materia} | ` +
      `Riesgo: ${nivelRiesgo} | Nota estimada: ${notaEstimada}`
    );

    if (!nivelRiesgo || nivelRiesgo === 'bajo') return;

    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');

      const { default: Prediccion } = await import('../models/Prediccion.js');
      await Prediccion.crearAlertaDocente(
        asignacionDocenteId,
        estudianteId,
        mlRequest.materia,
        mensajeAlerta,
        nivelRiesgo,
        notaEstimada,
        cerradoPor,
      );

      const tutores = await getTutoresParaNotificar(client2, estudianteId, nivelRiesgo);

      for (const tutor of tutores) {
        await crearNotificacionPadre(client2, {
          tutorUsuarioId:    tutor.usuario_id,
          nombreTutor:       tutor.nombre_completo,
          celular:           tutor.celular || tutor.telefono,
          email:             tutor.email,
          estudianteNombre,
          materia:           mlRequest.materia,
          nivelRiesgo,
          notaEstimada,
          creadorUsuarioId:  cerradoPor,
          periodoAcademicoId,
        });

        if (nivelRiesgo !== 'medio' && (tutor.celular || tutor.telefono)) {
          whatsappService.enviarMensaje?.({
            telefono: tutor.celular || tutor.telefono,
            mensaje:  [
              `[${mlRequest.materia}] ${estudianteNombre}`,
              `tiene riesgo ${nivelRiesgo.toUpperCase()}.`,
              `Nota estimada: ${notaEstimada}/100.`,
              `Por favor contáctenos.`,
            ].join(' '),
          }).catch(err =>
            console.warn(`[prediccionAuto] WhatsApp falló para tutor ${tutor.padre_familia_id}:`, err.message)
          );
        }
      }

      await client2.query('COMMIT');
      console.info(
        `[prediccionAuto] Notificaciones creadas: ` +
        `${tutores.length} tutor(es) | Matrícula ${matriculaId}`
      );

    } catch (err) {
      await client2.query('ROLLBACK');
      console.error('[prediccionAuto] Error creando notificaciones:', err.message);
    } finally {
      client2.release();
    }

  } catch (err) {
    console.error('[prediccionAuto] Error general:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// cerrarPeriodoClase — sin cambios lógicos
// ─────────────────────────────────────────────────────────────
export async function cerrarPeriodoClase({
  asignacionDocenteId,
  gradoMateriaId,
  periodoEvaluacionId,
  cerradoPor,
}) {
  const client = await pool.connect();
  let matriculas = [];

  try {
    const { rows } = await client.query(`
      SELECT
        m.id          AS matricula_id,
        m.estudiante_id,
        cp.id         AS calificacion_periodo_id,
        cp.estado     AS estado_actual
      FROM   asignacion_docente ad
      JOIN   matricula m
        ON   m.paralelo_id          = ad.paralelo_id
        AND  m.periodo_academico_id = ad.periodo_academico_id
        AND  m.estado               = 'activo'
        AND  m.deleted_at           IS NULL
      LEFT JOIN calificacion_periodo cp
        ON   cp.matricula_id          = m.id
        AND  cp.grado_materia_id      = $2
        AND  cp.periodo_evaluacion_id = $3
      WHERE  ad.id = $1
    `, [asignacionDocenteId, gradoMateriaId, periodoEvaluacionId]);

    matriculas = rows;
  } finally {
    client.release();
  }

  if (matriculas.length === 0) return { cerrados: 0, errores: 0 };

  let cerrados = 0;
  let errores  = 0;
  const BATCH  = 5;

  for (let i = 0; i < matriculas.length; i += BATCH) {
    const lote = matriculas.slice(i, i + BATCH);

    await Promise.allSettled(lote.map(async (m) => {
      try {
        if (m.estado_actual === 'activa' || !m.estado_actual) {
          const c = await pool.connect();
          try {
            await c.query(`
              UPDATE calificacion_periodo
              SET    estado='cerrada', cerrado_por=$1,
                     fecha_cierre=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
              WHERE  matricula_id          = $2
                AND  grado_materia_id      = $3
                AND  periodo_evaluacion_id = $4
                AND  estado = 'activa'
            `, [cerradoPor, m.matricula_id, gradoMateriaId, periodoEvaluacionId]);
          } finally {
            c.release();
          }
        }

        await dispararPrediccionAlCierre({
          matriculaId:         m.matricula_id,
          gradoMateriaId,
          periodoEvaluacionId,
          asignacionDocenteId,
          cerradoPor,
        });

        cerrados++;
      } catch (err) {
        errores++;
        console.error(`[prediccionAuto] Error en matrícula ${m.matricula_id}:`, err.message);
      }
    }));

    if (i + BATCH < matriculas.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.info(
    `[prediccionAuto] Cierre clase completado — ` +
    `${cerrados} cerrados, ${errores} errores | ` +
    `Asignación ${asignacionDocenteId} / Período ${periodoEvaluacionId}`
  );

  return { cerrados, errores };
}