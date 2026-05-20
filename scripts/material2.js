// seeds/asignar_permisos_materiales.js
//
// Asigna a los roles 'docente' y 'estudiante' todos los permisos
// necesarios para el módulo de materiales académicos.
//
// Ejecutar con: node seeds/asignar_permisos_materiales.js

import { pool } from '../src/db/pool.js';

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── 1. Obtener ids de roles ─────────────────────────────────────
    const rolesRes = await client.query(
      `SELECT id, nombre FROM roles WHERE nombre = ANY($1)`,
      [['docente', 'estudiante']]
    );

    const roles = Object.fromEntries(rolesRes.rows.map(r => [r.nombre, r.id]));

    if (!roles.docente)    throw new Error("No se encontró el rol 'docente'.");
    if (!roles.estudiante) throw new Error("No se encontró el rol 'estudiante'.");

    console.log(`✅ Rol 'docente'    encontrado — id: ${roles.docente}`);
    console.log(`✅ Rol 'estudiante' encontrado — id: ${roles.estudiante}`);

    // ── 2. Permisos por rol ────────────────────────────────────────
    //
    // DOCENTE:
    //   unidad_tematica: CRUD completo (gestiona el temario de su materia)
    //   tema: CRUD completo
    //   material: CRUD + descargar + publicar
    //   comentario_material: CRUD + moderar (puede resolver dudas y ocultar comentarios)
    //   progreso: leer + reporte (el trigger lo actualiza automáticamente)
    //   estadisticas_material: leer
    //
    // NO se le da: progreso.actualizar (lo maneja trg_actualizar_progreso)
    //
    // ESTUDIANTE:
    //   unidad_tematica: solo leer
    //   tema: solo leer
    //   material: leer + descargar
    //   comentario_material: leer + crear + actualizar propios
    //   progreso: leer + actualizar (su propio avance manual)
    //
    // NO se le da: material.crear / actualizar / eliminar / publicar
    //              comentario_material.eliminar (se controla en la app por usuario_id)
    //              comentario_material.moderar
    //              estadisticas_material.leer (info sensible de uso global)

    const permisosDocente = [
      // Unidades temáticas
      'unidad_tematica.leer',
      'unidad_tematica.crear',
      'unidad_tematica.actualizar',
      'unidad_tematica.eliminar',
      // Temas
      'tema.leer',
      'tema.crear',
      'tema.actualizar',
      'tema.eliminar',
      // Materiales
      'material.leer',
      'material.crear',
      'material.actualizar',
      'material.eliminar',
      'material.descargar',
      'material.publicar',
      // Comentarios
      'comentario_material.leer',
      'comentario_material.crear',
      'comentario_material.actualizar',
      'comentario_material.eliminar',
      'comentario_material.moderar',
      // Progreso
      'progreso.leer',
      'progreso.reporte',
      // Estadísticas
      'estadisticas_material.leer',
    ];

    const permisosEstudiante = [
      // Unidades temáticas
      'unidad_tematica.leer',
      // Temas
      'tema.leer',
      // Materiales
      'material.leer',
      'material.descargar',
      // Comentarios
      'comentario_material.leer',
      'comentario_material.crear',
      'comentario_material.actualizar',
      // Progreso
      'progreso.leer',
      'progreso.actualizar',
    ];

    // ── 3. Helper: asignar permisos a un rol ───────────────────────
    async function asignarPermisos(rolNombre, rolId, permisos) {
      console.log(`\n📋 Procesando permisos para '${rolNombre}'...`);

      const permisosRes = await client.query(
        `SELECT id, nombre FROM permisos WHERE nombre = ANY($1)`,
        [permisos]
      );

      const encontrados   = permisosRes.rows.map(p => p.nombre);
      const noEncontrados = permisos.filter(p => !encontrados.includes(p));

      if (noEncontrados.length > 0) {
        console.warn(`⚠️  Permisos no encontrados en BD (revisar seed del módulo):`);
        noEncontrados.forEach(p => console.warn(`   - ${p}`));
        console.warn(`   Estos se omitirán. Corré primero seeds/crear_modulo_materiales.js\n`);
      }

      let insertados = 0;
      let yaExistian = 0;

      for (const permiso of permisosRes.rows) {
        const res = await client.query(`
          INSERT INTO rol_permisos (rol_id, permiso_id)
          VALUES ($1, $2)
          ON CONFLICT (rol_id, permiso_id) DO NOTHING
        `, [rolId, permiso.id]);

        if (res.rowCount > 0) {
          insertados++;
          console.log(`   ✅ Asignado:   ${permiso.nombre}`);
        } else {
          yaExistian++;
          console.log(`   ⏭️  Ya existía: ${permiso.nombre}`);
        }
      }

      return { insertados, yaExistian, noEncontrados: noEncontrados.length };
    }

    // ── 4. Ejecutar asignaciones ───────────────────────────────────
    const resDocente    = await asignarPermisos('docente',    roles.docente,    permisosDocente);
    const resEstudiante = await asignarPermisos('estudiante', roles.estudiante, permisosEstudiante);

    await client.query('COMMIT');

    console.log(`
╔══════════════════════════════════════════════════════╗
║  SEED COMPLETADO — MÓDULO MATERIALES ACADÉMICOS      ║
╠══════════════════════════════════════════════════════╣
║  ROL DOCENTE    (id: ${String(roles.docente).padEnd(30)}║
║    Insertados:    ${String(resDocente.insertados).padEnd(34)}║
║    Ya existían:   ${String(resDocente.yaExistian).padEnd(34)}║
║    No encontrados:${String(resDocente.noEncontrados).padEnd(34)}║
╠══════════════════════════════════════════════════════╣
║  ROL ESTUDIANTE (id: ${String(roles.estudiante).padEnd(30)}║
║    Insertados:    ${String(resEstudiante.insertados).padEnd(34)}║
║    Ya existían:   ${String(resEstudiante.yaExistian).padEnd(34)}║
║    No encontrados:${String(resEstudiante.noEncontrados).padEnd(34)}║
╚══════════════════════════════════════════════════════╝

⚡ Los docentes ya pueden acceder a:
   GET    /api/materiales/tipos
   GET    /api/materiales/unidades/temario/:grado_materia_id
   GET    /api/materiales/unidades
   POST   /api/materiales/unidades
   PUT    /api/materiales/unidades/:id
   DELETE /api/materiales/unidades/:id
   GET    /api/materiales/temas
   POST   /api/materiales/temas
   PUT    /api/materiales/temas/:id
   DELETE /api/materiales/temas/:id
   GET    /api/materiales/buscar
   GET    /api/materiales/destacados
   GET    /api/materiales/:id/estadisticas
   POST   /api/materiales
   PUT    /api/materiales/:id
   DELETE /api/materiales/:id
   PATCH  /api/materiales/:id/publicar
   POST   /api/materiales/:id/temas
   DELETE /api/materiales/:id/temas/:tema_id
   GET    /api/materiales/:id/comentarios
   POST   /api/materiales/:id/comentarios
   PUT    /api/materiales/:id/comentarios/:comentario_id
   PATCH  /api/materiales/:id/comentarios/:comentario_id/resolver
   DELETE /api/materiales/:id/comentarios/:comentario_id
   GET    /api/materiales/progreso

⚡ Los estudiantes ya pueden acceder a:
   GET    /api/materiales/tipos
   GET    /api/materiales/unidades/temario/:grado_materia_id
   GET    /api/materiales/unidades
   GET    /api/materiales/temas
   GET    /api/materiales/buscar
   GET    /api/materiales/destacados
   GET    /api/materiales/favoritos
   GET    /api/materiales
   GET    /api/materiales/:id
   POST   /api/materiales/:id/acceso
   POST   /api/materiales/:id/favorito
   GET    /api/materiales/:id/comentarios
   POST   /api/materiales/:id/comentarios
   PUT    /api/materiales/:id/comentarios/:comentario_id
   GET    /api/materiales/progreso
   PUT    /api/materiales/progreso/:tema_id

💡 Si los tokens actuales no reflejan los nuevos permisos,
   pedile al usuario que cierre sesión y vuelva a ingresar.
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