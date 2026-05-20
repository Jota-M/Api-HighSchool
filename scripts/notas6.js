// seeds/asignar_permisos_docente_notas.js
//
// Asigna al rol 'docente' todos los permisos necesarios para
// notas, evaluaciones (incluyendo adjuntos y rúbrica) y asistencia.
//
// Ejecutar con: node seeds/asignar_permisos_docente_notas.js

import { pool } from '../src/db/pool.js';

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Obtener el id del rol 'docente' ──────────────────────
    const rolRes = await client.query(
      `SELECT id FROM roles WHERE nombre = 'docente' LIMIT 1`
    );
    if (rolRes.rows.length === 0) {
      throw new Error("No se encontró el rol 'docente'.");
    }
    const rolDocenteId = rolRes.rows[0].id;
    console.log(`✅ Rol 'docente' encontrado — id: ${rolDocenteId}`);

    // ── 2. Permisos del docente ─────────────────────────────────
    const permisosDocente = [
      // Notas
      'notas.leer',
      'notas.crear',
      'notas.actualizar',
      'notas.cerrar',
      'notas.boletin',
      // Evaluaciones — CRUD básico
      'evaluacion.leer',
      'evaluacion.crear',
      'evaluacion.actualizar',
      'evaluacion.eliminar',
      // Evaluaciones — adjuntos, publicación y rúbrica (nuevos)
      'evaluacion.subir_archivo',     // foto y PDF
      'evaluacion.ver_publica',       // vista pública padres/estudiantes
      'evaluacion.rubrica_crear',     // crear/reemplazar rúbrica
      'evaluacion.rubrica_editar',    // editar criterios individuales
      // Períodos de evaluación (solo lectura)
      'periodo_evaluacion.leer',
      // Asistencia
      'asistencia.leer',
      'asistencia.crear',
      'asistencia.actualizar',
      'asistencia.reporte',
      // Permisos de ausencia
      'solicitud_permiso.leer',
      'solicitud_permiso.aprobar',
    ];

    // ── 3. Buscar los IDs en la BD ──────────────────────────────
    const permisosRes = await client.query(
      `SELECT id, nombre FROM permisos WHERE nombre = ANY($1)`,
      [permisosDocente]
    );

    const encontrados   = permisosRes.rows.map(p => p.nombre);
    const noEncontrados = permisosDocente.filter(p => !encontrados.includes(p));

    if (noEncontrados.length > 0) {
      console.warn('\n⚠️  Permisos no encontrados en BD:');
      noEncontrados.forEach(p => console.warn(`   - ${p}`));
      console.warn('   Corré primero las migraciones del módulo de notas y adjuntos.\n');
    }

    // ── 4. Insertar en rol_permisos ─────────────────────────────
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
        console.log(`   ✅ Asignado:    ${permiso.nombre}`);
      } else {
        yaExistian++;
        console.log(`   ⏭️  Ya existía:  ${permiso.nombre}`);
      }
    }

    await client.query('COMMIT');

    console.log(`
╔══════════════════════════════════════════════════════╗
║  SEED COMPLETADO                                     ║
╠══════════════════════════════════════════════════════╣
║  Rol:             docente (id: ${String(rolDocenteId).padEnd(20)}║
║  Insertados:      ${String(insertados).padEnd(34)}║
║  Ya existían:     ${String(yaExistian).padEnd(34)}║
║  No encontrados:  ${String(noEncontrados.length).padEnd(34)}║
╚══════════════════════════════════════════════════════╝

⚡ Endpoints disponibles para docentes:
   GET  /api/notas/mis-materias
   GET  /api/notas/dimensiones
   GET  /api/notas/evaluaciones
   POST /api/notas/evaluaciones
   POST /api/notas/evaluaciones/:id/foto
   POST /api/notas/evaluaciones/:id/pdf
   PUT  /api/notas/evaluaciones/:id/rubrica
   PATCH /api/notas/evaluaciones/:id/publicar
   POST /api/notas/calificaciones/masivo
   POST /api/notas/calcular
   GET  /api/asistencia/mis-asignaciones
   GET  /api/asistencia/lista-dia
   POST /api/asistencia/masivo
   PATCH /api/permisos/:id/estado

💡 Si los tokens actuales no reflejan los nuevos permisos,
   el docente debe cerrar sesión y volver a ingresar.
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