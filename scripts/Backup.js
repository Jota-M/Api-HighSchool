// scripts/crearModuloBackup.js
import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function crearModuloBackup() {
  const client = await pool.connect();
  try {
    console.log('\n🗄️  CREACIÓN DE MÓDULO: BACKUP DE BASE DE DATOS');
    console.log('Se crearán las siguientes tablas y componentes:');
    console.log('\n📋 ESTRUCTURA DEL MÓDULO:');
    console.log('  1️⃣  backup_registro   - Historial y metadata de cada backup generado');
    console.log('\n⚙️  COMPONENTES:');
    console.log('  ✅ Índices de optimización');
    console.log('  ✅ Permisos del módulo');
    console.log('\n⚡ FUNCIONALIDADES:');
    console.log('  🎯 Registro de backups con URL de Cloudinary');
    console.log('  🎯 Historial de restauraciones');
    console.log('  🎯 Auditoría de quién generó/restauró/eliminó');
    console.log('  🎯 Estado del backup (completado / fallido)');
    console.log('  🎯 Eliminación lógica (soft delete)\n');

    const confirm = await ask('¿Deseas continuar con la creación? (SI para confirmar): ');

    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se realizaron cambios.');
      process.exit(0);
    }

    await client.query('BEGIN');
    console.log('\n⏳ Procesando...\n');

    // =============================================
    // 1️⃣ TABLA: backup_registro
    // =============================================
    console.log('📋 Creando tabla BACKUP_REGISTRO...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS backup_registro (
        id                  SERIAL PRIMARY KEY,

        -- Identificación del archivo
        backup_key          VARCHAR(60)  NOT NULL UNIQUE,   -- bkp_1715123456789_abc12
        filename            VARCHAR(255) NOT NULL,           -- backup_mydb_2026-05-09T10-30.sql

        -- Base de datos respaldada
        database_name       VARCHAR(100) NOT NULL,

        -- Cloudinary
        cloudinary_url      TEXT         NOT NULL,           -- URL pública de descarga
        cloudinary_public_id TEXT        NOT NULL UNIQUE,   -- para poder eliminarlo de Cloudinary

        -- Tamaño
        size_bytes          BIGINT       NOT NULL DEFAULT 0,
        size_formatted      VARCHAR(20)  NOT NULL DEFAULT '0 B',

        -- Estado del backup
        status              VARCHAR(20)  NOT NULL DEFAULT 'completado'
                              CHECK (status IN ('completado', 'fallido', 'en_progreso')),

        -- Restauraciones
        ultima_restauracion_at  TIMESTAMP,
        restaurado_por          INTEGER REFERENCES usuarios(id),

        -- Auditoría de creación
        creado_por          INTEGER NOT NULL REFERENCES usuarios(id),
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        -- Soft delete (no borramos el registro aunque se elimine de Cloudinary)
        deleted_at          TIMESTAMP,
        eliminado_por       INTEGER REFERENCES usuarios(id)
      )
    `);

    await client.query(`
      COMMENT ON TABLE backup_registro IS
        'Historial y metadata de backups de la base de datos. El archivo .sql vive en Cloudinary.'
    `);
    await client.query(`
      COMMENT ON COLUMN backup_registro.backup_key IS
        'ID único generado internamente: bkp_{timestamp}_{random}'
    `);
    await client.query(`
      COMMENT ON COLUMN backup_registro.cloudinary_public_id IS
        'public_id en Cloudinary, necesario para eliminar el archivo remotamente'
    `);
    await client.query(`
      COMMENT ON COLUMN backup_registro.deleted_at IS
        'Soft delete: el registro permanece para auditoría aunque el archivo de Cloudinary se haya eliminado'
    `);

    console.log('  ✅ Tabla backup_registro creada');

    // =============================================
    // ÍNDICES DE OPTIMIZACIÓN
    // =============================================
    console.log('\n🔍 Creando índices...');

    const indices = [
      `CREATE INDEX IF NOT EXISTS idx_backup_creado_por   ON backup_registro(creado_por)`,
      `CREATE INDEX IF NOT EXISTS idx_backup_status        ON backup_registro(status)`,
      `CREATE INDEX IF NOT EXISTS idx_backup_created_at    ON backup_registro(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_backup_activos        ON backup_registro(deleted_at) WHERE deleted_at IS NULL`,
    ];

    for (const idx of indices) {
      await client.query(idx);
    }

    console.log(`  ✅ ${indices.length} índices creados`);

    // =============================================
    // TRIGGER updated_at
    // =============================================
    console.log('\n⚡ Creando trigger...');

    await client.query(`
      CREATE OR REPLACE FUNCTION actualizar_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`DROP TRIGGER IF EXISTS trg_backup_updated_at ON backup_registro`);
    await client.query(`
      CREATE TRIGGER trg_backup_updated_at
      BEFORE UPDATE ON backup_registro
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `);

    console.log('  ✅ Trigger updated_at creado');

    // =============================================
    // PERMISOS
    // =============================================
    console.log('\n🔐 Insertando permisos...');

    await client.query(`
      INSERT INTO permisos (modulo, accion, nombre, descripcion)
      VALUES
        ('backup', 'leer',       'backup.leer',       'Ver historial de backups'),
        ('backup', 'crear',      'backup.crear',      'Generar un nuevo backup'),
        ('backup', 'restaurar',  'backup.restaurar',  'Restaurar la base de datos desde un backup'),
        ('backup', 'eliminar',   'backup.eliminar',   'Eliminar un backup de Cloudinary')
      ON CONFLICT (nombre) DO NOTHING
    `);

    console.log('  ✅ 4 permisos del módulo insertados');

    await client.query('COMMIT');

    console.log('\n✅ ¡Módulo de Backup creado exitosamente!\n');
    console.log('📊 RESUMEN:');
    console.log('┌──────────────────────────────────────────────────────┐');
    console.log('│ ✅ 1 Tabla creada  (backup_registro)                │');
    console.log('│ ✅ 4 Índices de optimización                        │');
    console.log('│ ✅ 1 Trigger updated_at                             │');
    console.log('│ ✅ 4 Permisos de acceso registrados                 │');
    console.log('└──────────────────────────────────────────────────────┘\n');
    console.log('💡 Próximos pasos:');
    console.log('   1. Registrar la ruta en app.js:');
    console.log('      import backupRoutes from \'./routes/backupRoutes.js\'');
    console.log('      app.use(\'/backups\', backupRoutes)\n');
    console.log('   2. Asignar los permisos al rol admin en tu sistema de roles\n');
    console.log('📚 Ejemplos de consulta:');
    console.log('   -- Último backup generado');
    console.log('   SELECT * FROM backup_registro WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1;\n');
    console.log('   -- Backups del mes actual');
    console.log('   SELECT * FROM backup_registro');
    console.log('   WHERE deleted_at IS NULL');
    console.log('   AND DATE_TRUNC(\'month\', created_at) = DATE_TRUNC(\'month\', CURRENT_DATE);\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error en la operación:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    rl.close();
    process.exit(0);
  }
}

crearModuloBackup().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});