import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function crearModuloSeguimientoPedagogico() {
  const client = await pool.connect();
  try {
    console.log('\n📋 CREACIÓN DE MÓDULO: SEGUIMIENTO PEDAGÓGICO');
    console.log('Se crearán las siguientes tablas y componentes:');
    console.log('\n📋 ESTRUCTURA DEL MÓDULO:');
    console.log('  1️⃣  categoria_observacion      - Catálogo de categorías (Conducta, Socioemocional, etc.)');
    console.log('  2️⃣  plantilla_observacion       - Frases rápidas predefinidas por categoría');
    console.log('  3️⃣  observacion_pedagogica      - Registro central de observaciones del docente');
    console.log('  4️⃣  observacion_pedagogica_historial - Auditoría de cambios de visibilidad/estado');
    console.log('  5️⃣  acuse_recibo_padre          - El padre confirma lectura y puede responder');
    console.log('\n⚙️  COMPONENTES:');
    console.log('  ✅ Índices de optimización');
    console.log('  ✅ Triggers automáticos');
    console.log('  ✅ Stored procedures para reportes');
    console.log('  ✅ Datos semilla (categorías, plantillas y permisos)');
    console.log('\n⚡ FUNCIONALIDADES:');
    console.log('  🎯 Registro cualitativo por materia y estudiante');
    console.log('  🎯 Control de visibilidad: interna (docente) o visible al padre');
    console.log('  🎯 Niveles de relevancia: informativo / requiere_atención / urgente');
    console.log('  🎯 Plantillas rápidas para agilizar el registro');
    console.log('  🎯 Acuse de recibo del padre con comentario opcional');
    console.log('  🎯 Auditoría completa de cambios');
    console.log('  🎯 Reporte de línea de tiempo por estudiante\n');

    const confirm = await ask('¿Deseas continuar con la creación? (SI para confirmar): ');

    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se realizaron cambios.');
      process.exit(0);
    }

    await client.query('BEGIN');
    console.log('\n⏳ Procesando...\n');

    // =============================================
    // 1️⃣ TABLA: categoria_observacion
    // =============================================
    console.log('📋 Creando tabla CATEGORIA_OBSERVACION...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS categoria_observacion (
        id          SERIAL PRIMARY KEY,
        nombre      VARCHAR(100) NOT NULL UNIQUE,
        codigo      VARCHAR(30)  NOT NULL UNIQUE,
        descripcion TEXT,
        color       VARCHAR(20),
        icono       VARCHAR(50),
        orden       INTEGER NOT NULL DEFAULT 1,
        activo      BOOLEAN DEFAULT true,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`COMMENT ON TABLE categoria_observacion IS 'Catálogo de categorías para clasificar observaciones pedagógicas'`);

    console.log('  ✅ Tabla categoria_observacion creada');

    // =============================================
    // 2️⃣ TABLA: plantilla_observacion
    // =============================================
    console.log('📋 Creando tabla PLANTILLA_OBSERVACION...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS plantilla_observacion (
        id                      SERIAL PRIMARY KEY,
        categoria_observacion_id INTEGER NOT NULL REFERENCES categoria_observacion(id),
        texto                   TEXT NOT NULL,
        nivel_relevancia        VARCHAR(20) NOT NULL DEFAULT 'informativo' CHECK (nivel_relevancia IN (
          'informativo',
          'requiere_atencion',
          'urgente'
        )),
        orden                   INTEGER DEFAULT 1,
        activo                  BOOLEAN DEFAULT true,
        created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`COMMENT ON TABLE plantilla_observacion IS 'Frases rápidas predefinidas para agilizar el registro del docente'`);

    console.log('  ✅ Tabla plantilla_observacion creada');

    // =============================================
    // 3️⃣ TABLA: observacion_pedagogica
    // =============================================
    console.log('📋 Creando tabla OBSERVACION_PEDAGOGICA...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS observacion_pedagogica (
        id                       SERIAL PRIMARY KEY,
        codigo_observacion       VARCHAR(50) NOT NULL UNIQUE,          -- OBS-2025-000001

        -- Quién y sobre quién
        docente_id               INTEGER NOT NULL REFERENCES docente(id),
        matricula_id             INTEGER NOT NULL REFERENCES matricula(id),
        asignacion_docente_id    INTEGER REFERENCES asignacion_docente(id), -- NULL = general (no ligada a materia)
        periodo_academico_id     INTEGER NOT NULL REFERENCES periodo_academico(id),

        -- Clasificación
        categoria_observacion_id INTEGER NOT NULL REFERENCES categoria_observacion(id),
        nivel_relevancia         VARCHAR(20) NOT NULL DEFAULT 'informativo' CHECK (nivel_relevancia IN (
          'informativo',
          'requiere_atencion',
          'urgente'
        )),

        -- Contenido
        descripcion              TEXT NOT NULL,
        fecha_ocurrencia         DATE NOT NULL DEFAULT CURRENT_DATE,   -- fecha del hecho observado
        plantilla_id             INTEGER REFERENCES plantilla_observacion(id), -- si usó plantilla rápida

        -- Visibilidad
        visible_para_padre       BOOLEAN DEFAULT false,                -- false = nota interna del docente
        fecha_publicacion        TIMESTAMP,                            -- cuándo se hizo visible al padre
        publicado_por            INTEGER REFERENCES usuarios(id),

        -- Estado
        activo                   BOOLEAN DEFAULT true,
        created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at               TIMESTAMP
      )
    `);

    await client.query(`COMMENT ON TABLE observacion_pedagogica IS 'Registro cualitativo de observaciones del docente sobre un estudiante'`);
    await client.query(`COMMENT ON COLUMN observacion_pedagogica.asignacion_docente_id IS 'NULL = observación general no vinculada a una materia específica'`);
    await client.query(`COMMENT ON COLUMN observacion_pedagogica.visible_para_padre IS 'false = nota interna; true = visible en el panel del padre de familia'`);
    await client.query(`COMMENT ON COLUMN observacion_pedagogica.fecha_ocurrencia IS 'Fecha del hecho observado (puede diferir de created_at si el docente registra luego)'`);

    console.log('  ✅ Tabla observacion_pedagogica creada');

    // =============================================
    // 4️⃣ TABLA: observacion_pedagogica_historial
    // =============================================
    console.log('📋 Creando tabla OBSERVACION_PEDAGOGICA_HISTORIAL...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS observacion_pedagogica_historial (
        id                        SERIAL PRIMARY KEY,
        observacion_pedagogica_id INTEGER NOT NULL REFERENCES observacion_pedagogica(id),
        campo_modificado          VARCHAR(50) NOT NULL,                -- 'visible_para_padre', 'descripcion', 'nivel_relevancia'
        valor_anterior            TEXT,
        valor_nuevo               TEXT,
        usuario_id                INTEGER REFERENCES usuarios(id),
        comentario                TEXT,
        created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`COMMENT ON TABLE observacion_pedagogica_historial IS 'Auditoría de cambios sobre observaciones pedagógicas'`);

    console.log('  ✅ Tabla observacion_pedagogica_historial creada');

    // =============================================
    // 5️⃣ TABLA: acuse_recibo_padre
    // =============================================
    console.log('📋 Creando tabla ACUSE_RECIBO_PADRE...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS acuse_recibo_padre (
        id                        SERIAL PRIMARY KEY,
        observacion_pedagogica_id INTEGER NOT NULL REFERENCES observacion_pedagogica(id),
        padre_familia_id          INTEGER NOT NULL REFERENCES padre_familia(id),
        fecha_lectura             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        comentario_padre          TEXT,                                -- respuesta opcional del padre
        created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (observacion_pedagogica_id, padre_familia_id)           -- un acuse por padre/observación
      )
    `);

    await client.query(`COMMENT ON TABLE acuse_recibo_padre IS 'Registro de lectura y respuesta del padre de familia a observaciones pedagógicas'`);

    console.log('  ✅ Tabla acuse_recibo_padre creada');

    // =============================================
    // ÍNDICES DE OPTIMIZACIÓN
    // =============================================
    console.log('\n🔍 Creando índices...');

    const indices = [
      // observacion_pedagogica — los más consultados
      `CREATE INDEX IF NOT EXISTS idx_obs_ped_matricula      ON observacion_pedagogica(matricula_id)`,
      `CREATE INDEX IF NOT EXISTS idx_obs_ped_docente        ON observacion_pedagogica(docente_id)`,
      `CREATE INDEX IF NOT EXISTS idx_obs_ped_asignacion     ON observacion_pedagogica(asignacion_docente_id) WHERE asignacion_docente_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_obs_ped_periodo        ON observacion_pedagogica(periodo_academico_id)`,
      `CREATE INDEX IF NOT EXISTS idx_obs_ped_categoria      ON observacion_pedagogica(categoria_observacion_id)`,
      `CREATE INDEX IF NOT EXISTS idx_obs_ped_relevancia     ON observacion_pedagogica(nivel_relevancia)`,
      `CREATE INDEX IF NOT EXISTS idx_obs_ped_visible        ON observacion_pedagogica(visible_para_padre) WHERE visible_para_padre = true`,
      `CREATE INDEX IF NOT EXISTS idx_obs_ped_fecha          ON observacion_pedagogica(fecha_ocurrencia)`,
      `CREATE INDEX IF NOT EXISTS idx_obs_ped_activo         ON observacion_pedagogica(activo, deleted_at) WHERE activo = true AND deleted_at IS NULL`,
      // Índice compuesto para el panel del padre: estudiante + visibles + período
      `CREATE INDEX IF NOT EXISTS idx_obs_ped_padre_panel    ON observacion_pedagogica(matricula_id, visible_para_padre, periodo_academico_id) WHERE activo = true AND deleted_at IS NULL`,
      // historial
      `CREATE INDEX IF NOT EXISTS idx_obs_hist_observacion   ON observacion_pedagogica_historial(observacion_pedagogica_id)`,
      // acuse
      `CREATE INDEX IF NOT EXISTS idx_acuse_observacion      ON acuse_recibo_padre(observacion_pedagogica_id)`,
      `CREATE INDEX IF NOT EXISTS idx_acuse_padre            ON acuse_recibo_padre(padre_familia_id)`,
      // plantillas
      `CREATE INDEX IF NOT EXISTS idx_plantilla_categoria    ON plantilla_observacion(categoria_observacion_id)`,
      `CREATE INDEX IF NOT EXISTS idx_plantilla_activo       ON plantilla_observacion(activo) WHERE activo = true`,
    ];

    for (const idx of indices) {
      await client.query(idx);
    }

    console.log(`  ✅ ${indices.length} índices creados`);

    // =============================================
    // TRIGGERS
    // =============================================
    console.log('\n⚡ Creando triggers...');

    // Función updated_at (reutiliza la existente si ya existe)
    await client.query(`
      CREATE OR REPLACE FUNCTION actualizar_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`DROP TRIGGER IF EXISTS trg_obs_ped_updated_at ON observacion_pedagogica`);
    await client.query(`
      CREATE TRIGGER trg_obs_ped_updated_at
      BEFORE UPDATE ON observacion_pedagogica
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `);

    console.log('  ✅ Trigger updated_at creado');

    // Trigger: auditoría automática al modificar campos sensibles
    await client.query(`
      CREATE OR REPLACE FUNCTION registrar_historial_observacion()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Auditar cambio de visibilidad
        IF OLD.visible_para_padre IS DISTINCT FROM NEW.visible_para_padre THEN
          INSERT INTO observacion_pedagogica_historial (
            observacion_pedagogica_id, campo_modificado,
            valor_anterior, valor_nuevo, usuario_id,
            comentario
          ) VALUES (
            NEW.id,
            'visible_para_padre',
            OLD.visible_para_padre::TEXT,
            NEW.visible_para_padre::TEXT,
            NEW.publicado_por,
            CASE
              WHEN NEW.visible_para_padre THEN 'Observación publicada al padre'
              ELSE 'Observación ocultada al padre'
            END
          );
        END IF;

        -- Auditar cambio de nivel de relevancia
        IF OLD.nivel_relevancia IS DISTINCT FROM NEW.nivel_relevancia THEN
          INSERT INTO observacion_pedagogica_historial (
            observacion_pedagogica_id, campo_modificado,
            valor_anterior, valor_nuevo
          ) VALUES (
            NEW.id,
            'nivel_relevancia',
            OLD.nivel_relevancia,
            NEW.nivel_relevancia
          );
        END IF;

        -- Auditar edición de descripción
        IF OLD.descripcion IS DISTINCT FROM NEW.descripcion THEN
          INSERT INTO observacion_pedagogica_historial (
            observacion_pedagogica_id, campo_modificado,
            valor_anterior, valor_nuevo,
            comentario
          ) VALUES (
            NEW.id,
            'descripcion',
            LEFT(OLD.descripcion, 200),   -- guardar solo los primeros 200 chars
            LEFT(NEW.descripcion, 200),
            'Descripción editada'
          );
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`DROP TRIGGER IF EXISTS trg_historial_observacion ON observacion_pedagogica`);
    await client.query(`
      CREATE TRIGGER trg_historial_observacion
      AFTER UPDATE ON observacion_pedagogica
      FOR EACH ROW EXECUTE FUNCTION registrar_historial_observacion()
    `);

    console.log('  ✅ Trigger de auditoría de observaciones creado');

    // Trigger: cuando se publica (visible_para_padre = true), registrar fecha_publicacion
    await client.query(`
      CREATE OR REPLACE FUNCTION registrar_fecha_publicacion_obs()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.visible_para_padre = true AND (OLD.visible_para_padre = false OR OLD.visible_para_padre IS NULL) THEN
          NEW.fecha_publicacion = CURRENT_TIMESTAMP;
        END IF;
        IF NEW.visible_para_padre = false AND OLD.visible_para_padre = true THEN
          NEW.fecha_publicacion = NULL;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`DROP TRIGGER IF EXISTS trg_fecha_publicacion_obs ON observacion_pedagogica`);
    await client.query(`
      CREATE TRIGGER trg_fecha_publicacion_obs
      BEFORE UPDATE ON observacion_pedagogica
      FOR EACH ROW EXECUTE FUNCTION registrar_fecha_publicacion_obs()
    `);

    console.log('  ✅ Trigger de fecha de publicación creado');

    // =============================================
    // STORED PROCEDURES
    // =============================================
    console.log('\n🔧 Creando stored procedures...');

    // Función: línea de tiempo de observaciones de un estudiante (vista del docente)
    await client.query(`
      CREATE OR REPLACE FUNCTION linea_tiempo_observaciones(
        p_matricula_id          INTEGER,
        p_periodo_academico_id  INTEGER  DEFAULT NULL,
        p_categoria_id          INTEGER  DEFAULT NULL,
        p_nivel_relevancia      VARCHAR  DEFAULT NULL,
        p_solo_visibles_padre   BOOLEAN  DEFAULT false
      )
      RETURNS TABLE(
        observacion_id          INTEGER,
        codigo_observacion      VARCHAR,
        fecha_ocurrencia        DATE,
        categoria_nombre        VARCHAR,
        categoria_color         VARCHAR,
        nivel_relevancia        VARCHAR,
        descripcion             TEXT,
        materia_nombre          VARCHAR,
        docente_nombres         VARCHAR,
        visible_para_padre      BOOLEAN,
        fecha_publicacion       TIMESTAMP,
        acuse_leido             BOOLEAN,
        fecha_lectura           TIMESTAMP,
        comentario_padre        TEXT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          op.id::INTEGER,
          op.codigo_observacion::VARCHAR,
          op.fecha_ocurrencia::DATE,
          co.nombre::VARCHAR,
          co.color::VARCHAR,
          op.nivel_relevancia::VARCHAR,
          op.descripcion::TEXT,
          m.nombre::VARCHAR,
          (d.nombres || ' ' || d.apellido_paterno)::VARCHAR,
          op.visible_para_padre::BOOLEAN,
          op.fecha_publicacion::TIMESTAMP,
          (arp.id IS NOT NULL)::BOOLEAN,
          arp.fecha_lectura::TIMESTAMP,
          arp.comentario_padre::TEXT
        FROM observacion_pedagogica op
        INNER JOIN categoria_observacion co     ON op.categoria_observacion_id = co.id
        INNER JOIN docente d                    ON op.docente_id = d.id
        LEFT JOIN  asignacion_docente ad        ON op.asignacion_docente_id = ad.id
        LEFT JOIN  grado_materia gm             ON ad.grado_materia_id = gm.id
        LEFT JOIN  materia m                    ON gm.materia_id = m.id
        LEFT JOIN  acuse_recibo_padre arp       ON op.id = arp.observacion_pedagogica_id
        LEFT JOIN  estudiante_tutor et          ON et.estudiante_id = (
          SELECT estudiante_id FROM matricula WHERE id = p_matricula_id
        ) AND et.padre_familia_id = arp.padre_familia_id
        WHERE op.matricula_id = p_matricula_id
          AND op.activo = true
          AND op.deleted_at IS NULL
          AND (p_periodo_academico_id IS NULL OR op.periodo_academico_id = p_periodo_academico_id)
          AND (p_categoria_id         IS NULL OR op.categoria_observacion_id = p_categoria_id)
          AND (p_nivel_relevancia      IS NULL OR op.nivel_relevancia = p_nivel_relevancia)
          AND (NOT p_solo_visibles_padre OR op.visible_para_padre = true)
        ORDER BY op.fecha_ocurrencia DESC, op.created_at DESC;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función linea_tiempo_observaciones creada');

    // Función: resumen de observaciones por estudiante en un período (para el padre)
    await client.query(`
      CREATE OR REPLACE FUNCTION resumen_observaciones_padre(
        p_padre_familia_id     INTEGER,
        p_periodo_academico_id INTEGER DEFAULT NULL
      )
      RETURNS TABLE(
        estudiante_id          INTEGER,
        estudiante_nombres     VARCHAR,
        estudiante_apellidos   VARCHAR,
        estudiante_codigo      VARCHAR,
        total_observaciones    BIGINT,
        informativos           BIGINT,
        requieren_atencion     BIGINT,
        urgentes               BIGINT,
        no_leidos              BIGINT,
        ultima_observacion     DATE
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          e.id::INTEGER,
          e.nombres::VARCHAR,
          e.apellidos::VARCHAR,
          e.codigo::VARCHAR,
          COUNT(op.id),
          COUNT(CASE WHEN op.nivel_relevancia = 'informativo'       THEN 1 END),
          COUNT(CASE WHEN op.nivel_relevancia = 'requiere_atencion' THEN 1 END),
          COUNT(CASE WHEN op.nivel_relevancia = 'urgente'           THEN 1 END),
          COUNT(CASE WHEN arp.id IS NULL                            THEN 1 END),
          MAX(op.fecha_ocurrencia)
        FROM estudiante_tutor et
        INNER JOIN estudiante e       ON et.estudiante_id = e.id
        INNER JOIN matricula mat_e    ON mat_e.estudiante_id = e.id
                                     AND mat_e.deleted_at IS NULL
                                     AND mat_e.estado = 'activo'
        INNER JOIN observacion_pedagogica op
                                      ON op.matricula_id = mat_e.id
                                     AND op.visible_para_padre = true
                                     AND op.activo = true
                                     AND op.deleted_at IS NULL
        LEFT JOIN  acuse_recibo_padre arp
                                      ON arp.observacion_pedagogica_id = op.id
                                     AND arp.padre_familia_id = p_padre_familia_id
        WHERE et.padre_familia_id = p_padre_familia_id
          AND et.recibe_notificaciones = true
          AND (p_periodo_academico_id IS NULL OR op.periodo_academico_id = p_periodo_academico_id)
        GROUP BY e.id, e.nombres, e.apellidos, e.codigo
        ORDER BY COUNT(CASE WHEN arp.id IS NULL THEN 1 END) DESC, e.apellidos;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función resumen_observaciones_padre creada');

    // Función: resumen para el docente — observaciones por paralelo/materia
    await client.query(`
      CREATE OR REPLACE FUNCTION resumen_obs_por_asignacion(
        p_asignacion_docente_id INTEGER,
        p_periodo_academico_id  INTEGER DEFAULT NULL
      )
      RETURNS TABLE(
        matricula_id            INTEGER,
        estudiante_nombres      VARCHAR,
        estudiante_apellidos    VARCHAR,
        estudiante_codigo       VARCHAR,
        total_obs               BIGINT,
        informativos            BIGINT,
        requieren_atencion      BIGINT,
        urgentes                BIGINT,
        visibles_padre          BIGINT,
        no_acusados             BIGINT,
        ultima_obs_fecha        DATE
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          m.id::INTEGER,
          e.nombres::VARCHAR,
          e.apellidos::VARCHAR,
          e.codigo::VARCHAR,
          COUNT(op.id),
          COUNT(CASE WHEN op.nivel_relevancia = 'informativo'       THEN 1 END),
          COUNT(CASE WHEN op.nivel_relevancia = 'requiere_atencion' THEN 1 END),
          COUNT(CASE WHEN op.nivel_relevancia = 'urgente'           THEN 1 END),
          COUNT(CASE WHEN op.visible_para_padre = true              THEN 1 END),
          COUNT(CASE WHEN op.visible_para_padre = true AND arp.id IS NULL THEN 1 END),
          MAX(op.fecha_ocurrencia)
        FROM asignacion_docente ad
        INNER JOIN matricula m  ON m.paralelo_id          = ad.paralelo_id
                               AND m.periodo_academico_id = ad.periodo_academico_id
                               AND m.estado               = 'activo'
                               AND m.deleted_at           IS NULL
        INNER JOIN estudiante e ON e.id = m.estudiante_id
        LEFT JOIN  observacion_pedagogica op
                               ON op.matricula_id             = m.id
                              AND op.asignacion_docente_id    = ad.id
                              AND op.activo                   = true
                              AND op.deleted_at               IS NULL
                              AND (p_periodo_academico_id IS NULL OR op.periodo_academico_id = p_periodo_academico_id)
        LEFT JOIN  acuse_recibo_padre arp ON arp.observacion_pedagogica_id = op.id
        WHERE ad.id = p_asignacion_docente_id
        GROUP BY m.id, e.nombres, e.apellidos, e.codigo
        ORDER BY e.apellidos, e.nombres;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función resumen_obs_por_asignacion creada');

    // =============================================
    // DATOS SEMILLA
    // =============================================
    console.log('\n📦 Insertando datos semilla...');

    // Categorías de observación
    await client.query(`
      INSERT INTO categoria_observacion (nombre, codigo, descripcion, color, icono, orden)
      VALUES
        ('Conducta',               'CONDUCTA',     'Comportamiento y disciplina en el aula',           '#EF4444', 'alert-triangle', 1),
        ('Socioemocional',         'SOCIOEM',      'Habilidades sociales, emociones y relaciones',     '#8B5CF6', 'heart',          2),
        ('Logro destacado',        'LOGRO',        'Reconocimiento de avances y comportamientos positivos', '#10B981', 'star',      3),
        ('Área a mejorar',         'MEJORA',       'Aspectos académicos o conductuales a reforzar',    '#F59E0B', 'trending-up',    4),
        ('Salud y bienestar',      'SALUD',        'Situaciones relacionadas con la salud del estudiante', '#3B82F6', 'activity',  5),
        ('Participación',          'PARTICIP',     'Nivel de participación e interés en clases',       '#06B6D4', 'users',          6),
        ('General',                'GENERAL',      'Observaciones generales no clasificadas',           '#6B7280', 'file-text',     7)
      ON CONFLICT (codigo) DO UPDATE SET
        nombre      = EXCLUDED.nombre,
        descripcion = EXCLUDED.descripcion,
        color       = EXCLUDED.color,
        icono       = EXCLUDED.icono
    `);

    console.log('  ✅ 7 categorías de observación insertadas');

    // Plantillas rápidas por categoría
    await client.query(`
      INSERT INTO plantilla_observacion (categoria_observacion_id, texto, nivel_relevancia, orden)
      SELECT co.id, t.texto, t.nivel_relevancia, t.orden
      FROM (
        VALUES
          -- Conducta
          ('CONDUCTA', 'Perturbó el orden durante la clase con conversaciones fuera de lugar.', 'informativo', 1),
          ('CONDUCTA', 'Se negó a realizar la actividad propuesta sin justificación.',           'requiere_atencion', 2),
          ('CONDUCTA', 'Tuvo un altercado físico con un compañero. Requiere intervención.',      'urgente', 3),
          ('CONDUCTA', 'Mostró una actitud irrespetuosa hacia el docente.',                      'requiere_atencion', 4),
          -- Socioemocional
          ('SOCIOEM',  'Se mostró retraído y con dificultades para interactuar con compañeros.', 'informativo', 1),
          ('SOCIOEM',  'Expresó sentirse triste o con dificultades personales fuera del colegio.','requiere_atencion', 2),
          ('SOCIOEM',  'Demostró empatía y apoyo hacia un compañero en situación difícil.',      'informativo', 3),
          ('SOCIOEM',  'Manifestó ansiedad o nerviosismo notorio durante la actividad.',         'requiere_atencion', 4),
          -- Logro destacado
          ('LOGRO',    'Participó activamente y aportó ideas valiosas a la clase.',              'informativo', 1),
          ('LOGRO',    'Obtuvo el mejor resultado de la evaluación en su paralelo.',             'informativo', 2),
          ('LOGRO',    'Apoyó a un compañero con dificultades de comprensión de forma espontánea.','informativo', 3),
          ('LOGRO',    'Presentó un trabajo de calidad excepcional y bien fundamentado.',        'informativo', 4),
          -- Área a mejorar
          ('MEJORA',   'Presenta dificultades para comprender los temas de la unidad actual.',   'informativo', 1),
          ('MEJORA',   'No entregó las tareas asignadas durante la semana.',                     'requiere_atencion', 2),
          ('MEJORA',   'Necesita refuerzo en los conceptos fundamentales de la materia.',        'informativo', 3),
          -- Salud y bienestar
          ('SALUD',    'El estudiante se mostró visiblemente cansado o con malestar físico.',    'informativo', 1),
          ('SALUD',    'Refirió dolor de cabeza o malestar y se retiró a enfermería.',           'informativo', 2),
          ('SALUD',    'Situación de salud requiere atención urgente. Se notificó a la dirección.','urgente', 3),
          -- Participación
          ('PARTICIP', 'Participó activamente respondiendo preguntas durante toda la clase.',    'informativo', 1),
          ('PARTICIP', 'Se mostró desinteresado y con poca disposición a participar.',           'informativo', 2),
          ('PARTICIP', 'Lideró el trabajo grupal de forma organizada y responsable.',            'informativo', 3)
      ) AS t(codigo_cat, texto, nivel_relevancia, orden)
      INNER JOIN categoria_observacion co ON co.codigo = t.codigo_cat
      ON CONFLICT DO NOTHING
    `);

    console.log('  ✅ 21 plantillas rápidas insertadas');

    // Permisos del módulo
    await client.query(`
      INSERT INTO permisos (modulo, accion, nombre, descripcion)
      VALUES
        -- Observaciones (docente)
        ('observacion_pedagogica', 'leer',      'observacion_pedagogica.leer',      'Ver observaciones pedagógicas'),
        ('observacion_pedagogica', 'crear',     'observacion_pedagogica.crear',     'Crear observaciones pedagógicas'),
        ('observacion_pedagogica', 'actualizar','observacion_pedagogica.actualizar','Editar observaciones pedagógicas'),
        ('observacion_pedagogica', 'eliminar',  'observacion_pedagogica.eliminar',  'Eliminar (soft) observaciones'),
        ('observacion_pedagogica', 'publicar',  'observacion_pedagogica.publicar',  'Publicar/ocultar observaciones al padre'),
        ('observacion_pedagogica', 'reporte',   'observacion_pedagogica.reporte',   'Ver reportes y línea de tiempo'),
        -- Observaciones (padre de familia)
        ('observacion_pedagogica', 'ver_padre', 'observacion_pedagogica.ver_padre', 'Ver observaciones propias como padre'),
        ('observacion_pedagogica', 'acusar',    'observacion_pedagogica.acusar',    'Acusar recibo de una observación'),
        -- Categorías y plantillas (admin)
        ('categoria_observacion',  'leer',      'categoria_observacion.leer',       'Ver categorías de observación'),
        ('categoria_observacion',  'gestionar', 'categoria_observacion.gestionar',  'Crear/editar categorías y plantillas')
      ON CONFLICT (nombre) DO NOTHING
    `);

    console.log('  ✅ 10 permisos del módulo insertados');

    await client.query('COMMIT');

    console.log('\n✅ ¡Módulo de Seguimiento Pedagógico creado exitosamente!\n');
    console.log('📊 RESUMEN:');
    console.log('┌──────────────────────────────────────────────────────┐');
    console.log('│ ✅ 5 Tablas creadas                                 │');
    console.log('│ ✅ 15 Índices de optimización                       │');
    console.log('│ ✅ 3 Triggers automáticos                           │');
    console.log('│ ✅ 3 Stored procedures                              │');
    console.log('│ ✅ 7 Categorías de observación                      │');
    console.log('│ ✅ 21 Plantillas rápidas predefinidas               │');
    console.log('│ ✅ 10 Permisos de acceso registrados                │');
    console.log('└──────────────────────────────────────────────────────┘\n');
    console.log('💡 Próximos pasos:');
    console.log('   1. El docente crea observaciones vinculadas a su materia');
    console.log('   2. Puede usar plantillas rápidas o descripción libre');
    console.log('   3. Decide si la hace visible al padre o la deja interna');
    console.log('   4. El padre ve y puede acusar recibo en su panel\n');
    console.log('📚 Ejemplos de uso:');
    console.log('   SELECT * FROM linea_tiempo_observaciones(123, 2025, NULL, NULL, false);');
    console.log('   SELECT * FROM resumen_observaciones_padre(45, 2025);');
    console.log('   SELECT * FROM resumen_obs_por_asignacion(12, 2025);\n');

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

crearModuloSeguimientoPedagogico().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});