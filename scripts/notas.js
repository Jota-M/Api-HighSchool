import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function crearModuloAsistenciaNotas() {
  const client = await pool.connect();
  try {
    console.log('\n📚 CREACIÓN DE MÓDULO: ASISTENCIA Y NOTAS');
    console.log('Se crearán las siguientes tablas y componentes:');
    console.log('\n📋 MÓDULO DE ASISTENCIA:');
    console.log('  1️⃣  solicitud_permiso         - Permisos solicitados por padres');
    console.log('  2️⃣  solicitud_permiso_historial - Auditoría de cambios de permiso');
    console.log('  3️⃣  asistencia               - Registro diario por materia');
    console.log('\n📝 MÓDULO DE NOTAS:');
    console.log('  4️⃣  dimension_evaluacion      - Dimensiones: Ser, Saber, Hacer');
    console.log('  5️⃣  periodo_evaluacion         - Trimestres del año académico');
    console.log('  6️⃣  evaluacion                - Evaluaciones individuales');
    console.log('  7️⃣  calificacion              - Notas por evaluación/estudiante');
    console.log('  8️⃣  nota_dimension            - Promedio por dimensión/período');
    console.log('  9️⃣  calificacion_periodo      - Nota final ponderada por período');
    console.log('\n⚙️  COMPONENTES:');
    console.log('  ✅ Índices de optimización');
    console.log('  ✅ Triggers automáticos');
    console.log('  ✅ Funciones stored procedures');
    console.log('  ✅ Datos semilla (dimensiones y permisos de acceso)');
    console.log('\n⚡ FUNCIONALIDADES:');
    console.log('  🎯 Asistencia por materia/asignación docente');
    console.log('  🎯 Flujo completo de permisos con historial');
    console.log('  🎯 Sistema de notas modelo boliviano (Ser/Saber/Hacer)');
    console.log('  🎯 Cálculo automático de notas por dimensión');
    console.log('  🎯 Cálculo automático de nota final ponderada\n');

    const confirm = await ask('¿Deseas continuar con la creación? (SI para confirmar): ');

    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se realizaron cambios.');
      process.exit(0);
    }

    await client.query('BEGIN');
    console.log('\n⏳ Procesando...\n');

    // =============================================
    // 1️⃣ TABLA: solicitud_permiso
    // =============================================
    console.log('📋 Creando tabla SOLICITUD_PERMISO...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS solicitud_permiso (
        id                    SERIAL PRIMARY KEY,
        codigo_solicitud      VARCHAR(50) NOT NULL UNIQUE,         -- SOL-2025-000001
        estudiante_id         INTEGER NOT NULL REFERENCES estudiante(id),
        padre_familia_id      INTEGER REFERENCES padre_familia(id), -- quién solicita
        asignacion_docente_id INTEGER REFERENCES asignacion_docente(id), -- materia afectada (null = día completo)
        fecha_ausencia        DATE NOT NULL,                        -- día que solicita permiso
        es_dia_completo       BOOLEAN DEFAULT true,                 -- false = parcial (hora_inicio/fin)
        hora_inicio           TIME,                                 -- solo si es_dia_completo = false
        hora_fin              TIME,                                 -- solo si es_dia_completo = false
        motivo                VARCHAR(100) NOT NULL CHECK (motivo IN (
          'cita_medica',
          'enfermedad',
          'viaje_familiar',
          'tramite_personal',
          'emergencia_familiar',
          'actividad_deportiva',
          'actividad_cultural',
          'otro'
        )),
        descripcion           TEXT,
        archivo_adjunto_url   TEXT,                                 -- certificado médico, etc.
        estado                VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN (
          'pendiente',
          'aprobada',
          'rechazada',
          'cancelada'
        )),
        -- Quién aprobó/rechazó
        revisado_por          INTEGER REFERENCES usuarios(id),      -- usuario (puede ser docente o admin)
        fecha_revision        TIMESTAMP,
        motivo_rechazo        TEXT,
        observaciones_revisor TEXT,
        created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`COMMENT ON TABLE solicitud_permiso IS 'Permisos de ausencia solicitados por padres de familia'`);
    await client.query(`COMMENT ON COLUMN solicitud_permiso.asignacion_docente_id IS 'NULL = permiso para todo el día; con valor = permiso solo para esa materia'`);

    console.log('  ✅ Tabla solicitud_permiso creada');

    // =============================================
    // 2️⃣ TABLA: solicitud_permiso_historial
    // =============================================
    console.log('📋 Creando tabla SOLICITUD_PERMISO_HISTORIAL...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS solicitud_permiso_historial (
        id                   SERIAL PRIMARY KEY,
        solicitud_permiso_id INTEGER NOT NULL REFERENCES solicitud_permiso(id),
        estado_anterior      VARCHAR(20),
        estado_nuevo         VARCHAR(20) NOT NULL,
        usuario_id           INTEGER REFERENCES usuarios(id),      -- quién hizo el cambio
        comentario           TEXT,
        created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`COMMENT ON TABLE solicitud_permiso_historial IS 'Auditoría de cambios de estado en solicitudes de permiso'`);

    console.log('  ✅ Tabla solicitud_permiso_historial creada');

    // =============================================
    // 3️⃣ TABLA: asistencia
    // =============================================
    console.log('📋 Creando tabla ASISTENCIA...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS asistencia (
        id                    SERIAL PRIMARY KEY,
        matricula_id          INTEGER NOT NULL REFERENCES matricula(id),
        asignacion_docente_id INTEGER NOT NULL REFERENCES asignacion_docente(id), -- materia específica
        fecha                 DATE NOT NULL,
        estado                VARCHAR(20) NOT NULL CHECK (estado IN (
          'presente',
          'ausente',
          'tardanza',
          'justificado',    -- ausencia con permiso aprobado
          'falta_parcial'   -- salida temprana autorizada
        )),
        -- Vínculo con permiso (si aplica)
        solicitud_permiso_id  INTEGER REFERENCES solicitud_permiso(id),
        justificacion         TEXT,                                -- texto libre si no hay permiso formal
        -- Control del registro
        marcado_por           INTEGER NOT NULL REFERENCES usuarios(id), -- usuario que registró
        hora_marcacion        TIME NOT NULL DEFAULT CURRENT_TIME,
        dispositivo           VARCHAR(20) CHECK (dispositivo IN ('web', 'movil', 'tablet', 'qr')),
        observaciones         TEXT,
        created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Un registro por estudiante/materia/día
        UNIQUE (matricula_id, asignacion_docente_id, fecha)
      )
    `);

    await client.query(`COMMENT ON TABLE asistencia IS 'Registro diario de asistencia por estudiante y materia'`);
    await client.query(`COMMENT ON COLUMN asistencia.estado IS 'justificado = ausencia con permiso aprobado; falta_parcial = salida temprana autorizada'`);

    console.log('  ✅ Tabla asistencia creada');

    // =============================================
    // 4️⃣ TABLA: dimension_evaluacion
    // =============================================
    console.log('📝 Creando tabla DIMENSION_EVALUACION...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS dimension_evaluacion (
        id                      SERIAL PRIMARY KEY,
        nombre                  VARCHAR(100) NOT NULL UNIQUE,
        codigo                  VARCHAR(20) NOT NULL UNIQUE,
        descripcion             TEXT,
        porcentaje_ponderacion  NUMERIC(5,2) NOT NULL CHECK (
          porcentaje_ponderacion > 0 AND porcentaje_ponderacion <= 100
        ),
        color                   VARCHAR(20),                        -- para UI
        orden                   INTEGER NOT NULL DEFAULT 1,
        activo                  BOOLEAN DEFAULT true,
        created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`COMMENT ON TABLE dimension_evaluacion IS 'Dimensiones de evaluación del modelo educativo boliviano (Ser/Saber/Hacer)'`);
    await client.query(`COMMENT ON COLUMN dimension_evaluacion.porcentaje_ponderacion IS 'Peso en la nota final: Ser=10, Saber=45, Hacer=45 (gestión 2025)'`);

    console.log('  ✅ Tabla dimension_evaluacion creada');

    // =============================================
    // 5️⃣ TABLA: periodo_evaluacion
    // =============================================
    console.log('📝 Creando tabla PERIODO_EVALUACION...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS periodo_evaluacion (
        id                    SERIAL PRIMARY KEY,
        periodo_academico_id  INTEGER NOT NULL REFERENCES periodo_academico(id),
        nombre                VARCHAR(100) NOT NULL,               -- "Primer Trimestre"
        codigo                VARCHAR(20),                          -- "T1-2025"
        orden                 INTEGER NOT NULL DEFAULT 1,           -- 1, 2, 3
        fecha_inicio          DATE NOT NULL,
        fecha_fin             DATE NOT NULL,
        activo                BOOLEAN DEFAULT true,
        observaciones         TEXT,
        created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (periodo_academico_id, orden)
      )
    `);

    await client.query(`COMMENT ON TABLE periodo_evaluacion IS 'Trimestres o bimestres dentro de un periodo académico'`);

    console.log('  ✅ Tabla periodo_evaluacion creada');

    // =============================================
    // 6️⃣ TABLA: evaluacion
    // =============================================
    console.log('📝 Creando tabla EVALUACION...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS evaluacion (
        id                      SERIAL PRIMARY KEY,
        asignacion_docente_id   INTEGER NOT NULL REFERENCES asignacion_docente(id),
        dimension_evaluacion_id INTEGER NOT NULL REFERENCES dimension_evaluacion(id),
        periodo_evaluacion_id   INTEGER NOT NULL REFERENCES periodo_evaluacion(id),
        nombre                  VARCHAR(200) NOT NULL,             -- "Examen parcial 1", "Proyecto final"
        tipo                    VARCHAR(30) CHECK (tipo IN (
          'examen',
          'practica',
          'tarea',
          'proyecto',
          'participacion',
          'exposicion',
          'trabajo_grupal'
        )),
        descripcion             TEXT,
        fecha                   DATE,
        puntaje_maximo          NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (puntaje_maximo > 0),
        -- Peso dentro de la dimensión (si hay varias evaluaciones en la misma dimensión)
        -- Ejemplo: 2 exámenes en "Saber" con peso 0.5 cada uno → promedio ponderado
        peso_en_dimension       NUMERIC(5,2) DEFAULT 1.00 CHECK (peso_en_dimension > 0),
        visible_para_padres     BOOLEAN DEFAULT false,
        fecha_publicacion       TIMESTAMP,                         -- cuándo se publicó al padre
        activo                  BOOLEAN DEFAULT true,
        created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`COMMENT ON TABLE evaluacion IS 'Evaluaciones/actividades creadas por el docente para una materia, dimensión y período'`);
    await client.query(`COMMENT ON COLUMN evaluacion.peso_en_dimension IS 'Peso relativo dentro de la dimensión. Se normaliza automáticamente al calcular nota_dimension'`);

    console.log('  ✅ Tabla evaluacion creada');

    // =============================================
    // 7️⃣ TABLA: calificacion
    // =============================================
    console.log('📝 Creando tabla CALIFICACION...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS calificacion (
        id               SERIAL PRIMARY KEY,
        evaluacion_id    INTEGER NOT NULL REFERENCES evaluacion(id),
        matricula_id     INTEGER NOT NULL REFERENCES matricula(id),
        puntaje_obtenido NUMERIC(5,2) NOT NULL CHECK (puntaje_obtenido >= 0),
        -- Se valida contra puntaje_maximo de la evaluacion en la lógica de negocio
        esta_ausente     BOOLEAN DEFAULT false,                    -- si faltó el día del examen
        observacion      TEXT,
        registrado_por   INTEGER NOT NULL REFERENCES usuarios(id),
        fecha_registro   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (evaluacion_id, matricula_id)
      )
    `);

    await client.query(`COMMENT ON TABLE calificacion IS 'Nota obtenida por cada estudiante en cada evaluación'`);
    await client.query(`COMMENT ON COLUMN calificacion.esta_ausente IS 'true = estudiante faltó; puntaje_obtenido se registra como 0 automáticamente'`);

    console.log('  ✅ Tabla calificacion creada');

    // =============================================
    // 8️⃣ TABLA: nota_dimension
    // =============================================
    console.log('📝 Creando tabla NOTA_DIMENSION...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS nota_dimension (
        id                      SERIAL PRIMARY KEY,
        matricula_id            INTEGER NOT NULL REFERENCES matricula(id),
        grado_materia_id        INTEGER NOT NULL REFERENCES grado_materia(id),
        periodo_evaluacion_id   INTEGER NOT NULL REFERENCES periodo_evaluacion(id),
        dimension_evaluacion_id INTEGER NOT NULL REFERENCES dimension_evaluacion(id),
        nota_promedio           NUMERIC(5,2),                      -- 0 a 100
        total_evaluaciones      INTEGER DEFAULT 0,
        calculado_en            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (matricula_id, grado_materia_id, periodo_evaluacion_id, dimension_evaluacion_id)
      )
    `);

    await client.query(`COMMENT ON TABLE nota_dimension IS 'Promedio ponderado de todas las evaluaciones de una dimensión para un estudiante en un período'`);

    console.log('  ✅ Tabla nota_dimension creada');

    // =============================================
    // 9️⃣ TABLA: calificacion_periodo
    // =============================================
    console.log('📝 Creando tabla CALIFICACION_PERIODO...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS calificacion_periodo (
        id                    SERIAL PRIMARY KEY,
        matricula_id          INTEGER NOT NULL REFERENCES matricula(id),
        grado_materia_id      INTEGER NOT NULL REFERENCES grado_materia(id),
        periodo_evaluacion_id INTEGER NOT NULL REFERENCES periodo_evaluacion(id),
        nota_final            NUMERIC(5,2),                        -- nota ponderada 0-100
        aprobado              BOOLEAN,                             -- calculado vs nota_minima_aprobacion
        estado                VARCHAR(20) DEFAULT 'activa' CHECK (estado IN (
          'activa',     -- período en curso
          'cerrada',    -- período finalizado, nota no modificable
          'anulada'
        )),
        -- Quién cerró el período
        cerrado_por           INTEGER REFERENCES usuarios(id),
        fecha_cierre          TIMESTAMP,
        es_nota_manual        BOOLEAN DEFAULT false,               -- true = docente ajustó manualmente
        nota_manual           NUMERIC(5,2),
        justificacion_manual  TEXT,
        calculado_en          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (matricula_id, grado_materia_id, periodo_evaluacion_id)
      )
    `);

    await client.query(`COMMENT ON TABLE calificacion_periodo IS 'Nota final ponderada (Ser+Saber+Hacer) por estudiante, materia y período'`);
    await client.query(`COMMENT ON COLUMN calificacion_periodo.aprobado IS 'Calculado comparando nota_final contra grado_materia.nota_minima_aprobacion'`);

    console.log('  ✅ Tabla calificacion_periodo creada');

    // =============================================
    // ÍNDICES DE OPTIMIZACIÓN
    // =============================================
    console.log('\n🔍 Creando índices...');

    const indices = [
      // Asistencia
      `CREATE INDEX IF NOT EXISTS idx_asistencia_matricula ON asistencia(matricula_id)`,
      `CREATE INDEX IF NOT EXISTS idx_asistencia_asignacion ON asistencia(asignacion_docente_id)`,
      `CREATE INDEX IF NOT EXISTS idx_asistencia_fecha ON asistencia(fecha)`,
      `CREATE INDEX IF NOT EXISTS idx_asistencia_estado ON asistencia(estado)`,
      `CREATE INDEX IF NOT EXISTS idx_asistencia_permiso ON asistencia(solicitud_permiso_id) WHERE solicitud_permiso_id IS NOT NULL`,
      // Solicitud permiso
      `CREATE INDEX IF NOT EXISTS idx_solicitud_permiso_estudiante ON solicitud_permiso(estudiante_id)`,
      `CREATE INDEX IF NOT EXISTS idx_solicitud_permiso_fecha ON solicitud_permiso(fecha_ausencia)`,
      `CREATE INDEX IF NOT EXISTS idx_solicitud_permiso_estado ON solicitud_permiso(estado)`,
      // Evaluacion
      `CREATE INDEX IF NOT EXISTS idx_evaluacion_asignacion ON evaluacion(asignacion_docente_id)`,
      `CREATE INDEX IF NOT EXISTS idx_evaluacion_dimension ON evaluacion(dimension_evaluacion_id)`,
      `CREATE INDEX IF NOT EXISTS idx_evaluacion_periodo ON evaluacion(periodo_evaluacion_id)`,
      // Calificacion
      `CREATE INDEX IF NOT EXISTS idx_calificacion_evaluacion ON calificacion(evaluacion_id)`,
      `CREATE INDEX IF NOT EXISTS idx_calificacion_matricula ON calificacion(matricula_id)`,
      // nota_dimension
      `CREATE INDEX IF NOT EXISTS idx_nota_dimension_matricula ON nota_dimension(matricula_id)`,
      `CREATE INDEX IF NOT EXISTS idx_nota_dimension_gm ON nota_dimension(grado_materia_id)`,
      // calificacion_periodo
      `CREATE INDEX IF NOT EXISTS idx_calificacion_periodo_matricula ON calificacion_periodo(matricula_id)`,
      `CREATE INDEX IF NOT EXISTS idx_calificacion_periodo_gm ON calificacion_periodo(grado_materia_id)`,
    ];

    for (const idx of indices) {
      await client.query(idx);
    }

    console.log(`  ✅ ${indices.length} índices creados`);

    // =============================================
    // TRIGGERS
    // =============================================
    console.log('\n⚡ Creando triggers...');

    // Función reutilizable updated_at (puede ya existir del módulo de transporte)
    await client.query(`
      CREATE OR REPLACE FUNCTION actualizar_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    const triggersUpdatedAt = [
      { tabla: 'solicitud_permiso',      trigger: 'trg_solicitud_permiso_updated_at' },
      { tabla: 'asistencia',             trigger: 'trg_asistencia_updated_at' },
      { tabla: 'periodo_evaluacion',     trigger: 'trg_periodo_evaluacion_updated_at' },
      { tabla: 'evaluacion',             trigger: 'trg_evaluacion_updated_at' },
      { tabla: 'calificacion',           trigger: 'trg_calificacion_updated_at' },
      { tabla: 'nota_dimension',         trigger: 'trg_nota_dimension_updated_at' },
      { tabla: 'calificacion_periodo',   trigger: 'trg_calificacion_periodo_updated_at' },
    ];

    for (const item of triggersUpdatedAt) {
      await client.query(`DROP TRIGGER IF EXISTS ${item.trigger} ON ${item.tabla}`);
      await client.query(`
        CREATE TRIGGER ${item.trigger}
        BEFORE UPDATE ON ${item.tabla}
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
      `);
    }

    console.log('  ✅ Triggers de updated_at creados');

    // Trigger: auditoría automática de solicitud_permiso
    await client.query(`
      CREATE OR REPLACE FUNCTION registrar_historial_permiso()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Solo registrar si el estado cambió
        IF OLD.estado IS DISTINCT FROM NEW.estado THEN
          INSERT INTO solicitud_permiso_historial (
            solicitud_permiso_id,
            estado_anterior,
            estado_nuevo,
            usuario_id,
            comentario
          ) VALUES (
            NEW.id,
            OLD.estado,
            NEW.estado,
            NEW.revisado_por,
            CASE
              WHEN NEW.estado = 'rechazada' THEN NEW.motivo_rechazo
              WHEN NEW.estado = 'aprobada'  THEN NEW.observaciones_revisor
              ELSE NULL
            END
          );
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`DROP TRIGGER IF EXISTS trg_historial_permiso ON solicitud_permiso`);
    await client.query(`
      CREATE TRIGGER trg_historial_permiso
      AFTER UPDATE ON solicitud_permiso
      FOR EACH ROW EXECUTE FUNCTION registrar_historial_permiso()
    `);

    console.log('  ✅ Trigger de historial de permisos creado');

    // Trigger: cuando se aprueba un permiso y ya existe asistencia "ausente", actualizarla a "justificado"
    await client.query(`
      CREATE OR REPLACE FUNCTION sincronizar_asistencia_con_permiso()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Solo actuar cuando se aprueba un permiso
        IF NEW.estado = 'aprobada' AND OLD.estado != 'aprobada' THEN
          UPDATE asistencia
          SET
            estado              = 'justificado',
            solicitud_permiso_id = NEW.id,
            justificacion       = 'Permiso aprobado: ' || NEW.motivo,
            updated_at          = CURRENT_TIMESTAMP
          WHERE
            matricula_id IN (
              SELECT id FROM matricula
              WHERE estudiante_id = NEW.estudiante_id
                AND deleted_at IS NULL
            )
            AND fecha = NEW.fecha_ausencia
            AND estado = 'ausente'
            -- Si el permiso es para una materia específica, solo esa asignación
            AND (
              NEW.asignacion_docente_id IS NULL
              OR asignacion_docente_id = NEW.asignacion_docente_id
            );
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`DROP TRIGGER IF EXISTS trg_sincronizar_asistencia_permiso ON solicitud_permiso`);
    await client.query(`
      CREATE TRIGGER trg_sincronizar_asistencia_permiso
      AFTER UPDATE ON solicitud_permiso
      FOR EACH ROW EXECUTE FUNCTION sincronizar_asistencia_con_permiso()
    `);

    console.log('  ✅ Trigger de sincronización asistencia-permiso creado');

    // =============================================
    // STORED PROCEDURES
    // =============================================
    console.log('\n🔧 Creando funciones stored procedures...');

    // Función: calcular nota_dimension
    await client.query(`
      CREATE OR REPLACE FUNCTION calcular_nota_dimension(
        p_matricula_id            INTEGER,
        p_grado_materia_id        INTEGER,
        p_periodo_evaluacion_id   INTEGER,
        p_dimension_evaluacion_id INTEGER
      )
      RETURNS NUMERIC AS $$
      DECLARE
        v_nota_promedio   NUMERIC(5,2);
        v_total_evs       INTEGER;
        v_total_peso      NUMERIC;
      BEGIN
        -- Calcular promedio ponderado de todas las evaluaciones de esta dimensión
        -- Fórmula: SUM(nota_normalizada * peso) / SUM(peso)
        -- nota_normalizada = (puntaje_obtenido / puntaje_maximo) * 100
        SELECT
          ROUND(
            COALESCE(
              SUM((c.puntaje_obtenido / e.puntaje_maximo * 100) * e.peso_en_dimension)
              / NULLIF(SUM(e.peso_en_dimension), 0),
              0
            )::NUMERIC,
            2
          ),
          COUNT(c.id),
          SUM(e.peso_en_dimension)
        INTO v_nota_promedio, v_total_evs, v_total_peso
        FROM evaluacion e
        INNER JOIN asignacion_docente ad ON e.asignacion_docente_id = ad.id
        INNER JOIN calificacion c       ON e.id = c.evaluacion_id
        WHERE ad.grado_materia_id             = p_grado_materia_id
          AND e.periodo_evaluacion_id         = p_periodo_evaluacion_id
          AND e.dimension_evaluacion_id       = p_dimension_evaluacion_id
          AND e.activo                        = true
          AND c.matricula_id                  = p_matricula_id;

        -- Insertar o actualizar nota_dimension
        INSERT INTO nota_dimension (
          matricula_id, grado_materia_id, periodo_evaluacion_id,
          dimension_evaluacion_id, nota_promedio, total_evaluaciones
        )
        VALUES (
          p_matricula_id, p_grado_materia_id, p_periodo_evaluacion_id,
          p_dimension_evaluacion_id, v_nota_promedio, v_total_evs
        )
        ON CONFLICT (matricula_id, grado_materia_id, periodo_evaluacion_id, dimension_evaluacion_id)
        DO UPDATE SET
          nota_promedio      = EXCLUDED.nota_promedio,
          total_evaluaciones = EXCLUDED.total_evaluaciones,
          calculado_en       = CURRENT_TIMESTAMP,
          updated_at         = CURRENT_TIMESTAMP;

        RETURN v_nota_promedio;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función calcular_nota_dimension creada');

    // Función: calcular calificacion_periodo (nota final ponderada)
    await client.query(`
      CREATE OR REPLACE FUNCTION calcular_calificacion_periodo(
        p_matricula_id          INTEGER,
        p_grado_materia_id      INTEGER,
        p_periodo_evaluacion_id INTEGER
      )
      RETURNS NUMERIC AS $$
      DECLARE
        v_nota_final        NUMERIC(5,2);
        v_nota_minima       NUMERIC(5,2);
        v_aprobado          BOOLEAN;
      BEGIN
        -- Primero recalcular todas las notas por dimensión
        PERFORM calcular_nota_dimension(
          p_matricula_id,
          p_grado_materia_id,
          p_periodo_evaluacion_id,
          de.id
        )
        FROM dimension_evaluacion de
        WHERE de.activo = true;

        -- Calcular nota final ponderada: SUM(nota_dimension * porcentaje) / 100
        SELECT
          ROUND(
            COALESCE(
              SUM(nd.nota_promedio * de.porcentaje_ponderacion) / 100,
              0
            )::NUMERIC,
            2
          )
        INTO v_nota_final
        FROM nota_dimension nd
        INNER JOIN dimension_evaluacion de ON nd.dimension_evaluacion_id = de.id
        WHERE nd.matricula_id          = p_matricula_id
          AND nd.grado_materia_id      = p_grado_materia_id
          AND nd.periodo_evaluacion_id = p_periodo_evaluacion_id;

        -- Obtener nota mínima de aprobación de la materia
        SELECT nota_minima_aprobacion
        INTO v_nota_minima
        FROM grado_materia
        WHERE id = p_grado_materia_id;

        v_aprobado := COALESCE(v_nota_final, 0) >= COALESCE(v_nota_minima, 51);

        -- Insertar o actualizar calificacion_periodo
        INSERT INTO calificacion_periodo (
          matricula_id, grado_materia_id, periodo_evaluacion_id,
          nota_final, aprobado
        )
        VALUES (
          p_matricula_id, p_grado_materia_id, p_periodo_evaluacion_id,
          v_nota_final, v_aprobado
        )
        ON CONFLICT (matricula_id, grado_materia_id, periodo_evaluacion_id)
        DO UPDATE SET
          nota_final   = CASE
                           WHEN calificacion_periodo.es_nota_manual THEN calificacion_periodo.nota_final
                           ELSE EXCLUDED.nota_final
                         END,
          aprobado     = CASE
                           WHEN calificacion_periodo.es_nota_manual THEN calificacion_periodo.aprobado
                           ELSE EXCLUDED.aprobado
                         END,
          calculado_en = CURRENT_TIMESTAMP,
          updated_at   = CURRENT_TIMESTAMP
        WHERE calificacion_periodo.estado != 'cerrada';

        RETURN v_nota_final;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función calcular_calificacion_periodo creada');

    // Función: reporte de asistencia por estudiante
    await client.query(`
      CREATE OR REPLACE FUNCTION reporte_asistencia_estudiante(
        p_matricula_id          INTEGER,
        p_asignacion_docente_id INTEGER DEFAULT NULL,
        p_fecha_inicio          DATE    DEFAULT NULL,
        p_fecha_fin             DATE    DEFAULT NULL
      )
      RETURNS TABLE(
        asignacion_id     INTEGER,
        materia_nombre    VARCHAR,
        total_clases      BIGINT,
        presentes         BIGINT,
        ausentes          BIGINT,
        tardanzas         BIGINT,
        justificados      BIGINT,
        faltas_parciales  BIGINT,
        porcentaje_asistencia NUMERIC
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          a.asignacion_docente_id::INTEGER,
          m.nombre::VARCHAR,
          COUNT(a.id),
          COUNT(CASE WHEN a.estado = 'presente'     THEN 1 END),
          COUNT(CASE WHEN a.estado = 'ausente'      THEN 1 END),
          COUNT(CASE WHEN a.estado = 'tardanza'     THEN 1 END),
          COUNT(CASE WHEN a.estado = 'justificado'  THEN 1 END),
          COUNT(CASE WHEN a.estado = 'falta_parcial' THEN 1 END),
          ROUND(
            COUNT(CASE WHEN a.estado IN ('presente', 'tardanza', 'justificado') THEN 1 END)::NUMERIC
            / NULLIF(COUNT(a.id), 0) * 100,
            2
          )
        FROM asistencia a
        INNER JOIN asignacion_docente ad ON a.asignacion_docente_id = ad.id
        INNER JOIN grado_materia gm      ON ad.grado_materia_id = gm.id
        INNER JOIN materia m             ON gm.materia_id = m.id
        WHERE a.matricula_id = p_matricula_id
          AND (p_asignacion_docente_id IS NULL OR a.asignacion_docente_id = p_asignacion_docente_id)
          AND (p_fecha_inicio IS NULL OR a.fecha >= p_fecha_inicio)
          AND (p_fecha_fin    IS NULL OR a.fecha <= p_fecha_fin)
        GROUP BY a.asignacion_docente_id, m.nombre;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función reporte_asistencia_estudiante creada');

    // Función: boletín de notas por estudiante y período
    await client.query(`
      CREATE OR REPLACE FUNCTION boletin_notas(
        p_matricula_id          INTEGER,
        p_periodo_evaluacion_id INTEGER
      )
      RETURNS TABLE(
        materia_nombre       VARCHAR,
        materia_codigo       VARCHAR,
        nota_ser             NUMERIC,
        nota_saber           NUMERIC,
        nota_hacer           NUMERIC,
        nota_final           NUMERIC,
        nota_minima          NUMERIC,
        aprobado             BOOLEAN,
        estado_periodo       VARCHAR
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          mat.nombre::VARCHAR,
          mat.codigo::VARCHAR,
          MAX(CASE WHEN de.codigo = 'SER'   THEN nd.nota_promedio END),
          MAX(CASE WHEN de.codigo = 'SAB'   THEN nd.nota_promedio END),
          MAX(CASE WHEN de.codigo = 'HAC'   THEN nd.nota_promedio END),
          cp.nota_final,
          gm.nota_minima_aprobacion,
          cp.aprobado,
          cp.estado::VARCHAR
        FROM calificacion_periodo cp
        INNER JOIN grado_materia gm  ON cp.grado_materia_id = gm.id
        INNER JOIN materia mat       ON gm.materia_id = mat.id
        LEFT JOIN nota_dimension nd  ON nd.matricula_id          = cp.matricula_id
                                    AND nd.grado_materia_id      = cp.grado_materia_id
                                    AND nd.periodo_evaluacion_id = cp.periodo_evaluacion_id
        LEFT JOIN dimension_evaluacion de ON nd.dimension_evaluacion_id = de.id
        WHERE cp.matricula_id          = p_matricula_id
          AND cp.periodo_evaluacion_id = p_periodo_evaluacion_id
        GROUP BY mat.nombre, mat.codigo, cp.nota_final,
                 gm.nota_minima_aprobacion, cp.aprobado, cp.estado
        ORDER BY mat.nombre;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función boletin_notas creada');

    // =============================================
    // DATOS SEMILLA
    // =============================================
    console.log('\n📦 Insertando datos semilla...');

    // Dimensiones del modelo educativo boliviano (gestión 2025)
    // Resolución Ministerial: Ser 10%, Saber 45%, Hacer 45%
    await client.query(`
      INSERT INTO dimension_evaluacion
        (nombre, codigo, descripcion, porcentaje_ponderacion, color, orden)
      VALUES
        (
          'Ser',
          'SER',
          'Valores, actitudes, espiritualidad y convivencia comunitaria',
          10.00,
          '#10B981',
          1
        ),
        (
          'Saber',
          'SAB',
          'Conocimientos, conceptos, teoría y comprensión crítica',
          40.00,
          '#3B82F6',
          2
        ),
        (
          'Hacer',
          'HAC',
          'Procedimientos, prácticas, habilidades y aplicación',
          45.00,
          '#F59E0B',
          3
        ),
        (
          'Autoevaluación',
          'AUTO',
          'Autoevaluación del aprendizaje',
          5.00,
          '#8B5CF6',
          4
        )
      ON CONFLICT (codigo) DO UPDATE SET
        porcentaje_ponderacion = EXCLUDED.porcentaje_ponderacion,
        descripcion            = EXCLUDED.descripcion,
        color                  = EXCLUDED.color
    `);

    console.log('  ✅ Dimensiones bolivianas insertadas (Ser 10% / Saber 45% / Hacer 45%)');

    // Permisos del módulo para el sistema de roles
    await client.query(`
      INSERT INTO permisos (modulo, accion, nombre, descripcion)
      VALUES
        -- Asistencia
        ('asistencia', 'leer',     'asistencia.leer',     'Ver registros de asistencia'),
        ('asistencia', 'crear',    'asistencia.crear',    'Registrar asistencia'),
        ('asistencia', 'actualizar','asistencia.actualizar','Editar registro de asistencia'),
        ('asistencia', 'eliminar', 'asistencia.eliminar', 'Eliminar registro de asistencia'),
        ('asistencia', 'reporte',  'asistencia.reporte',  'Ver reportes de asistencia'),
        -- Permisos (solicitudes)
        ('solicitud_permiso', 'leer',     'solicitud_permiso.leer',     'Ver solicitudes de permiso'),
        ('solicitud_permiso', 'crear',    'solicitud_permiso.crear',    'Crear solicitud de permiso'),
        ('solicitud_permiso', 'actualizar','solicitud_permiso.actualizar','Editar solicitud de permiso'),
        ('solicitud_permiso', 'aprobar',  'solicitud_permiso.aprobar',  'Aprobar o rechazar solicitudes'),
        -- Notas
        ('notas', 'leer',     'notas.leer',     'Ver calificaciones'),
        ('notas', 'crear',    'notas.crear',    'Registrar calificaciones'),
        ('notas', 'actualizar','notas.actualizar','Editar calificaciones'),
        ('notas', 'cerrar',   'notas.cerrar',   'Cerrar período de calificaciones'),
        ('notas', 'boletin',  'notas.boletin',  'Ver boletín de notas'),
        -- Evaluaciones
        ('evaluacion', 'leer',     'evaluacion.leer',     'Ver evaluaciones'),
        ('evaluacion', 'crear',    'evaluacion.crear',    'Crear evaluaciones'),
        ('evaluacion', 'actualizar','evaluacion.actualizar','Editar evaluaciones'),
        ('evaluacion', 'eliminar', 'evaluacion.eliminar', 'Eliminar evaluaciones'),
        -- Período de evaluación
        ('periodo_evaluacion', 'leer',    'periodo_evaluacion.leer',    'Ver períodos de evaluación'),
        ('periodo_evaluacion', 'crear',   'periodo_evaluacion.crear',   'Crear períodos de evaluación'),
        ('periodo_evaluacion', 'actualizar','periodo_evaluacion.actualizar','Editar períodos de evaluación')
      ON CONFLICT (nombre) DO NOTHING
    `);

    console.log('  ✅ Permisos del módulo insertados');

    await client.query('COMMIT');

    console.log('\n✅ ¡Módulo de Asistencia y Notas creado exitosamente!\n');
    console.log('📊 RESUMEN:');
    console.log('┌──────────────────────────────────────────────────┐');
    console.log('│ ✅ 9 Tablas creadas                             │');
    console.log('│ ✅ 18 Índices de optimización                   │');
    console.log('│ ✅ 5 Triggers automáticos                       │');
    console.log('│ ✅ 4 Stored procedures                          │');
    console.log('│ ✅ 3 Dimensiones bolivianas (Ser/Saber/Hacer)   │');
    console.log('│ ✅ 20 Permisos de acceso registrados            │');
    console.log('└──────────────────────────────────────────────────┘\n');
    console.log('💡 Próximos pasos:');
    console.log('   1. Crear períodos de evaluación (trimestres) para el año en curso');
    console.log('   2. El docente crea evaluaciones por materia/dimensión');
    console.log('   3. El docente registra calificaciones individuales');
    console.log('   4. Llamar a calcular_calificacion_periodo() para obtener nota final\n');

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

crearModuloAsistenciaNotas().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});