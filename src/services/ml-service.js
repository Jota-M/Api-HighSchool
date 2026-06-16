import { pool } from '../db/pool.js';
import notificacionesAcademicas from '../utils/notificacionesAcademicas.js';

const ML_BASE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000/api/v1';
const ML_TIMEOUT = parseInt(process.env.ML_TIMEOUT_MS || '15000');

const MAX_MATERIALES = 8;
const UMBRAL_NOTA_MATERIALES = 60;

const DIMS_PRINCIPALES = new Set(['SAB', 'HAC']);

const procesandoClase = new Set();


// ─────────────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────────────

const Q_PONDERACIONES = `
  SELECT codigo, porcentaje_ponderacion
  FROM   dimension_evaluacion
  WHERE  activo = true
  ORDER BY orden
`;

const Q_PERIODO = `
  SELECT
    pe.id,
    pe.nombre,
    pe.orden                                                    AS numero_periodo,
    pe.fecha_inicio,
    pe.fecha_fin,
    pa.id                                                       AS periodo_academico_id,
    CEIL(
      (pe.fecha_fin - pe.fecha_inicio)::float / 7
    )::INTEGER                                                  AS total_semanas,
    GREATEST(1, CEIL(
      (CURRENT_DATE - pe.fecha_inicio)::float / 7
    ))::INTEGER                                                 AS semana_actual,
    EXTRACT(YEAR FROM pe.fecha_inicio)::INTEGER                 AS anio_periodo
  FROM   periodo_evaluacion pe
  JOIN   periodo_academico   pa ON pa.id = pe.periodo_academico_id
  WHERE  pe.id    = $1
    AND  pe.activo = true
`;

const Q_ASISTENCIA = `
  SELECT
    COUNT(*)                                                            AS total_clases,
    COUNT(CASE WHEN a.estado IN ('presente','tardanza','justificado')
               THEN 1 END)                                             AS clases_asistidas,
    ROUND(
      COUNT(CASE WHEN a.estado IN ('presente','tardanza','justificado')
                 THEN 1 END)::NUMERIC
      / NULLIF(COUNT(*), 0) * 100
    , 1)                                                               AS asistencia_pct,
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
    ), 0)                                                              AS racha_actual,
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
    ), 0)                                                              AS max_racha
  FROM asistencia a
  WHERE a.matricula_id          = $1
    AND a.asignacion_docente_id = $2
`;

const Q_NOTAS = `
  SELECT
    e.tipo,
    de.codigo                AS dimension_codigo,
    ROUND(
      (c.puntaje_obtenido / e.puntaje_maximo * 100)::NUMERIC
    , 1)                     AS nota_normalizada,
    e.fecha,
    e.nombre                 AS evaluacion_nombre
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
`;

const Q_MATERIA = `
  SELECT
    m.nombre   AS materia_nombre,
    m.codigo   AS materia_codigo,
    pe.orden   AS numero_periodo
  FROM   asignacion_docente ad
  JOIN   grado_materia      gm ON gm.id = ad.grado_materia_id
  JOIN   materia             m ON m.id  = gm.materia_id
  JOIN   periodo_evaluacion pe ON pe.id = $2
  WHERE  ad.id = $1
`;

const Q_HISTORIAL = `
  SELECT
    cp.nota_final,
    cp.aprobado,
    pe.orden          AS numero_periodo,
    pa.id             AS periodo_academico_id
  FROM   calificacion_periodo  cp
  JOIN   periodo_evaluacion    pe  ON pe.id  = cp.periodo_evaluacion_id
  JOIN   periodo_academico     pa  ON pa.id  = pe.periodo_academico_id
  JOIN   asignacion_docente    ad  ON ad.grado_materia_id = cp.grado_materia_id
                                  AND ad.id = $2
  WHERE  cp.matricula_id = $1
    AND  (
      (pe.periodo_academico_id = $3 AND pe.orden < $4)
      OR
      (pa.id < $3)
    )
    AND  cp.estado != 'anulada'
  ORDER  BY pa.id DESC, pe.orden DESC
  LIMIT  3
`;

const Q_PROM_OTRAS_MATERIAS_ANT = `
  SELECT
    AVG(cp.nota_final) AS promedio_otras_materias
  FROM   calificacion_periodo  cp
  JOIN   periodo_evaluacion    pe  ON pe.id  = cp.periodo_evaluacion_id
  JOIN   periodo_academico     pa  ON pa.id  = pe.periodo_academico_id
  WHERE  cp.matricula_id    = $1
    AND  (
      (pe.periodo_academico_id = $4 AND pe.orden = $2)
      OR
      (pa.id < $4 AND pe.orden = $2)
    )
    AND  cp.grado_materia_id != (
           SELECT grado_materia_id
           FROM   asignacion_docente
           WHERE  id = $3
         )
    AND  cp.estado != 'anulada'
`;

const Q_DIMS_TRIM_ANT = `
  SELECT
    de.codigo                                              AS dimension_codigo,
    ROUND(
      AVG(c.puntaje_obtenido / e.puntaje_maximo * 100)::NUMERIC
    , 1)                                                   AS promedio_dim
  FROM   calificacion        c
  JOIN   evaluacion          e   ON e.id  = c.evaluacion_id
  JOIN   dimension_evaluacion de ON de.id = e.dimension_evaluacion_id
  JOIN   asignacion_docente  ad  ON ad.id = e.asignacion_docente_id
  JOIN   periodo_evaluacion  pe  ON pe.id = e.periodo_evaluacion_id
  JOIN   periodo_academico   pa  ON pa.id = pe.periodo_academico_id
  WHERE  c.matricula_id          = $1
    AND  ad.grado_materia_id     = (
           SELECT grado_materia_id FROM asignacion_docente WHERE id = $2
         )
    AND  (
      (pe.periodo_academico_id = $3 AND pe.orden = $4)
      OR
      (pa.id < $3 AND pe.orden = $4)
    )
    AND  e.activo        = true
    AND  de.activo       = true
    AND  c.esta_ausente  = false
  GROUP BY de.codigo
`;

