import { pool } from '../src/db/pool.js';

async function asignarPermisosPadre() {
  const client = await pool.connect();

  try {
    console.log('\n🔐 ASIGNANDO PERMISOS AL ROL padre\n');

    await client.query('BEGIN');

    // ── 1. Verificar rol ────────────────────────────────────
    const rol = await client.query(`
      SELECT id FROM roles WHERE nombre = 'padre'
    `);

    if (rol.rows.length === 0) {
      console.log('❌ El rol padre no existe');
      await client.query('ROLLBACK');
      return;
    }

    const rolId = rol.rows[0].id;
    console.log(`✅ Rol encontrado → ID: ${rolId}`);

    // ── 2. Permisos necesarios ──────────────────────────────
    const permisosNecesarios = [
      'asistencia.leer',
      'asistencia.reporte',
      'solicitud_permiso.leer',
      'solicitud_permiso.crear'
    ];

    // ── 3. Verificar permisos en BD ─────────────────────────
    const permisos = await client.query(`
      SELECT id, nombre FROM permisos
      WHERE nombre = ANY($1::text[])
    `, [permisosNecesarios]);

    console.log('\n📋 Permisos encontrados:');
    permisosNecesarios.forEach(nombre => {
      const existe = permisos.rows.find(p => p.nombre === nombre);
      console.log(`  ${existe ? '✅' : '❌'} ${nombre}`);
    });

    // ── 4. Insertar relaciones ──────────────────────────────
    const insertados = await client.query(`
      INSERT INTO rol_permisos (rol_id, permiso_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permisos p
      WHERE r.nombre = 'padre'
        AND p.nombre = ANY($1::text[])
      ON CONFLICT (rol_id, permiso_id) DO NOTHING
      RETURNING permiso_id
    `, [permisosNecesarios]);

    console.log(`\n🔗 Permisos nuevos asignados: ${insertados.rowCount}`);

    if (insertados.rowCount === 0) {
      console.log('ℹ️ Todos los permisos ya estaban asignados');
    }

    // ── 5. Verificación final ───────────────────────────────
    const final = await client.query(`
      SELECT p.nombre
      FROM rol_permisos rp
      INNER JOIN permisos p ON rp.permiso_id = p.id
      WHERE rp.rol_id = $1
        AND p.nombre = ANY($2::text[])
      ORDER BY p.nombre
    `, [rolId, permisosNecesarios]);

    console.log('\n✅ Estado final:');
    console.log('┌──────────────────────────────────────────────┐');
    permisosNecesarios.forEach(nombre => {
      const ok = final.rows.find(r => r.nombre === nombre);
      console.log(`│  ${ok ? '✅' : '❌'} ${nombre.padEnd(42)} │`);
    });
    console.log('└──────────────────────────────────────────────┘\n');

    await client.query('COMMIT');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('💥 Error:', error.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

asignarPermisosPadre();