// models/Prediccion.js — v8.3
//
// Cambios respecto a v8.2:
//   - getHistorialFeatures: reprobo_misma_mat_ant ahora es la diferencia
//     normalizada [-1, 1] entre la nota de esta materia y el promedio de
//     las otras materias el trimestre anterior. Ya no es un flag binario
//     redundante con reprobo_trim_ant.
//   - Q_PROM_OTRAS_MATERIAS_ANT: query nueva para obtener ese promedio.
//   - getMaterialesParaEstudiante: sin cambios.
//   - construirPayloadNotas: sin cambios.
//   - crearAlertaDocente: sin cambios.

import { pool } from '../db/pool.js';

const DIMS_PRINCIPALES = new Set(['SAB', 'HAC']);

class Prediccion {

  /**
   * Construye config_periodo consultando la BD.
   */
  static async buildConfigPeriodo(client, periodoEvaluacionId) {
    const [resPeriodo, resPond] = await Promise.all([
      client.query(`
        SELECT
          pe.id,
          pe.orden                               AS numero_periodo,
          pe.fecha_inicio,
          pe.fecha_fin,
          pa.id                                  AS periodo_academico_id,
          CEIL(
            (pe.fecha_fin - pe.fecha_inicio)::float / 7
          )::INTEGER                             AS total_semanas,
          GREATEST(1, CEIL(
            (CURRENT_DATE - pe.fecha_inicio)::float / 7
          ))::INTEGER                            AS semana_actual,
          EXTRACT(YEAR FROM pe.fecha_inicio)::INTEGER AS anio_periodo
        FROM periodo_evaluacion pe
        JOIN periodo_academico   pa ON pa.id = pe.periodo_academico_id
        WHERE pe.id     = $1
          AND pe.activo = true
      `, [periodoEvaluacionId]),
      client.query(`
        SELECT codigo, porcentaje_ponderacion
        FROM   dimension_evaluacion
        WHERE  activo = true
        ORDER  BY orden
      `),
    ]);

    if (resPeriodo.rows.length === 0) {
      throw new Error(`Período de evaluación ${periodoEvaluacionId} no encontrado o inactivo`);
    }

    const periodo = resPeriodo.rows[0];
    const ponderaciones = {};

    for (const row of resPond.rows) {
      ponderaciones[row.codigo] = parseFloat(row.porcentaje_ponderacion);
    }

    const total = Object.values(ponderaciones).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 100) > 0.5) {
      throw new Error(
        `Las ponderaciones en dimension_evaluacion suman ${total.toFixed(1)}, deben sumar 100`
      );
    }

    return {
      config_periodo: {
        total_semanas: Math.max(8, Math.min(20, periodo.total_semanas)),
        ponderaciones,
      },
      semana_actual: Math.min(periodo.semana_actual, periodo.total_semanas),
      numero_periodo: periodo.numero_periodo,
      anio_periodo: periodo.anio_periodo,
    };
  }

  /**
   * Calcula asistencia acumulada y rachas.
   */
  static async getAsistencia(client, matriculaId, asignacionDocenteId) {
    const { rows } = await client.query(`
      SELECT
        COUNT(*)                                                              AS total_clases,
        COUNT(CASE WHEN a.estado IN ('presente','tardanza','justificado')
                   THEN 1 END)                                               AS clases_asistidas,
        ROUND(
          COUNT(CASE WHEN a.estado IN ('presente','tardanza','justificado')
                     THEN 1 END)::NUMERIC
          / NULLIF(COUNT(*), 0) * 100
        , 1)                                                                 AS asistencia_pct,
        COALESCE((
          SELECT COUNT(*)
          FROM   asistencia a2
          WHERE  a2.matricula_id          = $1
            AND  a2.asignacion_docente_id = $2
            AND  a2.estado = 'ausente'
            AND  a2.fecha > (
              SELECT COALESCE(MAX(a3.fecha), '1900-01-01'::DATE)
              FROM   asistencia a3
              WHERE  a3.matricula_id          = $1
                AND  a3.asignacion_docente_id = $2
                AND  a3.estado IN ('presente','tardanza','justificado')
            )
        ), 0)                                                                AS racha_actual,
        COALESCE((
          WITH runs AS (
            SELECT
              estado,
              ROW_NUMBER() OVER (ORDER BY fecha)
              - ROW_NUMBER() OVER (PARTITION BY estado ORDER BY fecha) AS grp
            FROM asistencia
            WHERE matricula_id          = $1
              AND asignacion_docente_id = $2
              AND estado = 'ausente'
          )
          SELECT MAX(cnt)
          FROM (SELECT COUNT(*) AS cnt FROM runs GROUP BY grp) sub
        ), 0)                                                                AS max_racha
      FROM asistencia a
      WHERE a.matricula_id          = $1
        AND a.asignacion_docente_id = $2
    `, [matriculaId, asignacionDocenteId]);

    return rows[0];
  }

  /**
   * Obtiene notas normalizadas agrupadas por código de dimensión.
   */
  static async getNotas(client, matriculaId, asignacionDocenteId, periodoEvaluacionId) {
    const { rows } = await client.query(`
      SELECT
        e.tipo,
        de.codigo                AS dimension_codigo,
        ROUND(
          (c.puntaje_obtenido / e.puntaje_maximo * 100)::NUMERIC
        , 1)                     AS nota_normalizada,
        e.fecha,
        e.nombre                 AS evaluacion_nombre,
        e.tema_id
      FROM   calificacion c
      JOIN   evaluacion           e  ON e.id  = c.evaluacion_id
      JOIN   dimension_evaluacion de ON de.id = e.dimension_evaluacion_id
      JOIN   asignacion_docente  ad  ON ad.id = e.asignacion_docente_id
      WHERE  c.matricula_id          = $1
        AND  ad.id                   = $2
        AND  e.periodo_evaluacion_id = $3
        AND  e.activo   = true
        AND  de.activo  = true
        AND  c.esta_ausente = false
      ORDER BY e.fecha ASC
    `, [matriculaId, asignacionDocenteId, periodoEvaluacionId]);

    const notasPorDimension = {};
    for (const row of rows) {
      const nota = parseFloat(row.nota_normalizada);
      const dim = row.dimension_codigo;
      if (isNaN(nota) || !dim) continue;
      if (!notasPorDimension[dim]) notasPorDimension[dim] = [];
      notasPorDimension[dim].push(nota);
    }

    return { notasPorDimension };
  }

  /**
   * Construye las features de historial, observaciones y correlación.
   *
   * v8.3: reprobo_misma_mat_ant es ahora la diferencia normalizada [-1, 1]
   * entre la nota de esta materia y el promedio de las otras materias
   * el trimestre anterior. Ya no es un flag binario redundante.
   *
   * Ejemplos:
   *   nota_mat=40, prom_otras=70 → diff=-30 → normalizado=-0.60
   *   nota_mat=65, prom_otras=65 → diff=0   → normalizado= 0.00
   *   nota_mat=80, prom_otras=60 → diff=+20 → normalizado=+0.40
   */
  static async getHistorialFeatures(
    client,
    matriculaId,
    asignacionDocenteId,
    periodoEvaluacionId,
    numeroPeriodo,
  ) {
    try {
      const periodoAnterior = numeroPeriodo - 1;

      const [historial, observaciones, materiasRiesgo, otrasMateriasAnt] =
        await Promise.all([

          // 1. Notas finales de períodos anteriores en esta materia
          client.query(`
            SELECT
              cp.nota_final,
              cp.aprobado,
              pe.orden AS numero_periodo
            FROM   calificacion_periodo  cp
            JOIN   periodo_evaluacion    pe  ON pe.id  = cp.periodo_evaluacion_id
            JOIN   asignacion_docente    ad  ON ad.grado_materia_id = cp.grado_materia_id
                                            AND ad.id = $2
            WHERE  cp.matricula_id = $1
              AND  pe.orden        < $3
              AND  cp.estado      != 'anulada'
            ORDER  BY pe.orden DESC
            LIMIT  3
          `, [matriculaId, asignacionDocenteId, numeroPeriodo]),

          // 2. Observaciones pedagógicas del período académico actual
          client.query(`
            SELECT
              co.codigo                  AS categoria_codigo,
              op.nivel_relevancia,
              COUNT(*)                   AS total
            FROM   observacion_pedagogica  op
            JOIN   categoria_observacion   co  ON co.id = op.categoria_observacion_id
            WHERE  op.matricula_id          = $1
              AND  op.periodo_academico_id  = (
                     SELECT pe2.periodo_academico_id
                     FROM   periodo_evaluacion pe2
                     WHERE  pe2.id = $2
                     LIMIT  1
                   )
              AND  op.activo    = true
              AND  op.deleted_at IS NULL
            GROUP  BY co.codigo, op.nivel_relevancia
          `, [matriculaId, periodoEvaluacionId]),

          // 3. Materias en riesgo simultáneo en el período actual
          client.query(`
            SELECT COUNT(DISTINCT cp.grado_materia_id) AS n_materias_riesgo
            FROM   calificacion_periodo  cp
            JOIN   periodo_evaluacion    pe  ON pe.id = cp.periodo_evaluacion_id
            WHERE  cp.matricula_id    = $1
              AND  pe.id              = $2
              AND  cp.aprobado        = false
              AND  cp.estado         != 'anulada'
              AND  cp.grado_materia_id != (
                     SELECT grado_materia_id
                     FROM   asignacion_docente
                     WHERE  id = $3
                   )
          `, [matriculaId, periodoEvaluacionId, asignacionDocenteId]),

          // 4. v8.3: promedio de OTRAS materias el trimestre anterior
          // Para calcular reprobo_misma_mat_ant como diferencia normalizada
          periodoAnterior >= 1
            ? client.query(`
                SELECT AVG(cp.nota_final) AS promedio_otras_materias
                FROM   calificacion_periodo  cp
                JOIN   periodo_evaluacion    pe  ON pe.id = cp.periodo_evaluacion_id
                WHERE  cp.matricula_id    = $1
                  AND  pe.orden           = $2
                  AND  cp.grado_materia_id != (
                         SELECT grado_materia_id
                         FROM   asignacion_docente
                         WHERE  id = $3
                       )
                  AND  cp.estado != 'anulada'
              `, [matriculaId, periodoAnterior, asignacionDocenteId])
            : Promise.resolve({ rows: [] }),
        ]);

      // ── Procesar historial intertrimestral ───────────────────────────────────
      const periodos = historial.rows;

      const nota_trim_ant = periodos[0]?.nota_final != null
        ? parseFloat(periodos[0].nota_final)
        : -1;

      const reprobo_trim_ant = periodos[0]
        ? (parseFloat(periodos[0].nota_final) < 51 ? 1 : 0)
        : 0;

      const mejor_nota_historica = periodos.length > 0
        ? Math.max(...periodos.map(p => parseFloat(p.nota_final)))
        : -1;

      let racha_trims_riesgo = 0;
      for (const p of periodos) {
        if (parseFloat(p.nota_final) < 51) racha_trims_riesgo++;
        else break;
      }
      racha_trims_riesgo = Math.min(racha_trims_riesgo, 4);

      let tend_intertrimestral = 0;
      if (periodos.length >= 2) {
        const diff = parseFloat(periodos[0].nota_final) - parseFloat(periodos[1].nota_final);
        tend_intertrimestral = diff > 3 ? 1 : diff < -3 ? -1 : 0;
      }

      // ── reprobo_misma_mat_ant — v8.3: diferencia normalizada ──────────────
      let reprobo_misma_mat_ant = 0.0;
      if (nota_trim_ant >= 0 && otrasMateriasAnt.rows.length > 0) {
        const promOtras = parseFloat(
          otrasMateriasAnt.rows[0].promedio_otras_materias ?? 65
        );
        const diff = nota_trim_ant - promOtras;
        // Normalizar a [-1, 1] dividiendo por 50 (máxima diferencia plausible)
        reprobo_misma_mat_ant = parseFloat(
          Math.max(-1.0, Math.min(1.0, diff / 50)).toFixed(3)
        );
      }
      // Si no hay período anterior o no hay otras materias → 0.0 (neutro)

      // ── Procesar observaciones ───────────────────────────────────────────────
      const obsMap = {};
      for (const row of observaciones.rows) {
        const key = `${row.categoria_codigo}_${row.nivel_relevancia}`;
        obsMap[key] = (obsMap[key] ?? 0) + parseInt(row.total);
      }

      const n_obs_conducta = (obsMap['CONDUCTA_informativo'] ?? 0)
        + (obsMap['CONDUCTA_requiere_atencion'] ?? 0)
        + (obsMap['CONDUCTA_urgente'] ?? 0);

      const n_obs_socioem = (obsMap['SOCIOEM_informativo'] ?? 0)
        + (obsMap['SOCIOEM_requiere_atencion'] ?? 0)
        + (obsMap['SOCIOEM_urgente'] ?? 0);

      const n_obs_urgentes = observaciones.rows
        .filter(r => r.nivel_relevancia === 'urgente')
        .reduce((acc, r) => acc + parseInt(r.total), 0);

      const n_logros = (obsMap['LOGRO_informativo'] ?? 0)
        + (obsMap['LOGRO_requiere_atencion'] ?? 0);

      const total_obs = n_obs_conducta + n_obs_socioem + n_obs_urgentes + n_logros;
      const ratio_obs_negativas = total_obs > 0
        ? parseFloat(
          ((n_obs_conducta + n_obs_socioem + n_obs_urgentes) / total_obs).toFixed(3)
        )
        : 0;

      // ── Correlación entre materias ────────────────────────────────────────────
      const n_materias_riesgo_sim = parseInt(
        materiasRiesgo.rows[0]?.n_materias_riesgo ?? 0
      );
      const reprobo_mat_correlac = n_materias_riesgo_sim > 0 ? 1 : 0;

      return {
        nota_trim_ant,
        asist_trim_ant: -1,
        reprobo_trim_ant,
        racha_trims_riesgo,
        mejor_nota_historica,
        tend_intertrimestral,
        reprobo_misma_mat_ant,  // v8.3: continuo [-1, 1]
        n_obs_conducta,
        n_obs_socioem,
        n_obs_urgentes,
        n_logros,
        ratio_obs_negativas,
        n_materias_riesgo_sim,
        reprobo_mat_correlac,
      };

    } catch (err) {
      console.warn('[Prediccion] getHistorialFeatures falló, usando defaults:', err.message);
      return {
        nota_trim_ant: -1,
        asist_trim_ant: -1,
        reprobo_trim_ant: 0,
        racha_trims_riesgo: 0,
        mejor_nota_historica: -1,
        tend_intertrimestral: 0,
        reprobo_misma_mat_ant: 0.0,
        n_obs_conducta: 0,
        n_obs_socioem: 0,
        n_obs_urgentes: 0,
        n_logros: 0,
        ratio_obs_negativas: 0,
        n_materias_riesgo_sim: 0,
        reprobo_mat_correlac: 0,
      };
    }
  }

  /**
   * Transforma notasPorDimension al formato que espera el ML.
   */
  static construirPayloadNotas(notasPorDimension, ponderaciones) {
    const notas_sab = notasPorDimension['SAB'] ?? [];
    const notas_hac = notasPorDimension['HAC'] ?? [];

    let notaComplementariaPonderada = 0;
    let pesoComplementario = 0;

    for (const [codigo, notas] of Object.entries(notasPorDimension)) {
      if (DIMS_PRINCIPALES.has(codigo)) continue;
      if (notas.length === 0) continue;
      const pond = (ponderaciones[codigo] ?? 0) / 100;
      if (pond === 0) continue;
      const prom = notas.reduce((a, b) => a + b, 0) / notas.length;
      notaComplementariaPonderada += prom * pond;
      pesoComplementario += pond;
    }

    const nota_complementaria_pct = pesoComplementario > 0
      ? parseFloat((notaComplementariaPonderada / pesoComplementario).toFixed(2))
      : 0;

    return {
      notas_sab,
      notas_hac,
      nota_complementaria_pct,
      peso_complementario: parseFloat(pesoComplementario.toFixed(4)),
    };
  }

  /**
   * Materiales del repositorio para temas con notas bajas.
   */
  static async getMaterialesParaEstudiante(
    client,
    matriculaId,
    asignacionDocenteId,
    periodoEvaluacionId,
    umbralNota = 60,
    maxMateriales = 8,
  ) {
    const { rows: temas } = await client.query(`
      SELECT DISTINCT e.tema_id
      FROM   calificacion c
      JOIN   evaluacion   e  ON c.evaluacion_id = e.id
      WHERE  c.matricula_id            = $1
        AND  e.asignacion_docente_id   = $2
        AND  e.periodo_evaluacion_id   = $3
        AND  e.tema_id                 IS NOT NULL
        AND  e.activo                  = true
        AND  c.esta_ausente            = false
        AND  (c.puntaje_obtenido::float / NULLIF(e.puntaje_maximo, 0) * 100) < $4
    `, [matriculaId, asignacionDocenteId, periodoEvaluacionId, umbralNota]);

    if (temas.length === 0) return [];

    const temaIds = temas.map(t => t.tema_id);

    const { rows: materiales } = await client.query(`
      SELECT
        ma.id, ma.titulo, ma.descripcion,
        ma.url_archivo, ma.url_externa, ma.es_destacado,
        tm.nombre AS tipo, tm.codigo AS tipo_codigo,
        t.id AS tema_id, t.titulo AS tema_titulo
      FROM   material_academico ma
      JOIN   tipo_material  tm  ON ma.tipo_material_id  = tm.id
      JOIN   material_tema  mt  ON ma.id                = mt.material_academico_id
      JOIN   tema           t   ON mt.tema_id           = t.id
      WHERE  t.id                         = ANY($1::int[])
        AND  ma.visible_para_estudiantes  = true
        AND  ma.activo                    = true
        AND  ma.deleted_at                IS NULL
        AND  ma.fecha_publicacion         IS NOT NULL
        AND  ma.fecha_publicacion         <= NOW()
        AND  (ma.fecha_despublicacion IS NULL OR ma.fecha_despublicacion > NOW())
      ORDER BY ma.es_destacado DESC, ma.contador_vistas DESC, ma.fecha_publicacion DESC
      LIMIT $2
    `, [temaIds, maxMateriales]);

    return materiales.map(m => ({
      id: m.id,
      titulo: m.titulo,
      tipo: m.tipo,
      tipo_codigo: m.tipo_codigo,
      tema_id: m.tema_id,
      tema_titulo: m.tema_titulo,
      descripcion: m.descripcion || null,
      es_destacado: m.es_destacado,
      url: m.url_externa || m.url_archivo || null,
    }));
  }

  /**
   * Datos de la materia para armar el request al ML.
   */
  static async getMateria(client, asignacionDocenteId, periodoEvaluacionId) {
    const { rows } = await client.query(`
      SELECT
        m.nombre   AS materia_nombre,
        m.codigo   AS materia_codigo,
        pe.orden   AS numero_periodo
      FROM   asignacion_docente ad
      JOIN   grado_materia      gm ON gm.id = ad.grado_materia_id
      JOIN   materia             m ON m.id  = gm.materia_id
      JOIN   periodo_evaluacion  pe ON pe.id = $2
      WHERE  ad.id = $1
    `, [asignacionDocenteId, periodoEvaluacionId]);

    return rows[0] || null;
  }

  /**
   * Estudiantes activos de un paralelo.
   */
  static async getEstudiantesParalelo(client, paraleloId) {
    const { rows } = await client.query(`
      SELECT
        m.id          AS matricula_id,
        e.id          AS estudiante_id,
        e.nombres     AS nombre,
        e.apellidos   AS apellidos
      FROM   matricula m
      JOIN   estudiante e ON e.id = m.estudiante_id
      WHERE  m.paralelo_id  = $1
        AND  m.estado       = 'activo'
        AND  m.deleted_at   IS NULL
      ORDER  BY e.apellidos, e.nombres
    `, [paraleloId]);

    return rows;
  }

  /**
   * Crea una notificación de alerta para el docente.
   */
  static async crearAlertaDocente(
    asignacionDocenteId,
    estudianteId,
    materia,
    mensajeAlerta,
    nivelRiesgo,
    notaEstimada,
    creadorUsuarioId,
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [docente] } = await client.query(`
        SELECT
          d.usuario_id,
          d.nombres || ' ' || d.apellido_paterno AS nombre_docente,
          d.celular, d.email,
          ad.periodo_academico_id,
          p.grado_id, ad.paralelo_id
        FROM   asignacion_docente ad
        JOIN   docente  d ON ad.docente_id  = d.id
        JOIN   paralelo p ON ad.paralelo_id = p.id
        WHERE  ad.id = $1
      `, [asignacionDocenteId]);

      if (!docente) {
        await client.query('ROLLBACK');
        return null;
      }

      const { rows: [est] } = await client.query(`
        SELECT
          e.nombres || ' ' || e.apellidos AS nombre_estudiante,
          e.codigo                         AS codigo_estudiante,
          g.nombre AS grado_nombre,
          p.nombre AS paralelo_nombre,
          t.nombre AS turno_nombre
        FROM   matricula m
        JOIN   estudiante  e ON e.id  = m.estudiante_id
        JOIN   paralelo    p ON p.id  = m.paralelo_id
        JOIN   grado       g ON g.id  = p.grado_id
        JOIN   turno       t ON t.id  = p.turno_id
        WHERE  m.estudiante_id = $1
          AND  m.paralelo_id   = (SELECT paralelo_id FROM asignacion_docente WHERE id = $2)
          AND  m.estado        = 'activo'
          AND  m.deleted_at    IS NULL
        LIMIT  1
      `, [estudianteId, asignacionDocenteId]);

      const nombreEstudiante = est
        ? `${est.nombre_estudiante} (${est.codigo_estudiante})`
        : `Estudiante ID ${estudianteId}`;
      const contextoAula = est
        ? `${est.grado_nombre} "${est.paralelo_nombre}" — ${est.turno_nombre}`
        : '';

      const etiquetas = {
        medio: '🟡 Riesgo MEDIO',
        alto: '🟠 Riesgo ALTO',
        critico: '🔴 Riesgo CRÍTICO',
      };
      const titulo = `${etiquetas[nivelRiesgo] ?? '⚠️ Alerta'} — ${nombreEstudiante} · ${materia}`;
      const mensaje = mensajeAlerta?.trim()
        ? mensajeAlerta
        : buildMensajeDocente({ nivelRiesgo, nombreEstudiante, materia, contextoAula, notaEstimada });

      const anio = new Date().getFullYear();
      const { rows: [last] } = await client.query(
        `SELECT codigo FROM notificacion_institucional
         WHERE  codigo LIKE $1 ORDER BY codigo DESC LIMIT 1`,
        [`NOTIF-${anio}-%`],
      );
      const numero = last ? parseInt(last.codigo.split('-')[2], 10) + 1 : 1;
      const codigo = `NOTIF-${anio}-${String(numero).padStart(6, '0')}`;

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
        'notificacion_individual',
        nivelRiesgo === 'critico' ? 'urgente' : 'alta',
        'individual',
        docente.periodo_academico_id, docente.usuario_id,
        !!(docente.celular), !!(docente.email), true,
        'enviada', creadorUsuarioId,
      ]);

      if (docente.usuario_id) {
        await client.query(`
          INSERT INTO notificacion_destinatario (
            notificacion_id, usuario_id, nombre_destinatario,
            celular_snapshot, email_snapshot,
            rol_destinatario, canal, estado_envio, enviado_en
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
          ON CONFLICT (notificacion_id, usuario_id, canal) DO NOTHING
        `, [
          notif.id, docente.usuario_id, docente.nombre_docente,
          docente.celular || null, docente.email || null,
          'docente', 'interno', 'enviado',
        ]);

        if (docente.celular) {
          await client.query(`
            INSERT INTO notificacion_destinatario (
              notificacion_id, usuario_id, nombre_destinatario,
              celular_snapshot, rol_destinatario, canal, estado_envio
            ) VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (notificacion_id, usuario_id, canal) DO NOTHING
          `, [
            notif.id, docente.usuario_id, docente.nombre_docente,
            docente.celular, 'docente', 'whatsapp', 'pendiente',
          ]);
        }

        if (docente.email) {
          await client.query(`
            INSERT INTO notificacion_destinatario (
              notificacion_id, usuario_id, nombre_destinatario,
              email_snapshot, rol_destinatario, canal, estado_envio
            ) VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (notificacion_id, usuario_id, canal) DO NOTHING
          `, [
            notif.id, docente.usuario_id, docente.nombre_docente,
            docente.email, 'docente', 'email', 'pendiente',
          ]);
        }
      }

      await client.query('COMMIT');
      console.info(
        `[Prediccion] Alerta creada: ${codigo} | ` +
        `Para: ${docente.nombre_docente} | ` +
        `Estudiante: ${nombreEstudiante} | Riesgo: ${nivelRiesgo}`
      );
      return { notificacionId: notif.id, codigo: notif.codigo };

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[Prediccion] Error creando alerta docente:', err.message);
      return null;
    } finally {
      client.release();
    }
  }

}