const Q_OBSERVACIONES = `
  SELECT
    co.codigo              AS categoria_codigo,
    op.nivel_relevancia,
    COUNT(*)               AS total
  FROM   observacion_pedagogica  op
  JOIN   categoria_observacion   co  ON co.id = op.categoria_observacion_id
  WHERE  op.matricula_id         = $1
    AND  op.periodo_academico_id = (
           SELECT pe2.periodo_academico_id
           FROM   periodo_evaluacion pe2
           WHERE  pe2.id = $2
           LIMIT  1
         )
    AND  op.activo    = true
    AND  op.deleted_at IS NULL
  GROUP  BY co.codigo, op.nivel_relevancia
`;

const Q_MATERIAS_RIESGO = `
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
`;

const Q_TEMAS_CON_PROBLEMAS = `
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
  ORDER BY e.tema_id
`;

const Q_MATERIALES_POR_TEMAS = `
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
  WHERE  t.id                         = ANY($1::int[])
    AND  ma.visible_para_estudiantes  = true
    AND  ma.activo                    = true
    AND  ma.deleted_at                IS NULL
    AND  ma.fecha_publicacion         IS NOT NULL
    AND  ma.fecha_publicacion         <= NOW()
    AND  (ma.fecha_despublicacion IS NULL OR ma.fecha_despublicacion > NOW())
  ORDER BY
    ma.es_destacado  DESC,
    ma.contador_vistas DESC,
    ma.fecha_publicacion DESC
  LIMIT $2
`;

const Q_DOCENTE_DE_ASIGNACION = `
  SELECT
    d.usuario_id,
    d.nombres || ' ' || d.apellido_paterno AS nombre_completo,
    d.celular,
    d.email,
    ad.periodo_academico_id,
    p.grado_id,
    ad.paralelo_id
  FROM   asignacion_docente ad
  JOIN   docente d ON ad.docente_id = d.id
  JOIN   paralelo p ON ad.paralelo_id = p.id
  WHERE  ad.id = $1
`;

const Q_ESTILO_DOCENTE = `
  SELECT
    AVG(c.puntaje_obtenido / e.puntaje_maximo * 100) AS promedio_docente,
    STDDEV(c.puntaje_obtenido / e.puntaje_maximo * 100) AS stddev_docente,
    COUNT(c.id) AS total_calificaciones
  FROM   calificacion c
  JOIN   evaluacion e           ON e.id  = c.evaluacion_id
  JOIN   asignacion_docente ad  ON ad.id = e.asignacion_docente_id
  JOIN   periodo_evaluacion pe  ON pe.id = e.periodo_evaluacion_id
  WHERE  ad.docente_id = (
           SELECT docente_id FROM asignacion_docente WHERE id = $1
         )
    AND  ad.grado_materia_id = (
           SELECT grado_materia_id FROM asignacion_docente WHERE id = $1
         )
    AND  pe.id != $2
    AND  e.activo = true
    AND  c.esta_ausente = false
`;

const Q_NIVEL_GRADO = `
  SELECT
    na.codigo                AS nivel_codigo,
    g.orden                  AS grado_orden,
    CASE
      WHEN LOWER(na.codigo) LIKE '%prim%' OR LOWER(na.nombre) LIKE '%prim%' THEN 0
      ELSE 1
    END                      AS nivel_educativo,
    CASE g.orden
      WHEN 1 THEN 136  WHEN 2 THEN 136
      WHEN 3 THEN 176  WHEN 4 THEN 168
      WHEN 5 THEN 192  WHEN 6 THEN 192
      WHEN 7 THEN 136  WHEN 8 THEN 136
      WHEN 9 THEN 176  WHEN 10 THEN 168
      WHEN 11 THEN 192 WHEN 12 THEN 192
      ELSE 168
    END                      AS horas_grado
  FROM   matricula m
  JOIN   paralelo     p  ON p.id  = m.paralelo_id
  JOIN   grado        g  ON g.id  = p.grado_id
  JOIN   nivel_academico na ON na.id = g.nivel_academico_id
  WHERE  m.id = $1
`;


// ─────────────────────────────────────────────────────────────
// HELPER — buildConfigPeriodo
// ─────────────────────────────────────────────────────────────

