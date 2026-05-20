// scripts/seed.js
// Migración: Desarrollo → Producción
// Descripción: Agrega las 42 tablas existentes en DEV que faltan en PROD
// Uso: node scripts/seed.js

import { pool } from '../src/db/pool.js';

async function seed() {
  const client = await pool.connect();

  try {
    console.log('\n==============================');
    console.log('🚀 SEED: MIGRACIÓN DEV → PROD');
    console.log('Generado: 2026-05-17');
    console.log('==============================\n');

    await client.query('BEGIN');

    // ════════════════════════════════════════════════════
    // SEQUENCES (deben existir antes que las tablas)
    // ════════════════════════════════════════════════════

    console.log('📋 Creando sequences...');

    const sequences = [
      'acceso_material_id_seq',
      'actividad_log_id_seq',
      'acuse_recibo_padre_id_seq',
      'area_conocimiento_id_seq',
      'asignacion_docente_id_seq',
      'asignacion_transporte_id_seq',
      'asistencia_id_seq',
      'backup_registro_id_seq',
      'bloque_horario_id_seq',
      'calificacion_id_seq',
      'calificacion_periodo_id_seq',
      'categoria_observacion_id_seq',
      'comentario_material_id_seq',
      'costo_mensualidad_id_seq',
      'cupo_preinscripcion_id_seq',
      'curso_vacacional_id_seq',
      'dimension_evaluacion_id_seq',
      'docente_id_seq',
      'documentos_id_seq',
      'estudiante_id_seq',
      'estudiante_tutor_id_seq',
      'evaluacion_id_seq',
      'evaluacion_rubrica_id_seq',
      'favorito_material_id_seq',
      'grado_id_seq',
      'grado_materia_id_seq',
      'horario_detalle_id_seq',
      'horario_id_seq',
      'ingreso_id_seq',
      'inscripcion_vacacional_id_seq',
      'materia_id_seq',
      'materia_prerequisito_id_seq',
      'material_academico_id_seq',
      'material_asignado_estudiante_id_seq',
      'material_tema_id_seq',
      'matricula_documento_id_seq',
      'matricula_id_seq',
      'mensualidad_id_seq',
      'nivel_academico_id_seq',
      'nota_dimension_id_seq',
      'notificacion_destinatario_id_seq',
      'notificacion_institucional_id_seq',
      'observacion_pedagogica_historial_id_seq',
      'observacion_pedagogica_id_seq',
      'padre_familia_id_seq',
      'pago_anual_completo_id_seq',
      'pago_mensualidad_id_seq',
      'pago_transporte_id_seq',
      'paquete_vacacional_id_seq',
      'parada_ruta_id_seq',
      'paralelo_id_seq',
      'periodo_academico_id_seq',
      'periodo_evaluacion_id_seq',
      'periodo_vacacional_id_seq',
      'permisos_id_seq',
      'plantilla_observacion_id_seq',
      'pre_documento_id_seq',
      'pre_estudiante_id_seq',
      'pre_inscripcion_historial_id_seq',
      'pre_inscripcion_id_seq',
      'pre_tutor_id_seq',
      'preinscripcion_id_seq',
      'progreso_estudiante_id_seq',
      'representante_id_seq',
      'roles_id_seq',
      'ruta_transporte_id_seq',
      'sesiones_id_seq',
      'solicitud_permiso_historial_id_seq',
      'solicitud_permiso_id_seq',
      'teachers_id_seq',
      'tema_id_seq',
      'tipo_ingreso_id_seq',
      'tipo_material_id_seq',
      'turno_id_seq',
      'unidad_tematica_id_seq',
      'users_id_seq',
      'usuario_roles_id_seq',
      'usuarios_id_seq',
    ];

    for (const seq of sequences) {
      await client.query(`CREATE SEQUENCE IF NOT EXISTS public.${seq} START 1 INCREMENT 1;`);
    }
    console.log(`   ✅ ${sequences.length} sequences creados\n`);

    // ════════════════════════════════════════════════════
    // CONFIGURACIÓN / CATÁLOGOS
    // ════════════════════════════════════════════════════

    console.log('📋 Creando tablas de Configuración / Catálogos...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "tipo_ingreso" (
        "id"                  integer DEFAULT nextval('tipo_ingreso_id_seq'::regclass) NOT NULL,
        "codigo"              character varying(50)  NOT NULL,
        "nombre"              character varying(200) NOT NULL,
        "descripcion"         text,
        "categoria"           character varying(50)  NOT NULL,
        "requiere_estudiante" boolean DEFAULT false,
        "activo"              boolean DEFAULT true,
        "color"               character varying(20),
        "orden"               integer,
        "created_at"          timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"          timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("codigo")
      );
    `);
    console.log('   ✅ tipo_ingreso');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "tipo_material" (
        "id"          integer DEFAULT nextval('tipo_material_id_seq'::regclass) NOT NULL,
        "nombre"      character varying(100) NOT NULL,
        "codigo"      character varying(20)  NOT NULL,
        "descripcion" text,
        "icono"       character varying(50),
        "extensiones" text[],
        "color"       character varying(20),
        "activo"      boolean DEFAULT true,
        "orden"       integer DEFAULT 1,
        "created_at"  timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("codigo"),
        UNIQUE ("nombre")
      );
    `);
    console.log('   ✅ tipo_material');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "categoria_observacion" (
        "id"          integer DEFAULT nextval('categoria_observacion_id_seq'::regclass) NOT NULL,
        "nombre"      character varying(100) NOT NULL,
        "codigo"      character varying(30)  NOT NULL,
        "descripcion" text,
        "color"       character varying(20),
        "icono"       character varying(50),
        "orden"       integer DEFAULT 1 NOT NULL,
        "activo"      boolean DEFAULT true,
        "created_at"  timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("nombre"),
        UNIQUE ("codigo")
      );
    `);
    console.log('   ✅ categoria_observacion');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "dimension_evaluacion" (
        "id"                     integer DEFAULT nextval('dimension_evaluacion_id_seq'::regclass) NOT NULL,
        "nombre"                 character varying(100) NOT NULL,
        "codigo"                 character varying(20)  NOT NULL,
        "descripcion"            text,
        "porcentaje_ponderacion" numeric NOT NULL,
        "color"                  character varying(20),
        "orden"                  integer DEFAULT 1 NOT NULL,
        "activo"                 boolean DEFAULT true,
        "created_at"             timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("nombre"),
        UNIQUE ("codigo")
      );
    `);
    console.log('   ✅ dimension_evaluacion');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "plantilla_observacion" (
        "id"                       integer DEFAULT nextval('plantilla_observacion_id_seq'::regclass) NOT NULL,
        "categoria_observacion_id" integer NOT NULL,
        "texto"                    text NOT NULL,
        "nivel_relevancia"         character varying(20) DEFAULT 'informativo'::character varying NOT NULL,
        "orden"                    integer DEFAULT 1,
        "activo"                   boolean DEFAULT true,
        "created_at"               timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id")
      );
    `);
    console.log('   ✅ plantilla_observacion');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "bloque_horario" (
        "id"          integer DEFAULT nextval('bloque_horario_id_seq'::regclass) NOT NULL,
        "turno_id"    integer NOT NULL,
        "nombre"      character varying(50) NOT NULL,
        "codigo"      character varying(20),
        "numero"      integer NOT NULL,
        "hora_inicio" time without time zone NOT NULL,
        "hora_fin"    time without time zone NOT NULL,
        "es_recreo"   boolean DEFAULT false,
        "activo"      boolean DEFAULT true,
        "created_at"  timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"  timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("codigo")
      );
    `);
    console.log('   ✅ bloque_horario');

    // ════════════════════════════════════════════════════
    // ACADÉMICO – HORARIOS
    // ════════════════════════════════════════════════════

    console.log('\n📋 Creando tablas de Horarios...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "horario" (
        "id"                   integer DEFAULT nextval('horario_id_seq'::regclass) NOT NULL,
        "paralelo_id"          integer NOT NULL,
        "periodo_academico_id" integer NOT NULL,
        "nombre"               character varying(150),
        "estado"               character varying(20) DEFAULT 'borrador'::character varying,
        "publicado_en"         timestamp without time zone,
        "publicado_por"        integer,
        "observaciones"        text,
        "activo"               boolean DEFAULT true,
        "created_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "deleted_at"           timestamp without time zone,
        PRIMARY KEY ("id")
      );
    `);
    console.log('   ✅ horario');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "horario_detalle" (
        "id"                   integer DEFAULT nextval('horario_detalle_id_seq'::regclass) NOT NULL,
        "horario_id"           integer NOT NULL,
        "dia_semana"           smallint NOT NULL,
        "bloque_horario_id"    integer NOT NULL,
        "grado_materia_id"     integer NOT NULL,
        "asignacion_docente_id" integer,
        "aula"                 character varying(50),
        "color"                character varying(20),
        "observaciones"        text,
        "activo"               boolean DEFAULT true,
        "created_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id")
      );
    `);
    console.log('   ✅ horario_detalle');

    // ════════════════════════════════════════════════════
    // ACADÉMICO – EVALUACIÓN Y CALIFICACIONES
    // ════════════════════════════════════════════════════

    console.log('\n📋 Creando tablas de Evaluación y Calificaciones...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "periodo_evaluacion" (
        "id"                   integer DEFAULT nextval('periodo_evaluacion_id_seq'::regclass) NOT NULL,
        "periodo_academico_id" integer NOT NULL,
        "nombre"               character varying(100) NOT NULL,
        "codigo"               character varying(20),
        "orden"                integer DEFAULT 1 NOT NULL,
        "fecha_inicio"         date NOT NULL,
        "fecha_fin"            date NOT NULL,
        "activo"               boolean DEFAULT true,
        "observaciones"        text,
        "created_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id")
      );
    `);
    console.log('   ✅ periodo_evaluacion');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "evaluacion" (
        "id"                      integer DEFAULT nextval('evaluacion_id_seq'::regclass) NOT NULL,
        "asignacion_docente_id"   integer NOT NULL,
        "dimension_evaluacion_id" integer NOT NULL,
        "periodo_evaluacion_id"   integer NOT NULL,
        "nombre"                  character varying(200) NOT NULL,
        "tipo"                    character varying(30),
        "descripcion"             text,
        "fecha"                   date,
        "puntaje_maximo"          numeric DEFAULT 100 NOT NULL,
        "peso_en_dimension"       numeric DEFAULT 1.00,
        "visible_para_padres"     boolean DEFAULT false,
        "fecha_publicacion"       timestamp without time zone,
        "activo"                  boolean DEFAULT true,
        "created_at"              timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"              timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "foto_url"                text,
        "foto_public_id"          character varying(200),
        "pdf_url"                 text,
        "pdf_public_id"           character varying(200),
        "pdf_nombre"              character varying(200),
        "fecha_limite"            timestamp without time zone,
        "instrucciones"           text,
        "publicado_en"            timestamp without time zone,
        "tema_id"                 integer,
        PRIMARY KEY ("id")
      );
    `);
    console.log('   ✅ evaluacion');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "evaluacion_rubrica" (
        "id"                  integer DEFAULT nextval('evaluacion_rubrica_id_seq'::regclass) NOT NULL,
        "evaluacion_id"       integer NOT NULL,
        "orden"               integer DEFAULT 1 NOT NULL,
        "criterio"            character varying(200) NOT NULL,
        "descripcion"         text,
        "nivel_excelente"     text,
        "nivel_bueno"         text,
        "nivel_basico"        text,
        "nivel_insuficiente"  text,
        "puntos_posibles"     numeric NOT NULL,
        "activo"              boolean DEFAULT true,
        "created_at"          timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"          timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id")
      );
    `);
    console.log('   ✅ evaluacion_rubrica');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "calificacion" (
        "id"                integer DEFAULT nextval('calificacion_id_seq'::regclass) NOT NULL,
        "evaluacion_id"     integer NOT NULL,
        "matricula_id"      integer NOT NULL,
        "puntaje_obtenido"  numeric NOT NULL,
        "esta_ausente"      boolean DEFAULT false,
        "observacion"       text,
        "registrado_por"    integer NOT NULL,
        "fecha_registro"    timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "created_at"        timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"        timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("evaluacion_id", "matricula_id")
      );
    `);
    console.log('   ✅ calificacion');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "calificacion_periodo" (
        "id"                    integer DEFAULT nextval('calificacion_periodo_id_seq'::regclass) NOT NULL,
        "matricula_id"          integer NOT NULL,
        "grado_materia_id"      integer NOT NULL,
        "periodo_evaluacion_id" integer NOT NULL,
        "nota_final"            numeric,
        "aprobado"              boolean,
        "estado"                character varying(20) DEFAULT 'activa'::character varying,
        "cerrado_por"           integer,
        "fecha_cierre"          timestamp without time zone,
        "es_nota_manual"        boolean DEFAULT false,
        "nota_manual"           numeric,
        "justificacion_manual"  text,
        "calculado_en"          timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"            timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("matricula_id", "grado_materia_id", "periodo_evaluacion_id")
      );
    `);
    console.log('   ✅ calificacion_periodo');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "nota_dimension" (
        "id"                      integer DEFAULT nextval('nota_dimension_id_seq'::regclass) NOT NULL,
        "matricula_id"            integer NOT NULL,
        "grado_materia_id"        integer NOT NULL,
        "periodo_evaluacion_id"   integer NOT NULL,
        "dimension_evaluacion_id" integer NOT NULL,
        "nota_promedio"           numeric,
        "total_evaluaciones"      integer DEFAULT 0,
        "calculado_en"            timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"              timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("matricula_id", "grado_materia_id", "periodo_evaluacion_id", "dimension_evaluacion_id")
      );
    `);
    console.log('   ✅ nota_dimension');

    // ════════════════════════════════════════════════════
    // ACADÉMICO – MATERIAL Y TEMAS
    // ════════════════════════════════════════════════════

    console.log('\n📋 Creando tablas de Material y Temas...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "unidad_tematica" (
        "id"                   integer DEFAULT nextval('unidad_tematica_id_seq'::regclass) NOT NULL,
        "grado_materia_id"     integer NOT NULL,
        "periodo_evaluacion_id" integer,
        "numero_unidad"        integer NOT NULL,
        "titulo"               character varying(200) NOT NULL,
        "descripcion"          text,
        "objetivos"            text,
        "orden"                integer DEFAULT 1 NOT NULL,
        "fecha_inicio_prevista" date,
        "fecha_fin_prevista"   date,
        "activo"               boolean DEFAULT true,
        "created_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("grado_materia_id", "numero_unidad")
      );
    `);
    console.log('   ✅ unidad_tematica');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "tema" (
        "id"                 integer DEFAULT nextval('tema_id_seq'::regclass) NOT NULL,
        "unidad_tematica_id" integer NOT NULL,
        "numero_tema"        integer NOT NULL,
        "titulo"             character varying(200) NOT NULL,
        "descripcion"        text,
        "contenido"          text,
        "palabras_clave"     text[],
        "duracion_estimada"  integer,
        "es_obligatorio"     boolean DEFAULT true,
        "orden"              integer DEFAULT 1 NOT NULL,
        "nivel_dificultad"   character varying(20),
        "activo"             boolean DEFAULT true,
        "created_at"         timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"         timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("unidad_tematica_id", "numero_tema")
      );
    `);
    console.log('   ✅ tema');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "material_academico" (
        "id"                        integer DEFAULT nextval('material_academico_id_seq'::regclass) NOT NULL,
        "codigo_material"           character varying(50)  NOT NULL,
        "asignacion_docente_id"     integer NOT NULL,
        "tipo_material_id"          integer NOT NULL,
        "titulo"                    character varying(200) NOT NULL,
        "descripcion"               text,
        "es_enlace_externo"         boolean DEFAULT false,
        "url_archivo"               text,
        "url_externa"               text,
        "nombre_archivo"            character varying(255),
        "tamano_bytes"              bigint,
        "tipo_mime"                 character varying(100),
        "version"                   integer DEFAULT 1,
        "material_anterior_id"      integer,
        "subido_por"                integer NOT NULL,
        "visible_para_estudiantes"  boolean DEFAULT true,
        "fecha_publicacion"         timestamp without time zone,
        "fecha_despublicacion"      timestamp without time zone,
        "requiere_descarga"         boolean DEFAULT false,
        "contador_vistas"           integer DEFAULT 0,
        "contador_descargas"        integer DEFAULT 0,
        "activo"                    boolean DEFAULT true,
        "es_destacado"              boolean DEFAULT false,
        "created_at"                timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"                timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "deleted_at"                timestamp without time zone,
        PRIMARY KEY ("id"),
        UNIQUE ("codigo_material")
      );
    `);
    console.log('   ✅ material_academico');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "material_tema" (
        "id"                   integer DEFAULT nextval('material_tema_id_seq'::regclass) NOT NULL,
        "material_academico_id" integer NOT NULL,
        "tema_id"              integer NOT NULL,
        "es_principal"         boolean DEFAULT false,
        "orden"                integer DEFAULT 1,
        "created_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("material_academico_id", "tema_id")
      );
    `);
    await client.query(`SELECT setval('public.material_tema_id_seq', COALESCE((SELECT MAX("id") FROM "material_tema"), 1));`);
    console.log('   ✅ material_tema');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "material_asignado_estudiante" (
        "id"                   integer DEFAULT nextval('material_asignado_estudiante_id_seq'::regclass) NOT NULL,
        "material_academico_id" integer NOT NULL,
        "matricula_id"         integer NOT NULL,
        "asignacion_docente_id" integer NOT NULL,
        "asignado_por"         integer NOT NULL,
        "origen"               character varying(10) DEFAULT 'manual'::character varying NOT NULL,
        "mensaje_docente"      text,
        "visto_por_estudiante" boolean DEFAULT false NOT NULL,
        "fecha_vista"          timestamp without time zone,
        "activo"               boolean DEFAULT true NOT NULL,
        "created_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updated_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        PRIMARY KEY ("id"),
        UNIQUE ("material_academico_id", "matricula_id", "asignacion_docente_id")
      );
    `);
    await client.query(`SELECT setval('public.material_asignado_estudiante_id_seq', COALESCE((SELECT MAX("id") FROM "material_asignado_estudiante"), 1));`);
    console.log('   ✅ material_asignado_estudiante');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "favorito_material" (
        "id"                   integer DEFAULT nextval('favorito_material_id_seq'::regclass) NOT NULL,
        "material_academico_id" integer NOT NULL,
        "matricula_id"         integer NOT NULL,
        "notas_personales"     text,
        "created_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("material_academico_id", "matricula_id")
      );
    `);
    console.log('   ✅ favorito_material');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "acceso_material" (
        "id"                   integer DEFAULT nextval('acceso_material_id_seq'::regclass) NOT NULL,
        "material_academico_id" integer NOT NULL,
        "matricula_id"         integer,
        "usuario_id"           integer,
        "tipo_accion"          character varying(20) NOT NULL,
        "ip_address"           character varying(50),
        "user_agent"           text,
        "dispositivo"          character varying(20),
        "duracion_segundos"    integer,
        "completado"           boolean DEFAULT false,
        "created_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id")
      );
    `);
    console.log('   ✅ acceso_material');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "comentario_material" (
        "id"                   integer DEFAULT nextval('comentario_material_id_seq'::regclass) NOT NULL,
        "material_academico_id" integer NOT NULL,
        "usuario_id"           integer NOT NULL,
        "comentario_padre_id"  integer,
        "contenido"            text NOT NULL,
        "es_duda"              boolean DEFAULT false,
        "es_resuelto"          boolean DEFAULT false,
        "resuelto_por"         integer,
        "fecha_resolucion"     timestamp without time zone,
        "editado"              boolean DEFAULT false,
        "fecha_edicion"        timestamp without time zone,
        "activo"               boolean DEFAULT true,
        "created_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id")
      );
    `);
    console.log('   ✅ comentario_material');

    // ════════════════════════════════════════════════════
    // ACADÉMICO – ASISTENCIA Y PERMISOS
    // ════════════════════════════════════════════════════

    console.log('\n📋 Creando tablas de Asistencia y Permisos...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "asistencia" (
        "id"                    integer DEFAULT nextval('asistencia_id_seq'::regclass) NOT NULL,
        "matricula_id"          integer NOT NULL,
        "asignacion_docente_id" integer NOT NULL,
        "fecha"                 date NOT NULL,
        "estado"                character varying(20) NOT NULL,
        "solicitud_permiso_id"  integer,
        "justificacion"         text,
        "marcado_por"           integer NOT NULL,
        "hora_marcacion"        time without time zone DEFAULT CURRENT_TIME NOT NULL,
        "dispositivo"           character varying(20),
        "observaciones"         text,
        "created_at"            timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"            timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("matricula_id", "asignacion_docente_id", "fecha")
      );
    `);
    console.log('   ✅ asistencia');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "solicitud_permiso" (
        "id"                    integer DEFAULT nextval('solicitud_permiso_id_seq'::regclass) NOT NULL,
        "codigo_solicitud"      character varying(50) NOT NULL,
        "estudiante_id"         integer NOT NULL,
        "padre_familia_id"      integer,
        "asignacion_docente_id" integer,
        "fecha_ausencia"        date NOT NULL,
        "es_dia_completo"       boolean DEFAULT true,
        "hora_inicio"           time without time zone,
        "hora_fin"              time without time zone,
        "motivo"                character varying(100) NOT NULL,
        "descripcion"           text,
        "archivo_adjunto_url"   text,
        "estado"                character varying(20) DEFAULT 'pendiente'::character varying,
        "revisado_por"          integer,
        "fecha_revision"        timestamp without time zone,
        "motivo_rechazo"        text,
        "observaciones_revisor" text,
        "created_at"            timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"            timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("codigo_solicitud")
      );
    `);
    console.log('   ✅ solicitud_permiso');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "solicitud_permiso_historial" (
        "id"                   integer DEFAULT nextval('solicitud_permiso_historial_id_seq'::regclass) NOT NULL,
        "solicitud_permiso_id" integer NOT NULL,
        "estado_anterior"      character varying(20),
        "estado_nuevo"         character varying(20) NOT NULL,
        "usuario_id"           integer,
        "comentario"           text,
        "created_at"           timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id")
      );
    `);
    console.log('   ✅ solicitud_permiso_historial');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "observacion_pedagogica" (
        "id"                        integer DEFAULT nextval('observacion_pedagogica_id_seq'::regclass) NOT NULL,
        "codigo_observacion"        character varying(50) NOT NULL,
        "docente_id"                integer NOT NULL,
        "matricula_id"              integer NOT NULL,
        "asignacion_docente_id"     integer,
        "periodo_academico_id"      integer NOT NULL,
        "categoria_observacion_id"  integer NOT NULL,
        "nivel_relevancia"          character varying(20) DEFAULT 'informativo'::character varying NOT NULL,
        "descripcion"               text NOT NULL,
        "fecha_ocurrencia"          date DEFAULT CURRENT_DATE NOT NULL,
        "plantilla_id"              integer,
        "visible_para_padre"        boolean DEFAULT false,
        "fecha_publicacion"         timestamp without time zone,
        "publicado_por"             integer,
        "activo"                    boolean DEFAULT true,
        "created_at"                timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"                timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "deleted_at"                timestamp without time zone,
        PRIMARY KEY ("id"),
        UNIQUE ("codigo_observacion")
      );
    `);
    console.log('   ✅ observacion_pedagogica');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "observacion_pedagogica_historial" (
        "id"                        integer DEFAULT nextval('observacion_pedagogica_historial_id_seq'::regclass) NOT NULL,
        "observacion_pedagogica_id" integer NOT NULL,
        "campo_modificado"          character varying(50) NOT NULL,
        "valor_anterior"            text,
        "valor_nuevo"               text,
        "usuario_id"                integer,
        "comentario"                text,
        "created_at"                timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id")
      );
    `);
    console.log('   ✅ observacion_pedagogica_historial');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "acuse_recibo_padre" (
        "id"                        integer DEFAULT nextval('acuse_recibo_padre_id_seq'::regclass) NOT NULL,
        "observacion_pedagogica_id" integer NOT NULL,
        "padre_familia_id"          integer NOT NULL,
        "fecha_lectura"             timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "comentario_padre"          text,
        "created_at"                timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("observacion_pedagogica_id", "padre_familia_id")
      );
    `);
    await client.query(`SELECT setval('public.acuse_recibo_padre_id_seq', COALESCE((SELECT MAX("id") FROM "acuse_recibo_padre"), 1));`);
    console.log('   ✅ acuse_recibo_padre');

    // ════════════════════════════════════════════════════
    // ACADÉMICO – PROGRESO
    // ════════════════════════════════════════════════════

    console.log('\n📋 Creando tablas de Progreso...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "progreso_estudiante" (
        "id"               integer DEFAULT nextval('progreso_estudiante_id_seq'::regclass) NOT NULL,
        "matricula_id"     integer NOT NULL,
        "tema_id"          integer NOT NULL,
        "estado"           character varying(20) DEFAULT 'no_iniciado'::character varying,
        "porcentaje_avance" numeric DEFAULT 0,
        "fecha_inicio"     timestamp without time zone,
        "fecha_completado" timestamp without time zone,
        "tiempo_dedicado"  integer DEFAULT 0,
        "created_at"       timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"       timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("matricula_id", "tema_id")
      );
    `);
    await client.query(`SELECT setval('public.progreso_estudiante_id_seq', COALESCE((SELECT MAX("id") FROM "progreso_estudiante"), 1));`);
    console.log('   ✅ progreso_estudiante');

    // ════════════════════════════════════════════════════
    // TRANSPORTE
    // ════════════════════════════════════════════════════

    console.log('\n📋 Creando tablas de Transporte...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "ruta_transporte" (
        "id"                  integer DEFAULT nextval('ruta_transporte_id_seq'::regclass) NOT NULL,
        "codigo"              character varying(50)  NOT NULL,
        "nombre"              character varying(200) NOT NULL,
        "descripcion"         text,
        "zona_cobertura"      text,
        "punto_inicio"        character varying(200),
        "punto_fin"           character varying(200),
        "horario_ida"         time without time zone,
        "horario_retorno"     time without time zone,
        "capacidad_maxima"    integer DEFAULT 40 NOT NULL,
        "cupos_ocupados"      integer DEFAULT 0,
        "cupos_disponibles"   integer,
        "costo_mensual"       numeric NOT NULL,
        "conductor_responsable" character varying(200),
        "telefono_conductor"  character varying(50),
        "placa_vehiculo"      character varying(20),
        "modelo_vehiculo"     character varying(100),
        "anio_vehiculo"       integer,
        "color"               character varying(20),
        "activo"              boolean DEFAULT true,
        "observaciones"       text,
        "created_at"          timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"          timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "deleted_at"          timestamp without time zone,
        PRIMARY KEY ("id"),
        UNIQUE ("codigo")
      );
    `);
    console.log('   ✅ ruta_transporte');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "parada_ruta" (
        "id"                     integer DEFAULT nextval('parada_ruta_id_seq'::regclass) NOT NULL,
        "ruta_id"                integer NOT NULL,
        "nombre"                 character varying(200) NOT NULL,
        "direccion"              text,
        "referencia"             text,
        "latitud"                numeric,
        "longitud"               numeric,
        "orden"                  integer NOT NULL,
        "hora_estimada_ida"      time without time zone,
        "hora_estimada_retorno"  time without time zone,
        "activo"                 boolean DEFAULT true,
        "created_at"             timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id")
      );
    `);
    await client.query(`SELECT setval('public.parada_ruta_id_seq', COALESCE((SELECT MAX("id") FROM "parada_ruta"), 1));`);
    console.log('   ✅ parada_ruta');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "asignacion_transporte" (
        "id"                    integer DEFAULT nextval('asignacion_transporte_id_seq'::regclass) NOT NULL,
        "estudiante_id"         integer NOT NULL,
        "ruta_id"               integer NOT NULL,
        "parada_id"             integer,
        "periodo_academico_id"  integer NOT NULL,
        "fecha_inicio"          date NOT NULL,
        "fecha_fin"             date,
        "costo_mensual"         numeric NOT NULL,
        "usa_ida"               boolean DEFAULT true,
        "usa_retorno"           boolean DEFAULT true,
        "contacto_emergencia"   character varying(200),
        "telefono_emergencia"   character varying(50),
        "observaciones"         text,
        "estado"                character varying(50) DEFAULT 'activo'::character varying,
        "activo"                boolean DEFAULT true,
        "created_at"            timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"            timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "deleted_at"            timestamp without time zone,
        PRIMARY KEY ("id")
      );
    `);
    console.log('   ✅ asignacion_transporte');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "pago_transporte" (
        "id"                        integer DEFAULT nextval('pago_transporte_id_seq'::regclass) NOT NULL,
        "codigo_pago"               character varying(50) NOT NULL,
        "asignacion_transporte_id"  integer NOT NULL,
        "mes_correspondiente"       character varying(50) NOT NULL,
        "fecha_vencimiento"         date NOT NULL,
        "monto_original"            numeric NOT NULL,
        "monto_recargo"             numeric DEFAULT 0,
        "monto_final"               numeric NOT NULL,
        "monto_pagado"              numeric DEFAULT 0,
        "estado"                    character varying(50) DEFAULT 'pendiente'::character varying,
        "metodo_pago"               character varying(50),
        "numero_comprobante"        character varying(100),
        "comprobante_url"           text,
        "fecha_pago"                timestamp without time zone,
        "registrado_por"            integer,
        "anulado"                   boolean DEFAULT false,
        "motivo_anulacion"          text,
        "anulado_por"               integer,
        "fecha_anulacion"           timestamp without time zone,
        "observaciones"             text,
        "created_at"                timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"                timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("codigo_pago")
      );
    `);
    console.log('   ✅ pago_transporte');

    // ════════════════════════════════════════════════════
    // NOTIFICACIONES
    // ════════════════════════════════════════════════════

    console.log('\n📋 Creando tablas de Notificaciones...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "notificacion_institucional" (
        "id"                     integer DEFAULT nextval('notificacion_institucional_id_seq'::regclass) NOT NULL,
        "codigo"                 character varying(50)  NOT NULL,
        "titulo"                 character varying(200) NOT NULL,
        "mensaje"                text NOT NULL,
        "tipo"                   character varying(30)  NOT NULL,
        "prioridad"              character varying(10) DEFAULT 'normal'::character varying,
        "audiencia"              character varying(20)  NOT NULL,
        "nivel_academico_id"     integer,
        "grado_id"               integer,
        "paralelo_id"            integer,
        "periodo_academico_id"   integer,
        "destinatario_usuario_id" integer,
        "enviar_whatsapp"        boolean DEFAULT true,
        "enviar_email"           boolean DEFAULT true,
        "enviar_interno"         boolean DEFAULT true,
        "programada_para"        timestamp without time zone,
        "enviada_en"             timestamp without time zone,
        "estado"                 character varying(20) DEFAULT 'borrador'::character varying,
        "adjunto_url"            text,
        "adjunto_nombre"         character varying(200),
        "creada_por"             integer NOT NULL,
        "created_at"             timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"             timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "deleted_at"             timestamp without time zone,
        "foto_url"               text,
        "foto_public_id"         character varying(200),
        PRIMARY KEY ("id"),
        UNIQUE ("codigo")
      );
    `);
    console.log('   ✅ notificacion_institucional');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "notificacion_destinatario" (
        "id"                 integer DEFAULT nextval('notificacion_destinatario_id_seq'::regclass) NOT NULL,
        "notificacion_id"    integer NOT NULL,
        "usuario_id"         integer,
        "nombre_destinatario" character varying(200),
        "celular_snapshot"   character varying(20),
        "email_snapshot"     character varying(200),
        "rol_destinatario"   character varying(20),
        "canal"              character varying(15) NOT NULL,
        "estado_envio"       character varying(20) DEFAULT 'pendiente'::character varying,
        "enviado_en"         timestamp without time zone,
        "error_mensaje"      text,
        "leido"              boolean DEFAULT false,
        "leido_en"           timestamp without time zone,
        "created_at"         timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"         timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("notificacion_id", "usuario_id", "canal")
      );
    `);
    console.log('   ✅ notificacion_destinatario');

    // ════════════════════════════════════════════════════
    // FINANZAS – INGRESOS
    // ════════════════════════════════════════════════════

    console.log('\n📋 Creando tablas de Finanzas...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "ingreso" (
        "id"                    integer DEFAULT nextval('ingreso_id_seq'::regclass) NOT NULL,
        "codigo_ingreso"        character varying(50)  NOT NULL,
        "tipo_ingreso_id"       integer NOT NULL,
        "fecha_ingreso"         timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "periodo_academico_id"  integer,
        "estudiante_id"         integer,
        "padre_familia_id"      integer,
        "matricula_id"          integer,
        "referencia_tipo"       character varying(50),
        "referencia_id"         integer,
        "referencia_codigo"     character varying(100),
        "monto"                 numeric NOT NULL,
        "descuento"             numeric DEFAULT 0,
        "recargo"               numeric DEFAULT 0,
        "monto_neto"            numeric,
        "metodo_pago"           character varying(50) NOT NULL,
        "numero_comprobante"    character varying(100),
        "comprobante_url"       text,
        "banco"                 character varying(100),
        "numero_referencia"     character varying(100),
        "requiere_factura"      boolean DEFAULT false,
        "factura_emitida"       boolean DEFAULT false,
        "numero_factura"        character varying(100),
        "nit_factura"           character varying(50),
        "razon_social_factura"  character varying(200),
        "estado"                character varying(50) DEFAULT 'registrado'::character varying,
        "verificado"            boolean DEFAULT false,
        "verificado_por"        integer,
        "fecha_verificacion"    timestamp without time zone,
        "anulado"               boolean DEFAULT false,
        "motivo_anulacion"      text,
        "anulado_por"           integer,
        "fecha_anulacion"       timestamp without time zone,
        "observaciones"         text,
        "registrado_por"        integer NOT NULL,
        "created_at"            timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"            timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("codigo_ingreso")
      );
    `);
    console.log('   ✅ ingreso');

    // ════════════════════════════════════════════════════
    // LEGACY / SISTEMA ANTERIOR
    // ════════════════════════════════════════════════════

    console.log('\n📋 Creando tablas Legacy...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "teachers" (
        "id"              integer DEFAULT nextval('teachers_id_seq'::regclass) NOT NULL,
        "first_name"      character varying(100) NOT NULL,
        "last_name"       character varying(100) NOT NULL,
        "mother_last_name" character varying(100),
        "id_number"       character varying(50) NOT NULL,
        "phone"           character varying(20),
        "email"           character varying(100) NOT NULL,
        "birth_date"      date,
        "title"           character varying(150),
        "experience"      integer,
        "subject"         character varying(100),
        "level"           character varying(100),
        "account_status"  boolean DEFAULT true,
        "user_id"         integer,
        PRIMARY KEY ("id"),
        UNIQUE ("id_number"),
        UNIQUE ("email")
      );
    `);
    console.log('   ✅ teachers');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"       integer DEFAULT nextval('users_id_seq'::regclass) NOT NULL,
        "username" character varying(100) NOT NULL,
        "password" character varying(255) NOT NULL,
        "role_id"  integer,
        PRIMARY KEY ("id"),
        UNIQUE ("username")
      );
    `);
    console.log('   ✅ users');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "representante" (
        "id"                integer DEFAULT nextval('representante_id_seq'::regclass) NOT NULL,
        "tipo_representante" character varying(50),
        "nombres"           character varying(100) NOT NULL,
        "apellido_paterno"  character varying(100) NOT NULL,
        "apellido_materno"  character varying(100),
        "ci"                character varying(20) NOT NULL,
        "fecha_nacimiento"  date,
        "genero"            character varying(20),
        "nacionalidad"      character varying(50),
        "profesion"         character varying(100),
        "lugar_trabajo"     character varying(150),
        "telefono"          character varying(20),
        "correo"            character varying(100),
        PRIMARY KEY ("id"),
        UNIQUE ("ci")
      );
    `);
    console.log('   ✅ representante');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "documentos" (
        "id"                    integer DEFAULT nextval('documentos_id_seq'::regclass) NOT NULL,
        "preinscripcion_id"     integer,
        "cedula_estudiante"     text,
        "certificado_nacimiento" text,
        "libreta_notas"         text,
        "cedula_representante"  text,
        "fecha_subida"          timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id")
      );
    `);
    console.log('   ✅ documentos');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "preinscripcion" (
        "id"               integer DEFAULT nextval('preinscripcion_id_seq'::regclass) NOT NULL,
        "estudiante_id"    integer,
        "representante_id" integer,
        "fecha_registro"   timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "estado"           character varying(50) DEFAULT 'pendiente'::character varying,
        PRIMARY KEY ("id")
      );
    `);
    console.log('   ✅ preinscripcion');

    // ════════════════════════════════════════════════════
    // SISTEMA
    // ════════════════════════════════════════════════════

    console.log('\n📋 Creando tablas de Sistema...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "backup_registro" (
        "id"                    integer DEFAULT nextval('backup_registro_id_seq'::regclass) NOT NULL,
        "backup_key"            character varying(60)  NOT NULL,
        "filename"              character varying(255) NOT NULL,
        "database_name"         character varying(100) NOT NULL,
        "cloudinary_url"        text NOT NULL,
        "cloudinary_public_id"  text NOT NULL,
        "size_bytes"            bigint DEFAULT 0 NOT NULL,
        "size_formatted"        character varying(20) DEFAULT '0 B'::character varying NOT NULL,
        "status"                character varying(20) DEFAULT 'completado'::character varying NOT NULL,
        "ultima_restauracion_at" timestamp without time zone,
        "restaurado_por"        integer,
        "creado_por"            integer NOT NULL,
        "created_at"            timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"            timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "deleted_at"            timestamp without time zone,
        "eliminado_por"         integer,
        PRIMARY KEY ("id"),
        UNIQUE ("cloudinary_public_id"),
        UNIQUE ("backup_key")
      );
    `);
    await client.query(`SELECT setval('public.backup_registro_id_seq', COALESCE((SELECT MAX("id") FROM "backup_registro"), 1));`);
    console.log('   ✅ backup_registro');

    await client.query('COMMIT');

    console.log('\n==============================');
    console.log('✅ MIGRACIÓN COMPLETADA EXITOSAMENTE');
    console.log('==============================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error durante la migración — se hizo ROLLBACK');
    console.error('   Tabla en proceso al momento del error:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

seed();