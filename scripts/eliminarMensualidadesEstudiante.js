import { pool } from '../src/db/pool.js';

async function main() {
    const ci = process.argv[2] || '16549591';
    console.log(`🔍 Buscando estudiante con CI: ${ci}...`);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const estRes = await client.query(
            `SELECT e.id AS estudiante_id, e.nombres, e.apellidos, e.ci,
                    m.id AS matricula_id, m.periodo_academico_id, m.paralelo_id
             FROM estudiante e
             JOIN matricula m ON m.estudiante_id = e.id
             WHERE e.ci = $1 AND m.deleted_at IS NULL`,
            [ci]
        );

        if (estRes.rows.length === 0) {
            console.log(`❌ No se encontró ningún estudiante activo con CI ${ci}`);
            await client.query('ROLLBACK');
            return;
        }

        const est = estRes.rows[0];
        console.log(`👤 Encontrado: ${est.nombres} ${est.apellidos} (ID: ${est.estudiante_id}, Matrícula: ${est.matricula_id})`);

        const allMats = await client.query(`SELECT * FROM matricula WHERE estudiante_id = $1`, [est.estudiante_id]);
        console.log(`📋 Matrículas encontradas (${allMats.rows.length}):`, allMats.rows.map(m => ({ id: m.id, periodo: m.periodo_academico_id, paralelo: m.paralelo_id, estado: m.estado })));

        for (const m of allMats.rows) {
            const mens = await client.query(`SELECT id, numero_cuota, mes_correspondiente, estado FROM mensualidad WHERE matricula_id = $1`, [m.id]);
            console.log(`   - Mensualidades de matrícula ${m.id} (Período ${m.periodo_academico_id}): ${mens.rows.length}`);

            if (mens.rows.length > 0) {
                const delRes = await client.query(
                    `DELETE FROM mensualidad WHERE matricula_id = $1 RETURNING id, numero_cuota, mes_correspondiente, estado`,
                    [m.id]
                );
                console.log(`🗑️ Se eliminaron ${delRes.rowCount} mensualidades de la matrícula ${m.id}:`);
                delRes.rows.forEach(r => console.log(`      • Cuota ${r.numero_cuota} (${r.mes_correspondiente}): estado '${r.estado}'`));
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ Limpieza completada exitosamente.`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error al eliminar mensualidades:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
