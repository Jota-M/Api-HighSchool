import { pool } from '../src/db/pool.js';

async function asignarPermisosHorarios() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('📅 Asignando permisos de HORARIOS al super_admin...');

    // 1️⃣ Obtener rol super_admin
    const rolResult = await client.query(
      `SELECT id FROM roles WHERE nombre = 'super_admin' LIMIT 1`
    );

    if (!rolResult.rows.length) {
      throw new Error('❌ No existe el rol super_admin');
    }

    const rolId = rolResult.rows[0].id;

    // 2️⃣ Obtener permisos SOLO de horarios
    const permisosResult = await client.query(`
      SELECT id, nombre 
      FROM permisos 
      WHERE modulo IN ('horario', 'bloque_horario')
    `);

    const permisos = permisosResult.rows;

    console.log(`📊 Permisos de horarios encontrados: ${permisos.length}`);

    // 3️⃣ Asignar permisos
    for (const p of permisos) {
      await client.query(
        `INSERT INTO rol_permisos (rol_id, permiso_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [rolId, p.id]
      );

      console.log(`  ✓ ${p.nombre}`);
    }

    await client.query('COMMIT');

    console.log('\n✅ Permisos de horarios asignados correctamente al super_admin');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', err.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

asignarPermisosHorarios();