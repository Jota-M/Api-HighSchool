// scripts/migration_material_asignado_externo.js
// Agrega soporte para recursos externos (internet) en material_asignado_estudiante
//
// Ejecutar con:
//   node --env-file .env.dev scripts/migration_material_asignado_externo.js

import { pool } from '../src/db/pool.js';

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('\n🔧 Aplicando migración: material_asignado_estudiante\n');

    // 1. Permitir material_academico_id NULL para recursos externos
    await client.query(`
      ALTER TABLE material_asignado_estudiante
        ALTER COLUMN material_academico_id DROP NOT NULL
    `);
    console.log('  ✅ material_academico_id ahora acepta NULL');

    // 2. Columnas para recurso externo
    await client.query(`
      ALTER TABLE material_asignado_estudiante
        ADD COLUMN IF NOT EXISTS url_recurso_externo    TEXT,
        ADD COLUMN IF NOT EXISTS titulo_recurso_externo VARCHAR(300),
        ADD COLUMN IF NOT EXISTS origen_externo         VARCHAR(50)
    `);
    console.log('  ✅ Columnas url_recurso_externo, titulo_recurso_externo, origen_externo agregadas');

    // 3. Nuevo valor en el CHECK de origen para distinguir búsqueda web
    //    Si ya existe el constraint lo reemplazamos
    await client.query(`
      ALTER TABLE material_asignado_estudiante
        DROP CONSTRAINT IF EXISTS material_asignado_estudiante_origen_check
    `);
    await client.query(`
      ALTER TABLE material_asignado_estudiante
        ADD CONSTRAINT material_asignado_estudiante_origen_check
        CHECK (origen IN ('manual', 'gemini', 'automatico', 'web_search'))
    `);
    console.log('  ✅ Constraint origen actualizado (agrega web_search)');

    // 4. Constraint: debe tener material_academico_id O url_recurso_externo, no ninguno
    await client.query(`
      ALTER TABLE material_asignado_estudiante
        DROP CONSTRAINT IF EXISTS chk_material_o_externo
    `);
    await client.query(`
      ALTER TABLE material_asignado_estudiante
        ADD CONSTRAINT chk_material_o_externo
        CHECK (
          material_academico_id IS NOT NULL
          OR url_recurso_externo IS NOT NULL
        )
    `);
    console.log('  ✅ Constraint chk_material_o_externo agregado');

    // 5. El ON CONFLICT original era por (material_academico_id, matricula_id, asignacion_docente_id)
    //    Ese índice único no funciona cuando material_academico_id es NULL
    //    Lo reemplazamos por dos índices parciales
    await client.query(`
      ALTER TABLE material_asignado_estudiante
        DROP CONSTRAINT IF EXISTS material_asignado_estudiante_material_academico_id_matricula_id_key
    `);
    console.log('  ✅ Constraint unique original eliminado');

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_material_asignado_interno
        ON material_asignado_estudiante (material_academico_id, matricula_id, asignacion_docente_id)
        WHERE material_academico_id IS NOT NULL
    `);
    console.log('  ✅ Índice único para materiales internos creado');

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_material_asignado_externo
        ON material_asignado_estudiante (url_recurso_externo, matricula_id, asignacion_docente_id)
        WHERE url_recurso_externo IS NOT NULL
    `);
    console.log('  ✅ Índice único para recursos externos creado');

    await client.query('COMMIT');

    console.log('\n✅ Migración completada exitosamente\n');
    console.log('Campos agregados a material_asignado_estudiante:');
    console.log('  - url_recurso_externo    TEXT         — URL del recurso de internet');
    console.log('  - titulo_recurso_externo VARCHAR(300) — Título descriptivo del recurso');
    console.log('  - origen_externo         VARCHAR(50)  — Fuente: youtube, khan_academy, etc.');
    console.log('  - material_academico_id  ahora es nullable\n');

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