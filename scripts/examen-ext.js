// scripts/examen-ext.js
//
// Crea las tablas y secuencias del módulo de Exámenes Virtuales.
//
// Ejecutar con:
// node --env-file .env scripts/examen-ext.js

import { pool } from '../src/db/pool.js';

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🚀 Creando módulo de Exámenes Virtuales...');

    await client.query(`
      -- =============================================
      -- MIGRACIÓN: Exámenes Virtuales
      -- =============================================

      -- 1) Extender evaluacion existente
      ALTER TABLE public.evaluacion
        ADD COLUMN IF NOT EXISTS modalidad varchar(20) DEFAULT 'presencial'
          CHECK (modalidad IN ('presencial', 'virtual')),
        ADD COLUMN IF NOT EXISTS duracion_minutos integer,
        ADD COLUMN IF NOT EXISTS fecha_hora_inicio timestamp without time zone,
        ADD COLUMN IF NOT EXISTS fecha_hora_fin timestamp without time zone,
        ADD COLUMN IF NOT EXISTS intentos_permitidos integer DEFAULT 1,
        ADD COLUMN IF NOT EXISTS orden_aleatorio boolean DEFAULT false;

      -- 2) Banco de preguntas del examen
      CREATE SEQUENCE IF NOT EXISTS examen_pregunta_id_seq;

      CREATE TABLE IF NOT EXISTS public.examen_pregunta (
        id                 integer NOT NULL DEFAULT nextval('examen_pregunta_id_seq'::regclass),
        evaluacion_id      integer NOT NULL,
        tipo               varchar(20) NOT NULL
          CHECK (tipo IN ('opcion_multiple', 'verdadero_falso', 'respuesta_corta', 'desarrollo')),
        pregunta           text NOT NULL,
        opciones           jsonb,
        respuesta_correcta integer,
        respuesta_esperada text,
        puntos             numeric NOT NULL DEFAULT 1,
        requiere_archivo   boolean DEFAULT false,
        orden              integer DEFAULT 1,
        activo             boolean DEFAULT true,
        generado_por_ia    boolean DEFAULT false,
        created_at         timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at         timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT examen_pregunta_pkey PRIMARY KEY (id),
        CONSTRAINT examen_pregunta_evaluacion_id_fkey
          FOREIGN KEY (evaluacion_id) REFERENCES public.evaluacion(id)
      );

      CREATE INDEX IF NOT EXISTS idx_examen_pregunta_evaluacion_id
        ON public.examen_pregunta(evaluacion_id);

      -- 3) Intentos de examen
      CREATE SEQUENCE IF NOT EXISTS examen_intento_id_seq;

      CREATE TABLE IF NOT EXISTS public.examen_intento (
        id                   integer NOT NULL DEFAULT nextval('examen_intento_id_seq'::regclass),
        evaluacion_id        integer NOT NULL,
        matricula_id         integer NOT NULL,
        estado               varchar(20) DEFAULT 'en_progreso'
          CHECK (estado IN ('en_progreso', 'entregado', 'expirado')),
        iniciado_en          timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        entregado_en         timestamp without time zone,
        puntaje_obtenido     numeric,
        calificado_completo  boolean DEFAULT false,
        CONSTRAINT examen_intento_pkey PRIMARY KEY (id),
        CONSTRAINT examen_intento_evaluacion_id_fkey
          FOREIGN KEY (evaluacion_id) REFERENCES public.evaluacion(id),
        CONSTRAINT examen_intento_matricula_id_fkey
          FOREIGN KEY (matricula_id) REFERENCES public.matricula(id),
        UNIQUE (evaluacion_id, matricula_id)
      );

      CREATE INDEX IF NOT EXISTS idx_examen_intento_evaluacion_id
        ON public.examen_intento(evaluacion_id);
      CREATE INDEX IF NOT EXISTS idx_examen_intento_matricula_id
        ON public.examen_intento(matricula_id);

      -- 4) Respuestas por pregunta
      CREATE SEQUENCE IF NOT EXISTS examen_respuesta_id_seq;

      CREATE TABLE IF NOT EXISTS public.examen_respuesta (
        id                 integer NOT NULL DEFAULT nextval('examen_respuesta_id_seq'::regclass),
        intento_id         integer NOT NULL,
        pregunta_id        integer NOT NULL,
        respuesta_opcion   integer,
        respuesta_texto    text,
        archivo_url        text,
        archivo_public_id  varchar(200),
        es_correcta        boolean,
        puntaje_obtenido   numeric,
        retroalimentacion  text,
        CONSTRAINT examen_respuesta_pkey PRIMARY KEY (id),
        CONSTRAINT examen_respuesta_intento_id_fkey
          FOREIGN KEY (intento_id) REFERENCES public.examen_intento(id),
        CONSTRAINT examen_respuesta_pregunta_id_fkey
          FOREIGN KEY (pregunta_id) REFERENCES public.examen_pregunta(id),
        UNIQUE (intento_id, pregunta_id)
      );

      CREATE INDEX IF NOT EXISTS idx_examen_respuesta_intento_id
        ON public.examen_respuesta(intento_id);
      CREATE INDEX IF NOT EXISTS idx_examen_respuesta_pregunta_id
        ON public.examen_respuesta(pregunta_id);
    `);

    await client.query('COMMIT');

    console.log(`
╔══════════════════════════════════════════════╗
║  MÓDULO EXÁMENES VIRTUALES CREADO CON ÉXITO  ║
╠══════════════════════════════════════════════╣
║  Columnas agregadas a evaluacion             ║
║  Tabla: examen_pregunta                      ║
║  Tabla: examen_intento                       ║
║  Tabla: examen_respuesta                     ║
║  Índices y constraints verificados           ║
╚══════════════════════════════════════════════╝
`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error al crear el módulo Exámenes Virtuales:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