async function buildConfigPeriodo(client, periodoEvaluacionId) {
  const [resPeriodo, resPond] = await Promise.all([
    client.query(Q_PERIODO, [periodoEvaluacionId]),
    client.query(Q_PONDERACIONES),
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
    periodo_academico_id: parseInt(periodo.periodo_academico_id)
  };
}


// ─────────────────────────────────────────────────────────────
// HELPER — separarNotas
// ─────────────────────────────────────────────────────────────

function separarNotas(notasRows) {
  const notasPorDimension = {};
  for (const row of notasRows) {
    const nota = parseFloat(row.nota_normalizada);
    const dim = row.dimension_codigo;
    if (isNaN(nota) || !dim) continue;
    if (!notasPorDimension[dim]) notasPorDimension[dim] = [];
    notasPorDimension[dim].push(nota);
  }
  return { notasPorDimension };
}


// ─────────────────────────────────────────────────────────────
// HELPER — construirPayloadNotas
// ─────────────────────────────────────────────────────────────

function construirPayloadNotas(notasPorDimension, ponderaciones) {
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


// ─────────────────────────────────────────────────────────────
// HELPER — calcularEstiloDocente
// ─────────────────────────────────────────────────────────────

async function calcularEstiloDocente(client, asignacionDocenteId, periodoEvaluacionId) {
  try {
    const { rows } = await client.query(Q_ESTILO_DOCENTE, [asignacionDocenteId, periodoEvaluacionId]);
    const row = rows[0];
    if (!row || parseInt(row.total_calificaciones) < 20) return 1;

    const promedio = parseFloat(row.promedio_docente);
    const stddev = parseFloat(row.stddev_docente ?? 0);
    const PROMEDIO_GENERAL = 62;
    const sesgo = promedio - PROMEDIO_GENERAL;

    if (sesgo > 8) return 0;
    if (sesgo < -8) return 2;
    if (stddev > 20) return 3;
    return 1;
  } catch (err) {
    console.warn('[mlService] calcularEstiloDocente falló, usando default 1:', err.message);
    return 1;
  }
}


// ─────────────────────────────────────────────────────────────
// HELPER — calcularNivelGrado
// ─────────────────────────────────────────────────────────────

async function calcularNivelGrado(client, matriculaId) {
  try {
    const { rows } = await client.query(Q_NIVEL_GRADO, [matriculaId]);
    if (rows.length === 0) return { nivel_educativo: 1, horas_grado: 168 };
    return {
      nivel_educativo: parseInt(rows[0].nivel_educativo),
      horas_grado: parseInt(rows[0].horas_grado),
    };
  } catch (err) {
    console.warn('[mlService] calcularNivelGrado falló, usando defaults:', err.message);
    return { nivel_educativo: 1, horas_grado: 168 };
  }
}


// ─────────────────────────────────────────────────────────────
// HELPER — calcularRegimenPond
// ─────────────────────────────────────────────────────────────

function calcularRegimenPond(anio) {
  const regimenes = { 2021: 0, 2022: 1, 2023: 1, 2024: 1, 2025: 2, 2026: 3 };
  return regimenes[anio] ?? 1;
}


// ─────────────────────────────────────────────────────────────
// HELPER — buildHistorialFeatures
// ─────────────────────────────────────────────────────────────

async function buildHistorialFeatures(
  client, matriculaId, asignacionDocenteId, periodoEvaluacionId, numeroPeriodo, periodoAcademicoId,
) {
  try {
    const periodoAnterior = numeroPeriodo - 1;

    const [historial, observaciones, materiasRiesgo, otrasMateriasAnt, dimsAnt] = await Promise.all([
      client.query(Q_HISTORIAL, [matriculaId, asignacionDocenteId, periodoAcademicoId, numeroPeriodo]),
      client.query(Q_OBSERVACIONES, [matriculaId, periodoEvaluacionId]),
      client.query(Q_MATERIAS_RIESGO, [matriculaId, periodoEvaluacionId, asignacionDocenteId]),
      periodoAnterior >= 1
        ? client.query(Q_PROM_OTRAS_MATERIAS_ANT, [matriculaId, periodoAnterior, asignacionDocenteId, periodoAcademicoId])
        : Promise.resolve({ rows: [] }),
      periodoAnterior >= 1
        ? client.query(Q_DIMS_TRIM_ANT, [matriculaId, asignacionDocenteId, periodoAcademicoId, periodoAnterior])
        : Promise.resolve({ rows: [] }),
    ]);

    const periodos = historial.rows;

    const nota_trim_ant = periodos[0]?.nota_final != null ? parseFloat(periodos[0].nota_final) : -1;
    const reprobo_trim_ant = periodos[0] ? (parseFloat(periodos[0].nota_final) < 51 ? 1 : 0) : 0;
    const mejor_nota_historica = periodos.length > 0
      ? Math.max(...periodos.map(p => parseFloat(p.nota_final))) : -1;

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

    let reprobo_misma_mat_ant = 0.0;
    if (nota_trim_ant >= 0 && otrasMateriasAnt.rows.length > 0) {
      const promOtras = parseFloat(otrasMateriasAnt.rows[0].promedio_otras_materias ?? 65);
      const diff = nota_trim_ant - promOtras;
      reprobo_misma_mat_ant = parseFloat(Math.max(-1.0, Math.min(1.0, diff / 50)).toFixed(3));
    }

    const dimsMap = {};
    for (const row of dimsAnt.rows) {
      dimsMap[row.dimension_codigo] = parseFloat(row.promedio_dim);
    }
    const sab_trim_ant = dimsMap['SAB'] ?? -1;
    const hac_trim_ant = dimsMap['HAC'] ?? -1;

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
    const n_logros = (obsMap['LOGRO_informativo'] ?? 0) + (obsMap['LOGRO_requiere_atencion'] ?? 0);

    const total_obs = n_obs_conducta + n_obs_socioem + n_obs_urgentes + n_logros;
    const ratio_obs_negativas = total_obs > 0
      ? parseFloat(((n_obs_conducta + n_obs_socioem + n_obs_urgentes) / total_obs).toFixed(3)) : 0;

    const n_materias_riesgo_sim = parseInt(materiasRiesgo.rows[0]?.n_materias_riesgo ?? 0);
    const reprobo_mat_correlac = n_materias_riesgo_sim > 0 ? 1 : 0;

    return {
      nota_trim_ant, asist_trim_ant: -1, reprobo_trim_ant, racha_trims_riesgo,
      mejor_nota_historica, tend_intertrimestral, reprobo_misma_mat_ant,
      sab_trim_ant, hac_trim_ant,
      n_obs_conducta, n_obs_socioem, n_obs_urgentes, n_logros, ratio_obs_negativas,
      n_materias_riesgo_sim, reprobo_mat_correlac,
    };

  } catch (err) {
    console.warn('[mlService] buildHistorialFeatures falló, usando defaults:', err.message);
    return {
      nota_trim_ant: -1, asist_trim_ant: -1, reprobo_trim_ant: 0, racha_trims_riesgo: 0,
      mejor_nota_historica: -1, tend_intertrimestral: 0, reprobo_misma_mat_ant: 0.0,
      sab_trim_ant: -1, hac_trim_ant: -1,
      n_obs_conducta: 0, n_obs_socioem: 0, n_obs_urgentes: 0, n_logros: 0,
      ratio_obs_negativas: 0, n_materias_riesgo_sim: 0, reprobo_mat_correlac: 0,
    };
  }
}


// ─────────────────────────────────────────────────────────────
// HELPER — consultarMaterialesParaEstudiante
// ─────────────────────────────────────────────────────────────

async function consultarMaterialesParaEstudiante(client, matriculaId, asignacionDocenteId, periodoEvaluacionId) {
  const { rows: temas } = await client.query(Q_TEMAS_CON_PROBLEMAS, [
    matriculaId, asignacionDocenteId, periodoEvaluacionId, UMBRAL_NOTA_MATERIALES,
  ]);
  if (temas.length === 0) return [];

  const temaIds = temas.map(t => t.tema_id);
  const { rows: materiales } = await client.query(Q_MATERIALES_POR_TEMAS, [temaIds, MAX_MATERIALES]);

  return materiales.map(m => ({
    id: m.id, titulo: m.titulo, tipo: m.tipo, tipo_codigo: m.tipo_codigo,
    tema_id: m.tema_id, tema_titulo: m.tema_titulo,
    descripcion: m.descripcion || null, es_destacado: m.es_destacado,
    url: m.url_externa || m.url_archivo || null,
  }));
}


// ─────────────────────────────────────────────────────────────
// HELPER — buildPayloadCompleto
// ─────────────────────────────────────────────────────────────

export async function buildPayloadCompleto(
  client, { matriculaId, asignacionDocenteId, periodoEvaluacionId, conMateriales = true },
) {
  const [configResult, asistResult, notasResult, materiaResult, nivelGrado, estiloDocente] =
    await Promise.all([
      buildConfigPeriodo(client, periodoEvaluacionId),
      client.query(Q_ASISTENCIA, [matriculaId, asignacionDocenteId]),
      client.query(Q_NOTAS, [matriculaId, asignacionDocenteId, periodoEvaluacionId]),
      client.query(Q_MATERIA, [asignacionDocenteId, periodoEvaluacionId]),
      calcularNivelGrado(client, matriculaId),
      calcularEstiloDocente(client, asignacionDocenteId, periodoEvaluacionId),
    ]);

  const { config_periodo, semana_actual, numero_periodo, anio_periodo, periodo_academico_id } = configResult;
  const asist = asistResult.rows[0];
  const materia = materiaResult.rows[0];

  if (!materia) throw new Error(`Asignación docente ${asignacionDocenteId} no encontrada`);

  const { notasPorDimension } = separarNotas(notasResult.rows);
  const payloadNotas = construirPayloadNotas(notasPorDimension, config_periodo.ponderaciones);
  const tieneEvaluaciones = (payloadNotas.notas_sab.length + payloadNotas.notas_hac.length) > 0;

  const historialFeatures = await buildHistorialFeatures(
    client, matriculaId, asignacionDocenteId, periodoEvaluacionId, numero_periodo, periodo_academico_id,
  );

  let materiales_disponibles = [];
  if (conMateriales && tieneEvaluaciones) {
    try {
      materiales_disponibles = await consultarMaterialesParaEstudiante(
        client, matriculaId, asignacionDocenteId, periodoEvaluacionId,
      );
    } catch (err) {
      console.warn('[mlService] No se pudieron cargar materiales:', err.message);
    }
  }

  const mlRequest = {
    estudiante_id: matriculaId,
    materia: materia.materia_nombre,
    codigo_materia: materia.materia_codigo,
    trimestre: numero_periodo,
    config_periodo,
    semana: semana_actual,
    asistencia_acumulada_pct: parseFloat(asist.asistencia_pct) || 0,
    racha_inasistencias: parseInt(asist.racha_actual) || 0,
    max_racha_inasistencias: parseInt(asist.max_racha) || 0,
    ...payloadNotas,
    ...historialFeatures,
    nivel_educativo: nivelGrado.nivel_educativo,
    horas_grado: nivelGrado.horas_grado,
    regimen_pond: calcularRegimenPond(anio_periodo),
    estilo_docente: estiloDocente,
    materiales_disponibles,
  };

  const meta = {
    total_clases: parseInt(asist.total_clases),
    clases_asistidas: parseInt(asist.clases_asistidas),
    n_notas_sab: payloadNotas.notas_sab.length,
    n_notas_hac: payloadNotas.notas_hac.length,
    nota_complementaria_pct: payloadNotas.nota_complementaria_pct,
    peso_complementario: payloadNotas.peso_complementario,
    materiales_consultados: materiales_disponibles.length,
    periodo_nombre: `Período ${numero_periodo}`,
    semana_actual,
    total_semanas: config_periodo.total_semanas,
    historial_disponible: historialFeatures.nota_trim_ant !== -1,
    racha_trims_riesgo: historialFeatures.racha_trims_riesgo,
    estilo_docente: estiloDocente,
    regimen_pond: calcularRegimenPond(anio_periodo),
  };

  return { mlRequest, meta, materia };
}


// ─────────────────────────────────────────────────────────────
// HELPERS — alertas
// ─────────────────────────────────────────────────────────────

async function generarCodigoNotificacion(client) {
  const anio = new Date().getFullYear();
  await client.query(`LOCK TABLE notificacion_institucional IN ACCESS EXCLUSIVE MODE`);
  const { rows: [last] } = await client.query(
    `SELECT codigo FROM notificacion_institucional WHERE codigo LIKE $1 ORDER BY codigo DESC LIMIT 1`,
    [`NOTIF-${anio}-%`]
  );
  const numero = last ? parseInt(last.codigo.split('-')[2], 10) + 1 : 1;
  return `NOTIF-${anio}-${String(numero).padStart(6, '0')}`;
}

async function crearAlertaDocente({
  asignacionDocenteId, estudianteId, materia, mensajeAlerta,
  nivelRiesgo, notaEstimada, creadorUsuarioId,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [docente] } = await client.query(Q_DOCENTE_DE_ASIGNACION, [asignacionDocenteId]);
    if (!docente) { await client.query('ROLLBACK'); return null; }

    // FIX #2 — fallback a usuario del docente cuando creadorUsuarioId es null
    const creadoPor = creadorUsuarioId ?? docente.usuario_id;
    if (!creadoPor) {
      console.warn('[mlService] crearAlertaDocente: sin creador disponible, abortando');
      await client.query('ROLLBACK');
      return null;
    }

    const codigo = await generarCodigoNotificacion(client);
    const prioridad = nivelRiesgo === 'critico' ? 'urgente' : 'alta';
    const titulo = `⚠️ Alerta de riesgo — ${materia}`;
    const mensaje = mensajeAlerta
      || `Estudiante ID ${estudianteId} con riesgo ${nivelRiesgo.toUpperCase()} en ${materia}. Nota estimada: ${notaEstimada}. Intervención recomendada.`;

    const { rows: [notif] } = await client.query(
      `INSERT INTO notificacion_institucional (
         codigo, titulo, mensaje, tipo, prioridad, audiencia,
         periodo_academico_id, destinatario_usuario_id,
         enviar_whatsapp, enviar_email, enviar_interno, estado, creada_por
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, codigo`,
      [
        codigo, titulo, mensaje, 'notificacion_individual', prioridad, 'individual',
        docente.periodo_academico_id, docente.usuario_id,
        docente.celular ? true : false, docente.email ? true : false,
        true, 'enviada', creadoPor,
      ],
    );

    if (docente.usuario_id) {
      await client.query(
        `INSERT INTO notificacion_destinatario (
           notificacion_id, usuario_id, nombre_destinatario,
           celular_snapshot, email_snapshot, rol_destinatario, canal, estado_envio, enviado_en
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (notificacion_id, usuario_id, canal) DO NOTHING`,
        [notif.id, docente.usuario_id, docente.nombre_completo,
        docente.celular || null, docente.email || null, 'docente', 'interno', 'enviado'],
      );

      if (docente.celular) {
        await client.query(
          `INSERT INTO notificacion_destinatario (
             notificacion_id, usuario_id, nombre_destinatario,
             celular_snapshot, rol_destinatario, canal, estado_envio
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (notificacion_id, usuario_id, canal) DO NOTHING`,
          [notif.id, docente.usuario_id, docente.nombre_completo,
          docente.celular, 'docente', 'whatsapp', 'pendiente'],
        );
      }

      if (docente.email) {
        await client.query(
          `INSERT INTO notificacion_destinatario (
             notificacion_id, usuario_id, nombre_destinatario,
             email_snapshot, rol_destinatario, canal, estado_envio
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (notificacion_id, usuario_id, canal) DO NOTHING`,
          [notif.id, docente.usuario_id, docente.nombre_completo,
          docente.email, 'docente', 'email', 'pendiente'],
        );
      }
    }

    await client.query('COMMIT');
    return { notificacionId: notif.id, codigo: notif.codigo };

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[mlService] Error creando alerta docente:', err.message);
    return null;
  } finally {
    client.release();
  }
}

async function crearAlertaInstitucional({
  asignacionDocenteId, materia, mensajeInstitucional,
  totalEstudiantes, pctRiesgo, creadorUsuarioId,
  estudiantesCriticos = [],
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [docente] } = await client.query(Q_DOCENTE_DE_ASIGNACION, [asignacionDocenteId]);
    if (!docente) { await client.query('ROLLBACK'); return; }

    // FIX #2 — fallback a usuario del docente cuando creadorUsuarioId es null
    const creadoPor = creadorUsuarioId ?? docente.usuario_id;
    if (!creadoPor) {
      console.warn('[mlService] crearAlertaInstitucional: sin creador disponible, abortando');
      await client.query('ROLLBACK');
      return;
    }

    const codigo = await generarCodigoNotificacion(client);
    const titulo = `🚨 Alerta de clase — ${materia}`;

    const listaEstudiantes = estudiantesCriticos.length > 0
      ? `\n\nEstudiantes en riesgo crítico/alto:\n` +
      estudiantesCriticos.map(e =>
        `• ${e.nombre}` +
        (e.nota_estimada != null ? ` — nota est. ${Number(e.nota_estimada).toFixed(1)}` : '') +
        (e.asistencia_pct != null ? `, asistencia ${Number(e.asistencia_pct).toFixed(0)}%` : '')
      ).join('\n')
      : '';

    const mensaje =
      `Tu clase de ${materia} presenta una situación crítica:\n` +
      `• ${pctRiesgo?.toFixed(1) ?? '?'}% de estudiantes en riesgo de reprobar\n` +
      `• ${totalEstudiantes} estudiantes evaluados` +
      `${listaEstudiantes}\n\n` +
      (mensajeInstitucional
        ? `Análisis adicional:\n${mensajeInstitucional}`
        : 'Se recomienda intervención grupal inmediata.');

    const { rows: [notif] } = await client.query(
      `INSERT INTO notificacion_institucional (
         codigo, titulo, mensaje, tipo, prioridad, audiencia,
         grado_id, paralelo_id, periodo_academico_id,
         destinatario_usuario_id,
         enviar_whatsapp, enviar_email, enviar_interno, estado, creada_por
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id, codigo`,
      [
        codigo, titulo, mensaje,
        'notificacion_individual', 'urgente', 'individual',
        docente.grado_id || null,
        docente.paralelo_id || null,
        docente.periodo_academico_id || null,
        docente.usuario_id,
        docente.celular ? true : false,
        docente.email ? true : false,
        true, 'enviada', creadoPor,
      ],
    );

    if (docente.usuario_id) {
      await client.query(
        `INSERT INTO notificacion_destinatario (
           notificacion_id, usuario_id, nombre_destinatario,
           celular_snapshot, email_snapshot, rol_destinatario, canal, estado_envio, enviado_en
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (notificacion_id, usuario_id, canal) DO NOTHING`,
        [notif.id, docente.usuario_id, docente.nombre_completo,
        docente.celular || null, docente.email || null, 'docente', 'interno', 'enviado'],
      );

      if (docente.celular) {
        await client.query(
          `INSERT INTO notificacion_destinatario (
             notificacion_id, usuario_id, nombre_destinatario,
             celular_snapshot, rol_destinatario, canal, estado_envio
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (notificacion_id, usuario_id, canal) DO NOTHING`,
          [notif.id, docente.usuario_id, docente.nombre_completo,
          docente.celular, 'docente', 'whatsapp', 'pendiente'],
        );
      }

      if (docente.email) {
        await client.query(
          `INSERT INTO notificacion_destinatario (
             notificacion_id, usuario_id, nombre_destinatario,
             email_snapshot, rol_destinatario, canal, estado_envio
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (notificacion_id, usuario_id, canal) DO NOTHING`,
          [notif.id, docente.usuario_id, docente.nombre_completo,
          docente.email, 'docente', 'email', 'pendiente'],
        );
      }
    }

    await client.query('COMMIT');
    console.info(`[mlService] Alerta de clase creada para docente ${docente.nombre_completo}: ${codigo}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[mlService] Error creando alerta institucional:', err.message);
  } finally {
    client.release();
  }
}


// ─────────────────────────────────────────────────────────────
// predecirEstudiante
// ─────────────────────────────────────────────────────────────

export async function predecirEstudiante({
  estudianteId, matriculaId, asignacionDocenteId, periodoEvaluacionId,
  creadorUsuarioId = null, nombreEstudiante = null,
  incluirGemini = true, usarXgboost = true,
}) {
  const client = await pool.connect();

  try {
    const { mlRequest, meta, materia } = await buildPayloadCompleto(client, {
      matriculaId, asignacionDocenteId, periodoEvaluacionId, conMateriales: true,
    });

    const params = new URLSearchParams({ incluir_gemini: incluirGemini, usar_xgboost: usarXgboost });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ML_TIMEOUT);

    let response;
    try {
      response = await fetch(`${ML_BASE_URL}/predecir?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mlRequest),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`ML service error ${response.status}: ${errorBody}`);
    }

    const resultado = await response.json();

    let notificacion_alerta = null;
    if (incluirGemini && resultado.analisis?.alerta_urgente === true) {
      const nivelRiesgo = resultado.modelo?.nivel_riesgo || 'alto';
      const notaEstimada = resultado.modelo?.nota_estimada_final ?? 0;
      const asistenciaPct = mlRequest.asistencia_acumulada_pct ?? 0;

      const promSab = mlRequest.notas_sab?.length
        ? (mlRequest.notas_sab.reduce((a, b) => a + b, 0) / mlRequest.notas_sab.length).toFixed(1)
        : null;
      const promHac = mlRequest.notas_hac?.length
        ? (mlRequest.notas_hac.reduce((a, b) => a + b, 0) / mlRequest.notas_hac.length).toFixed(1)
        : null;

      const lineasDetalle = [
        `• Nota estimada al cierre: ${notaEstimada.toFixed(1)}`,
        `• Nivel de riesgo: ${nivelRiesgo.toUpperCase()}`,
        `• Asistencia acumulada: ${asistenciaPct.toFixed(1)}%`,
        promSab != null ? `• Promedio SAB (saber): ${promSab}` : null,
        promHac != null ? `• Promedio HAC (hacer): ${promHac}` : null,
        meta.racha_trims_riesgo > 0
          ? `• Trimestres consecutivos en riesgo: ${meta.racha_trims_riesgo}` : null,
        mlRequest.racha_inasistencias > 2
          ? `• Racha de inasistencias actual: ${mlRequest.racha_inasistencias} clases` : null,
      ].filter(Boolean).join('\n');

      const contextoGemini = resultado.analisis?.mensaje_alerta
        ? `\n\nAnálisis adicional:\n${resultado.analisis.mensaje_alerta}` : '';

      const encabezado = nombreEstudiante
        ? `🔴 ATENCIÓN: ${nombreEstudiante} está en riesgo ${nivelRiesgo.toUpperCase()} de reprobar ${materia.materia_nombre}`
        : `🔴 ATENCIÓN: Estudiante ID ${estudianteId} en riesgo ${nivelRiesgo.toUpperCase()} en ${materia.materia_nombre}`;

      const mensajeEnriquecido =
        `${encabezado} (${meta.periodo_nombre}).\n\n` +
        `${lineasDetalle}${contextoGemini}\n\nSe recomienda intervención inmediata.`;

      notificacion_alerta = await crearAlertaDocente({
        asignacionDocenteId, estudianteId,
        materia: materia.materia_nombre,
        mensajeAlerta: mensajeEnriquecido,
        nivelRiesgo, notaEstimada, creadorUsuarioId,
      });

      if (nivelRiesgo === 'critico') {
        notificacionesAcademicas.onAlertaMLPadre({
          matricula_id: matriculaId,
          materia_nombre: materia.materia_nombre,
          nota_estimada: notaEstimada,
          asistencia_pct: asistenciaPct,
          recomendaciones: resultado.analisis?.recomendaciones ?? [],
        }).catch(err =>
          console.error('[mlService] onAlertaMLPadre (estudiante) falló:', err.message)
        );
      }
    }

    return { ...resultado, _meta: meta, notificacion_alerta };

  } finally {
    client.release();
  }
}


