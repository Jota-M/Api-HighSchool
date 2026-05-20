import { pool } from '../src/db/pool.js';

async function asignarPermisosHorarioRoles() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('📅 Asignando permiso horario.leer a roles de visualización...\n');

    // 1️⃣ Roles que solo necesitan VER horarios (no editar)
    const ROLES_VISUALIZACION = ['docente', 'estudiante', 'padre'];

    const rolesResult = await client.query(`
      SELECT id, nombre FROM roles
      WHERE nombre = ANY($1)
    `, [ROLES_VISUALIZACION]);

    if (!rolesResult.rows.length) {
      throw new Error('❌ No se encontró ninguno de los roles esperados');
    }

    console.log(`👥 Roles encontrados: ${rolesResult.rows.map(r => r.nombre).join(', ')}`);

    // Advertir si falta alguno
    const rolesEncontrados = rolesResult.rows.map(r => r.nombre);
    const rolesFaltantes = ROLES_VISUALIZACION.filter(r => !rolesEncontrados.includes(r));
    if (rolesFaltantes.length) {
      console.log(`⚠️  Roles no encontrados en BD: ${rolesFaltantes.join(', ')} (se omiten)`);
    }

    // 2️⃣ Solo el permiso de lectura de horario
    // (leer paralelo y docente — NO crear/editar/publicar/eliminar)
    const permisosResult = await client.query(`
      SELECT id, nombre FROM permisos
      WHERE nombre = 'horario.leer'
    `);

    if (!permisosResult.rows.length) {
      throw new Error('❌ No existe el permiso horario.leer en la BD');
    }

    const permiso = permisosResult.rows[0];
    console.log(`\n🔑 Permiso a asignar: ${permiso.nombre}\n`);

    // 3️⃣ Asignar a cada rol
    let asignados = 0;
    let omitidos = 0;

    for (const rol of rolesResult.rows) {
      const result = await client.query(`
        INSERT INTO rol_permisos (rol_id, permiso_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [rol.id, permiso.id]);

      if (result.rowCount > 0) {
        console.log(`  ✅ ${rol.nombre} → ${permiso.nombre}`);
        asignados++;
      } else {
        console.log(`  ⏭️  ${rol.nombre} → ya tenía ${permiso.nombre}`);
        omitidos++;
      }
    }

    await client.query('COMMIT');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Listo — ${asignados} asignados, ${omitidos} ya existían`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n💡 Ahora docentes, estudiantes y padres pueden ver');
    console.log('   los endpoints GET /horarios/docente/:id');
    console.log('   y GET /horarios/paralelo/:id sin 403.\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error:', err.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

asignarPermisosHorarioRoles();