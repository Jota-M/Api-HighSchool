import { pool } from '../src/db/pool.js';

async function asignarPermisosNotasPadre() {
  const client = await pool.connect();
  try {
    console.log('\n📝 ASIGNANDO PERMISOS DE NOTAS AL ROL padre\n');

    await client.query('BEGIN');

    // Los permisos que necesita el padre para ver notas
    // - notas.leer     → GET /notas/dimensiones, /notas/calificaciones/..., /notas/dimension-notas/...
    // - notas.boletin  → GET /notas/boletin/:matricula_id/:periodo_evaluacion_id
    // - periodo_evaluacion.leer → GET /notas/periodos
    const permisosNecesarios = [
      'notas.leer',
      'notas.boletin',
      'periodo_evaluacion.leer',
    ];

    // Verificar que existen
    const existentes = await client.query(`
      SELECT id, nombre FROM permisos WHERE nombre = ANY($1::text[])
    `, [permisosNecesarios]);

    console.log('📋 Permisos encontrados:');
    permisosNecesarios.forEach(nombre => {
      const ok = existentes.rows.find(p => p.nombre === nombre);
      console.log(`  ${ok ? '✅' : '❌'} ${nombre}`);
    });

    const faltantes = permisosNecesarios.filter(n => !existentes.rows.find(p => p.nombre === n));
    if (faltantes.length > 0) {
      console.log('\n⚠️  Estos permisos no existen — asegurate de haber corrido el seed de notas primero:');
      faltantes.forEach(f => console.log(`   · ${f}`));
      await client.query('ROLLBACK');
      return;
    }

    // Asignar al rol padre
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

    console.log(`\n🔗 Permisos nuevos asignados al rol padre: ${insertados.rowCount}`);
    if (insertados.rowCount === 0) {
      console.log('  ℹ️  (todos ya estaban asignados)');
    }

    // Verificación final
    const final = await client.query(`
      SELECT p.nombre
      FROM rol_permisos rp
      INNER JOIN roles r    ON rp.rol_id    = r.id
      INNER JOIN permisos p ON rp.permiso_id = p.id
      WHERE r.nombre = 'padre'
        AND p.nombre = ANY($1::text[])
      ORDER BY p.nombre
    `, [permisosNecesarios]);

    await client.query('COMMIT');

    console.log('\n✅ Estado final — permisos del rol padre para notas:');
    console.log('┌──────────────────────────────────────────────┐');
    permisosNecesarios.forEach(nombre => {
      const ok = final.rows.find(r => r.nombre === nombre);
      console.log(`│  ${ok ? '✅' : '❌'} ${nombre.padEnd(42)} │`);
    });
    console.log('└──────────────────────────────────────────────┘\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('💥 Error:', error.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

asignarPermisosNotasPadre();