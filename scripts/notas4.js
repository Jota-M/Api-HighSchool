import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function agregarAdjuntosYRubrica() {
  const client = await pool.connect();
  try {
    console.log('\n📎 MIGRACIÓN: ADJUNTOS Y RÚBRICA EN EVALUACIONES');
    console.log('\nCambios a realizar:');
    console.log('  1️⃣  ALTER TABLE evaluacion  — columnas de foto, PDF y fecha límite');
    console.log('  2️⃣  CREATE TABLE evaluacion_rubrica — criterios de evaluación');
    console.log('  3️⃣  Índices y permisos nuevos\n');

    const confirm = await ask('¿Deseas continuar? (SI para confirmar): ');
    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se realizaron cambios.');
      process.exit(0);
    }

    await client.query('BEGIN');
    console.log('\n⏳ Procesando...\n');

    // =============================================
    // 1️⃣ ALTER TABLE evaluacion
    // Agregar columnas para archivos adjuntos y fecha límite
    // Usamos ADD COLUMN IF NOT EXISTS para que sea idempotente
    // =============================================
    console.log('📝 Alterando tabla EVALUACION...');

    const columnasEvaluacion = [
      // Foto del enunciado/práctica (imagen subida a Cloudinary)
      `ALTER TABLE evaluacion ADD COLUMN IF NOT EXISTS
        foto_url          TEXT`,
      `ALTER TABLE evaluacion ADD COLUMN IF NOT EXISTS
        foto_public_id    VARCHAR(200)`,

      // PDF con instrucciones completas (subido a Cloudinary)
      `ALTER TABLE evaluacion ADD COLUMN IF NOT EXISTS
        pdf_url           TEXT`,
      `ALTER TABLE evaluacion ADD COLUMN IF NOT EXISTS
        pdf_public_id     VARCHAR(200)`,
      `ALTER TABLE evaluacion ADD COLUMN IF NOT EXISTS
        pdf_nombre        VARCHAR(200)`,   

      // Fecha límite de entrega (para tareas/proyectos)
      `ALTER TABLE evaluacion ADD COLUMN IF NOT EXISTS
        fecha_limite      TIMESTAMP`,

      // Instrucciones cortas visibles directamente (sin abrir adjunto)
      `ALTER TABLE evaluacion ADD COLUMN IF NOT EXISTS
        instrucciones     TEXT`,

      // Control de publicación hacia padres/estudiantes
      // (ya existe visible_para_padres, este complementa)
      `ALTER TABLE evaluacion ADD COLUMN IF NOT EXISTS
        publicado_en      TIMESTAMP`      
    ];

    for (const col of columnasEvaluacion) {
      await client.query(col);
    }

    console.log('  ✅ Columnas de adjuntos y fecha límite agregadas a evaluacion');

    // =============================================
    // 2️⃣ CREATE TABLE evaluacion_rubrica
    // Criterios de evaluación de una práctica/examen
    // Ejemplo: "Presentación" 20pts, "Desarrollo" 50pts, "Conclusión" 30pts
    // La suma de puntos_posibles debe coincidir con evaluacion.puntaje_maximo
    // (se valida en lógica de negocio, no en BD para mayor flexibilidad)
    // =============================================
    console.log('📋 Creando tabla EVALUACION_RUBRICA...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS evaluacion_rubrica (
        id                SERIAL PRIMARY KEY,
        evaluacion_id     INTEGER NOT NULL REFERENCES evaluacion(id) ON DELETE CASCADE,
        orden             INTEGER NOT NULL DEFAULT 1,
        criterio          VARCHAR(200) NOT NULL,   -- "Presentación", "Desarrollo", "Ortografía"
        descripcion       TEXT,                     -- qué se espera para obtener el puntaje máximo
        -- Niveles de logro (escala simple para padres)
        nivel_excelente   TEXT,                     -- descripción del logro máximo
        nivel_bueno       TEXT,                     -- logro intermedio
        nivel_basico      TEXT,                     -- logro mínimo aceptable
        nivel_insuficiente TEXT,                    -- no cumple
        -- Puntaje
        puntos_posibles   NUMERIC(5,2) NOT NULL CHECK (puntos_posibles > 0),
        activo            BOOLEAN DEFAULT true,
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      COMMENT ON TABLE evaluacion_rubrica IS
        'Criterios de evaluación (rúbrica) de una evaluación. Visible para padres y estudiantes.'
    `);
    await client.query(`
      COMMENT ON COLUMN evaluacion_rubrica.nivel_excelente IS
        'Descripción del desempeño para obtener el puntaje máximo en este criterio'
    `);

    console.log('  ✅ Tabla evaluacion_rubrica creada');

    // =============================================
    // 3️⃣ ÍNDICES
    // =============================================
    console.log('🔍 Creando índices...');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rubrica_evaluacion
        ON evaluacion_rubrica(evaluacion_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_evaluacion_visible
        ON evaluacion(visible_para_padres, publicado_en)
        WHERE visible_para_padres = true
    `);

    console.log('  ✅ Índices creados');

    // =============================================
    // 4️⃣ TRIGGER updated_at para evaluacion_rubrica
    // =============================================
    console.log('⚡ Creando trigger...');

    await client.query(`DROP TRIGGER IF EXISTS trg_rubrica_updated_at ON evaluacion_rubrica`);
    await client.query(`
      CREATE TRIGGER trg_rubrica_updated_at
      BEFORE UPDATE ON evaluacion_rubrica
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `);

    console.log('  ✅ Trigger created');

    // =============================================
    // 5️⃣ PERMISOS NUEVOS
    // =============================================
    console.log('🔑 Insertando permisos...');

    await client.query(`
      INSERT INTO permisos (modulo, accion, nombre, descripcion)
      VALUES
        ('evaluacion', 'subir_archivo', 'evaluacion.subir_archivo',
         'Subir foto o PDF a una evaluación'),
        ('evaluacion', 'ver_publica',   'evaluacion.ver_publica',
         'Ver evaluación pública (padres y estudiantes)'),
        ('evaluacion', 'rubrica_crear', 'evaluacion.rubrica_crear',
         'Crear criterios de rúbrica'),
        ('evaluacion', 'rubrica_editar','evaluacion.rubrica_editar',
         'Editar criterios de rúbrica')
      ON CONFLICT (nombre) DO NOTHING
    `);

    console.log('  ✅ Permisos insertados');

    await client.query('COMMIT');

    console.log('\n✅ Migración completada exitosamente\n');
    console.log('📊 RESUMEN:');
    console.log('┌────────────────────────────────────────────────────────┐');
    console.log('│ ✅ 7 columnas nuevas en evaluacion                    │');
    console.log('│    foto_url, foto_public_id                           │');
    console.log('│    pdf_url, pdf_public_id, pdf_nombre                 │');
    console.log('│    fecha_limite, instrucciones, publicado_en          │');
    console.log('│ ✅ 1 tabla nueva: evaluacion_rubrica                  │');
    console.log('│ ✅ 2 índices nuevos                                   │');
    console.log('│ ✅ 4 permisos nuevos                                  │');
    console.log('└────────────────────────────────────────────────────────┘\n');
    console.log('💡 Próximos pasos:');
    console.log('   1. El docente sube foto/PDF al crear/editar evaluación');
    console.log('   2. El docente agrega criterios de rúbrica');
    console.log('   3. Al publicar, padres y estudiantes ven todo desde su vista\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    rl.close();
    process.exit(0);
  }
}

agregarAdjuntosYRubrica().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});