// ─────────────────────────────────────────────────────────────
// analizarClase
// ─────────────────────────────────────────────────────────────

export async function analizarClase({
  asignacionDocenteId, periodoEvaluacionId, paraleloId,
  creadorUsuarioId = null, incluirGemini = true,
}) {
  // FIX #1 — guard anti-duplicados
  const cacheKey = `clase:${asignacionDocenteId}:${periodoEvaluacionId}`;
  if (procesandoClase.has(cacheKey)) {
    throw new Error('Análisis de clase ya en progreso para esta asignación y período');
  }
  procesandoClase.add(cacheKey);

  const client = await pool.connect();

  try {
    const { config_periodo, semana_actual, numero_periodo, anio_periodo, periodo_academico_id } =
      await buildConfigPeriodo(client, periodoEvaluacionId);

    const { rows: matriculas } = await client.query(
      `SELECT
         m.id          AS matricula_id,
         e.id          AS estudiante_id,
         e.nombres     AS nombre,
         e.apellidos   AS apellidos
       FROM   matricula m
       JOIN   estudiante e ON e.id = m.estudiante_id
       WHERE  m.paralelo_id          = $1
         AND  m.estado               = 'activo'
         AND  m.periodo_academico_id = $2
         AND  m.deleted_at           IS NULL
       ORDER  BY e.apellidos, e.nombres`,
      [paraleloId, periodo_academico_id],
    );

    if (matriculas.length === 0) return { estudiantes: [], total: 0 };

    const { rows: [materia] } = await client.query(Q_MATERIA, [asignacionDocenteId, periodoEvaluacionId]);
    const estiloDocente = await calcularEstiloDocente(client, asignacionDocenteId, periodoEvaluacionId);
    const regimen_pond = calcularRegimenPond(anio_periodo);

    const estudiantesML = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < matriculas.length; i += BATCH_SIZE) {
      const lote = matriculas.slice(i, i + BATCH_SIZE);

      const datosLote = await Promise.all(lote.map(async (m) => {
        const [asistResult, notasResult, historialFeatures, nivelGrado] = await Promise.all([
          client.query(Q_ASISTENCIA, [m.matricula_id, asignacionDocenteId]),
          client.query(Q_NOTAS, [m.matricula_id, asignacionDocenteId, periodoEvaluacionId]),
          buildHistorialFeatures(client, m.matricula_id, asignacionDocenteId, periodoEvaluacionId, numero_periodo, periodo_academico_id),
          calcularNivelGrado(client, m.matricula_id),
        ]);

        const asist = asistResult.rows[0];
        const { notasPorDimension } = separarNotas(notasResult.rows);
        const payloadNotas = construirPayloadNotas(notasPorDimension, config_periodo.ponderaciones);

        return {
          estudiante_id: m.estudiante_id,
          materia: materia.materia_nombre,
          codigo_materia: materia.materia_codigo,
          trimestre: numero_periodo,
          config_periodo,
          semana: semana_actual,
          asistencia_acumulada_pct: parseFloat(asist.asistencia_pct) || 0,
          racha_inasistencias: parseInt(asist.racha_actual) || 0,
          max_racha_inasistencias: parseInt(asist.max_racha) || 0,
          ...payloadNotas,
          ...historialFeatures,
          nivel_educativo: nivelGrado.nivel_educativo,
          horas_grado: nivelGrado.horas_grado,
          regimen_pond,
          estilo_docente: estiloDocente,
          materiales_disponibles: [],
          _nombre: `${m.apellidos}, ${m.nombre}`,
        };
      }));

      estudiantesML.push(...datosLote);
    }

    const mlPayload = {
      asignacion_docente_id: asignacionDocenteId,
      materia: materia.materia_nombre,
      semana_actual,
      config_periodo,
      estudiantes: estudiantesML.map(({ _nombre, ...resto }) => resto),
    };

    const params = new URLSearchParams({ incluir_gemini: incluirGemini });
    const response = await fetch(`${ML_BASE_URL}/predecir/clase?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mlPayload),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`ML clase/analizar error ${response.status}: ${err}`);
    }

    const resultado = await response.json();

    const nombresMap = Object.fromEntries(
      estudiantesML.map(e => [e.estudiante_id, e._nombre]),
    );
    const matriculasMap = Object.fromEntries(
      matriculas.map(m => [m.estudiante_id, parseInt(m.matricula_id)]),
    );

    if (incluirGemini && resultado.analisis?.alerta_institucional === true) {
      const estudiantesCriticos = (resultado.estudiantes ?? [])
        .filter(e => e.nivel_riesgo === 'critico' || e.nivel_riesgo === 'alto')
        .slice(0, 5)
        .map(e => ({
          nombre: e.nombre_completo ?? nombresMap[e.estudiante_id] ?? `Estudiante ${e.estudiante_id}`,
          nota_estimada: e.nota_estimada_final,
          asistencia_pct: e.asistencia_pct,
        }));

      await crearAlertaInstitucional({
        asignacionDocenteId,
        materia: materia.materia_nombre,
        mensajeInstitucional: resultado.analisis.mensaje_institucional,
        totalEstudiantes: resultado.total_estudiantes,
        pctRiesgo: resultado.pct_riesgo,
        creadorUsuarioId,
        estudiantesCriticos,
      });

      const estudiantesParaNotificarPadres = (resultado.estudiantes ?? [])
        .filter(e => e.nivel_riesgo === 'critico');

      for (const est of estudiantesParaNotificarPadres) {
        const matriculaId = matriculasMap[est.estudiante_id];
        if (!matriculaId) continue;

        notificacionesAcademicas.onAlertaMLPadre({
          matricula_id: matriculaId,
          materia_nombre: materia.materia_nombre,
          nota_estimada: est.nota_estimada_final,
          asistencia_pct: est.asistencia_pct,
          recomendaciones: resultado.analisis?.recomendaciones ?? [],
        }).catch(err =>
          console.error(`[mlService] onAlertaMLPadre (clase, est ${est.estudiante_id}) falló:`, err.message)
        );
      }
    }

    return {
      ...resultado,
      estudiantes: resultado.estudiantes.map(est => ({
        ...est,
        matricula_id: matriculasMap[est.estudiante_id] ?? null,
        nombre_completo: nombresMap[est.estudiante_id] || `Estudiante ${est.estudiante_id}`,
      })),
    };

  } finally {
    procesandoClase.delete(cacheKey); // FIX #1 — siempre liberar el guard
    client.release();
  }
}


// ─────────────────────────────────────────────────────────────
// generarPlanRecuperacion
// ─────────────────────────────────────────────────────────────

export async function generarPlanRecuperacion({
  estudianteId, matriculaId, asignacionDocenteId, periodoEvaluacionId,
}) {
  const client = await pool.connect();
  try {
    const { mlRequest } = await buildPayloadCompleto(client, {
      matriculaId, asignacionDocenteId, periodoEvaluacionId, conMateriales: true,
    });

    const response = await fetch(`${ML_BASE_URL}/predecir/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mlRequest),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`ML plan-recuperacion error ${response.status}: ${err}`);
    }

    return await response.json();
  } finally {
    client.release();
  }
}


