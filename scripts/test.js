// import { createInterface } from 'readline';
// import { pool } from '../src/db/pool.js';

// const rl = createInterface({ input: process.stdin, output: process.stdout });
// function ask(q) { return new Promise(resolve => rl.question(q, resolve)); }

// async function migrarBloquesHorario() {
//   const client = await pool.connect();
//   try {
//     console.log('\n🔧 MIGRACIÓN: BLOQUES HORARIO → SOPORTE POR NIVEL ACADÉMICO');
//     console.log('━'.repeat(60));
//     console.log('\nEsta migración realiza los siguientes cambios:\n');
//     console.log('  1️⃣  Agrega columna nivel_academico_id a bloque_horario');
//     console.log('  2️⃣  Reemplaza el índice único (turno_id, numero)');
//     console.log('       por dos índices parciales:');
//     console.log('       • (turno_id, nivel_academico_id, numero) cuando nivel presente');
//     console.log('       • (turno_id, numero) cuando no hay nivel (retrocompat.)');
//     console.log('  3️⃣  Elimina los bloques semilla genéricos anteriores (si existen)');
//     console.log('  4️⃣  Inserta los bloques reales de la institución:');
//     console.log('');
//     console.log('       TURNO MAÑANA');
//     console.log('       ├─ Inicial:    Ingreso 09:00 → 12:00');
//     console.log('       ├─ Primaria:   3 horas + 2 recreos (07:45 → 12:00)');
//     console.log('       └─ Secundaria: 3 horas + 1 recreo  (07:45 → 12:00)');
//     console.log('');
//     console.log('       TURNO TARDE');
//     console.log('       ├─ Inicial:    Ingreso 14:00 → 17:00');
//     console.log('       ├─ Primaria:   3 horas + 2 recreos (13:45 → 17:45)');
//     console.log('       └─ Secundaria: 3 horas + 1 recreo  (13:45 → 17:45)');
//     console.log('');
//     console.log('⚠️  REQUISITO: Las tablas turno y nivel_academico deben');
//     console.log('    tener registros con nombres que coincidan.');
//     console.log('');

//     const confirm = await ask('¿Deseas continuar? (SI para confirmar): ');
//     if (confirm.trim() !== 'SI') {
//       console.log('\n❌ Cancelado — no se realizaron cambios.');
//       process.exit(0);
//     }

//     await client.query('BEGIN');
//     console.log('\n⏳ Procesando...\n');

//     // ─────────────────────────────────────────────
//     // PASO 1: Agregar columna nivel_academico_id
//     // ─────────────────────────────────────────────
//     console.log('📋 Paso 1/4 — Agregando columna nivel_academico_id...');

//     // Verificar si ya existe para que sea idempotente
//     const { rows: cols } = await client.query(`
//       SELECT column_name FROM information_schema.columns
//       WHERE table_name = 'bloque_horario' AND column_name = 'nivel_academico_id'
//     `);

//     if (cols.length === 0) {
//       await client.query(`
//         ALTER TABLE bloque_horario
//           ADD COLUMN nivel_academico_id INTEGER REFERENCES nivel_academico(id)
//       `);
//       console.log('  ✅ Columna nivel_academico_id agregada');
//     } else {
//       console.log('  ℹ️  Columna nivel_academico_id ya existe — se omite');
//     }

//     // ─────────────────────────────────────────────
//     // PASO 2: Reemplazar índice único
//     // ─────────────────────────────────────────────
//     console.log('\n📋 Paso 2/4 — Limpiando tabla y actualizando índices únicos...');

//     // Vaciar tabla: de ahora en adelante TODOS los bloques tienen nivel_academico_id
//     // Es seguro porque horario_detalle aún no tiene datos (módulo recién creado)
//     await client.query(`TRUNCATE TABLE bloque_horario RESTART IDENTITY CASCADE`);
//     console.log('  ✅ Tabla bloque_horario vaciada');

//     // Eliminar constraints/índices anteriores que puedan interferir
//     await client.query(`
//       ALTER TABLE bloque_horario
//         DROP CONSTRAINT IF EXISTS bloque_horario_turno_id_numero_key
//     `);
//     await client.query(`DROP INDEX IF EXISTS uq_bloque_turno_nivel_numero`);
//     await client.query(`DROP INDEX IF EXISTS uq_bloque_turno_numero_sin_nivel`);
//     await client.query(`DROP INDEX IF EXISTS idx_bloque_horario_nivel`);

