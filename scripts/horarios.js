import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
function ask(q) { return new Promise(resolve => rl.question(q, resolve)); }

async function crearModuloHorarios() {
  const client = await pool.connect();
  try {
    console.log('\n📅 CREACIÓN DE MÓDULO: HORARIOS');
    console.log('Se crearán las siguientes tablas y componentes:');
    console.log('\n🗓️  MÓDULO DE HORARIOS:');
    console.log('  1️⃣  bloque_horario      - Bloques/horas del día por turno');
    console.log('  2️⃣  horario             - Cabecera del horario por paralelo/período');
    console.log('  3️⃣  horario_detalle     - Celdas del horario (día × bloque)');
    console.log('\n⚙️  COMPONENTES:');
    console.log('  ✅ Índices de optimización');
    console.log('  ✅ Índice único anti-conflicto de docentes');
    console.log('  ✅ Triggers automáticos');
    console.log('  ✅ Datos semilla (bloques horarios y permisos)');
    console.log('\n⚡ FUNCIONALIDADES:');
    console.log('  🎯 Bloques horarios configurables por turno');
    console.log('  🎯 Horario por paralelo y período académico');
    console.log('  🎯 Detección automática de conflictos de docente');
    console.log('  🎯 Estados: borrador → publicado → archivado\n');

    const confirm = await ask('¿Deseas continuar con la creación? (SI para confirmar): ');
    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se realizaron cambios.');
      process.exit(0);
    }

    await client.query('BEGIN');
    console.log('\n⏳ Procesando...\n');

    // =============================================
    // 1️⃣ TABLA: bloque_horario
    // =============================================
    console.log('📋 Creando tabla BLOQUE_HORARIO...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS bloque_horario (
        id               SERIAL PRIMARY KEY,
        turno_id         INTEGER NOT NULL REFERENCES turno(id),
        nombre           VARCHAR(50) NOT NULL,
        codigo           VARCHAR(20) UNIQUE,
        numero           INTEGER NOT NULL,
        hora_inicio      TIME NOT NULL,
        hora_fin         TIME NOT NULL,
        es_recreo        BOOLEAN DEFAULT false,
        activo           BOOLEAN DEFAULT true,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (turno_id, numero)
      )
    `);

    await client.query(`COMMENT ON TABLE bloque_horario IS 'Bloques/períodos horarios del día, asociados a un turno'`);
    await client.query(`COMMENT ON COLUMN bloque_horario.numero IS 'Orden del bloque dentro del día (1 = primera hora)'`);
    await client.query(`COMMENT ON COLUMN bloque_horario.es_recreo IS 'true = recreo/descanso, no se asignan materias'`);

    console.log('  ✅ Tabla bloque_horario creada');

    // =============================================
    // 2️⃣ TABLA: horario
    // =============================================
    console.log('📋 Creando tabla HORARIO...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS horario (
        id                   SERIAL PRIMARY KEY,
        paralelo_id          INTEGER NOT NULL REFERENCES paralelo(id),
        periodo_academico_id INTEGER NOT NULL REFERENCES periodo_academico(id),
        nombre               VARCHAR(150),
        estado               VARCHAR(20) DEFAULT 'borrador' CHECK (estado IN ('borrador', 'publicado', 'archivado')),
        publicado_en         TIMESTAMP,
        publicado_por        INTEGER REFERENCES usuarios(id),
        observaciones        TEXT,
        activo               BOOLEAN DEFAULT true,
        created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at           TIMESTAMP,
        UNIQUE (paralelo_id, periodo_academico_id)
      )
    `);

    await client.query(`COMMENT ON TABLE horario IS 'Cabecera del horario semanal por paralelo y período académico'`);
    await client.query(`COMMENT ON COLUMN horario.estado IS 'borrador = en edición; publicado = visible para padres/alumnos; archivado = fuera de uso'`);

    console.log('  ✅ Tabla horario creada');

    // =============================================
    // 3️⃣ TABLA: horario_detalle
    // =============================================
    console.log('📋 Creando tabla HORARIO_DETALLE...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS horario_detalle (
        id                    SERIAL PRIMARY KEY,
        horario_id            INTEGER NOT NULL REFERENCES horario(id) ON DELETE CASCADE,
        dia_semana            SMALLINT NOT NULL CHECK (dia_semana BETWEEN 1 AND 6),
        bloque_horario_id     INTEGER NOT NULL REFERENCES bloque_horario(id),
        grado_materia_id      INTEGER NOT NULL REFERENCES grado_materia(id),
        asignacion_docente_id INTEGER REFERENCES asignacion_docente(id),
        aula                  VARCHAR(50),
        color                 VARCHAR(20),
        observaciones         TEXT,
        activo                BOOLEAN DEFAULT true,
        created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (horario_id, dia_semana, bloque_horario_id)
      )
    `);

    await client.query(`COMMENT ON TABLE horario_detalle IS 'Cada celda del horario: día × bloque → materia + docente'`);
    await client.query(`COMMENT ON COLUMN horario_detalle.dia_semana IS '1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado'`);
    await client.query(`COMMENT ON COLUMN horario_detalle.asignacion_docente_id IS 'Referencia a asignacion_docente garantiza coherencia con la gestión'`);

    console.log('  ✅ Tabla horario_detalle creada');

    // =============================================
    // ÍNDICES
    // =============================================
    console.log('\n🔍 Creando índices...');

    const indices = [
      // bloque_horario
      `CREATE INDEX IF NOT EXISTS idx_bloque_horario_turno ON bloque_horario(turno_id)`,
      // horario
      `CREATE INDEX IF NOT EXISTS idx_horario_paralelo ON horario(paralelo_id)`,
      `CREATE INDEX IF NOT EXISTS idx_horario_periodo ON horario(periodo_academico_id)`,
      `CREATE INDEX IF NOT EXISTS idx_horario_estado ON horario(estado)`,
      // horario_detalle
      `CREATE INDEX IF NOT EXISTS idx_horario_detalle_horario ON horario_detalle(horario_id)`,
      `CREATE INDEX IF NOT EXISTS idx_horario_detalle_asignacion ON horario_detalle(asignacion_docente_id) WHERE asignacion_docente_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_horario_detalle_grado_materia ON horario_detalle(grado_materia_id)`,
      // Índice único anti-conflicto de docente (mismo docente, mismo día, mismo bloque, activo)
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_no_conflicto_docente
         ON horario_detalle (asignacion_docente_id, dia_semana, bloque_horario_id)
         WHERE activo = true AND asignacion_docente_id IS NOT NULL`,
    ];

    for (const idx of indices) {
      await client.query(idx);
    }

    console.log(`  ✅ ${indices.length} índices creados (incluye anti-conflicto de docente)`);

    // =============================================
    // TRIGGERS
    // =============================================
    console.log('\n⚡ Creando triggers...');

    await client.query(`
      CREATE OR REPLACE FUNCTION actualizar_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    const triggers = [
      { tabla: 'bloque_horario',  trigger: 'trg_bloque_horario_updated_at' },
      { tabla: 'horario',         trigger: 'trg_horario_updated_at' },
      { tabla: 'horario_detalle', trigger: 'trg_horario_detalle_updated_at' },
    ];

    for (const item of triggers) {
      await client.query(`DROP TRIGGER IF EXISTS ${item.trigger} ON ${item.tabla}`);
      await client.query(`
        CREATE TRIGGER ${item.trigger}
        BEFORE UPDATE ON ${item.tabla}
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
      `);
    }

    console.log('  ✅ Triggers de updated_at creados');

    // Trigger: al publicar horario, guardar fecha y usuario
    await client.query(`
      CREATE OR REPLACE FUNCTION registrar_publicacion_horario()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.estado = 'publicado' AND OLD.estado != 'publicado' THEN
          NEW.publicado_en = CURRENT_TIMESTAMP;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`DROP TRIGGER IF EXISTS trg_publicacion_horario ON horario`);
    await client.query(`
      CREATE TRIGGER trg_publicacion_horario
      BEFORE UPDATE ON horario
      FOR EACH ROW EXECUTE FUNCTION registrar_publicacion_horario()
    `);

    console.log('  ✅ Trigger de publicación de horario creado');

    // =============================================
    // DATOS SEMILLA — Bloques horarios
    // CORRECCIÓN: uso de IN con nombres exactos en lugar de LIKE '%ma%'
    // para evitar falsos positivos con otros turnos
    // =============================================
    console.log('\n📦 Insertando datos semilla...');

    // Bloques para turno mañana
    await client.query(`
      INSERT INTO bloque_horario (turno_id, nombre, codigo, numero, hora_inicio, hora_fin, es_recreo)
      SELECT t.id, b.nombre, b.codigo, b.numero, b.hora_inicio::TIME, b.hora_fin::TIME, b.es_recreo
      FROM turno t,
      (VALUES
        ('1ra Hora',  'BLQ-M-01', 1, '07:45', '08:30', false),
        ('2da Hora',  'BLQ-M-02', 2, '08:30', '09:15', false),
        ('3ra Hora',  'BLQ-M-03', 3, '09:15', '10:00', false),
        ('Recreo',    'BLQ-M-R1', 4, '10:00', '10:20', true),
        ('4ta Hora',  'BLQ-M-04', 5, '10:20', '11:05', false),
        ('5ta Hora',  'BLQ-M-05', 6, '11:05', '11:50', false),
        ('6ta Hora',  'BLQ-M-06', 7, '11:50', '12:35', false)
      ) AS b(nombre, codigo, numero, hora_inicio, hora_fin, es_recreo)
      WHERE LOWER(t.nombre) IN ('mañana', 'matutino', 'turno mañana', 'turno matutino')
      LIMIT 7
      ON CONFLICT (codigo) DO NOTHING
    `);

    // Bloques para turno tarde
    await client.query(`
      INSERT INTO bloque_horario (turno_id, nombre, codigo, numero, hora_inicio, hora_fin, es_recreo)
      SELECT t.id, b.nombre, b.codigo, b.numero, b.hora_inicio::TIME, b.hora_fin::TIME, b.es_recreo
      FROM turno t,
      (VALUES
        ('1ra Hora',  'BLQ-T-01', 1, '12:45', '13:30', false),
        ('2da Hora',  'BLQ-T-02', 2, '13:30', '14:15', false),
        ('3ra Hora',  'BLQ-T-03', 3, '14:15', '15:00', false),
        ('Recreo',    'BLQ-T-R1', 4, '15:00', '15:20', true),
        ('4ta Hora',  'BLQ-T-04', 5, '15:20', '16:05', false),
        ('5ta Hora',  'BLQ-T-05', 6, '16:05', '16:50', false),
        ('6ta Hora',  'BLQ-T-06', 7, '16:50', '17:35', false)
      ) AS b(nombre, codigo, numero, hora_inicio, hora_fin, es_recreo)
      WHERE LOWER(t.nombre) IN ('tarde', 'vespertino', 'turno tarde', 'turno vespertino')
      LIMIT 7
      ON CONFLICT (codigo) DO NOTHING
    `);

    console.log('  ✅ Bloques horarios insertados (mañana y tarde)');

    // Permisos del módulo
    await client.query(`
      INSERT INTO permisos (modulo, accion, nombre, descripcion)
      VALUES
        ('horario', 'leer',      'horario.leer',      'Ver horarios'),
        ('horario', 'crear',     'horario.crear',     'Crear horarios'),
        ('horario', 'actualizar','horario.actualizar','Editar horarios'),
        ('horario', 'eliminar',  'horario.eliminar',  'Eliminar horarios'),
        ('horario', 'publicar',  'horario.publicar',  'Publicar o archivar horarios'),
        ('bloque_horario', 'leer',      'bloque_horario.leer',      'Ver bloques horarios'),
        ('bloque_horario', 'crear',     'bloque_horario.crear',     'Crear bloques horarios'),
        ('bloque_horario', 'actualizar','bloque_horario.actualizar','Editar bloques horarios'),
        ('bloque_horario', 'eliminar',  'bloque_horario.eliminar',  'Eliminar bloques horarios')
      ON CONFLICT (nombre) DO NOTHING
    `);

    console.log('  ✅ Permisos del módulo insertados');

    await client.query('COMMIT');

    console.log('\n✅ ¡Módulo de Horarios creado exitosamente!\n');
    console.log('📊 RESUMEN:');
    console.log('┌──────────────────────────────────────────────────┐');
    console.log('│ ✅ 3 Tablas creadas                              │');
    console.log('│ ✅ 8 Índices de optimización                     │');
    console.log('│ ✅ 4 Triggers automáticos                        │');
    console.log('│ ✅ Bloques horarios mañana y tarde               │');
    console.log('│ ✅ 9 Permisos de acceso registrados              │');
    console.log('└──────────────────────────────────────────────────┘\n');
    console.log('💡 Próximos pasos:');
    console.log('   1. Verificar que los nombres de turnos en BD coincidan con el seed');
    console.log('   2. Crear horario por paralelo (estado: borrador)');
    console.log('   3. Asignar celdas día × bloque con materia y docente');
    console.log('   4. Publicar el horario para hacerlo visible\n');

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

crearModuloHorarios().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});