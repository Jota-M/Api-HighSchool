// scripts/migration_galeria_institucional.js
// Carrusel de fotos institucionales que se ve en el home de la app y la
// web (Acto Cívico, Feria de Ciencias, etc.), con vigencia por fecha para
// que secretaría pueda programar cuándo aparece y desaparece cada foto
// sin tener que acordarse de sacarla a mano.
//
// Ejecutar con:
//   node --env-file .env.dev scripts/migration_galeria_institucional.js

import { pool } from '../src/db/pool.js';

async function migrate() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        console.log('\n🖼️  Aplicando migración: galeria_institucional\n');

        // 1. Tabla principal
        //    fecha_inicio / fecha_fin en NULL = sin restricción de ese lado
        //    (una foto sin fecha_inicio ya está vigente; sin fecha_fin nunca
        //    vence sola, hay que desactivarla a mano).
        await client.query(`
      CREATE TABLE IF NOT EXISTS galeria_institucional (
        id                     SERIAL PRIMARY KEY,
        titulo                 VARCHAR(150) NOT NULL,
        imagen_url             TEXT NOT NULL,
        cloudinary_public_id   TEXT,
        orden                  INTEGER NOT NULL DEFAULT 0,
        fecha_inicio           DATE,
        fecha_fin              DATE,
        activo                 BOOLEAN NOT NULL DEFAULT true,
        creado_por             INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        creado_en              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT galeria_fechas_check
          CHECK (fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_inicio <= fecha_fin)
      )
    `);
        console.log('  ✅ Tabla galeria_institucional creada');

        // Índice pensado exactamente para la query que más se va a llamar:
        // "dame las vigentes hoy, activas, ordenadas" — la pega el home de
        // la app/web en cada carga.
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_galeria_vigentes
        ON galeria_institucional (orden)
        WHERE activo = true
    `);
        console.log('  ✅ Índice idx_galeria_vigentes creado');

        // updated_at automático, mismo trigger genérico que ya usás en otras
        // tablas (backup_registro, etc.) — si ya existe la función no rompe.
        await client.query(`
      CREATE OR REPLACE FUNCTION actualizar_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.actualizado_en = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
        await client.query(`DROP TRIGGER IF EXISTS trg_galeria_updated_at ON galeria_institucional`);
        await client.query(`
      CREATE TRIGGER trg_galeria_updated_at
      BEFORE UPDATE ON galeria_institucional
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `);
        console.log('  ✅ Trigger actualizado_en creado');

        // 2. Permisos del módulo
        console.log('\n🔐 Insertando permisos...');
        await client.query(`
      INSERT INTO permisos (modulo, accion, nombre, descripcion)
      VALUES
        ('galeria', 'leer',     'galeria.leer',     'Ver el listado completo de fotos institucionales (incluye inactivas/vencidas)'),
        ('galeria', 'crear',    'galeria.crear',    'Subir una nueva foto al carrusel institucional'),
        ('galeria', 'editar',   'galeria.editar',   'Editar título, fechas de vigencia u orden de una foto'),
        ('galeria', 'eliminar', 'galeria.eliminar', 'Eliminar una foto del carrusel institucional')
      ON CONFLICT (nombre) DO NOTHING
    `);
        console.log('  ✅ 4 permisos del módulo insertados');

        await client.query('COMMIT');

        console.log('\n✅ Migración completada exitosamente\n');
        console.log('Tabla nueva:');
        console.log('  - galeria_institucional (id, titulo, imagen_url, orden, fecha_inicio, fecha_fin, activo)\n');
        console.log('💡 Próximos pasos:');
        console.log('   1. Registrar la ruta en app.js:');
        console.log('      import galeriaRoutes from \'./routes/galeriaRoutes.js\'');
        console.log('      app.use(\'/galeria\', galeriaRoutes)\n');
        console.log('   2. Asignar galeria.leer/crear/editar/eliminar a los roles');
        console.log('      admin/secretaria desde /dashboard/admin/permisos\n');
        console.log('   NOTA: GET /galeria/vigentes NO requiere estos permisos —');
        console.log('   solo estar logueado, la usan todos los roles para el carrusel.\n');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n❌ Error en migración:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrate();