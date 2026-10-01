// scripts/cargarNotasFinalesCurso.js
//
// Motor genérico de carga masiva de notas finales (directo, sin
// desglose por dimensión), reusando el patrón de tus otros seeds
// (BEGIN/COMMIT/ROLLBACK sobre `pool`).
//
// Resuelve por CI + código de materia, y usa upsert real (INSERT ...
// ON CONFLICT) porque las filas de calificacion_periodo no existen
// todavía en un sistema recién arrancado.
//
// CONTROL DE RE-EJECUCIÓN: antes de insertar, chequea si ya existe la
// fila (matricula_id + grado_materia_id + periodo_evaluacion_id). Si
// ya existe, la SALTEA (no la toca de nuevo) — así podés volver a
// correr el mismo archivo después de corregir un CI/matrícula y solo
// se procesan los que faltaban.
//
// USO:
//   node scripts/cargarNotasFinalesCurso.js ./data/notas_primero_b.json --periodo-evaluacion-id=1
//
// El archivo de data es un JSON: [{ ci, nombre_ref, materia_codigo, nota_final }, ...]

import { readFileSync } from 'fs';
import { pool } from '../src/db/pool.js';

function parseArgs(argv) {
    const args = { _: [] };
    for (const a of argv.slice(2)) {
        if (a.startsWith('--periodo-evaluacion-id=')) args.periodoEvaluacionId = Number(a.split('=')[1]);
        else args._.push(a);
    }
    return args;
}

async function resolverFila(client, fila) {
    const estRes = await client.query(
        `SELECT id FROM estudiante WHERE ci = $1 AND deleted_at IS NULL`,
        [fila.ci]
    );
    if (!estRes.rows[0]) return { error: `CI "${fila.ci}" no encontrado en estudiante` };
    const estudiante_id = estRes.rows[0].id;

    const matRes = await client.query(`
    SELECT m.id AS matricula_id, p.grado_id
    FROM matricula m
    INNER JOIN paralelo p ON m.paralelo_id = p.id
    INNER JOIN periodo_academico pa ON m.periodo_academico_id = pa.id
    WHERE m.estudiante_id = $1
      AND m.estado = 'activo'
      AND pa.activo = true
      AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT 1
  `, [estudiante_id]);
    if (!matRes.rows[0]) return { error: `Sin matrícula activa` };
    const { matricula_id, grado_id } = matRes.rows[0];

    const matdRes = await client.query(
        `SELECT id FROM materia WHERE codigo = $1 AND deleted_at IS NULL`,
        [fila.materia_codigo]
    );
    if (!matdRes.rows[0]) return { error: `Materia "${fila.materia_codigo}" no encontrada` };
    const materia_id = matdRes.rows[0].id;

    const gmRes = await client.query(
        `SELECT id, nota_minima_aprobacion FROM grado_materia WHERE grado_id = $1 AND materia_id = $2`,
        [grado_id, materia_id]
    );
    if (!gmRes.rows[0]) return { error: `Materia "${fila.materia_codigo}" no asignada a este grado` };

    return {
        matricula_id,
        grado_materia_id: gmRes.rows[0].id,
        nota_minima_aprobacion: gmRes.rows[0].nota_minima_aprobacion,
    };
}

async function cargarNotasFinalesCurso() {
    const args = parseArgs(process.argv);
    const dataPath = args._[0];

    if (!dataPath || !args.periodoEvaluacionId) {
        console.error('Uso: node scripts/cargarNotasFinalesCurso.js ./data/notas_curso.json --periodo-evaluacion-id=<id>');
        process.exit(1);
    }

    const filas = JSON.parse(readFileSync(dataPath, 'utf-8'));
    console.log(`\n📥 CARGA DE NOTAS FINALES — ${filas.length} filas en ${dataPath}\n`);

    const client = await pool.connect();
    let insertadas = 0;
    let salteadas = 0;
    const errores = [];

    try {
        await client.query('BEGIN');

        for (const fila of filas) {
            const resuelto = await resolverFila(client, fila);
            if (resuelto.error) {
                errores.push({ ci: fila.ci, nombre: fila.nombre_ref, materia: fila.materia_codigo, motivo: resuelto.error });
                continue;
            }

            const existe = await client.query(
                `SELECT id FROM calificacion_periodo
         WHERE matricula_id = $1 AND grado_materia_id = $2 AND periodo_evaluacion_id = $3`,
                [resuelto.matricula_id, resuelto.grado_materia_id, args.periodoEvaluacionId]
            );

            if (existe.rows[0]) {
                salteadas++;
                continue; // ya estaba cargada, no la tocamos
            }

            const aprobado = fila.nota_final >= (resuelto.nota_minima_aprobacion ?? 51);
            await client.query(`
        INSERT INTO calificacion_periodo
          (matricula_id, grado_materia_id, periodo_evaluacion_id, nota_final, aprobado,
           es_nota_manual, nota_manual, justificacion_manual, estado)
        VALUES ($1, $2, $3, $4, $5, true, $4, 'Carga inicial - notas trimestre 1', 'activa')
      `, [resuelto.matricula_id, resuelto.grado_materia_id, args.periodoEvaluacionId, fila.nota_final, aprobado]);

            insertadas++;
        }

        await client.query('COMMIT');

        console.log('═══════════════════════════════════════');
        console.log(`✅ Insertadas: ${insertadas}`);
        console.log(`⏭️  Ya existían (salteadas): ${salteadas}`);
        console.log(`❌ Con error: ${errores.length}`);
        console.log('═══════════════════════════════════════\n');

        if (errores.length) {
            console.log('Estudiantes que NO se registraron:\n');
            for (const e of errores) {
                console.log(`  - ${e.nombre} (CI ${e.ci}) — ${e.materia}: ${e.motivo}`);
            }
            console.log('\nCorregí lo que corresponda (matricular, cargar materia, etc.) y volvé a correr');
            console.log('el mismo comando — lo que ya se cargó no se toca, solo entran los que faltaban.\n');
        }
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n💥 Error inesperado, se revirtió todo:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

cargarNotasFinalesCurso();