//     // Índice único principal: turno + nivel + numero (todos los bloques tendrán nivel)
//     await client.query(`
//       CREATE UNIQUE INDEX uq_bloque_turno_nivel_numero
//         ON bloque_horario (turno_id, nivel_academico_id, numero)
//         WHERE nivel_academico_id IS NOT NULL
//     `);

//     // Índice de búsqueda por nivel
//     await client.query(`
//       CREATE INDEX idx_bloque_horario_nivel
//         ON bloque_horario(nivel_academico_id)
//     `);

//     console.log('  ✅ 2 índices configurados');

//     // ─────────────────────────────────────────────
//     // PASO 3: omitido — ya se limpió con TRUNCATE
//     // ─────────────────────────────────────────────
//     console.log('\n📋 Paso 3/4 — Limpieza ya realizada en paso anterior (TRUNCATE)');
//     // ─────────────────────────────────────────────
//     // PASO 4: Insertar bloques reales por turno × nivel
//     // ─────────────────────────────────────────────
//     console.log('\n📋 Paso 4/4 — Insertando bloques reales...');

//     // Definición completa basada en la foto de la institución
//     const grupos = [
//       // ══════════════════════════════════════════
//       // TURNO MAÑANA
//       // ══════════════════════════════════════════
//       {
//         turnoNombres: ['mañana'],
//         nivelNombres: ['educación inicial'],
//         filas: [
//           { nombre: 'Ingreso', codigo: 'BLQ-M-INI-01', num: 1, ini: '09:00', fin: '12:00', recreo: false },
//         ],
//       },
//       {
//         turnoNombres: ['mañana'],
//         nivelNombres: ['educación primaria'],
//         filas: [
//           { nombre: 'Primera Hora', codigo: 'BLQ-M-PRI-01', num: 1, ini: '07:45', fin: '09:00', recreo: false },
//           { nombre: 'Recreo', codigo: 'BLQ-M-PRI-R1', num: 2, ini: '09:00', fin: '09:10', recreo: true },
//           { nombre: 'Segunda Hora', codigo: 'BLQ-M-PRI-02', num: 3, ini: '09:10', fin: '10:35', recreo: false },
//           { nombre: 'Recreo', codigo: 'BLQ-M-PRI-R2', num: 4, ini: '10:35', fin: '10:45', recreo: true },
//           { nombre: 'Tercera Hora', codigo: 'BLQ-M-PRI-03', num: 5, ini: '10:45', fin: '12:00', recreo: false },
//         ],
//       },
//       {
//         turnoNombres: ['mañana'],
//         nivelNombres: ['educación secundaria'],
//         filas: [
//           { nombre: 'Primera Hora', codigo: 'BLQ-M-SEC-01', num: 1, ini: '07:45', fin: '09:05', recreo: false },
//           { nombre: 'Segunda Hora', codigo: 'BLQ-M-SEC-02', num: 2, ini: '09:05', fin: '10:15', recreo: false },
//           { nombre: 'Recreo', codigo: 'BLQ-M-SEC-R1', num: 3, ini: '10:15', fin: '10:35', recreo: true },
//           { nombre: 'Tercera Hora', codigo: 'BLQ-M-SEC-03', num: 4, ini: '10:35', fin: '12:00', recreo: false },
//         ],
//       },

//       // ══════════════════════════════════════════
//       // TURNO TARDE
//       // ══════════════════════════════════════════
//       {
//         turnoNombres: ['tarde'],
//         nivelNombres: ['educación inicial'],
//         filas: [
//           { nombre: 'Ingreso', codigo: 'BLQ-T-INI-01', num: 1, ini: '14:00', fin: '17:00', recreo: false },
//         ],
//       },
//       {
//         turnoNombres: ['tarde'],
//         nivelNombres: ['educación primaria'],
//         filas: [
//           { nombre: 'Primera Hora', codigo: 'BLQ-T-PRI-01', num: 1, ini: '13:45', fin: '15:00', recreo: false },
//           { nombre: 'Recreo', codigo: 'BLQ-T-PRI-R1', num: 2, ini: '15:00', fin: '15:10', recreo: true },
//           { nombre: 'Segunda Hora', codigo: 'BLQ-T-PRI-02', num: 3, ini: '15:10', fin: '16:05', recreo: false },
//           { nombre: 'Recreo', codigo: 'BLQ-T-PRI-R2', num: 4, ini: '16:05', fin: '16:15', recreo: true },
//           { nombre: 'Tercera Hora', codigo: 'BLQ-T-PRI-03', num: 5, ini: '16:15', fin: '17:45', recreo: false },
//         ],
//       },
//       {
//         turnoNombres: ['tarde'],
//         nivelNombres: ['educación secundaria'],
//         filas: [
//           { nombre: 'Primera Hora', codigo: 'BLQ-T-SEC-01', num: 1, ini: '13:45', fin: '15:00', recreo: false },
//           { nombre: 'Segunda Hora', codigo: 'BLQ-T-SEC-02', num: 2, ini: '15:00', fin: '16:15', recreo: false },
//           { nombre: 'Recreo', codigo: 'BLQ-T-SEC-R1', num: 3, ini: '16:15', fin: '16:35', recreo: true },
//           { nombre: 'Tercera Hora', codigo: 'BLQ-T-SEC-03', num: 4, ini: '16:35', fin: '17:45', recreo: false },
//         ],
//       },
//     ];

