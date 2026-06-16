// src/utils/notificacionesAcademicas.js
// Orquesta las notificaciones automáticas generadas por eventos académicos.
// v2 — Canal interno activado
// v2.1 — Fix: creada_por usa usuario_id del destinatario (proceso automático del sistema)

import { pool } from '../db/pool.js';
import whatsappService from './whatsappService.js';
import emailService from './emailService.js';

// ─── Niveles de importancia → canales activos ────────────────────────────────
const CANALES_POR_NIVEL = {
  urgente: { whatsapp: true, email: true, interno: true },
  importante: { whatsapp: true, email: false, interno: true },
  informativo: { whatsapp: false, email: false, interno: true },
};

// ─── Tipo de notificación por evento ─────────────────────────────────────────
const TIPO_POR_EVENTO = {
  asistencia: 'notificacion_individual',
  calificacion: 'notificacion_individual',
  nota_periodo: 'notificacion_individual',
  evaluacion: 'notificacion_individual',
  observacion: 'notificacion_individual',
  alerta_ml: 'notificacion_individual',
};

class NotificacionesAcademicas {

  // ════════════════════════════════════════════════════════════════
  //  EVENTO 0 — Asistencia (ausente o tardanza)
  // ════════════════════════════════════════════════════════════════
  async onAsistencia({ matricula_id, estado, materia_nombre, fecha, asignacion_docente_id }) {
    if (!['ausente', 'tardanza'].includes(estado)) return;
    try {
      const estudiante = await this._getDatosEstudiantePorMatricula(matricula_id);
      if (!estudiante) return;

      const { padres } = await this._getDestinatarios(estudiante.estudiante_id);
      if (!padres.length) return;

      const canales = CANALES_POR_NIVEL['urgente'];
      const titulo = `${estado === 'ausente' ? '⚠️ Inasistencia' : '🕐 Tardanza'} — ${estudiante.estudiante_nombre}`;
      const mensaje = this._tplAsistencia({ estado, estudiante, materia_nombre, fecha });

      await this._despachar({
        destinatarios: padres,
        titulo,
        mensaje,
        asunto: titulo,
        canales,
        tipoEvento: 'asistencia',
        prioridad: 'urgente',
      });
    } catch (err) {
      console.error('⚠️ [notif] onAsistencia:', err.message);
    }
  }

  async onAsistenciaMasiva(registros, { asignacion_docente_id, fecha, materia_nombre }) {
    const aNotificar = (registros || []).filter(r => ['ausente', 'tardanza'].includes(r.estado));
    if (!aNotificar.length) return;

    await Promise.allSettled(
      aNotificar.map(r =>
        this.onAsistencia({
          matricula_id: r.matricula_id,
          estado: r.estado,
          materia_nombre,
          fecha,
          asignacion_docente_id,
        })
      )
    );
  }

