import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function reestructurarTablasEstudiantes() {
  const client = await pool.connect();
  try {
    console.log('\n🔧 REESTRUCTURACIÓN DE TABLAS - ESTUDIANTES Y PADRES');
    console.log('Se realizarán los siguientes cambios:');
    console.log('\n📝 ESTUDIANTE:');
    console.log('  ✅ Añadir: rude (VARCHAR)');
    console.log('  ❌ Eliminar: telefono_emergencia');
    console.log('\n📝 PRE_ESTUDIANTE:');
    console.log('  ✅ Añadir: rude (VARCHAR)');
    console.log('  ❌ Eliminar: telefono_emergencia');
    console.log('\n👤 PADRE_FAMILIA:');
    console.log('  ❌ Eliminar: lugar_trabajo');
    console.log('  ❌ Eliminar: telefono_trabajo');
    console.log('  ❌ Eliminar: nivel_educacion');
    console.log('\n👥 PRE_TUTOR:');
    console.log('  ❌ Eliminar: lugar_trabajo');
    console.log('  ❌ Eliminar: telefono_trabajo');
    console.log('  ❌ Eliminar: nivel_educacion');
    console.log('  ✅ Añadir: otro_parentesco (VARCHAR)');
    console.log('  ✅ Verificar: ocupacion existe');
    console.log('\n📊 ÍNDICES:');
    console.log('  ✅ Crear índices para CI y RUDE\n');

    const confirm = await ask('¿Deseas continuar? (SI para confirmar): ');

    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se realizaron cambios.');
      process.exit(0);
    }

    await client.query('BEGIN');
    console.log('\n⏳ Procesando...\n');

    // =============================================
    // 1️⃣ TABLA ESTUDIANTE
    // =============================================
    console.log('🎓 Modificando tabla ESTUDIANTE...');

    // Añadir RUDE
    const estudianteRudeCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'estudiante' AND column_name = 'rude'
    `);

    if (estudianteRudeCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE estudiante
        ADD COLUMN rude VARCHAR(20) UNIQUE
      `);
      console.log('  ✅ Columna rude agregada');
      
      await client.query(`
        COMMENT ON COLUMN estudiante.rude IS 'Registro Único de Estudiantes - Bolivia'
      `);
    } else {
      console.log('  ⚠️ Columna rude ya existe');
    }

    // Eliminar telefono_emergencia
    const estudianteTelEmergCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'estudiante' AND column_name = 'telefono_emergencia'
    `);

    if (estudianteTelEmergCheck.rows.length > 0) {
      await client.query(`
        ALTER TABLE estudiante
        DROP COLUMN IF EXISTS telefono_emergencia
      `);
      console.log('  ✅ Columna telefono_emergencia eliminada');
    } else {
      console.log('  ⚠️ Columna telefono_emergencia no existe (ya fue eliminada)');
    }

    // Índices de estudiante
    const idxEstudianteRude = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'estudiante' AND indexname = 'idx_estudiante_rude'
    `);

    if (idxEstudianteRude.rows.length === 0) {
      await client.query(`
        CREATE INDEX idx_estudiante_rude 
        ON estudiante(rude) 
        WHERE rude IS NOT NULL
      `);
      console.log('  ✅ Índice idx_estudiante_rude creado');
    } else {
      console.log('  ⚠️ Índice idx_estudiante_rude ya existe');
    }

    const idxEstudianteCI = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'estudiante' AND indexname = 'idx_estudiante_ci'
    `);

    if (idxEstudianteCI.rows.length === 0) {
      await client.query(`
        CREATE INDEX idx_estudiante_ci 
        ON estudiante(ci) 
        WHERE ci IS NOT NULL
      `);
      console.log('  ✅ Índice idx_estudiante_ci creado');
    } else {
      console.log('  ⚠️ Índice idx_estudiante_ci ya existe');
    }

    // =============================================
    // 2️⃣ TABLA PRE_ESTUDIANTE
    // =============================================
    console.log('\n📝 Modificando tabla PRE_ESTUDIANTE...');

    // Añadir RUDE
    const preEstudianteRudeCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pre_estudiante' AND column_name = 'rude'
    `);

    if (preEstudianteRudeCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE pre_estudiante
        ADD COLUMN rude VARCHAR(20)
      `);
      console.log('  ✅ Columna rude agregada');
      
      await client.query(`
        COMMENT ON COLUMN pre_estudiante.rude IS 'Registro Único de Estudiantes - Bolivia'
      `);
    } else {
      console.log('  ⚠️ Columna rude ya existe');
    }

    // Eliminar telefono_emergencia
    const preEstudianteTelEmergCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pre_estudiante' AND column_name = 'telefono_emergencia'
    `);

    if (preEstudianteTelEmergCheck.rows.length > 0) {
      await client.query(`
        ALTER TABLE pre_estudiante
        DROP COLUMN IF EXISTS telefono_emergencia
      `);
      console.log('  ✅ Columna telefono_emergencia eliminada');
    } else {
      console.log('  ⚠️ Columna telefono_emergencia no existe (ya fue eliminada)');
    }

    // =============================================
    // 3️⃣ TABLA PADRE_FAMILIA
    // =============================================
    console.log('\n👤 Modificando tabla PADRE_FAMILIA...');

    // Eliminar lugar_trabajo
    const padreLugarTrabajoCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'padre_familia' AND column_name = 'lugar_trabajo'
    `);

    if (padreLugarTrabajoCheck.rows.length > 0) {
      await client.query(`
        ALTER TABLE padre_familia
        DROP COLUMN IF EXISTS lugar_trabajo
      `);
      console.log('  ✅ Columna lugar_trabajo eliminada');
    } else {
      console.log('  ⚠️ Columna lugar_trabajo no existe (ya fue eliminada)');
    }

    // Eliminar telefono_trabajo
    const padreTelTrabajoCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'padre_familia' AND column_name = 'telefono_trabajo'
    `);

    if (padreTelTrabajoCheck.rows.length > 0) {
      await client.query(`
        ALTER TABLE padre_familia
        DROP COLUMN IF EXISTS telefono_trabajo
      `);
      console.log('  ✅ Columna telefono_trabajo eliminada');
    } else {
      console.log('  ⚠️ Columna telefono_trabajo no existe (ya fue eliminada)');
    }

    // Eliminar nivel_educacion
    const padreNivelEducCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'padre_familia' AND column_name = 'nivel_educacion'
    `);

    if (padreNivelEducCheck.rows.length > 0) {
      await client.query(`
        ALTER TABLE padre_familia
        DROP COLUMN IF EXISTS nivel_educacion
      `);
      console.log('  ✅ Columna nivel_educacion eliminada');
    } else {
      console.log('  ⚠️ Columna nivel_educacion no existe (ya fue eliminada)');
    }

    // Índice para CI
    const idxPadreCI = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'padre_familia' AND indexname = 'idx_padre_familia_ci'
    `);

    if (idxPadreCI.rows.length === 0) {
      await client.query(`
        CREATE INDEX idx_padre_familia_ci ON padre_familia(ci)
      `);
      console.log('  ✅ Índice idx_padre_familia_ci creado');
    } else {
      console.log('  ⚠️ Índice idx_padre_familia_ci ya existe');
    }

    // =============================================
    // 4️⃣ TABLA PRE_TUTOR
    // =============================================
    console.log('\n👥 Modificando tabla PRE_TUTOR...');

    // Eliminar lugar_trabajo
    const tutorLugarTrabajoCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pre_tutor' AND column_name = 'lugar_trabajo'
    `);

    if (tutorLugarTrabajoCheck.rows.length > 0) {
      await client.query(`
        ALTER TABLE pre_tutor
        DROP COLUMN IF EXISTS lugar_trabajo
      `);
      console.log('  ✅ Columna lugar_trabajo eliminada');
    } else {
      console.log('  ⚠️ Columna lugar_trabajo no existe (ya fue eliminada)');
    }

    // Eliminar telefono_trabajo
    const tutorTelTrabajoCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pre_tutor' AND column_name = 'telefono_trabajo'
    `);

    if (tutorTelTrabajoCheck.rows.length > 0) {
      await client.query(`
        ALTER TABLE pre_tutor
        DROP COLUMN IF EXISTS telefono_trabajo
      `);
      console.log('  ✅ Columna telefono_trabajo eliminada');
    } else {
      console.log('  ⚠️ Columna telefono_trabajo no existe (ya fue eliminada)');
    }

    // Eliminar nivel_educacion
    const tutorNivelEducCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pre_tutor' AND column_name = 'nivel_educacion'
    `);

    if (tutorNivelEducCheck.rows.length > 0) {
      await client.query(`
        ALTER TABLE pre_tutor
        DROP COLUMN IF EXISTS nivel_educacion
      `);
      console.log('  ✅ Columna nivel_educacion eliminada');
    } else {
      console.log('  ⚠️ Columna nivel_educacion no existe (ya fue eliminada)');
    }

    // Añadir otro_parentesco
    const tutorOtroParentescoCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pre_tutor' AND column_name = 'otro_parentesco'
    `);

    if (tutorOtroParentescoCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE pre_tutor
        ADD COLUMN otro_parentesco VARCHAR(100)
      `);
      console.log('  ✅ Columna otro_parentesco agregada');
      
      await client.query(`
        COMMENT ON COLUMN pre_tutor.otro_parentesco 
        IS 'Descripción del parentesco cuando se selecciona "otro"'
      `);
    } else {
      console.log('  ⚠️ Columna otro_parentesco ya existe');
    }

    // Verificar que existe ocupacion
    const tutorOcupacionCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pre_tutor' AND column_name = 'ocupacion'
    `);

    if (tutorOcupacionCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE pre_tutor
        ADD COLUMN ocupacion VARCHAR(255)
      `);
      console.log('  ✅ Columna ocupacion agregada');
    } else {
      console.log('  ✅ Columna ocupacion ya existe');
    }

    // Índices para pre_tutor
    const idxPreTutorCI = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'pre_tutor' AND indexname = 'idx_pre_tutor_ci'
    `);

    if (idxPreTutorCI.rows.length === 0) {
      await client.query(`
        CREATE INDEX idx_pre_tutor_ci ON pre_tutor(ci)
      `);
      console.log('  ✅ Índice idx_pre_tutor_ci creado');
    } else {
      console.log('  ⚠️ Índice idx_pre_tutor_ci ya existe');
    }

    const idxPreTutorInscripcion = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'pre_tutor' AND indexname = 'idx_pre_tutor_pre_inscripcion'
    `);

    if (idxPreTutorInscripcion.rows.length === 0) {
      await client.query(`
        CREATE INDEX idx_pre_tutor_pre_inscripcion ON pre_tutor(pre_inscripcion_id)
      `);
      console.log('  ✅ Índice idx_pre_tutor_pre_inscripcion creado');
    } else {
      console.log('  ⚠️ Índice idx_pre_tutor_pre_inscripcion ya existe');
    }

    // =============================================
    // 5️⃣ VERIFICAR COLUMNAS GENERATED
    // =============================================
    console.log('\n🔄 Verificando columnas generadas...');

    // Verificar si apellidos es GENERATED en estudiante
    const estudianteGenerated = await client.query(`
      SELECT column_name, generation_expression
      FROM information_schema.columns
      WHERE table_name = 'estudiante' 
      AND column_name = 'apellidos'
      AND generation_expression IS NOT NULL
    `);

    if (estudianteGenerated.rows.length > 0) {
      console.log('  ✅ Columna apellidos en estudiante es GENERATED (se actualiza automáticamente)');
    } else {
      console.log('  ⚠️ Columna apellidos en estudiante NO es GENERATED');
      // Solo actualizar si NO es generated
      const updateEstudiante = await client.query(`
        UPDATE estudiante 
        SET apellidos = TRIM(CONCAT(apellido_paterno, ' ', COALESCE(apellido_materno, '')))
        WHERE apellidos IS NULL OR apellidos = ''
      `);
      console.log(`  ✅ Actualizados ${updateEstudiante.rowCount} registros de estudiante`);
    }

    // Verificar si apellidos es GENERATED en padre_familia
    const padreGenerated = await client.query(`
      SELECT column_name, generation_expression
      FROM information_schema.columns
      WHERE table_name = 'padre_familia' 
      AND column_name = 'apellidos'
      AND generation_expression IS NOT NULL
    `);

    if (padreGenerated.rows.length > 0) {
      console.log('  ✅ Columna apellidos en padre_familia es GENERATED (se actualiza automáticamente)');
    } else {
      console.log('  ⚠️ Columna apellidos en padre_familia NO es GENERATED');
      // Solo actualizar si NO es generated
      const updatePadre = await client.query(`
        UPDATE padre_familia 
        SET apellidos = TRIM(CONCAT(apellido_paterno, ' ', COALESCE(apellido_materno, '')))
        WHERE apellidos IS NULL OR apellidos = ''
      `);
      console.log(`  ✅ Actualizados ${updatePadre.rowCount} registros de padre_familia`);
    }

    await client.query('COMMIT');

    console.log('\n✅ ¡Seed ejecutado con éxito!');
    console.log('\n📊 RESUMEN DE CAMBIOS:');
    console.log('┌─────────────────────────────────────────┐');
    console.log('│ ESTUDIANTE & PRE_ESTUDIANTE             │');
    console.log('│  ✅ Campo rude añadido                  │');
    console.log('│  ❌ Campo telefono_emergencia eliminado │');
    console.log('├─────────────────────────────────────────┤');
    console.log('│ PADRE_FAMILIA & PRE_TUTOR               │');
    console.log('│  ❌ lugar_trabajo eliminado             │');
    console.log('│  ❌ telefono_trabajo eliminado          │');
    console.log('│  ❌ nivel_educacion eliminado           │');
    console.log('│  ✅ otro_parentesco añadido (pre_tutor) │');
    console.log('├─────────────────────────────────────────┤');
    console.log('│ ÍNDICES                                 │');
    console.log('│  ✅ idx_estudiante_rude                 │');
    console.log('│  ✅ idx_estudiante_ci                   │');
    console.log('│  ✅ idx_padre_familia_ci                │');
    console.log('│  ✅ idx_pre_tutor_ci                    │');
    console.log('│  ✅ idx_pre_tutor_pre_inscripcion       │');
    console.log('└─────────────────────────────────────────┘');
    console.log('\n🎯 Base de datos reestructurada correctamente.');
    console.log('⚠️  Recuerda actualizar los tipos TypeScript y servicios.\n');

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

reestructurarTablasEstudiantes().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});