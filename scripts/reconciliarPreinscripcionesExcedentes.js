// scripts/reconciliarPreinscripcionesExcedentes.js
// Uso:
//   node --env-file .env ./scripts/reconciliarPreinscripcionesExcedentes.js          (simulación / dry-run)
//   node --env-file .env ./scripts/reconciliarPreinscripcionesExcedentes.js --apply  (aplica cambios en BD)

import { pool } from '../src/db/pool.js';
import ReservaCupo from '../src/models/ReservaCupo.js';
import { CupoPreinscripcion } from '../src/models/CupoPreinscripcion.js';

const aplicar = process.argv.includes('--apply');

async function ejecutar() {
  console.log(`\n=== RECONCILIACIÓN DE PREINSCRIPCIONES EXCEDENTES (Opción B) ===`);
  console.log(`Modo: ${aplicar ? 'APLICAR CAMBIOS EN BD (--apply)' : 'SIMULACIÓN (--dry-run)'}\n`);

  // 1. Obtener periodo académico destino (2027 o más reciente)
  const perRes = await pool.query(`
    SELECT id, nombre, fecha_inicio
    FROM periodo_academico
    WHERE deleted_at IS NULL
    ORDER BY (CASE WHEN nombre ILIKE '%2027%' THEN 0 ELSE 1 END), fecha_inicio DESC
    LIMIT 1
  `);

  if (perRes.rows.length === 0) {
    console.log('No se encontró ningún periodo académico.');
    process.exit(0);
  }

  const periodo = perRes.rows[0];
  const matchYear = periodo.nombre.match(/\d{4}/);
  const anioDestino = matchYear ? parseInt(matchYear[0], 10) : 2027;
  console.log(`Periodo destino: ${periodo.nombre} (ID: ${periodo.id}, Año: ${anioDestino})\n`);

  // 2. Mapa de regulares protegidos (excluye no_continua, anuladas, canceladas; respeta cambios de turno)
  const mapaRegulares = await ReservaCupo.obtenerMapaRegularesProtegidos({
    periodoDestinoId: periodo.id,
    anioDestino
  });

  // 3. Combinaciones grado + turno con preinscripciones activas
  const combosRes = await pool.query(`
    SELECT DISTINCT pi.grado_id, pi.turno_preferido_id as turno_id, g.nombre as grado_nombre, t.nombre as turno_nombre
    FROM pre_inscripcion pi
    INNER JOIN grado g ON pi.grado_id = g.id
    INNER JOIN turno t ON pi.turno_preferido_id = t.id
    WHERE pi.periodo_academico_id = $1
      AND pi.estado NOT IN ('cancelada', 'rechazada', 'convertida', 'en_espera')
      AND pi.deleted_at IS NULL
    ORDER BY g.nombre, t.nombre
  `, [periodo.id]);

  let totalCursosConExcedente = 0;
  let totalMovidos = 0;

  const client = await pool.connect();
  try {
    if (aplicar) await client.query('BEGIN');

    for (const combo of combosRes.rows) {
      const { grado_id, turno_id, grado_nombre, turno_nombre } = combo;

      // Aforo del curso
      let aforoRes = await client.query(`
        SELECT COALESCE(SUM(capacidad_maxima), 0)::int as aforo
        FROM paralelo
        WHERE grado_id = $1 AND turno_id = $2 AND anio = $3 AND activo = true AND deleted_at IS NULL
      `, [grado_id, turno_id, anioDestino]);
      let aforo = aforoRes.rows[0]?.aforo || 0;

      if (aforo === 0) {
        const cupoRes = await client.query(`
          SELECT cupos_totales FROM cupo_preinscripcion
          WHERE grado_id = $1 AND turno_id = $2 AND periodo_academico_id = $3 LIMIT 1
        `, [grado_id, turno_id, periodo.id]);
        aforo = cupoRes.rows[0]?.cupos_totales || 0;
      }

      const regProt = (mapaRegulares.get(`${grado_id}:${turno_id}`) || { protegidos: 0 }).protegidos;

      const hermRes = await client.query(`
        SELECT COUNT(*)::int as total
        FROM reserva_cupo_hermano
        WHERE grado_solicitado_id = $1 AND turno_solicitado_id = $2 AND periodo_academico_id = $3
          AND estado = 'confirmada' AND deleted_at IS NULL
      `, [grado_id, turno_id, periodo.id]);
      const hermConf = hermRes.rows[0]?.total || 0;

      const cupoParaNuevos = Math.max(0, aforo - regProt - hermConf);

      // Preinscripciones activas ordenadas del más antiguo al más reciente
      const activasRes = await client.query(`
        SELECT pi.id, pi.codigo_inscripcion, pi.estado, pi.created_at,
               pe.nombres, pe.apellido_paterno, pe.apellido_materno
        FROM pre_inscripcion pi
        LEFT JOIN pre_estudiante pe ON pe.pre_inscripcion_id = pi.id
        WHERE pi.grado_id = $1 AND pi.turno_preferido_id = $2 AND pi.periodo_academico_id = $3
          AND pi.estado NOT IN ('cancelada', 'rechazada', 'convertida', 'en_espera')
          AND pi.deleted_at IS NULL
        ORDER BY pi.created_at ASC, pi.id ASC
      `, [grado_id, turno_id, periodo.id]);

      const activas = activasRes.rows;
      if (activas.length <= cupoParaNuevos) continue;

      const excedente = activas.length - cupoParaNuevos;
      // Elegibles para pasar a lista de espera: no aprobadas ni con entrevista ya agendada/realizada (más recientes primero)
      const elegibles = [...activas]
        .reverse()
        .filter(p => !['aprobada', 'entrevista_programada', 'entrevista_realizada'].includes(p.estado))
        .slice(0, excedente);

      totalCursosConExcedente++;
      console.log(`• ${grado_nombre} (${turno_nombre}): Aforo=${aforo}, RegProt=${regProt}, Herm=${hermConf}, CupoNuevos=${cupoParaNuevos}, Activas=${activas.length}, Excedente=${excedente}, Movibles=${elegibles.length}`);

      if (elegibles.length > 0) {
        const espMaxRes = await client.query(`
          SELECT COALESCE(MAX(posicion_espera), 0)::int as max_pos
          FROM pre_inscripcion
          WHERE grado_id = $1 AND turno_preferido_id = $2 AND periodo_academico_id = $3
            AND estado = 'en_espera' AND deleted_at IS NULL
        `, [grado_id, turno_id, periodo.id]);
        let nextPos = (espMaxRes.rows[0]?.max_pos || 0) + 1;

        for (const p of elegibles) {
          const nombre = `${p.nombres || ''} ${p.apellido_paterno || ''} ${p.apellido_materno || ''}`.trim();
          console.log(`   -> [${p.codigo_inscripcion}] ${nombre} (estado actual: ${p.estado}) => en_espera (puesto #${nextPos})`);

          if (aplicar) {
            await client.query(`
              UPDATE pre_inscripcion
              SET estado = 'en_espera',
                  tiene_cupo_asignado = false,
                  posicion_espera = $1,
                  updated_at = NOW()
              WHERE id = $2
            `, [nextPos, p.id]);
          }
          nextPos++;
          totalMovidos++;
        }
      }
    }

    if (aplicar) {
      await client.query('COMMIT');
      await CupoPreinscripcion.sincronizarTodos(periodo.id);
      console.log(`\n✅ Cambios aplicados y cupos sincronizados. Total movidos a lista de espera: ${totalMovidos}`);
    } else {
      console.log(`\nℹ️ Simulación completada. Cursos con excedente: ${totalCursosConExcedente}, Postulantes a mover: ${totalMovidos}`);
      console.log(`Para aplicar los cambios en BD, ejecuta con --apply`);
    }
  } catch (err) {
    if (aplicar) await client.query('ROLLBACK');
    console.error('❌ Error en reconciliación:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

ejecutar();
