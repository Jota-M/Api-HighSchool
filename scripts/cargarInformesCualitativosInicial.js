// scripts/cargarInformesCualitativosInicial.js
//
// Motor genérico de carga masiva de evaluaciones e informes cualitativos
// para Educación Inicial en Familia Comunitaria, reusando el patrón de
// `cargarNotasFinalesCurso.js` (BEGIN/COMMIT/ROLLBACK sobre `pool`).
//
// Resuelve por CI, RUDE o Nombre Completo del estudiante, y busca su matrícula activa.
//
// CONTROL DE RE-EJECUCIÓN: antes de insertar, chequea si ya existe el informe para
// (matricula_id + periodo_evaluacion_id). Por defecto lo SALTEA (no lo sobrescribe).
// Si se especifica el flag `--sobreescribir`, actualiza el texto y estado existentes.
//
// USO:
//   node --env-file .env.dev scripts/cargarInformesCualitativosInicial.js ./data/informes_inicial_primero_a.json --periodo-evaluacion-id=1
//
// Opciones:
//   --periodo-evaluacion-id=<id>  ID del período de evaluación (ej. 1 para Primer Trimestre)
//   --periodo-orden=<1|2|3>       Alternativa: buscar por orden del período activo
//   --estado=<publicado|borrador> Estado del informe (por defecto: publicado)
//   --sobreescribir               Si ya existe el informe, actualizarlo en vez de saltearlo
//
// Formato del archivo JSON:
// [
//   {
//     "ci": "17195232",
//     "rude": "814802562026109A",
//     "nombre_ref": "ALAVE ARI VALERIA INDIRA",
//     "informe_cualitativo": "Texto descriptivo de la evaluación integral...",
//     "estado": "publicado" // opcional, sobreescribe el estado global
//   },
//   ...
// ]

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { pool } from '../src/db/pool.js';

function parseArgs(argv) {
    const args = {
        _: [],
        periodoEvaluacionId: null,
        periodoOrden: null,
        estado: 'publicado',
        sobreescribir: false,
    };

    for (const a of argv.slice(2)) {
        if (a.startsWith('--periodo-evaluacion-id=')) {
            args.periodoEvaluacionId = Number(a.split('=')[1]);
        } else if (a.startsWith('--periodo-orden=')) {
            args.periodoOrden = Number(a.split('=')[1]);
        } else if (a.startsWith('--estado=')) {
            args.estado = a.split('=')[1].toLowerCase();
        } else if (a === '--sobreescribir' || a === '--upsert') {
            args.sobreescribir = true;
        } else {
            args._.push(a);
        }
    }
    return args;
}

async function resolverPeriodo(client, args) {
    if (args.periodoEvaluacionId) {
        const res = await client.query(
            `SELECT id, nombre, orden FROM periodo_evaluacion WHERE id = $1`,
            [args.periodoEvaluacionId]
        );
        if (!res.rows[0]) {
            throw new Error(`Período de evaluación con ID ${args.periodoEvaluacionId} no encontrado.`);
        }
        return res.rows[0];
    }

    if (args.periodoOrden) {
        const res = await client.query(
            `SELECT id, nombre, orden FROM periodo_evaluacion WHERE orden = $1 AND activo = true LIMIT 1`,
            [args.periodoOrden]
        );
        if (!res.rows[0]) {
            throw new Error(`No se encontró un período de evaluación activo con orden ${args.periodoOrden}.`);
        }
        return res.rows[0];
    }

    throw new Error('Debe especificar --periodo-evaluacion-id=<id> o --periodo-orden=<1|2|3>.');
}

