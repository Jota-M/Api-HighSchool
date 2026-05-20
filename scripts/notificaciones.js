// scripts/migration_notificaciones.js
// Ejecutar: node scripts/migration_notificaciones.js
import { pool } from '../src/db/pool.js';

async function crearModuloNotificaciones() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('\n🔔 CREANDO MÓDULO: NOTIFICACIONES INSTITUCIONALES\n');

    // ─── 1. notificacion_institucional ───────────────────────────
    // El comunicado en sí, creado por la secretaria/admin
    await client.query(`
      CREATE TABLE IF NOT EXISTS notificacion_institucional (
        id                SERIAL PRIMARY KEY,
        codigo            VARCHAR(50) NOT NULL UNIQUE,  -- NOTIF-2025-000001

        -- Contenido
        titulo            VARCHAR(200) NOT NULL,
        mensaje           TEXT NOT NULL,
        tipo              VARCHAR(30) NOT NULL CHECK (tipo IN (
          'aviso_general',        -- reunión, evento, feriado
          'pago_vencido',         -- alerta mensualidad
          'comunicado_grado',     -- por grado/paralelo
          'notificacion_individual' -- estudiante/padre específico
        )),
        prioridad         VARCHAR(10) DEFAULT 'normal' CHECK (prioridad IN (
          'baja', 'normal', 'alta', 'urgente'
        )),

        -- Segmentación de destinatarios
        -- audiencia define el grupo base; los filtros lo acotan
        audiencia         VARCHAR(20) NOT NULL CHECK (audiencia IN (
          'todos',          -- toda la institución
          'docentes',       -- solo docentes
          'padres',         -- padres de familia
          'estudiantes',    -- estudiantes
          'padres_estudiantes', -- padres + estudiantes
          'individual'      -- destinatario único
        )),

        -- Filtros opcionales de segmentación
        nivel_academico_id  INTEGER REFERENCES nivel_academico(id),
        grado_id            INTEGER REFERENCES grado(id),
        paralelo_id         INTEGER REFERENCES paralelo(id),
        periodo_academico_id INTEGER REFERENCES periodo_academico(id),

        -- Para notificación individual
        -- puede apuntar a un padre, estudiante o docente específico
        destinatario_usuario_id INTEGER REFERENCES usuarios(id),

        -- Canales de envío (flags independientes)
        enviar_whatsapp   BOOLEAN DEFAULT true,
        enviar_email      BOOLEAN DEFAULT true,
        enviar_interno    BOOLEAN DEFAULT true,  -- notif. en plataforma

        -- Programación
        programada_para   TIMESTAMP,   -- NULL = enviar ahora
        enviada_en        TIMESTAMP,   -- cuando se despachó

        -- Estado del proceso de envío
        estado            VARCHAR(20) DEFAULT 'borrador' CHECK (estado IN (
          'borrador',    -- guardada sin enviar
          'programada',  -- para enviar más tarde
          'enviando',    -- en proceso
          'enviada',     -- completada
          'fallida'      -- error en envío
        )),

        -- Adjunto (imagen o PDF)
        adjunto_url       TEXT,
        adjunto_nombre    VARCHAR(200),

        -- Auditoría
        creada_por        INTEGER NOT NULL REFERENCES usuarios(id),
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at        TIMESTAMP
      )
    `);
    console.log('  ✅ Tabla notificacion_institucional');

    // ─── 2. notificacion_destinatario ────────────────────────────
    // Un registro por persona × canal — tracking individual
    await client.query(`
      CREATE TABLE IF NOT EXISTS notificacion_destinatario (
        id                        SERIAL PRIMARY KEY,
        notificacion_id           INTEGER NOT NULL
                                    REFERENCES notificacion_institucional(id)
                                    ON DELETE CASCADE,

        -- A quién va
        usuario_id                INTEGER REFERENCES usuarios(id),
        -- Datos de contacto capturados al momento del envío
        -- (para no depender de cambios futuros en el perfil)
        nombre_destinatario       VARCHAR(200),
        celular_snapshot          VARCHAR(20),
        email_snapshot            VARCHAR(200),

        -- Rol del destinatario en el momento del envío
        rol_destinatario          VARCHAR(20) CHECK (rol_destinatario IN (
          'docente', 'padre', 'estudiante', 'admin'
        )),

        -- Canal
        canal                     VARCHAR(15) NOT NULL CHECK (canal IN (
          'whatsapp', 'email', 'interno'
        )),

        -- Estado del envío por canal
        estado_envio              VARCHAR(20) DEFAULT 'pendiente' CHECK (estado_envio IN (
          'pendiente',
          'enviado',
          'entregado',   -- confirmación de Twilio/email
          'fallido',
          'omitido'      -- no tenía celular/email
        )),
        enviado_en                TIMESTAMP,
        error_mensaje             TEXT,       -- detalle del fallo si falló

        -- Estado de lectura (solo canal 'interno')
        leido                     BOOLEAN DEFAULT false,
        leido_en                  TIMESTAMP,

        created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        -- Evitar duplicados: un destinatario recibe una notif. una sola vez por canal
        UNIQUE (notificacion_id, usuario_id, canal)
      )
    `);
    console.log('  ✅ Tabla notificacion_destinatario');

    // ─── Índices ─────────────────────────────────────────────────
    const indices = [
      `CREATE INDEX IF NOT EXISTS idx_notif_inst_estado
         ON notificacion_institucional(estado)`,
      `CREATE INDEX IF NOT EXISTS idx_notif_inst_tipo
         ON notificacion_institucional(tipo)`,
      `CREATE INDEX IF NOT EXISTS idx_notif_inst_creada_por
         ON notificacion_institucional(creada_por)`,
      `CREATE INDEX IF NOT EXISTS idx_notif_inst_programada
         ON notificacion_institucional(programada_para)
         WHERE programada_para IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_notif_dest_notif
         ON notificacion_destinatario(notificacion_id)`,
      `CREATE INDEX IF NOT EXISTS idx_notif_dest_usuario
         ON notificacion_destinatario(usuario_id)`,
      `CREATE INDEX IF NOT EXISTS idx_notif_dest_leido
         ON notificacion_destinatario(usuario_id, leido)
         WHERE canal = 'interno'`,
      `CREATE INDEX IF NOT EXISTS idx_notif_dest_estado
         ON notificacion_destinatario(estado_envio)`,
    ];

    for (const idx of indices) await client.query(idx);
    console.log(`  ✅ ${indices.length} índices`);

    // ─── Trigger updated_at ───────────────────────────────────────
    for (const tabla of ['notificacion_institucional', 'notificacion_destinatario']) {
      await client.query(`DROP TRIGGER IF EXISTS trg_${tabla}_updated_at ON ${tabla}`);
      await client.query(`
        CREATE TRIGGER trg_${tabla}_updated_at
        BEFORE UPDATE ON ${tabla}
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
      `);
    }
    console.log('  ✅ Triggers updated_at');

    // ─── Permisos de acceso ───────────────────────────────────────
    await client.query(`
      INSERT INTO permisos (modulo, accion, nombre, descripcion) VALUES
        ('notificaciones', 'leer',    'notificaciones.leer',    'Ver notificaciones institucionales'),
        ('notificaciones', 'crear',   'notificaciones.crear',   'Crear notificaciones institucionales'),
        ('notificaciones', 'enviar',  'notificaciones.enviar',  'Enviar/despachar notificaciones'),
        ('notificaciones', 'eliminar','notificaciones.eliminar','Eliminar notificaciones'),
        ('notificaciones', 'gestionar','notificaciones.gestionar','Gestión completa de notificaciones')
      ON CONFLICT (nombre) DO NOTHING
    `);
    console.log('  ✅ Permisos registrados');

    // ─── Función generadora de código ─────────────────────────────
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
    console.log('  ✅ Función generar_codigo_notificacion');

    await client.query('COMMIT');
    console.log('\n✅ Módulo de notificaciones creado exitosamente');
    console.log('──────────────────────────────────────────────');
    console.log('  2 tablas  |  8 índices  |  2 triggers  |  5 permisos\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error:', err.message);
    throw err;
  } finally {
    client.release();
    process.exit(0);
  }
}

crearModuloNotificaciones();