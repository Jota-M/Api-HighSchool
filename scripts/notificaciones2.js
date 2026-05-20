// scripts/seed_notificaciones_completo.js
// Ejecutar DESPUÉS de migration_notificaciones.js
// node scripts/seed_notificaciones_completo.js
import { pool } from '../src/db/pool.js';

async function seedNotificaciones() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('\n🌱 SEED: NOTIFICACIONES INSTITUCIONALES\n');

    // ─── 1. Agregar columna foto si no existe ────────────────────
    console.log('📸 Agregando soporte de fotos...');
    await client.query(`
      ALTER TABLE notificacion_institucional
        ADD COLUMN IF NOT EXISTS foto_url        TEXT,
        ADD COLUMN IF NOT EXISTS foto_public_id  VARCHAR(200)
    `);
    console.log('  ✅ Columnas foto_url y foto_public_id agregadas');

    // ─── 2. Permisos del módulo ───────────────────────────────────
    console.log('\n🔐 Insertando permisos...');
    await client.query(`
      INSERT INTO permisos (modulo, accion, nombre, descripcion) VALUES
        ('notificaciones', 'leer',     'notificaciones.leer',     'Ver notificaciones institucionales'),
        ('notificaciones', 'crear',    'notificaciones.crear',    'Crear notificaciones institucionales'),
        ('notificaciones', 'enviar',   'notificaciones.enviar',   'Enviar/despachar notificaciones'),
        ('notificaciones', 'eliminar', 'notificaciones.eliminar', 'Eliminar notificaciones'),
        ('notificaciones', 'gestionar','notificaciones.gestionar','Gestión completa de notificaciones')
      ON CONFLICT (nombre) DO NOTHING
    `);
    console.log('  ✅ Permisos insertados');

    // ─── 3. Asignar permisos a roles ──────────────────────────────
    console.log('\n👥 Asignando permisos a roles...');

    // Helper: asignar lista de permisos a un rol por nombre
    const asignar = async (rolNombre, permisos) => {
      const rolRes = await client.query(
        `SELECT id FROM roles WHERE nombre = $1`, [rolNombre]
      );
      if (!rolRes.rows[0]) {
        console.log(`  ⚠️  Rol "${rolNombre}" no encontrado — omitido`);
        return;
      }
      const rolId = rolRes.rows[0].id;

      for (const permNombre of permisos) {
        const permRes = await client.query(
          `SELECT id FROM permisos WHERE nombre = $1`, [permNombre]
        );
        if (!permRes.rows[0]) continue;
        await client.query(`
          INSERT INTO rol_permisos (rol_id, permiso_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [rolId, permRes.rows[0].id]);
      }
      console.log(`  ✅ ${rolNombre}: ${permisos.length} permisos asignados`);
    };

    // super_admin → gestión completa
    await asignar('super_admin', [
      'notificaciones.leer',
      'notificaciones.crear',
      'notificaciones.enviar',
      'notificaciones.eliminar',
      'notificaciones.gestionar',
    ]);

    // secretaria → crear, enviar, leer, eliminar (no gestionar)
    await asignar('secretaria', [
      'notificaciones.leer',
      'notificaciones.crear',
      'notificaciones.enviar',
      'notificaciones.eliminar',
    ]);

    // docente → solo ver sus notificaciones internas (bandeja)
    // No necesita permiso especial — el endpoint /mis-notificaciones
    // solo requiere authenticate, no authorize
    // Pero le damos leer para el historial general si se necesita
    // (comentado — descomentá si querés que vean el historial)
    // await asignar('docente', ['notificaciones.leer']);

    // padre, estudiante → solo bandeja interna (sin permiso especial)
    // El endpoint GET /mis-notificaciones solo requiere authenticate

    console.log('\n  📋 Resumen de accesos:');
    console.log('     admin      → crear, enviar, leer, eliminar, gestionar');
    console.log('     secretaria → crear, enviar, leer, eliminar');
    console.log('     docente    → solo bandeja interna (mis-notificaciones)');
    console.log('     padre      → solo bandeja interna (mis-notificaciones)');
    console.log('     estudiante → solo bandeja interna (mis-notificaciones)');

    // ─── 4. Verificar roles existentes ───────────────────────────
    console.log('\n🔍 Verificando roles en BD...');
    const rolesRes = await client.query(`SELECT nombre FROM roles ORDER BY nombre`);
    const roles = rolesRes.rows.map(r => r.nombre);
    console.log('  Roles encontrados:', roles.join(', '));

    // ─── 5. Actualizar la función generadora de código ────────────
    console.log('\n🔧 Actualizando función generadora de código...');
    await client.query(`
      CREATE OR REPLACE FUNCTION generar_codigo_notificacion()
      RETURNS VARCHAR AS $$
      DECLARE
        v_anio  INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
        v_ultimo VARCHAR;
        v_num   INTEGER;
      BEGIN
        SELECT codigo INTO v_ultimo
        FROM notificacion_institucional
        WHERE codigo LIKE 'NOTIF-' || v_anio || '-%'
        ORDER BY codigo DESC LIMIT 1;

        IF v_ultimo IS NULL THEN
          v_num := 1;
        ELSE
          v_num := CAST(SPLIT_PART(v_ultimo, '-', 3) AS INTEGER) + 1;
        END IF;

        RETURN 'NOTIF-' || v_anio || '-' || LPAD(v_num::TEXT, 6, '0');
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('  ✅ Función actualizada');

    await client.query('COMMIT');

    console.log('\n✅ Seed completado exitosamente');
    console.log('─────────────────────────────────────────────────');
    console.log('  ✅ Soporte de fotos agregado (foto_url, foto_public_id)');
    console.log('  ✅ 5 permisos registrados');
    console.log('  ✅ Permisos asignados a admin y secretaria');
    console.log('  ✅ Docentes, padres y estudiantes acceden a bandeja interna');
    console.log('\n💡 Si tus roles tienen nombres diferentes, editá el archivo');
    console.log('   y cambiá los strings en las llamadas a asignar()\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error:', err.message);
    throw err;
  } finally {
    client.release();
    process.exit(0);
  }
}

seedNotificaciones();