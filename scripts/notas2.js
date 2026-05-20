// seeds/asignar_permisos_docente_notas.js
//
// Asigna al rol 'docente' todos los permisos necesarios para
// el módulo de notas y asistencia.
//
// Ejecutar con: node seeds/asignar_permisos_docente_notas.js

import { pool } from '../src/db/pool.js';

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── 1. Obtener el id del rol 'docente' ──────────────────────────
    const rolRes = await client.query(
      `SELECT id FROM roles WHERE nombre = 'docente' LIMIT 1`
    );

    if (rolRes.rows.length === 0) {
      throw new Error("No se encontró el rol 'docente'. Verificá que exista en la tabla roles.");
    }

    const rolDocenteId = rolRes.rows[0].id;
    console.log(`✅ Rol 'docente' encontrado — id: ${rolDocenteId}`);

    // ── 2. Permisos que necesita el docente ────────────────────────
    //
    // NOTAS: leer, crear, actualizar, cerrar, boletin
    // EVALUACION: leer, crear, actualizar, eliminar
    // PERIODO_EVALUACION: leer
    // ASISTENCIA: leer, crear, actualizar, reporte
    // SOLICITUD_PERMISO: leer, aprobar
    //
    // NO se le da: notas.manual (nota manual es solo admin/directivo)
    //              periodo_evaluacion.crear / actualizar (solo admin crea trimestres)
    //              asistencia.eliminar (no puede borrar registros de asistencia)
    //              solicitud_permiso.crear (el que crea es el padre, no el docente)

    const permisosDocente = [
      // Notas
      'notas.leer',
      'notas.crear',
      'notas.actualizar',
      'notas.cerrar',
      'notas.boletin',
      // Evaluaciones
      'evaluacion.leer',
      'evaluacion.crear',
      'evaluacion.actualizar',
      'evaluacion.eliminar',
      // Períodos de evaluación (solo lectura — el admin los crea)
      'periodo_evaluacion.leer',
      // Asistencia
      'asistencia.leer',
      'asistencia.crear',
      'asistencia.actualizar',
      'asistencia.reporte',
      // Permisos de ausencia (el docente los aprueba/rechaza)
      'solicitud_permiso.leer',
      'solicitud_permiso.aprobar',
    ];

    // ── 3. Obtener los ids de esos permisos ────────────────────────
    const permisosRes = await client.query(
      `SELECT id, nombre FROM permisos WHERE nombre = ANY($1)`,
      [permisosDocente]
    );

    const encontrados = permisosRes.rows.map(p => p.nombre);
    const noEncontrados = permisosDocente.filter(p => !encontrados.includes(p));

    if (noEncontrados.length > 0) {
      console.warn(`⚠️  Permisos no encontrados en BD (revisar seed del módulo):`);
      noEncontrados.forEach(p => console.warn(`   - ${p}`));
      console.warn(`   Estos se omitirán. Corré primero el seed del módulo de asistencia/notas.\n`);
    }

    // ── 4. Insertar en rol_permisos (ignorar duplicados) ──────────
    let insertados = 0;
    let yaExistian = 0;

    for (const permiso of permisosRes.rows) {
      const res = await client.query(`
        INSERT INTO rol_permisos (rol_id, permiso_id)
        VALUES ($1, $2)
        ON CONFLICT (rol_id, permiso_id) DO NOTHING
      `, [rolDocenteId, permiso.id]);

      if (res.rowCount > 0) {
        insertados++;
        console.log(`   ✅ Asignado: ${permiso.nombre}`);
      } else {
        yaExistian++;
        console.log(`   ⏭️  Ya existía: ${permiso.nombre}`);
      }
    }

    await client.query('COMMIT');

    console.log(`
╔══════════════════════════════════════════════════╗
║  SEED COMPLETADO                                 ║
╠══════════════════════════════════════════════════╣
║  Rol:           docente (id: ${String(rolDocenteId).padEnd(18)}║
║  Insertados:    ${String(insertados).padEnd(32)}║
║  Ya existían:   ${String(yaExistian).padEnd(32)}║
║  No encontrados:${String(noEncontrados.length).padEnd(32)}║
╚══════════════════════════════════════════════════╝

⚡ Los docentes ya pueden acceder a:
   GET /api/notas/mis-materias
   GET /api/notas/dimensiones
   GET /api/notas/evaluaciones
   POST /api/notas/calificaciones/masivo
   GET /api/asistencia/mis-asignaciones
   GET /api/asistencia/lista-dia
   POST /api/asistencia/masivo
   PATCH /api/permisos/:id/estado

💡 Si los tokens actuales no reflejan los nuevos permisos,
   pedile al docente que cierre sesión y vuelva a ingresar.
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