//     let totalInsertados = 0;
//     let totalOmitidos = 0;

//     for (const grupo of grupos) {
//       // Buscar el turno
//       const { rows: turnos } = await client.query(
//         `SELECT id, nombre FROM turno WHERE LOWER(nombre) = ANY($1::text[]) LIMIT 1`,
//         [grupo.turnoNombres]
//       );

//       // Buscar el nivel
//       const { rows: niveles } = await client.query(
//         `SELECT id, nombre FROM nivel_academico WHERE LOWER(nombre) = ANY($1::text[]) LIMIT 1`,
//         [grupo.nivelNombres]
//       );

//       if (turnos.length === 0) {
//         console.log(`  ⚠️  Turno no encontrado para: [${grupo.turnoNombres.join(', ')}] — se omite grupo`);
//         totalOmitidos += grupo.filas.length;
//         continue;
//       }
//       if (niveles.length === 0) {
//         console.log(`  ⚠️  Nivel no encontrado para: [${grupo.nivelNombres.join(', ')}] — se omite grupo`);
//         totalOmitidos += grupo.filas.length;
//         continue;
//       }

//       const turnoId = turnos[0].id;
//       const nivelId = niveles[0].id;

//       for (const f of grupo.filas) {
//         const { rowCount } = await client.query(`
//           INSERT INTO bloque_horario
//             (turno_id, nivel_academico_id, nombre, codigo, numero, hora_inicio, hora_fin, es_recreo)
//           VALUES ($1, $2, $3, $4, $5, $6::TIME, $7::TIME, $8)
//           ON CONFLICT (codigo) DO NOTHING
//         `, [turnoId, nivelId, f.nombre, f.codigo, f.num, f.ini, f.fin, f.recreo]);

//         if (rowCount > 0) totalInsertados++;
//         else totalOmitidos++;
//       }

//       console.log(`  ✅ Turno "${turnos[0].nombre}" + Nivel "${niveles[0].nombre}" — ${grupo.filas.length} bloques`);
//     }

//     // ─────────────────────────────────────────────
//     // Verificar resultado
//     // ─────────────────────────────────────────────
//     const { rows: resumen } = await client.query(`
//       SELECT
//         t.nombre  AS turno,
//         n.nombre  AS nivel,
//         COUNT(*)  AS bloques,
//         MIN(bh.hora_inicio::text) AS desde,
//         MAX(bh.hora_fin::text)    AS hasta
//       FROM bloque_horario bh
//       INNER JOIN turno t           ON bh.turno_id = t.id
//       LEFT  JOIN nivel_academico n ON bh.nivel_academico_id = n.id
//       WHERE bh.activo = true
//       GROUP BY t.nombre, n.nombre
//       ORDER BY t.nombre DESC, n.nombre
//     `);

//     await client.query('COMMIT');

//     // ─────────────────────────────────────────────
//     // Resumen final
//     // ─────────────────────────────────────────────
//     console.log('\n✅ ¡Migración completada exitosamente!\n');
//     console.log('📊 ESTADO FINAL DE BLOQUES HORARIOS:');
//     console.log('┌──────────────────┬──────────────┬────────┬────────────────────┐');
//     console.log('│ Turno            │ Nivel        │ Bloq.  │ Rango horario      │');
//     console.log('├──────────────────┼──────────────┼────────┼────────────────────┤');
//     for (const r of resumen) {
//       const turno = (r.turno || '—').padEnd(16);
//       const nivel = (r.nivel || '—').padEnd(12);
//       const bloq = String(r.bloques).padEnd(6);
//       const rango = `${r.desde?.slice(0, 5)} → ${r.hasta?.slice(0, 5)}`.padEnd(18);
//       console.log(`│ ${turno} │ ${nivel} │ ${bloq} │ ${rango} │`);
//     }
//     console.log('└──────────────────┴──────────────┴────────┴────────────────────┘');
//     console.log(`\n   Insertados: ${totalInsertados}   Omitidos/ya existían: ${totalOmitidos}`);