async function resolverFila(client, fila) {
    let estudiante = null;

    // 1. Búsqueda por CI si existe
    if (fila.ci && String(fila.ci).trim() !== '') {
        const ciLimpio = String(fila.ci).trim();
        const estRes = await client.query(
            `SELECT id, ci, rude, nombres, apellidos 
             FROM estudiante 
             WHERE ci = $1 AND deleted_at IS NULL 
             LIMIT 1`,
            [ciLimpio]
        );
        if (estRes.rows[0]) estudiante = estRes.rows[0];
    }

    // 2. Búsqueda por RUDE si no se encontró por CI
    if (!estudiante && fila.rude && String(fila.rude).trim() !== '') {
        const rudeLimpio = String(fila.rude).trim();
        const estRes = await client.query(
            `SELECT id, ci, rude, nombres, apellidos 
             FROM estudiante 
             WHERE rude = $1 AND deleted_at IS NULL 
             LIMIT 1`,
            [rudeLimpio]
        );
        if (estRes.rows[0]) estudiante = estRes.rows[0];
    }

    // 3. Búsqueda por Nombre / Apellidos aproximados
    if (!estudiante && fila.nombre_ref && String(fila.nombre_ref).trim() !== '') {
        const nombreBusqueda = `%${String(fila.nombre_ref).trim()}%`;
        const estRes = await client.query(
            `SELECT id, ci, rude, nombres, apellidos 
             FROM estudiante 
             WHERE deleted_at IS NULL 
               AND (
                 CONCAT(apellidos, ' ', nombres) ILIKE $1 
                 OR CONCAT(nombres, ' ', apellidos) ILIKE $1
                 OR CONCAT(COALESCE(apellido_paterno, ''), ' ', COALESCE(apellido_materno, ''), ' ', nombres) ILIKE $1
               )
             LIMIT 1`,
            [nombreBusqueda]
        );
        if (estRes.rows[0]) estudiante = estRes.rows[0];
    }

    if (!estudiante) {
        return {
            error: `Estudiante no encontrado en la base de datos (CI: ${fila.ci || '—'}, RUDE: ${fila.rude || '—'}, Nombre: ${fila.nombre_ref || '—'})`,
        };
    }

    // Buscar matrícula activa en el período académico activo
    const matRes = await client.query(
        `SELECT m.id AS matricula_id, p.id AS paralelo_id, p.nombre AS paralelo_nombre,
                g.id AS grado_id, g.nombre AS grado_nombre
         FROM matricula m
         INNER JOIN paralelo p ON m.paralelo_id = p.id
         INNER JOIN grado g ON p.grado_id = g.id
         INNER JOIN periodo_academico pa ON m.periodo_academico_id = pa.id
         WHERE m.estudiante_id = $1
           AND m.estado IN ('activo', 'inscrito', 'regular')
           AND pa.activo = true
           AND m.deleted_at IS NULL
         ORDER BY m.created_at DESC
         LIMIT 1`,
        [estudiante.id]
    );

    if (!matRes.rows[0]) {
        return {
            error: `El estudiante ${estudiante.apellidos} ${estudiante.nombres} (ID: ${estudiante.id}) no tiene matrícula activa en la gestión actual.`,
        };
    }

    return {
        estudiante_id: estudiante.id,
        nombre_completo: `${estudiante.apellidos}, ${estudiante.nombres}`,
        matricula_id: matRes.rows[0].matricula_id,
        paralelo_nombre: matRes.rows[0].paralelo_nombre,
        grado_nombre: matRes.rows[0].grado_nombre,
    };
}