function buildMensajeDocente({ nivelRiesgo, nombreEstudiante, materia, contextoAula, notaEstimada }) {
  const nota = notaEstimada ? `${notaEstimada}/100` : 'pendiente de calcular';
  const cuerpos = {
    medio: [
      `El modelo de IA detectó que ${nombreEstudiante} presenta un rendimiento medio en ${materia}.`,
      contextoAula ? `Curso: ${contextoAula}.` : '',
      `Nota estimada al cierre del período: ${nota}.`,
      `Se recomienda hacer seguimiento y reforzar los temas con menor puntaje.`,
    ],
    alto: [
      `⚠️ ${nombreEstudiante} tiene riesgo ALTO de reprobar ${materia}.`,
      contextoAula ? `Curso: ${contextoAula}.` : '',
      `Nota estimada al cierre del período: ${nota}.`,
      `Se recomienda una intervención pedagógica esta semana y comunicar a los padres.`,
    ],
    critico: [
      `🔴 ATENCIÓN: ${nombreEstudiante} está en riesgo CRÍTICO de reprobar ${materia}.`,
      contextoAula ? `Curso: ${contextoAula}.` : '',
      `Nota estimada al cierre del período: ${nota}.`,
      `Es urgente coordinar con los padres y definir un plan de recuperación inmediato.`,
    ],
  };
  return (cuerpos[nivelRiesgo] || cuerpos.medio).filter(Boolean).join(' ');
}

export default Prediccion;