  // ════════════════════════════════════════════════════════════════
  //  EVENTO 1 — Calificación cargada
  // ════════════════════════════════════════════════════════════════
  async onCalificacionCargada({ calificacion_id, matricula_id, evaluacion_id }) {
    try {
      const datos = await this._getDatosCalificacion(calificacion_id, matricula_id, evaluacion_id);
      if (!datos) return;

      const nivel = datos.aprobado === false ? 'urgente' : 'importante';
      const canales = CANALES_POR_NIVEL[nivel];

      const { estudiante, padres } = await this._getDestinatarios(datos.estudiante_id);

      const tituloEst = `📝 Nueva calificación — ${datos.materia_nombre}`;
      await this._despachar({
        destinatarios: [estudiante],
        titulo: tituloEst,
        mensaje: this._tplCalificacionEstudiante(datos),
        asunto: tituloEst,
        canales,
        tipoEvento: 'calificacion',
        prioridad: nivel === 'urgente' ? 'urgente' : 'normal',
      });

      const tituloPadre = `📝 Calificación de ${datos.estudiante_nombre} — ${datos.materia_nombre}`;
      await this._despachar({
        destinatarios: padres,
        titulo: tituloPadre,
        mensaje: this._tplCalificacionPadre(datos),
        asunto: tituloPadre,
        canales,
        tipoEvento: 'calificacion',
        prioridad: nivel === 'urgente' ? 'urgente' : 'normal',
      });

    } catch (err) {
      console.error('⚠️ [notif] onCalificacionCargada:', err.message);
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  EVENTO 2 — Nota de período cerrada
  // ════════════════════════════════════════════════════════════════
  async onNotaPeriodoCerrada({ calificacion_periodo_id, matricula_id, grado_materia_id, periodo_evaluacion_id }) {
    try {
      const datos = await this._getDatosNotaPeriodo(
        calificacion_periodo_id, matricula_id, grado_materia_id, periodo_evaluacion_id
      );
      if (!datos) return;

      const nivel = datos.aprobado ? 'importante' : 'urgente';
      const canales = CANALES_POR_NIVEL[nivel];

      const { estudiante, padres } = await this._getDestinatarios(datos.estudiante_id);

      const tituloEst = `📊 Nota de período — ${datos.materia_nombre}`;
      const tituloPadre = `📊 Nota de período de ${datos.estudiante_nombre} — ${datos.materia_nombre}`;
      const prioridad = datos.aprobado ? 'normal' : 'urgente';

      await Promise.allSettled([
        this._despachar({
          destinatarios: [estudiante],
          titulo: tituloEst,
          mensaje: this._tplNotaPeriodoEstudiante(datos),
          asunto: tituloEst,
          canales,
          tipoEvento: 'nota_periodo',
          prioridad,
        }),
        this._despachar({
          destinatarios: padres,
          titulo: tituloPadre,
          mensaje: this._tplNotaPeriodoPadre(datos),
          asunto: tituloPadre,
          canales,
          tipoEvento: 'nota_periodo',
          prioridad,
        }),
      ]);

    } catch (err) {
      console.error('⚠️ [notif] onNotaPeriodoCerrada:', err.message);
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  EVENTO 3 — Práctica/evaluación próxima
  // ════════════════════════════════════════════════════════════════
  async onEvaluacionProxima({ evaluacion_id, matricula_id, dias_restantes }) {
    try {
      const datos = await this._getDatosEvaluacion(evaluacion_id, matricula_id);
      if (!datos) return;

      const nivel = dias_restantes <= 2 ? 'importante' : 'informativo';
      const canales = CANALES_POR_NIVEL[nivel];

      const { estudiante } = await this._getDestinatarios(datos.estudiante_id);

      const titulo = `⏰ Recordatorio — ${datos.evaluacion_nombre} en ${dias_restantes} día(s)`;
      await this._despachar({
        destinatarios: [estudiante],
        titulo,
        mensaje: this._tplEvaluacionProxima(datos, dias_restantes),
        asunto: titulo,
        canales,
        tipoEvento: 'evaluacion',
        prioridad: nivel === 'importante' ? 'alta' : 'normal',
      });

    } catch (err) {
      console.error('⚠️ [notif] onEvaluacionProxima:', err.message);
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  EVENTO 4 — Observación pedagógica publicada al padre
  // ════════════════════════════════════════════════════════════════
  async onObservacionPublicada({ observacion_id, matricula_id }) {
    try {
      const datos = await this._getDatosObservacion(observacion_id, matricula_id);
      if (!datos) return;

      const mapaUrgencia = { critico: 'urgente', moderado: 'importante', informativo: 'informativo' };
      const mapaPrioridad = { critico: 'urgente', moderado: 'alta', informativo: 'normal' };
      const nivel = mapaUrgencia[datos.nivel_relevancia] || 'informativo';
      const canales = CANALES_POR_NIVEL[nivel];
      const prioridad = mapaPrioridad[datos.nivel_relevancia] || 'normal';

      const { padres } = await this._getDestinatarios(datos.estudiante_id);

      const titulo = `📋 Observación pedagógica — ${datos.estudiante_nombre}`;
      await this._despachar({
        destinatarios: padres,
        titulo,
        mensaje: this._tplObservacionPadre(datos),
        asunto: titulo,
        canales,
        tipoEvento: 'observacion',
        prioridad,
      });

    } catch (err) {
      console.error('⚠️ [notif] onObservacionPublicada:', err.message);
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  EVENTO 5 — Alerta ML al padre (riesgo crítico)
  // ════════════════════════════════════════════════════════════════
  async onAlertaMLPadre({
    matricula_id, materia_nombre, nota_estimada,
    asistencia_pct, recomendaciones = [], docente_nombre = null,
  }) {
    try {
      const estudiante = await this._getDatosEstudiantePorMatricula(matricula_id);
      if (!estudiante) return;

      const { padres } = await this._getDestinatarios(estudiante.estudiante_id);
      if (!padres.length) return;

      const canales = CANALES_POR_NIVEL['urgente'];
      const titulo = `🔴 Atención académica — ${estudiante.estudiante_nombre}`;
      const mensaje = this._tplAlertaMLPadre({
        estudiante, materia_nombre, nota_estimada,
        asistencia_pct, recomendaciones, docente_nombre,
      });

      await this._despachar({
        destinatarios: padres,
        titulo,
        mensaje,
        asunto: titulo,
        canales,
        tipoEvento: 'alerta_ml',
        prioridad: 'urgente',
      });

    } catch (err) {
      console.error('⚠️ [notif] onAlertaMLPadre:', err.message);
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  CRON — Recordatorios diarios
  // ════════════════════════════════════════════════════════════════
  async procesarRecordatoriosDiarios() {
    try {
      const query = `
        SELECT
          e.id            AS evaluacion_id,
          m.id            AS matricula_id,
          (e.fecha_limite::date - CURRENT_DATE) AS dias_restantes
        FROM evaluacion e
        INNER JOIN asignacion_docente ad ON e.asignacion_docente_id = ad.id
        INNER JOIN matricula m           ON m.paralelo_id = ad.paralelo_id
                                        AND m.periodo_academico_id = ad.periodo_academico_id
                                        AND m.deleted_at IS NULL
        WHERE e.activo = true
          AND e.fecha_limite IS NOT NULL
          AND (e.fecha_limite::date - CURRENT_DATE) IN (1, 2, 7)
          AND m.estado = 'activo'
      `;
      const { rows } = await pool.query(query);
      console.log(`🔔 Cron recordatorios: ${rows.length} evaluaciones próximas encontradas`);

      for (const row of rows) {
        await this.onEvaluacionProxima({
          evaluacion_id: row.evaluacion_id,
          matricula_id: row.matricula_id,
          dias_restantes: parseInt(row.dias_restantes),
        }).catch(err =>
          console.error(`⚠️ Error recordatorio eval ${row.evaluacion_id}:`, err.message)
        );
      }
    } catch (err) {
      console.error('⚠️ [notif] procesarRecordatoriosDiarios:', err.message);
    }
  }


  // ════════════════════════════════════════════════════════════════
  //  HELPERS PRIVADOS — Queries
  // ════════════════════════════════════════════════════════════════

  async _getDatosCalificacion(calificacion_id, matricula_id, evaluacion_id) {
    const { rows } = await pool.query(`
      SELECT
        c.id                   AS calificacion_id,
        c.puntaje_obtenido,
        c.esta_ausente,
        e.nombre               AS evaluacion_nombre,
        e.puntaje_maximo,
        e.tipo                 AS evaluacion_tipo,
        ROUND((c.puntaje_obtenido / e.puntaje_maximo) * 100, 1) AS porcentaje,
        (c.puntaje_obtenido >= gm.nota_minima_aprobacion) AS aprobado,
        gm.nota_minima_aprobacion,
        ma.nombre              AS materia_nombre,
        est.id                 AS estudiante_id,
        (est.nombres || ' ' || est.apellidos) AS estudiante_nombre,
        g.nombre               AS grado_nombre,
        p.nombre               AS paralelo_nombre,
        t.nombre               AS turno_nombre,
        de.nombre              AS dimension_nombre
      FROM calificacion c
      INNER JOIN evaluacion e            ON c.evaluacion_id = e.id
      INNER JOIN dimension_evaluacion de ON e.dimension_evaluacion_id = de.id
      INNER JOIN asignacion_docente ad   ON e.asignacion_docente_id = ad.id
      INNER JOIN grado_materia gm        ON ad.grado_materia_id = gm.id
      INNER JOIN materia ma              ON gm.materia_id = ma.id
      INNER JOIN matricula m             ON c.matricula_id = m.id
      INNER JOIN estudiante est          ON m.estudiante_id = est.id
      INNER JOIN paralelo p              ON m.paralelo_id = p.id
      INNER JOIN grado g                 ON p.grado_id = g.id
      INNER JOIN turno t                 ON p.turno_id = t.id
      WHERE c.id = $1
    `, [calificacion_id]);
    return rows[0] || null;
  }

  async _getDatosNotaPeriodo(calificacion_periodo_id, matricula_id, grado_materia_id, periodo_evaluacion_id) {
    const { rows } = await pool.query(`
      SELECT
        cp.nota_final,
        cp.aprobado,
        gm.nota_minima_aprobacion,
        ma.nombre              AS materia_nombre,
        pe.nombre              AS periodo_nombre,
        est.id                 AS estudiante_id,
        (est.nombres || ' ' || est.apellidos) AS estudiante_nombre,
        g.nombre               AS grado_nombre,
        p.nombre               AS paralelo_nombre,
        t.nombre               AS turno_nombre
      FROM calificacion_periodo cp
      INNER JOIN grado_materia gm       ON cp.grado_materia_id = gm.id
      INNER JOIN materia ma             ON gm.materia_id = ma.id
      INNER JOIN periodo_evaluacion pe  ON cp.periodo_evaluacion_id = pe.id
      INNER JOIN matricula m            ON cp.matricula_id = m.id
      INNER JOIN estudiante est         ON m.estudiante_id = est.id
      INNER JOIN paralelo p             ON m.paralelo_id = p.id
      INNER JOIN grado g                ON p.grado_id = g.id
      INNER JOIN turno t                ON p.turno_id = t.id
      WHERE cp.id = $1
    `, [calificacion_periodo_id]);
    return rows[0] || null;
  }

  async _getDatosEvaluacion(evaluacion_id, matricula_id) {
    const { rows } = await pool.query(`
      SELECT
        e.id                   AS evaluacion_id,
        e.nombre               AS evaluacion_nombre,
        e.tipo                 AS evaluacion_tipo,
        e.fecha_limite,
        e.instrucciones,
        ma.nombre              AS materia_nombre,
        est.id                 AS estudiante_id,
        (est.nombres || ' ' || est.apellidos) AS estudiante_nombre,
        g.nombre               AS grado_nombre,
        p.nombre               AS paralelo_nombre
      FROM evaluacion e
      INNER JOIN asignacion_docente ad ON e.asignacion_docente_id = ad.id
      INNER JOIN grado_materia gm      ON ad.grado_materia_id = gm.id
      INNER JOIN materia ma            ON gm.materia_id = ma.id
      INNER JOIN matricula m           ON m.paralelo_id = ad.paralelo_id
                                      AND m.id = $2
      INNER JOIN estudiante est        ON m.estudiante_id = est.id
      INNER JOIN paralelo p            ON m.paralelo_id = p.id
      INNER JOIN grado g               ON p.grado_id = g.id
      WHERE e.id = $1 AND e.activo = true
    `, [evaluacion_id, matricula_id]);
    return rows[0] || null;
  }

  async _getDatosObservacion(observacion_id, matricula_id) {
    const { rows } = await pool.query(`
      SELECT
        op.descripcion,
        op.nivel_relevancia,
        op.fecha_ocurrencia,
        co.nombre              AS categoria_nombre,
        co.icono               AS categoria_icono,
        ma.nombre              AS materia_nombre,
        est.id                 AS estudiante_id,
        (est.nombres || ' ' || est.apellidos) AS estudiante_nombre,
        g.nombre               AS grado_nombre,
        p.nombre               AS paralelo_nombre,
        (d.nombres || ' ' || d.apellidos) AS docente_nombre
      FROM observacion_pedagogica op
      INNER JOIN categoria_observacion co ON op.categoria_observacion_id = co.id
      INNER JOIN matricula m              ON op.matricula_id = m.id
      INNER JOIN estudiante est           ON m.estudiante_id = est.id
      INNER JOIN paralelo p               ON m.paralelo_id = p.id
      INNER JOIN grado g                  ON p.grado_id = g.id
      INNER JOIN docente d                ON op.docente_id = d.id
      LEFT JOIN asignacion_docente ad     ON op.asignacion_docente_id = ad.id
      LEFT JOIN grado_materia gm          ON ad.grado_materia_id = gm.id
      LEFT JOIN materia ma                ON gm.materia_id = ma.id
      WHERE op.id = $1
    `, [observacion_id]);
    return rows[0] || null;
  }

  async _getDatosEstudiantePorMatricula(matricula_id) {
    const { rows } = await pool.query(`
      SELECT
        e.id                                  AS estudiante_id,
        (e.nombres || ' ' || e.apellidos)     AS estudiante_nombre,
        g.nombre                              AS grado_nombre,
        p.nombre                              AS paralelo_nombre,
        t.nombre                              AS turno_nombre
      FROM matricula m
      INNER JOIN estudiante e ON m.estudiante_id = e.id
      INNER JOIN paralelo p   ON m.paralelo_id = p.id
      INNER JOIN grado g      ON p.grado_id = g.id
      INNER JOIN turno t      ON p.turno_id = t.id
      WHERE m.id = $1 AND m.deleted_at IS NULL
    `, [matricula_id]);
    return rows[0] || null;
  }

  async _getDestinatarios(estudiante_id) {
    const resEst = await pool.query(`
      SELECT e.usuario_id, e.email, e.telefono
      FROM estudiante e
      WHERE e.id = $1 AND e.deleted_at IS NULL
    `, [estudiante_id]);

    const resPadres = await pool.query(`
      SELECT
        pf.id,
        pf.usuario_id,
        pf.celular,
        u.email,
        (pf.nombres || ' ' || pf.apellido_paterno) AS nombre_completo
      FROM estudiante_tutor et
      INNER JOIN padre_familia pf ON et.padre_familia_id = pf.id
      LEFT JOIN usuarios u        ON pf.usuario_id = u.id
      WHERE et.estudiante_id         = $1
        AND et.recibe_notificaciones = true
        AND pf.deleted_at            IS NULL
      ORDER BY et.prioridad_contacto ASC, et.es_tutor_principal DESC
    `, [estudiante_id]);

    return {
      estudiante: resEst.rows[0] || null,
      padres: resPadres.rows,
    };
  }


  // ════════════════════════════════════════════════════════════════
  //  INSERTAR NOTIFICACIÓN INTERNA EN BD
  //  FIX v2.1: creada_por usa usuario_id del destinatario
  //  FIX v2.2: acepta nombre_destinatario para no violar NOT NULL constraint
  // ════════════════════════════════════════════════════════════════
  async _insertarNotifInterna(usuario_id, titulo, mensaje, { tipoEvento = 'notificacion_individual', prioridad = 'normal', nombre_destinatario = null, rol_destinatario = 'padre' } = {}) {
    if (!usuario_id) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [{ codigo }] } = await client.query(
        `SELECT generar_codigo_notificacion() AS codigo`
      );

      const { rows: [notif] } = await client.query(`
        INSERT INTO notificacion_institucional (
          codigo, titulo, mensaje, tipo, prioridad, audiencia,
          destinatario_usuario_id,
          enviar_whatsapp, enviar_email, enviar_interno,
          estado, creada_por
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING id
      `, [
        codigo,
        titulo,
        mensaje,
        tipoEvento,
        prioridad,
        'individual',
        usuario_id,
        false,
        false,
        true,
        'enviada',
        usuario_id,  // FIX v2.1: usar el usuario_id del destinatario
      ]);

      await client.query(`
        INSERT INTO notificacion_destinatario (
          notificacion_id, usuario_id, nombre_destinatario,
          rol_destinatario, canal, estado_envio, enviado_en
        ) VALUES ($1,$2,$3,$4,$5,$6,NOW())
        ON CONFLICT (notificacion_id, usuario_id, canal) DO NOTHING
      `, [
        notif.id,
        usuario_id,
        nombre_destinatario,  // FIX v2.2: nombre real en lugar de null
        rol_destinatario,
        'interno',
        'enviado',
      ]);

      await client.query('COMMIT');
      console.info(`[notif] Notif interna insertada → usuario ${usuario_id} (${rol_destinatario})`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('⚠️ [notif] _insertarNotifInterna falló:', err.message);
    } finally {
      client.release();
    }
  }


  // ════════════════════════════════════════════════════════════════
  //  DESPACHADOR INTERNO
  // ════════════════════════════════════════════════════════════════
  async _despachar({ destinatarios, titulo, mensaje, asunto, canales, tipoEvento = 'notificacion_individual', prioridad = 'normal' }) {
    const validos = (destinatarios || []).filter(Boolean);
    if (validos.length === 0) return;

    const tareas = [];

    for (const dest of validos) {
      if (canales.whatsapp && dest.celular) {
        tareas.push(
          whatsappService.enviarMensaje({ to: dest.celular, body: mensaje })
            .catch(err => console.error('⚠️ WA error:', err.message))
        );
      }

      if (canales.email && dest.email) {
        tareas.push(
          emailService.enviarEmail({
            to: dest.email,
            subject: asunto,
            html: this._wrapEmailHtml(asunto, mensaje),
          }).catch(err => console.error('⚠️ Email error:', err.message))
        );
      }

      if (canales.interno && dest.usuario_id) {
        tareas.push(
          this._insertarNotifInterna(dest.usuario_id, titulo ?? asunto, mensaje, {
            tipoEvento,
            prioridad,
            nombre_destinatario: dest.nombre_completo ?? dest.nombre ?? null,
            rol_destinatario: dest.rol ?? 'padre',
          }).catch(err => console.error('⚠️ Interno error:', err.message))
        );
      }
    }

    await Promise.allSettled(tareas);
  }


  // ════════════════════════════════════════════════════════════════
  //  TEMPLATES
  // ════════════════════════════════════════════════════════════════

  _tplCalificacionEstudiante(d) {
    const estado = d.aprobado ? '✅ Aprobado' : '❌ Reprobado';
    return [
      `📝 *Nueva calificación registrada*`,
      `🏫 Unidad Educativa La Voz de Cristo`,
      ``,
      `📖 Materia: *${d.materia_nombre}*`,
      `📋 Evaluación: ${d.evaluacion_nombre}`,
      `📊 Dimensión: ${d.dimension_nombre}`,
      ``,
      `🎯 Puntaje: *${d.puntaje_obtenido} / ${d.puntaje_maximo}* (${d.porcentaje}%)`,
      `${estado}`,
      ``,
      `Podés ver el detalle en tu panel académico.`,
      ``,
      `📞 _Colegio: +591 69624189_`,
      `_Este es un mensaje automático._`,
    ].join('\n');
  }

  _tplCalificacionPadre(d) {
    const estado = d.aprobado ? '✅ Aprobado' : '❌ Reprobado';
    return [
      `📝 *Calificación registrada*`,
      `🏫 Unidad Educativa La Voz de Cristo`,
      ``,
      `👤 Estudiante: *${d.estudiante_nombre}*`,
      `📚 Grado: ${d.grado_nombre} ${d.paralelo_nombre} — Turno ${d.turno_nombre}`,
      `📖 Materia: *${d.materia_nombre}*`,
      `📋 Evaluación: ${d.evaluacion_nombre}`,
      ``,
      `🎯 Puntaje: *${d.puntaje_obtenido} / ${d.puntaje_maximo}* (${d.porcentaje}%)`,
      `${estado}`,
      d.aprobado ? null : ``,
      d.aprobado ? null : `⚠️ Le recomendamos comunicarse con el docente.`,
      ``,
      `📞 _Colegio: +591 69624189_`,
      `_Este es un mensaje automático._`,
    ].filter(l => l !== null).join('\n');
  }

  _tplNotaPeriodoEstudiante(d) {
    const estado = d.aprobado ? '✅ *APROBADO*' : '❌ *REPROBADO*';
    return [
      `📊 *Nota de período registrada*`,
      `🏫 Unidad Educativa La Voz de Cristo`,
      ``,
      `📖 Materia: *${d.materia_nombre}*`,
      `🗓️ Período: ${d.periodo_nombre}`,
      ``,
      `🎯 Nota final: *${d.nota_final}* (mínimo: ${d.nota_minima_aprobacion})`,
      `${estado}`,
      ``,
      `Podés ver tu boletín en el panel académico.`,
      ``,
      `📞 _Colegio: +591 69624189_`,
      `_Este es un mensaje automático._`,
    ].join('\n');
  }

  _tplNotaPeriodoPadre(d) {
    const estado = d.aprobado ? '✅ *APROBADO*' : '❌ *REPROBADO*';
    return [
      `📊 *Nota de período — ${d.periodo_nombre}*`,
      `🏫 Unidad Educativa La Voz de Cristo`,
      ``,
      `👤 Estudiante: *${d.estudiante_nombre}*`,
      `📚 Grado: ${d.grado_nombre} ${d.paralelo_nombre} — Turno ${d.turno_nombre}`,
      `📖 Materia: *${d.materia_nombre}*`,
      ``,
      `🎯 Nota final: *${d.nota_final}* (mínimo: ${d.nota_minima_aprobacion})`,
      `${estado}`,
      d.aprobado ? null : ``,
      d.aprobado ? null : `⚠️ Su hijo/a necesita refuerzo en esta materia. Comuníquese con el docente.`,
      ``,
      `📞 _Colegio: +591 69624189_`,
      `_Este es un mensaje automático._`,
    ].filter(l => l !== null).join('\n');
  }

  _tplEvaluacionProxima(d, dias) {
    const diasTexto = dias === 1 ? 'mañana' : `en ${dias} días`;
    const fechaFormateada = new Date(d.fecha_limite).toLocaleDateString('es-BO', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    return [
      `⏰ *Recordatorio de evaluación*`,
      `🏫 Unidad Educativa La Voz de Cristo`,
      ``,
      `📖 Materia: *${d.materia_nombre}*`,
      `📋 Evaluación: *${d.evaluacion_nombre}*`,
      d.evaluacion_tipo ? `📌 Tipo: ${d.evaluacion_tipo}` : null,
      ``,
      `📅 Fecha límite: ${fechaFormateada}`,
      `⚡ Vence *${diasTexto}*`,
      ``,
      d.instrucciones ? `📝 Instrucciones: ${d.instrucciones}` : null,
      ``,
      `Revisá los materiales en tu panel académico.`,
      ``,
      `📞 _Colegio: +591 69624189_`,
      `_Este es un mensaje automático._`,
    ].filter(l => l !== null).join('\n');
  }

  _tplObservacionPadre(d) {
    const nivelIcono = { critico: '🚨', moderado: '⚠️', informativo: 'ℹ️' };
    const icono = nivelIcono[d.nivel_relevancia] || 'ℹ️';
    const fechaFormateada = new Date(d.fecha_ocurrencia + 'T12:00:00').toLocaleDateString('es-BO', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    return [
      `${icono} *Observación pedagógica*`,
      `🏫 Unidad Educativa La Voz de Cristo`,
      ``,
      `👤 Estudiante: *${d.estudiante_nombre}*`,
      `📚 Grado: ${d.grado_nombre} ${d.paralelo_nombre}`,
      d.materia_nombre ? `📖 Materia: ${d.materia_nombre}` : null,
      `📋 Categoría: ${d.categoria_nombre}`,
      `📅 Fecha: ${fechaFormateada}`,
      ``,
      `📝 ${d.descripcion}`,
      ``,
      `👨‍🏫 Docente: ${d.docente_nombre}`,
      ``,
      `Para más información comuníquese con la institución.`,
      ``,
      `📞 _Colegio: +591 69624189_`,
      `_Este es un mensaje automático._`,
    ].filter(l => l !== null).join('\n');
  }

  _tplAlertaMLPadre({ estudiante, materia_nombre, nota_estimada, asistencia_pct, recomendaciones, docente_nombre }) {
    const lineas = [
      `🔴 *Seguimiento académico importante*`,
      `🏫 Unidad Educativa La Voz de Cristo`,
      ``,
      `Estimado padre/madre de familia,`,
      ``,
      `Le informamos que *${estudiante.estudiante_nombre}* presenta dificultades`,
      `en la materia de *${materia_nombre}* durante este trimestre.`,
      ``,
      `📊 Situación actual:`,
      nota_estimada != null ? `• Rendimiento estimado: *${Number(nota_estimada).toFixed(1)} puntos*` : null,
      asistencia_pct != null ? `• Asistencia acumulada: *${Number(asistencia_pct).toFixed(0)}%*` : null,
      ``,
    ];

    if (recomendaciones.length > 0) {
      lineas.push(`💡 Le recomendamos:`);
      recomendaciones.slice(0, 3).forEach((r, i) => lineas.push(`${i + 1}. ${r}`));
      lineas.push('');
    } else {
      lineas.push(`💡 Le recomendamos:`);
      lineas.push(`1. Comunicarse con el docente de la materia`);
      lineas.push(`2. Revisar que su hijo/a complete las tareas en casa`);
      lineas.push(`3. Considerar apoyo adicional en la materia`);
      lineas.push('');
    }

    if (docente_nombre) {
      lineas.push(`👨‍🏫 Docente responsable: ${docente_nombre}`);
      lineas.push('');
    }

    lineas.push(`Para más información ingrese al portal de padres.`);
    lineas.push(``);
    lineas.push(`📞 _Colegio: +591 69624189_`);
    lineas.push(`_Este es un mensaje automático._`);

    return lineas.filter(l => l !== null).join('\n');
  }

  _tplAsistencia({ estado, estudiante, materia_nombre, fecha }) {
    const esAusente = estado === 'ausente';
    const fechaFormateada = new Date(fecha + 'T12:00:00').toLocaleDateString('es-BO', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    return [
      `${esAusente ? '⚠️' : '🕐'} *${esAusente ? 'Inasistencia' : 'Tardanza'} registrada*`,
      `🏫 Unidad Educativa La Voz de Cristo`,
      ``,
      `👤 Estudiante: *${estudiante.estudiante_nombre}*`,
      `📚 Grado: ${estudiante.grado_nombre} ${estudiante.paralelo_nombre} — Turno ${estudiante.turno_nombre}`,
      materia_nombre ? `📖 Materia: ${materia_nombre}` : null,
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
    ].filter(l => l !== null).join('\n');
  }

  _wrapEmailHtml(titulo, mensajeWhatsapp) {
    const lineas = mensajeWhatsapp
      .split('\n')
      .map(l => {
        if (!l.trim()) return '<br>';
        const procesado = l.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
        return `<p style="margin:4px 0">${procesado}</p>`;
      })
      .join('');

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #f3f4f6; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
    .header { background: #1e40af; color: #fff; padding: 28px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; }
    .body { padding: 28px 24px; color: #374151; font-size: 15px; line-height: 1.6; }
    .footer { background: #f9fafb; padding: 20px 24px; text-align: center; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>🏫 Unidad Educativa La Voz de Cristo</h1></div>
    <div class="body">${lineas}</div>
    <div class="footer">
      Av. Argentina Nro 200 · +591 69624189<br>
      Comunicado automático — No responder este correo.
    </div>
  </div>
</body>
</html>`;
  }
}

export default new NotificacionesAcademicas();