//     console.log('\n💡 Próximos pasos:');
//     console.log('   1. Actualizar BloqueHorario.findAll() para filtrar por nivel_academico_id');
//     console.log('   2. Actualizar BloqueHorarioController.listar() para recibir nivel_academico_id');
//     console.log('   3. En el frontend, al cargar bloques pasar turno_id + nivel_academico_id');
//     console.log('      Ejemplo: GET /api/horarios/bloques?turno_id=1&nivel_academico_id=2\n');

//   } catch (error) {
//     await client.query('ROLLBACK');
//     console.error('\n💥 Error — se revirtieron todos los cambios');
//     console.error('   Mensaje:', error.message);

//     // Ayuda diagnóstica para errores comunes
//     if (error.message.includes('nivel_academico')) {
//       console.error('\n   💡 Verificá que la tabla nivel_academico existe y tiene registros.');
//     }
//     if (error.message.includes('turno')) {
//       console.error('\n   💡 Verificá que la tabla turno existe y tiene registros.');
//     }
//     if (error.message.includes('foreign key') || error.message.includes('llave foránea')) {
//       console.error('\n   💡 Hay horario_detalle existente que referencia bloques que se intentaron borrar.');
//       console.error('      Borrá los horario_detalle antes de ejecutar la migración,');
//       console.error('      o remové los códigos del array codigosAnteriores si no querés borrarlos.');
//     }
//     console.error(error.stack);
//   } finally {
//     client.release();
//     rl.close();
//     process.exit(0);
//   }
// }

// migrarBloquesHorario().catch(err => {
//   console.error('💥 Error fatal:', err);
//   process.exit(1);
// });
// scripts/diagnosticoAsignacion.js
// seeds/ver_superadmin_permisos.js

// seeds/crear_permisos_mensualidades.js

// import { pool } from '../src/db/pool.js';

// async function crearPermisosMensualidades() {
//     const client = await pool.connect();

//     try {
//         console.log('\n💰 CREANDO PERMISOS DE MENSUALIDADES\n');

//         await client.query('BEGIN');

//         const permisos = [
//             // COSTOS
//             ['costo_mensualidad', 'leer', 'Ver costos de mensualidad'],
//             ['costo_mensualidad', 'crear', 'Crear costos de mensualidad'],
//             ['costo_mensualidad', 'actualizar', 'Actualizar costos de mensualidad'],
//             ['costo_mensualidad', 'eliminar', 'Eliminar costos de mensualidad'],

//             // MENSUALIDAD
//             ['mensualidad', 'leer', 'Ver mensualidades'],
//             ['mensualidad', 'generar', 'Generar mensualidades'],
//             ['mensualidad', 'anular', 'Anular mensualidades'],

//             // PAGOS
//             ['pago_mensualidad', 'leer', 'Ver pagos de mensualidades'],
//             ['pago_mensualidad', 'crear', 'Registrar pagos de mensualidades'],
//             ['pago_mensualidad', 'actualizar', 'Actualizar pagos de mensualidades'],
//             ['pago_mensualidad', 'anular', 'Anular pagos de mensualidades'],

//             // REPORTES
//             ['reportes_pagos', 'ver_estado_estudiante', 'Ver estado de cuenta de estudiantes'],
//             ['reportes_pagos', 'ver_ingresos', 'Ver reporte de ingresos'],
//             ['reportes_pagos', 'ver_morosos', 'Ver reporte de morosos']
//         ];

//         let creados = 0;

//         for (const [modulo, accion, descripcion] of permisos) {

//             const nombre = `${modulo}.${accion}`;

//             const existe = await client.query(
//                 `SELECT id FROM permisos WHERE nombre = $1`,
//                 [nombre]
//             );

//             if (existe.rows.length === 0) {
//                 await client.query(
//                     `
//           INSERT INTO permisos (modulo, accion, nombre, descripcion)
//           VALUES ($1, $2, $3, $4)
//           `,
//                     [modulo, accion, nombre, descripcion]
//                 );

