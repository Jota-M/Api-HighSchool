// // seeds/asignar_permisos_docente_seguimiento.js
// //
// // Asigna al rol 'docente' todos los permisos del módulo
// // de Seguimiento Pedagógico (crear, editar, publicar, ver reportes).
// //
// // Ejecutar con: node seeds/asignar_permisos_docente_seguimiento.js

// import { pool } from '../src/db/pool.js';

// async function seed() {
//   const client = await pool.connect();
//   try {
//     await client.query('BEGIN');

//     // ── 1. Obtener el id del rol 'docente' ────────────────────
//     const rolRes = await client.query(
//       `SELECT id FROM roles WHERE nombre = 'docente' LIMIT 1`
//     );

//     if (rolRes.rows.length === 0) {
//       throw new Error("No se encontró el rol 'docente'.");
//     }

//     const rolId = rolRes.rows[0].id;
//     console.log(`✅ Rol 'docente' encontrado — id: ${rolId}`);

//     // ── 2. Permisos del docente ───────────────────────────────
//     // El docente puede crear, editar, publicar y ver reportes.
//     // NO puede gestionar categorías (eso es del admin).
//     const permisosDocente = [
//       // Observaciones — CRUD completo + publicar + reportes
//       'observacion_pedagogica.leer',
//       'observacion_pedagogica.crear',
//       'observacion_pedagogica.actualizar',
//       'observacion_pedagogica.eliminar',
//       'observacion_pedagogica.publicar',
//       'observacion_pedagogica.reporte',
//       // Catálogo — solo lectura (usa las categorías creadas por admin)
//       'categoria_observacion.leer',
//     ];

//     // ── 3. Buscar permisos en BD ──────────────────────────────
//     const permisosRes = await client.query(
//       `SELECT id, nombre FROM permisos WHERE nombre = ANY($1)`,
//       [permisosDocente]
//     );

//     const encontrados   = permisosRes.rows.map(p => p.nombre);
//     const noEncontrados = permisosDocente.filter(p => !encontrados.includes(p));

//     if (noEncontrados.length > 0) {
//       console.warn('\n⚠️  Permisos no encontrados en BD (¿corriste el migration?):');
//       noEncontrados.forEach(p => console.warn(`   - ${p}`));
//     }

//     // ── 4. Insertar en rol_permisos ───────────────────────────
//     let insertados = 0;
//     let yaExistian = 0;

//     for (const permiso of permisosRes.rows) {
//       const res = await client.query(`
//         INSERT INTO rol_permisos (rol_id, permiso_id)
//         VALUES ($1, $2)
//         ON CONFLICT (rol_id, permiso_id) DO NOTHING
//       `, [rolId, permiso.id]);

//       if (res.rowCount > 0) {
//         insertados++;
//         console.log(`   ✅ Asignado:    ${permiso.nombre}`);
//       } else {
//         yaExistian++;
//         console.log(`   ⏭️  Ya existía: ${permiso.nombre}`);
//       }
//     }

//     await client.query('COMMIT');

//     console.log(`
// ╔══════════════════════════════════════════════════════╗
// ║  SEED DOCENTE — SEGUIMIENTO PEDAGÓGICO              ║
// ╠══════════════════════════════════════════════════════╣
// ║  Rol:             docente (id: ${String(rolId).padEnd(19)}║
// ║  Insertados:      ${String(insertados).padEnd(34)}║
// ║  Ya existían:     ${String(yaExistian).padEnd(34)}║
// ║  No encontrados:  ${String(noEncontrados.length).padEnd(34)}║
// ╚══════════════════════════════════════════════════════╝

// 👨‍🏫 El docente PUEDE:
//    ✔ Ver observaciones (propias y del paralelo)
//    ✔ Crear observaciones sobre sus estudiantes
//    ✔ Editar sus observaciones
//    ✔ Eliminar sus observaciones (soft delete)
//    ✔ Publicar / ocultar observaciones al padre
//    ✔ Ver reportes y línea de tiempo
//    ✔ Ver catálogo de categorías y plantillas

// ⚠️  El docente NO puede:
//    ✖ Crear / editar categorías de observación
//    ✖ Ver observaciones de otros docentes (filtro en backend)
//    ✖ Ver el panel del padre
//    ✖ Acusar recibo (eso es exclusivo del padre)
// `);

//   } catch (error) {
//     await client.query('ROLLBACK');
//     console.error('\n💥 Error en el seed:', error.message);
//     process.exit(1);
//   } finally {
//     client.release();
//     await pool.end();
//   }
// }

// seed();
// seeds/asignar_permisos_padre_seguimiento.js
//
// Asigna al rol 'padre' los permisos de lectura y acuse de recibo
// del módulo de Seguimiento Pedagógico.
//
// Ejecutar con: node seeds/asignar_permisos_padre_seguimiento.js

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

    const rolId = rolRes.rows[0].id;
    console.log(`✅ Rol 'padre' encontrado — id: ${rolId}`);

    // ── 2. Permisos del padre ─────────────────────────────────
    // Solo puede ver sus propias observaciones y acusar recibo.
    // El filtro real por hijo lo hace el backend con padre_familia_id.
    const permisosPadre = [
      // Ver sus propias observaciones
      'observacion_pedagogica.ver_padre',
      // Confirmar lectura (acuse de recibo)
      'observacion_pedagogica.acusar',
      // Ver catálogo (para mostrar nombres de categorías en la UI)
      'categoria_observacion.leer',
    ];

    // ── 3. Buscar permisos en BD ──────────────────────────────
    const permisosRes = await client.query(
      `SELECT id, nombre FROM permisos WHERE nombre = ANY($1)`,
      [permisosPadre]
    );

    const encontrados   = permisosRes.rows.map(p => p.nombre);
    const noEncontrados = permisosPadre.filter(p => !encontrados.includes(p));

    if (noEncontrados.length > 0) {
      console.warn('\n⚠️  Permisos no encontrados en BD (¿corriste el migration?):');
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
      `, [rolId, permiso.id]);

      if (res.rowCount > 0) {
        insertados++;
        console.log(`   ✅ Asignado:    ${permiso.nombre}`);
      } else {
        yaExistian++;
        console.log(`   ⏭️  Ya existía: ${permiso.nombre}`);
      }
    }

    await client.query('COMMIT');

    console.log(`
╔══════════════════════════════════════════════════════╗
║  SEED PADRE — SEGUIMIENTO PEDAGÓGICO                ║
╠══════════════════════════════════════════════════════╣
║  Rol:             padre (id: ${String(rolId).padEnd(21)}║
║  Insertados:      ${String(insertados).padEnd(34)}║
║  Ya existían:     ${String(yaExistian).padEnd(34)}║
║  No encontrados:  ${String(noEncontrados.length).padEnd(34)}║
╚══════════════════════════════════════════════════════╝

👨‍👩‍👧 El padre PUEDE:
   ✔ Ver observaciones de sus propios hijos (solo las visibles)
   ✔ Confirmar lectura de una observación (acuse de recibo)
   ✔ Dejar un comentario al acusar recibo
   ✔ Ver nombres de categorías en la UI

⚠️  El padre NO puede:
   ✖ Ver observaciones marcadas como internas (visible_para_padre = false)
   ✖ Crear observaciones
   ✖ Editar o eliminar nada
   ✖ Ver observaciones de estudiantes que no son sus hijos
   ✖ Ver el panel del docente ni los reportes
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