// ─────────────────────────────────────────────────────────────
// verificarMLService
// ─────────────────────────────────────────────────────────────

export async function verificarMLService() {
  try {
    const response = await fetch(`${ML_BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { disponible: false, error: `HTTP ${response.status}` };
    const data = await response.json();
    return {
      disponible: true,
      modelos_cargados: data.modelos_cargados,
      gemini: data.gemini_disponible,
      version: data.version_modelo,
      n_features: data.n_features,
    };
  } catch (err) {
    return { disponible: false, error: err.message };
  }
}


// ─────────────────────────────────────────────────────────────
// simularEscenarios
// ─────────────────────────────────────────────────────────────

export async function simularEscenarios({
  matriculaId, asignacionDocenteId, periodoEvaluacionId,
  escenarios, incluirGemini = true, usarXgboost = true,
}) {
  const client = await pool.connect();
  try {
    const { mlRequest } = await buildPayloadCompleto(client, {
      matriculaId, asignacionDocenteId, periodoEvaluacionId, conMateriales: false,
    });

    const params = new URLSearchParams({ incluir_gemini: incluirGemini, usar_xgboost: usarXgboost });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ML_TIMEOUT);

    let response;
    try {
      response = await fetch(`${ML_BASE_URL}/simular?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datos_base: mlRequest, escenarios }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`ML service error ${response.status}: ${err}`);
    }

    return await response.json();
  } finally {
    client.release();
  }
}


