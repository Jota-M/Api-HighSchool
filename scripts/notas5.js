// seeds/asignar_permisos_estudiante.js
// Ejecutar con: node seeds/asignar_permisos_estudiante.js

import { pool } from '../src/db/pool.js';

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const rolRes = await client.query(
      `SELECT id FROM roles WHERE nombre = 'estudiante' LIMIT 1`
    );
    if (rolRes.rows.length === 0) {
      throw new Error("No se encontró el rol 'estudiante'.");
    }

    const rolEstudianteId = rolRes.rows[0].id;
    console.log(`✅ Rol 'estudiante' encontrado — id: ${rolEstudianteId}`);

    const permisosEstudiante = [
      'material.leer',                // perfil, materias, materiales, favoritos, búsqueda
      'comentario_material.leer',     // GET comentarios
      'comentario_material.crear',    // POST comentarios
      'comentario_material.actualizar', // PUT comentarios propios
      'progreso.leer',                // GET progreso por materia
      'progreso.actualizar',          // PUT progreso manual por tema
      'notas.boletin',                // boletín + detalle de notas por materia
      'asistencia.reporte',           // GET /asistencia  y  GET /asistencia/detalle
    ];

    const permisosRes = await client.query(
      `SELECT id, nombre FROM permisos WHERE nombre = ANY($1)`,
      [permisosEstudiante]
    );

    const encontrados   = permisosRes.rows.map(p => p.nombre);
    const noEncontrados = permisosEstudiante.filter(p => !encontrados.includes(p));

    if (noEncontrados.length > 0) {
      console.warn(`⚠️  Permisos no encontrados en BD — verificar seeds previos:`);
      noEncontrados.forEach(p => console.warn(`   - ${p}`));
    }

    let insertados = 0, yaExistian = 0;

    for (const permiso of permisosRes.rows) {
      const res = await client.query(
        `INSERT INTO rol_permisos (rol_id, permiso_id)
         VALUES ($1, $2)
         ON CONFLICT (rol_id, permiso_id) DO NOTHING`,
        [rolEstudianteId, permiso.id]
      );
      if (res.rowCount > 0) { insertados++; console.log(`   ✅ Asignado:   ${permiso.nombre}`); }
      else                  { yaExistian++; console.log(`   ⏭️  Ya existía: ${permiso.nombre}`); }
    }

    await client.query('COMMIT');
    console.log(`
╔══════════════════════════════════════════════════╗
║  SEED COMPLETADO — rol: estudiante               ║
╠══════════════════════════════════════════════════╣
║  Insertados:     ${String(insertados).padEnd(31)}║
║  Ya existían:    ${String(yaExistian).padEnd(31)}║
║  No encontrados: ${String(noEncontrados.length).padEnd(31)}║
╚══════════════════════════════════════════════════╝
💡 Pedile al estudiante que cierre sesión y vuelva a ingresar
   para que el nuevo token incluya los permisos actualizados.
`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();