//                 console.log(`✅ ${nombre}`);
//                 creados++;
//             } else {
//                 console.log(`⚠️ Ya existe: ${nombre}`);
//             }
//         }

//         await client.query('COMMIT');

//         console.log('\n═══════════════════════════════════════');
//         console.log(`✅ Permisos creados: ${creados}`);
//         console.log('═══════════════════════════════════════\n');

//     } catch (error) {
//         await client.query('ROLLBACK');
//         console.error('\n💥 Error:', error.message);
//     } finally {
//         client.release();
//         await pool.end();
//     }
// }

// crearPermisosMensualidades();

// import { pool } from '../src/db/pool.js';

// async function crearPermisosAsignacionDocente() {
//     const client = await pool.connect();

//     try {
//         console.log('\n👨‍🏫 CREANDO PERMISOS DE ASIGNACIÓN DOCENTE\n');

//         await client.query('BEGIN');

//         const permisos = [
//             // ASIGNACIÓN DOCENTE
//             ['asignacion_docente', 'leer', 'Ver asignaciones de docentes'],
//             ['asignacion_docente', 'crear', 'Crear asignaciones de docentes'],
//             ['asignacion_docente', 'actualizar', 'Actualizar asignaciones de docentes'],
//             ['asignacion_docente', 'eliminar', 'Eliminar asignaciones de docentes'],

//             // ACCIONES ESPECÍFICAS
//             ['asignacion_docente', 'asignar', 'Asignar docente a materia/paralelo'],
//             ['asignacion_docente', 'asignar_masivo', 'Asignación masiva de docentes'],
//             ['asignacion_docente', 'copiar_periodo', 'Copiar asignaciones de otro periodo'],
//             ['asignacion_docente', 'cambiar_docente', 'Cambiar docente asignado'],

//             // CONSULTAS ESPECÍFICAS
//             ['asignacion_docente', 'ver_docente', 'Ver asignaciones por docente'],
//             ['asignacion_docente', 'ver_paralelo', 'Ver docentes por paralelo'],
//             ['asignacion_docente', 'ver_titular', 'Ver docente titular de materia'],
//         ];

//         let creados = 0;

//         for (const [modulo, accion, descripcion] of permisos) {

//             const nombre = `${modulo}.${accion}`;

//             const existe = await client.query(
//                 `SELECT id FROM permisos WHERE nombre = $1`,
//                 [nombre]
//             );

//             if (existe.rows.length === 0) {
//                 await client.query(
//                     `
//                     INSERT INTO permisos (modulo, accion, nombre, descripcion)
//                     VALUES ($1, $2, $3, $4)
//                     `,
//                     [modulo, accion, nombre, descripcion]
//                 );

//                 console.log(`✅ ${nombre}`);
//                 creados++;
//             } else {
//                 console.log(`⚠️ Ya existe: ${nombre}`);
//             }
//         }

//         await client.query('COMMIT');

//         console.log('\n═══════════════════════════════════════');
//         console.log(`✅ Permisos creados: ${creados}`);
//         console.log('═══════════════════════════════════════\n');

//     } catch (error) {
//         await client.query('ROLLBACK');
//         console.error('\n💥 Error:', error.message);
//     } finally {
//         client.release();
//         await pool.end();
//     }
// }

// crearPermisosAsignacionDocente();

// import { pool } from '../src/db/pool.js';

// async function verNotificaciones() {
//     const client = await pool.connect();

//     try {
//         console.log('\n🔎 CONSULTANDO NOTIFICACIONES\n');

//         // =============================================
//         // 1. NOTIFICACIONES PRINCIPALES
//         // =============================================
//         const notifs = await client.query(`
//       SELECT 
//         ni.id,
//         ni.codigo,
//         ni.titulo,
//         ni.mensaje,
//         ni.tipo,
//         ni.prioridad,
//         ni.audiencia,
//         ni.estado,
//         ni.created_at,
//         ni.enviada_en,

//         ni.creada_por AS creado_por_id,

//         u.username AS creado_por_username

//       FROM notificacion_institucional ni
//       LEFT JOIN usuarios u 
//         ON u.id = ni.creada_por

//       WHERE ni.codigo IN (
//         'NOTIF-2026-000034',
//         'NOTIF-2026-000035'
//       )

//       ORDER BY ni.codigo;
//     `);

//         console.log('\n📌 NOTIFICACIONES:');
//         console.table(notifs.rows);

