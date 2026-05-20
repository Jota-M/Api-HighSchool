// seeds/asignar_permiso_padre_evaluacion.js
//
// Asigna al rol 'padre' permisos de lectura de evaluaciones
//
// Ejecutar con: node seeds/asignar_permiso_padre_evaluacion.js

import { pool } from '../src/db/pool.js';

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Obtener el id del rol 'padre' ──────────────────────
    const rolRes = await client.query(
      `SELECT id FROM roles WHERE nombre = 'padre' LIMIT 1`
    );

    if (rolRes.rows.length === 0) {
      throw new Error("No se encontró el rol 'padre'.");
    }

    const rolPadreId = rolRes.rows[0].id;
    console.log(`✅ Rol 'padre' encontrado — id: ${rolPadreId}`);

    // ── 2. Permisos SOLO de lectura ───────────────────────────
    const permisosPadre = [
      'evaluacion.leer',
      'evaluacion.ver_publica',   // importante para lo publicado
      'periodo_evaluacion.leer',  // para ver trimestres
      'notas.leer'                // para ver calificaciones
    ];

    // ── 3. Buscar permisos en BD ──────────────────────────────
    const permisosRes = await client.query(
      `SELECT id, nombre FROM permisos WHERE nombre = ANY($1)`,
      [permisosPadre]
    );

    const encontrados   = permisosRes.rows.map(p => p.nombre);
    const noEncontrados = permisosPadre.filter(p => !encontrados.includes(p));

    if (noEncontrados.length > 0) {
      console.warn('\n⚠️ Permisos no encontrados:');
      noEncontrados.forEach(p => console.warn(`   - ${p}`));
    }

    // ── 4. Insertar en rol_permisos ───────────────────────────
    let insertados = 0;
    let yaExistian = 0;

    for (const permiso of permisosRes.rows) {
      const res = await client.query(`
        INSERT INTO rol_permisos (rol_id, permiso_id)
        VALUES ($1, $2)
        ON CONFLICT (rol_id, permiso_id) DO NOTHING
      `, [rolPadreId, permiso.id]);

      if (res.rowCount > 0) {
        insertados++;
        console.log(`   ✅ Asignado:    ${permiso.nombre}`);
      } else {
        yaExistian++;
        console.log(`   ⏭️ Ya existía: ${permiso.nombre}`);
      }
    }

    await client.query('COMMIT');

    console.log(`
╔══════════════════════════════════════════════════════╗
║  SEED PADRE COMPLETADO                              ║
╠══════════════════════════════════════════════════════╣
║  Rol:             padre (id: ${String(rolPadreId).padEnd(20)}║
║  Insertados:      ${String(insertados).padEnd(34)}║
║  Ya existían:     ${String(yaExistian).padEnd(34)}║
║  No encontrados:  ${String(noEncontrados.length).padEnd(34)}║
╚══════════════════════════════════════════════════════╝

👨‍👩‍👧 Permisos del padre:
   ✔ Ver evaluaciones publicadas
   ✔ Ver notas
   ✔ Ver periodos (trimestres)

⚠️ El padre NO puede:
   ✖ Crear evaluaciones
   ✖ Editar evaluaciones
   ✖ Subir archivos
   ✖ Calificar
`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error en el seed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();