async function cargarInformesCualitativos() {
    const args = parseArgs(process.argv);
    const dataPath = args._[0];

    if (!dataPath || (!args.periodoEvaluacionId && !args.periodoOrden)) {
        console.error('\n❌ Error de uso:');
        console.error('Uso: node --env-file .env.dev scripts/cargarInformesCualitativosInicial.js <archivo.json> --periodo-evaluacion-id=<id>');
        console.error('Ejemplo:');
        console.error('  node --env-file .env.dev scripts/cargarInformesCualitativosInicial.js ./data/informes_inicial_primero_a.json --periodo-evaluacion-id=1');
        console.error('  node --env-file .env.dev scripts/cargarInformesCualitativosInicial.js ./data/informes_inicial_primero_a.json --periodo-orden=1 --sobreescribir\n');
        process.exit(1);
    }

    const absPath = resolve(process.cwd(), dataPath);
    if (!existsSync(absPath)) {
        console.error(`\n❌ El archivo no existe: ${absPath}\n`);
        process.exit(1);
    }

    let filas;
    try {
        filas = JSON.parse(readFileSync(absPath, 'utf-8'));
        if (!Array.isArray(filas)) {
            throw new Error('El JSON debe contener un arreglo de registros.');
        }
    } catch (e) {
        console.error(`\n❌ Error al leer/parsear el JSON: ${e.message}\n`);
        process.exit(1);
    }

    const client = await pool.connect();
    let insertadas = 0;
    let actualizadas = 0;
    let salteadas = 0;
    const errores = [];

    try {
        await client.query('BEGIN');

        const periodo = await resolverPeriodo(client, args);

        console.log(`\n===============================================================`);
        console.log(`📥 CARGA DE EVALUACIONES CUALITATIVAS (INICIAL)`);
        console.log(`📂 Archivo: ${dataPath} (${filas.length} registros)`);
        console.log(`🗓️  Período: [ID ${periodo.id}] ${periodo.nombre} (Orden ${periodo.orden})`);
        console.log(`📌 Modo: ${args.sobreescribir ? 'SOBREESCRIBIR (Upsert)' : 'SALTEAR EXISTENTES'}`);
        console.log(`===============================================================\n`);

        for (const fila of filas) {
            const textoInforme = (fila.informe_cualitativo || fila.texto || '').trim();
            if (!textoInforme) {
                errores.push({
                    identificador: fila.ci || fila.rude || fila.nombre_ref || 'Desconocido',
                    nombre: fila.nombre_ref || 'Sin nombre',
                    motivo: 'El registro no incluye texto de informe cualitativo.',
                });
                continue;
            }

            const resuelto = await resolverFila(client, fila);
            if (resuelto.error) {
                errores.push({
                    identificador: fila.ci || fila.rude || 'Sin CI/RUDE',
                    nombre: fila.nombre_ref || 'Sin nombre',
                    motivo: resuelto.error,
                });
                continue;
            }

            const estadoFila = (fila.estado || args.estado || 'publicado').toLowerCase();
            const fechaPublicacion = estadoFila === 'publicado' ? new Date() : null;

            // Verificar si ya existe informe para esta matrícula y período
            const existeRes = await client.query(
                `SELECT id, estado FROM informe_cualitativo 
                 WHERE matricula_id = $1 AND periodo_evaluacion_id = $2`,
                [resuelto.matricula_id, periodo.id]
            );

            if (existeRes.rows[0]) {
                if (args.sobreescribir) {
                    await client.query(
                        `UPDATE informe_cualitativo
                         SET texto = $1,
                             estado = $2,
                             fecha_publicacion = $3,
                             updated_at = NOW()
                         WHERE id = $4`,
                        [textoInforme, estadoFila, fechaPublicacion, existeRes.rows[0].id]
                    );
                    actualizadas++;
                    console.log(`🔄 Actualizado: ${resuelto.nombre_completo} (${resuelto.grado_nombre} "${resuelto.paralelo_nombre}")`);
                } else {
                    salteadas++;
                    console.log(`⏭️  Salteado (ya existe): ${resuelto.nombre_completo}`);
                }
                continue;
            }

            // Insertar nuevo informe
            await client.query(
                `INSERT INTO informe_cualitativo (
                   matricula_id,
                   periodo_evaluacion_id,
                   texto,
                   generado_por_ia,
                   estado,
                   fecha_publicacion,
                   created_at,
                   updated_at
                 ) VALUES ($1, $2, $3, false, $4, $5, NOW(), NOW())`,
                [resuelto.matricula_id, periodo.id, textoInforme, estadoFila, fechaPublicacion]
            );

            insertadas++;
            console.log(`✅ Registrado: ${resuelto.nombre_completo} (${resuelto.grado_nombre} "${resuelto.paralelo_nombre}")`);
        }

        await client.query('COMMIT');

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log(`✅ Nuevos informes insertados: ${insertadas}`);
        if (args.sobreescribir) {
            console.log(`🔄 Informes actualizados:       ${actualizadas}`);
        }
        console.log(`⏭️  Ya existían (salteados):     ${salteadas}`);
        console.log(`❌ Con error / no procesados:   ${errores.length}`);
        console.log('═══════════════════════════════════════════════════════════════\n');

        if (errores.length) {
            console.log('⚠️  REGISTROS QUE NO SE PUDIERON CARGAR:\n');
            for (const err of errores) {
                console.log(`  • [${err.identificador}] ${err.nombre}`);
                console.log(`    Motivo: ${err.motivo}\n`);
            }
            console.log('💡 Tip: Puedes corregir el CI, RUDE o matricular al estudiante y volver a ejecutar.');
            console.log('   Los que ya se registraron correctamente no se duplicarán.\n');
        }

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n💥 Error crítico durante la transacción (se realizó ROLLBACK):', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

cargarInformesCualitativos();