//         // =============================================
//         // 2. DESTINATARIOS
//         // =============================================
//         const dest = await client.query(`
//       SELECT 
//         ni.codigo,
//         nd.usuario_id,

//         u.username AS destinatario,

//         nd.rol_destinatario,
//         nd.canal,
//         nd.estado_envio,
//         nd.enviado_en,
//         nd.leido,
//         nd.leido_en

//       FROM notificacion_institucional ni
//       JOIN notificacion_destinatario nd 
//         ON nd.notificacion_id = ni.id

//       LEFT JOIN usuarios u 
//         ON u.id = nd.usuario_id

//       WHERE ni.codigo IN (
//         'NOTIF-2026-000034',
//         'NOTIF-2026-000035'
//       )

//       ORDER BY ni.codigo, nd.id;
//     `);

//         console.log('\n📬 DESTINATARIOS:');
//         console.table(dest.rows);

//         // =============================================
//         // 3. RESUMEN GENERAL
//         // =============================================
//         const resumen = await client.query(`
//       SELECT 
//         ni.codigo,

//         COUNT(*) AS total_destinatarios,

//         COUNT(*) FILTER (WHERE nd.estado_envio = 'enviado') AS enviados,
//         COUNT(*) FILTER (WHERE nd.estado_envio = 'fallido') AS fallidos,
//         COUNT(*) FILTER (WHERE nd.estado_envio = 'pendiente') AS pendientes,

//         COUNT(*) FILTER (WHERE nd.leido = true) AS leidos

//       FROM notificacion_institucional ni
//       JOIN notificacion_destinatario nd 
//         ON nd.notificacion_id = ni.id

//       WHERE ni.codigo IN (
//         'NOTIF-2026-000034',
//         'NOTIF-2026-000035'
//       )

//       GROUP BY ni.codigo
//       ORDER BY ni.codigo;
//     `);

//         console.log('\n📊 RESUMEN:');
//         console.table(resumen.rows);

//         console.log('\n✅ CONSULTA FINALIZADA CORRECTAMENTE\n');

//     } catch (err) {
//         console.error('\n💥 ERROR:', err.message);
//         console.error(err.stack);
//     } finally {
//         client.release();
//         await pool.end();
//     }
// }

// // verNotificaciones();

// import { pool } from '../src/db/pool.js';

// async function consultarMensualidadesEstudiante(estudianteId) {
//   const client = await pool.connect();

//   try {
//     console.log(`\n🧾 CONSULTANDO MENSUALIDADES DEL ESTUDIANTE ${estudianteId}\n`);

//     const { rows } = await client.query(
//       `
//             SELECT
//                 m.id AS mensualidad_id,
//                 m.estado,
//                 m.mes_correspondiente,
//                 m.numero_cuota,

//                 pm.id AS pago_id,
//                 pm.metodo_pago,
//                 pm.qr_estado,
//                 pm.fecha_pago,
//                 pm.transaccion_id,
//                 pm.monto_pagado

//             FROM mensualidad m

//             LEFT JOIN pago_mensualidad pm
//                 ON pm.mensualidad_id = m.id

//             WHERE m.matricula_id IN (
//                 SELECT id
//                 FROM matricula
//                 WHERE estudiante_id = $1
//             )

//             ORDER BY m.numero_cuota;
//             `,
//       [estudianteId]
//     );

//     console.log('═══════════════════════════════════════');
//     console.table(rows);
//     console.log(`✅ Registros encontrados: ${rows.length}`);
//     console.log('═══════════════════════════════════════\n');

//   } catch (error) {
//     console.error('\n💥 Error:', error.message);
//   } finally {
//     client.release();
//     await pool.end();
//   }
// }

// // Reemplazá por el ID del estudiante que quieras consultar
// consultarMensualidadesEstudiante(12);
import { pool } from '../src/db/pool.js';

async function actualizarMensualidadesVencidas() {
  const client = await pool.connect();

  try {
    console.log('\n📅 ACTUALIZANDO MENSUALIDADES VENCIDAS\n');

    await client.query('BEGIN');

    const { rowCount } = await client.query(
      `
            UPDATE mensualidad
            SET
                estado = 'vencido',
                updated_at = CURRENT_TIMESTAMP
            WHERE estado = 'pendiente'
              AND fecha_vencimiento < CURRENT_DATE;
            `
    );

    await client.query('COMMIT');

    console.log('═══════════════════════════════════════');
    console.log(`✅ Mensualidades actualizadas: ${rowCount}`);
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

actualizarMensualidadesVencidas();