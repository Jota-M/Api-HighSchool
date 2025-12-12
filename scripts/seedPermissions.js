import { pool } from '../src/db/pool.js';

async function seedPermissions() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('🌱 Iniciando seed de permisos y roles...');

    // ============================================
    // 1️⃣ CREAR ROLES BASE
    // ============================================
    console.log('📝 Creando roles...');
    const roles = [
      { nombre: 'super_admin', descripcion: 'Administrador del sistema con todos los permisos', es_sistema: true },
      { nombre: 'secretaria', descripcion: 'Gestión administrativa del colegio', es_sistema: true },
      { nombre: 'docente', descripcion: 'Profesor con acceso a estudiantes, cursos y calificaciones', es_sistema: true },
      { nombre: 'estudiante', descripcion: 'Usuario con acceso limitado a sus cursos y calificaciones', es_sistema: true },
      { nombre: 'padre', descripcion: 'Padre o tutor con acceso al seguimiento académico', es_sistema: true },
    ];

    const rolesCreados = [];
    for (const rol of roles) {
      const result = await client.query(
        `INSERT INTO roles (nombre, descripcion, es_sistema)
         VALUES ($1, $2, $3)
         ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion
         RETURNING *`,
        [rol.nombre, rol.descripcion, rol.es_sistema]
      );
      rolesCreados.push(result.rows[0]);
      console.log(`  ✓ Rol creado/actualizado: ${rol.nombre}`);
    }

    // ============================================
    // 2️⃣ PERMISOS GENERALES CRUD
    // ============================================
    console.log('📝 Creando permisos CRUD generales...');
    const modulosGenerales = [
      'usuarios', 'estudiantes', 'docentes', 'padres', 'periodos', 'niveles', 'paralelos',
      'materias', 'horarios', 'calificaciones', 'reportes', 'configuracion',
      'alertas', 'asistencia', 'roles', 'permisos', 'sesiones', 'actividad',
      'preinscripciones', 'matriculacion', 'plan_estudio'
    ];
    const acciones = ['crear', 'leer', 'actualizar', 'eliminar'];
    const permisosGenerales = [];

    for (const modulo of modulosGenerales) {
      for (const accion of acciones) {
        const nombre = `${modulo}.${accion}`;
        const descripcion = `Permiso para ${accion} en ${modulo}`;
        const result = await client.query(
          `INSERT INTO permisos (modulo, accion, nombre, descripcion)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (nombre) DO NOTHING
           RETURNING *`,
          [modulo, accion, nombre, descripcion]
        );
        if (result.rows[0]) permisosGenerales.push(result.rows[0]);
      }
    }

    // ============================================
    // 2.1️⃣ PERMISOS ACADÉMICOS ADICIONALES
    // ============================================
    console.log('📝 Creando permisos académicos adicionales...');
    const modulosAcademicos = [
      'periodo_academico',
      'turno',
      'nivel_academico',
      'grado',
      'paralelo'
    ];
    const permisosAcademicos = [];
    for (const modulo of modulosAcademicos) {
      for (const accion of acciones) {
        const nombre = `${modulo}.${accion}`;
        const descripcion = `Permiso para ${accion} en ${modulo.replace('_', ' ')}`;
        const result = await client.query(
          `INSERT INTO permisos (modulo, accion, nombre, descripcion)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (nombre) DO NOTHING
           RETURNING *`,
          [modulo, accion, nombre, descripcion]
        );
        if (result.rows[0]) permisosAcademicos.push(result.rows[0]);
      }
    }

    // ============================================
    // 2.2️⃣ PERMISOS PARA MÓDULO DE MATERIAS COMPLETO
    // ============================================
    console.log("📝 Insertando permisos área_conocimiento, materia, grado_materia...");
    const modulosMaterias = {
      area_conocimiento: [
        ['crear', 'Crear áreas de conocimiento'],
        ['leer', 'Ver áreas de conocimiento'],
        ['actualizar', 'Editar áreas de conocimiento'],
        ['eliminar', 'Eliminar áreas de conocimiento'],
      ],
      materia: [
        ['crear', 'Crear materias'],
        ['leer', 'Ver materias'],
        ['actualizar', 'Editar materias y prerequisitos'],
        ['eliminar', 'Eliminar materias'],
      ],
      grado_materia: [
        ['crear', 'Asignar materias a grados'],
        ['leer', 'Ver materias asignadas a grados'],
        ['actualizar', 'Editar asignaciones de materias'],
        ['eliminar', 'Remover materias de grados'],
      ],
    };

    const permisosMaterias = [];
    for (const modulo in modulosMaterias) {
      for (const [accion, descripcion] of modulosMaterias[modulo]) {
        const nombre = `${modulo}.${accion}`;
        const result = await client.query(
          `INSERT INTO permisos (modulo, accion, nombre, descripcion)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (nombre) DO NOTHING
           RETURNING *`,
          [modulo, accion, nombre, descripcion]
        );
        if (result.rows[0]) permisosMaterias.push(result.rows[0]);
      }
    }

    // ============================================
    // 3️⃣ ASIGNACIÓN DE PERMISOS A ROLES
    // ============================================
    console.log('📝 Asignando permisos a roles...');

    const superAdmin = rolesCreados.find((r) => r.nombre === 'super_admin');
    const secretaria = rolesCreados.find((r) => r.nombre === 'secretaria');
    const docente = rolesCreados.find((r) => r.nombre === 'docente');
    const estudiante = rolesCreados.find((r) => r.nombre === 'estudiante');
    const padre = rolesCreados.find((r) => r.nombre === 'padre');

    const ALL = [...permisosGenerales, ...permisosAcademicos, ...permisosMaterias];

    // ============================================
    // SUPER ADMIN = TODOS LOS PERMISOS
    // ============================================
    console.log('  → Asignando permisos a super_admin...');
    for (const p of ALL) {
      await client.query(
        `INSERT INTO rol_permisos (rol_id, permiso_id) 
         VALUES ($1, $2) 
         ON CONFLICT DO NOTHING`,
        [superAdmin.id, p.id]
      );
    }

    // ============================================
    // SECRETARIA
    // ============================================
    console.log('  → Asignando permisos a secretaria...');
    const PERM_SECRETARIA = ALL.filter(p =>
      [
        'estudiantes', 'docentes', 'padres', 'periodos', 'niveles', 'paralelos', 
        'materias', 'horarios', 'preinscripciones', 'matriculacion', 'plan_estudio',
        'periodo_academico', 'turno', 'nivel_academico', 'grado', 'paralelo',
        'area_conocimiento', 'materia', 'grado_materia', 'usuarios'
      ].includes(p.modulo) && ['crear', 'leer', 'actualizar'].includes(p.accion)
    );
    for (const p of PERM_SECRETARIA) {
      await client.query(
        `INSERT INTO rol_permisos (rol_id, permiso_id) 
         VALUES ($1, $2) 
         ON CONFLICT DO NOTHING`,
        [secretaria.id, p.id]
      );
    }

    // ============================================
    // DOCENTE
    // ============================================
    console.log('  → Asignando permisos a docente...');
    const PERM_DOCENTE = ALL.filter(p =>
      [
        'estudiantes', 'calificaciones', 'materias', 'horarios', 'asistencia',
        'plan_estudio', 'materia', 'grado_materia'
      ].includes(p.modulo) && ['crear', 'leer', 'actualizar'].includes(p.accion)
    );
    for (const p of PERM_DOCENTE) {
      await client.query(
        `INSERT INTO rol_permisos (rol_id, permiso_id) 
         VALUES ($1, $2) 
         ON CONFLICT DO NOTHING`,
        [docente.id, p.id]
      );
    }

    // ============================================
    // ESTUDIANTE
    // ============================================
    console.log('  → Asignando permisos a estudiante...');
    const PERM_ESTUD = ALL.filter(p =>
      ['materias', 'calificaciones', 'horarios', 'asistencia'].includes(p.modulo) &&
      ['leer'].includes(p.accion)
    );
    for (const p of PERM_ESTUD) {
      await client.query(
        `INSERT INTO rol_permisos (rol_id, permiso_id) 
         VALUES ($1, $2) 
         ON CONFLICT DO NOTHING`,
        [estudiante.id, p.id]
      );
    }

    // ============================================
    // PADRE
    // ============================================
    console.log('  → Asignando permisos a padre...');
    const PERM_PADRE = ALL.filter(p =>
      ['calificaciones', 'asistencia', 'alertas', 'horarios'].includes(p.modulo) &&
      ['leer'].includes(p.accion)
    );
    for (const p of PERM_PADRE) {
      await client.query(
        `INSERT INTO rol_permisos (rol_id, permiso_id) 
         VALUES ($1, $2) 
         ON CONFLICT DO NOTHING`,
        [padre.id, p.id]
      );
    }

    await client.query('COMMIT');
    console.log(`\n✅ Seed completado con éxito`);
    console.log(`\n📊 Resumen:`);
    console.log(`   - Roles creados: ${rolesCreados.length}`);
    console.log(`   - Permisos totales: ${ALL.length}`);
    console.log(`   - Super Admin: ${ALL.length} permisos`);
    console.log(`   - Secretaria: ${PERM_SECRETARIA.length} permisos`);
    console.log(`   - Docente: ${PERM_DOCENTE.length} permisos`);
    console.log(`   - Estudiante: ${PERM_ESTUD.length} permisos`);
    console.log(`   - Padre: ${PERM_PADRE.length} permisos`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en seed:', err);
    throw err;
  } finally {
    client.release();
  }
}

seedPermissions()
  .then(() => {
    console.log('✅ Proceso finalizado');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
  });