// ─────────────────────────────────────────────────────────────
// simularOptimo
// ─────────────────────────────────────────────────────────────

export async function simularOptimo({
  matriculaId, asignacionDocenteId, periodoEvaluacionId,
  objetivoNota = 51, restricciones = {}, usarXgboost = true,
}) {
  const client = await pool.connect();
  try {
    const { mlRequest } = await buildPayloadCompleto(client, {
      matriculaId, asignacionDocenteId, periodoEvaluacionId, conMateriales: false,
    });

    const params = new URLSearchParams({ usar_xgboost: usarXgboost });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ML_TIMEOUT);

    let response;
    try {
      response = await fetch(`${ML_BASE_URL}/simular/optimo?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datos_base: mlRequest,
          objetivo_nota: objetivoNota,
          restricciones: {
            bloquear_practicas: restricciones.bloquearPracticas ?? false,
            bloquear_examenes: restricciones.bloquearExamenes ?? false,
            bloquear_asistencia: restricciones.bloquearAsistencia ?? false,
          },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`ML simular/optimo error ${response.status}: ${err}`);
    }

    return await response.json();
  } finally {
    client.release();
  }
}


// ─────────────────────────────────────────────────────────────
// simularOptimoV2
// ─────────────────────────────────────────────────────────────

export async function simularOptimoV2({
  matriculaId, asignacionDocenteId, periodoEvaluacionId,
  objetivoNota = 51, restricciones = {}, usarXgboost = true,
  practicasRestantes, examenesRestantes,
}) {
  const client = await pool.connect();
  try {
    const { mlRequest } = await buildPayloadCompleto(client, {
      matriculaId, asignacionDocenteId, periodoEvaluacionId, conMateriales: false,
    });

    const params = new URLSearchParams({ usar_xgboost: usarXgboost });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ML_TIMEOUT);

    let response;
    try {
      response = await fetch(`${ML_BASE_URL}/simular/optimo/v2?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datos_base: mlRequest,
          objetivo_nota: objetivoNota,
          restricciones: {
            bloquear_practicas: restricciones.bloquearPracticas ?? false,
            bloquear_examenes: restricciones.bloquearExamenes ?? false,
            bloquear_asistencia: restricciones.bloquearAsistencia ?? false,
          },
          ...(practicasRestantes !== undefined && { practicas_restantes: practicasRestantes }),
          ...(examenesRestantes !== undefined && { examenes_restantes: examenesRestantes }),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`ML simular/optimo/v2 error ${response.status}: ${err}`);
    }

    return await response.json();
  } finally {
    client.release();
  }
}