import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function crearModuloMaterialAsignado() {
  const client = await pool.connect();

  try {
    console.log('\n📚 CREACIÓN DE MÓDULO: MATERIAL ASIGNADO A ESTUDIANTES');
    console.log('Se crearán componentes para asignar materiales personalizados.');
    
    console.log('\n📋 ESTRUCTURA:');
    console.log('  1️⃣ material_asignado_estudiante');
    console.log('  2️⃣ Índices optimizados');
    console.log('  3️⃣ Trigger updated_at');
    console.log('  4️⃣ Permisos del módulo');
    
    console.log('\n⚡ FUNCIONALIDADES:');
    console.log('  🎯 Asignación individual de materiales');
    console.log('  🎯 Integración con IA/Gemini');
    console.log('  🎯 Seguimiento de lectura');
    console.log('  🎯 Soft delete');
    console.log('  🎯 Prevención de duplicados');
    console.log('  🎯 Auditoría automática\n');

    const confirm = await ask('¿Deseas continuar con la creación? (SI para confirmar): ');

    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se realizaron cambios.');
      process.exit(0);
    }

    await client.query('BEGIN');

    console.log('\n⏳ Procesando...\n');

    // =====================================================
    // TABLA
    // =====================================================
    console.log('📋 Creando tabla MATERIAL_ASIGNADO_ESTUDIANTE...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS material_asignado_estudiante (
        id                    SERIAL PRIMARY KEY,

        -- Qué material se asigna
        material_academico_id INTEGER NOT NULL
          REFERENCES material_academico(id) ON DELETE CASCADE,

        -- A quién
        matricula_id          INTEGER NOT NULL
          REFERENCES matricula(id) ON DELETE CASCADE,

        -- Contexto académico
        asignacion_docente_id INTEGER NOT NULL
          REFERENCES asignacion_docente(id),

        -- Quién asignó
        asignado_por          INTEGER NOT NULL
          REFERENCES usuarios(id),

        -- Origen
        origen                VARCHAR(10) NOT NULL DEFAULT 'manual'
          CHECK (origen IN ('gemini', 'manual')),

        -- Mensaje opcional
        mensaje_docente       TEXT,

        -- Seguimiento
        visto_por_estudiante  BOOLEAN NOT NULL DEFAULT false,
        fecha_vista           TIMESTAMP,

        -- Estado
        activo                BOOLEAN NOT NULL DEFAULT true,

        created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        -- Evitar duplicados
        UNIQUE (
          material_academico_id,
          matricula_id,
          asignacion_docente_id
        )
      )
    `);

    await client.query(`
      COMMENT ON TABLE material_asignado_estudiante IS
      'Materiales asignados individualmente a estudiantes desde predicción ML'
    `);

    await client.query(`
      COMMENT ON COLUMN material_asignado_estudiante.origen IS
      'gemini = sugerido por IA | manual = agregado por docente'
    `);

    console.log('  ✅ Tabla material_asignado_estudiante creada');

    // =====================================================
    // ÍNDICES
    // =====================================================
    console.log('\n🔍 Creando índices...');

    const indices = [
      `
      CREATE INDEX IF NOT EXISTS idx_mae_matricula
      ON material_asignado_estudiante(matricula_id)
      WHERE activo = true
      `,

      `
      CREATE INDEX IF NOT EXISTS idx_mae_asignacion
      ON material_asignado_estudiante(asignacion_docente_id)
      `,

      `
      CREATE INDEX IF NOT EXISTS idx_mae_material
      ON material_asignado_estudiante(material_academico_id)
      `,

      `
      CREATE INDEX IF NOT EXISTS idx_mae_no_visto
      ON material_asignado_estudiante(
        matricula_id,
        visto_por_estudiante
      )
      WHERE activo = true
        AND visto_por_estudiante = false
      `
    ];

    for (const idx of indices) {
      await client.query(idx);
    }

    console.log(`  ✅ ${indices.length} índices creados`);

    // =====================================================
    // TRIGGER updated_at
    // =====================================================
    console.log('\n⚡ Creando triggers...');

    await client.query(`
      CREATE OR REPLACE FUNCTION mae_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trg_mae_updated_at
      ON material_asignado_estudiante
    `);

    await client.query(`
      CREATE TRIGGER trg_mae_updated_at
      BEFORE UPDATE ON material_asignado_estudiante
      FOR EACH ROW
      EXECUTE FUNCTION mae_updated_at()
    `);

    console.log('  ✅ Trigger updated_at creado');

    // =====================================================
    // PERMISOS
    // =====================================================
    console.log('\n🔐 Insertando permisos...');

    await client.query(`
      INSERT INTO permisos (
        modulo,
        accion,
        nombre,
        descripcion
      )
      VALUES
        (
          'material_asignado',
          'crear',
          'material_asignado.crear',
          'Asignar materiales a estudiantes'
        ),
        (
          'material_asignado',
          'leer',
          'material_asignado.leer',
          'Ver materiales asignados'
        ),
        (
          'material_asignado',
          'eliminar',
          'material_asignado.eliminar',
          'Eliminar asignaciones de materiales'
        ),
        (
          'material_asignado',
          'marcar',
          'material_asignado.marcar',
          'Marcar material como visto'
        )
      ON CONFLICT (nombre) DO NOTHING
    `);

    console.log('  ✅ 4 permisos insertados');

    // =====================================================
    // COMMIT
    // =====================================================
    await client.query('COMMIT');

    console.log('\n✅ ¡Módulo creado exitosamente!\n');

    console.log('📊 RESUMEN:');
    console.log('┌──────────────────────────────────────────────┐');
    console.log('│ ✅ 1 Tabla creada                            │');
    console.log('│ ✅ 4 Índices optimizados                     │');
    console.log('│ ✅ 1 Trigger automático                      │');
    console.log('│ ✅ 4 Permisos registrados                    │');
    console.log('└──────────────────────────────────────────────┘\n');

    console.log('💡 FUNCIONALIDADES DISPONIBLES:');
    console.log('   ✨ Asignación personalizada de materiales');
    console.log('   ✨ Recomendaciones vía IA/Gemini');
    console.log('   ✨ Seguimiento de visualización');
    console.log('   ✨ Soft delete');
    console.log('   ✨ Evita duplicados automáticamente');
    console.log('   ✨ Auditoría de actualización\n');

    console.log('🚀 EJEMPLOS DE USO:\n');

    console.log('📌 Asignar material manualmente:');
    console.log(`
INSERT INTO material_asignado_estudiante (
  material_academico_id,
  matricula_id,
  asignacion_docente_id,
  asignado_por,
  origen,
  mensaje_docente
)
VALUES (1, 10, 5, 2, 'manual', 'Revisa este material');
    `);

    console.log('📌 Marcar como visto:');
    console.log(`
UPDATE material_asignado_estudiante
SET
  visto_por_estudiante = true,
  fecha_vista = CURRENT_TIMESTAMP
WHERE id = 1;
    `);

    console.log('📌 Obtener materiales pendientes:');
    console.log(`
SELECT *
FROM material_asignado_estudiante
WHERE matricula_id = 10
  AND activo = true
  AND visto_por_estudiante = false;
    `);

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

crearModuloMaterialAsignado().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});