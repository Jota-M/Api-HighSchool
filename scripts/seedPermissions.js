import { pool } from '../src/db/pool.js'; // ajusta la ruta a tu pool

async function seedPermissions() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🌱 Iniciando seed de permisos y roles...');

    // 1️⃣ ROLES BASE
    const roles = [
      { nombre: 'super_admin', descripcion: 'Administrador del sistema con todos los permisos', es_sistema: true },
      { nombre: 'admin', descripcion: 'Administrador general del sistema', es_sistema: true },
      { nombre: 'secretaria', descripcion: 'Gestión administrativa del colegio', es_sistema: true },
      { nombre: 'docente', descripcion: 'Profesor con acceso a estudiantes, cursos y calificaciones', es_sistema: true },
      { nombre: 'profesor', descripcion: 'Docente con acceso a su portal de clases', es_sistema: true },
      { nombre: 'estudiante', descripcion: 'Usuario con acceso limitado a sus cursos y calificaciones', es_sistema: true },
      { nombre: 'padre', descripcion: 'Padre o tutor con acceso al portal de seguimiento académico', es_sistema: true },
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
      console.log(`  ✓ Rol: ${rol.nombre}`);
    }

    // 2️⃣ PERMISOS GRANULARES
    const modulos = [
      'usuarios',
      'estudiantes',
      'docentes',
      'padres',
      'periodos',
      'niveles',
      'paralelos',
      'materias',
      'asignaciones',
      'horarios',
      'calificaciones',
      'reportes',
      'configuracion',
      'alertas',
      'asistencia',
    ];
    const acciones = ['crear', 'leer', 'actualizar', 'eliminar'];

    const permisosCreados = [];
    for (const modulo of modulos) {
      for (const accion of acciones) {
        const nombre = `${modulo}.${accion}`;
        const descripcion = `Permiso para ${accion} en ${modulo}`;
        const result = await client.query(
          `INSERT INTO permisos (modulo, accion, nombre, descripcion)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion
           RETURNING *`,
          [modulo, accion, nombre, descripcion]
        );
        permisosCreados.push(result.rows[0]);
      }
    }
    console.log(`  ✓ ${permisosCreados.length} permisos creados`);

    // 3️⃣ ASIGNACIÓN DE PERMISOS A ROLES

    // SUPER ADMIN: todos los permisos
    const superAdmin = rolesCreados.find(r => r.nombre === 'super_admin');
    for (const permiso of permisosCreados) {
      await client.query(
        `INSERT INTO rol_permisos (rol_id, permiso_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [superAdmin.id, permiso.id]
      );
    }
    console.log('  ✓ Super Admin con todos los permisos');

    // ADMIN: todos menos eliminar usuarios
    const admin = rolesCreados.find(r => r.nombre === 'admin');
    const permisosAdmin = permisosCreados.filter(
      p => !(p.modulo === 'usuarios' && p.accion === 'eliminar')
    );
    for (const permiso of permisosAdmin) {
      await client.query(
        `INSERT INTO rol_permisos (rol_id, permiso_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [admin.id, permiso.id]
      );
    }
    console.log(`  ✓ Admin: ${permisosAdmin.length} permisos`);

    // SECRETARIA: gestión académica y administrativa
    const secretaria = rolesCreados.find(r => r.nombre === 'secretaria');
    const permisosSecretaria = permisosCreados.filter(p =>
      [
        'estudiantes', 'docentes', 'padres',
        'periodos', 'niveles', 'paralelos',
        'materias', 'asignaciones', 'horarios'
      ].includes(p.modulo) &&
      ['crear', 'leer', 'actualizar'].includes(p.accion)
    );
    for (const permiso of permisosSecretaria) {
      await client.query(
        `INSERT INTO rol_permisos (rol_id, permiso_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [secretaria.id, permiso.id]
      );
    }
    console.log(`  ✓ Secretaria: ${permisosSecretaria.length} permisos`);

    // DOCENTE: gestión parcial académica
    const docente = rolesCreados.find(r => r.nombre === 'docente');
    const permisosDocente = permisosCreados.filter(p =>
      ['estudiantes', 'calificaciones', 'materias', 'horarios', 'asistencia'].includes(p.modulo) &&
      ['leer', 'crear', 'actualizar'].includes(p.accion)
    );
    for (const permiso of permisosDocente) {
      await client.query(
        `INSERT INTO rol_permisos (rol_id, permiso_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [docente.id, permiso.id]
      );
    }
    console.log(`  ✓ Docente: ${permisosDocente.length} permisos`);

    // PROFESOR (Portal Profesor)
    const profesor = rolesCreados.find(r => r.nombre === 'profesor');
    const permisosProfesor = permisosCreados.filter(p =>
      ['materias', 'calificaciones', 'asistencia', 'horarios'].includes(p.modulo) &&
      ['leer', 'crear', 'actualizar'].includes(p.accion)
    );
    for (const permiso of permisosProfesor) {
      await client.query(
        `INSERT INTO rol_permisos (rol_id, permiso_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [profesor.id, permiso.id]
      );
    }
    console.log(`  ✓ Profesor: ${permisosProfesor.length} permisos`);

    // ESTUDIANTE: solo lectura de materias, horarios y calificaciones
    const estudiante = rolesCreados.find(r => r.nombre === 'estudiante');
    const permisosEstudiante = permisosCreados.filter(p =>
      ['materias', 'calificaciones', 'horarios', 'asistencia'].includes(p.modulo) &&
      p.accion === 'leer'
    );
    for (const permiso of permisosEstudiante) {
      await client.query(
        `INSERT INTO rol_permisos (rol_id, permiso_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [estudiante.id, permiso.id]
      );
    }
    console.log(`  ✓ Estudiante: ${permisosEstudiante.length} permisos`);

    // PADRE: lectura de calificaciones, asistencia, alertas y horarios
    const padre = rolesCreados.find(r => r.nombre === 'padre');
    const permisosPadre = permisosCreados.filter(p =>
      ['calificaciones', 'asistencia', 'alertas', 'horarios'].includes(p.modulo) &&
      p.accion === 'leer'
    );
    for (const permiso of permisosPadre) {
      await client.query(
        `INSERT INTO rol_permisos (rol_id, permiso_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [padre.id, permiso.id]
      );
    }
    console.log(`  ✓ Padre: ${permisosPadre.length} permisos`);

    await client.query('COMMIT');
    console.log('✅ Seed completado correctamente.');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error durante el seed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seedPermissions()
  .then(() => console.log('🎉 Proceso finalizado'))
  .catch(err => console.error('Error fatal:', err));
