// scripts/reserva-cupo-ext.js
import 'dotenv/config';
import { pool } from '../src/db/pool.js';

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔄 Iniciando migración: reserva_cupo...');
    await client.query('BEGIN');

    // 1. Secuencia para reserva_cupo
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS reserva_cupo_id_seq;
    `);

    // 2. Tabla reserva_cupo
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.reserva_cupo (
        id                     INTEGER NOT NULL DEFAULT nextval('reserva_cupo_id_seq'::regclass),
        codigo_reserva         VARCHAR(40) NOT NULL,
        codigo_recibo          VARCHAR(40) NOT NULL,
        estudiante_id          INTEGER NOT NULL,
        periodo_academico_id   INTEGER NOT NULL,
        grado_actual_id        INTEGER,
        grado_destino_id       INTEGER NOT NULL,
        turno_destino_id       INTEGER NOT NULL,
        tutor_nombre           VARCHAR(150) NOT NULL,
        tutor_ci               VARCHAR(30) NOT NULL,
        tutor_parentesco       VARCHAR(50) NOT NULL,
        tutor_telefono         VARCHAR(30) NOT NULL,
        observaciones          TEXT,
        estado                 VARCHAR(25) NOT NULL DEFAULT 'confirmada'
                               CHECK (estado IN ('confirmada', 'matriculada', 'cancelada', 'vencida')),
        fecha_reserva          TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at             TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at             TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        deleted_at             TIMESTAMP WITHOUT TIME ZONE,
        CONSTRAINT reserva_cupo_pkey PRIMARY KEY (id),
        CONSTRAINT reserva_cupo_codigo_reserva_key UNIQUE (codigo_reserva),
        CONSTRAINT reserva_cupo_codigo_recibo_key UNIQUE (codigo_recibo),
        CONSTRAINT reserva_cupo_estudiante_fkey FOREIGN KEY (estudiante_id)
          REFERENCES public.estudiante(id) ON DELETE RESTRICT,
        CONSTRAINT reserva_cupo_periodo_fkey FOREIGN KEY (periodo_academico_id)
          REFERENCES public.periodo_academico(id) ON DELETE RESTRICT,
        CONSTRAINT reserva_cupo_grado_actual_fkey FOREIGN KEY (grado_actual_id)
          REFERENCES public.grado(id) ON DELETE SET NULL,
        CONSTRAINT reserva_cupo_grado_destino_fkey FOREIGN KEY (grado_destino_id)
          REFERENCES public.grado(id) ON DELETE RESTRICT,
        CONSTRAINT reserva_cupo_turno_destino_fkey FOREIGN KEY (turno_destino_id)
          REFERENCES public.turno(id) ON DELETE RESTRICT,
        CONSTRAINT unique_reserva_estudiante_periodo UNIQUE (estudiante_id, periodo_academico_id)
      );
    `);

    // 3. Índices de búsqueda
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reserva_cupo_estudiante ON public.reserva_cupo(estudiante_id);
      CREATE INDEX IF NOT EXISTS idx_reserva_cupo_periodo ON public.reserva_cupo(periodo_academico_id);
      CREATE INDEX IF NOT EXISTS idx_reserva_cupo_grado_destino ON public.reserva_cupo(grado_destino_id);
      CREATE INDEX IF NOT EXISTS idx_reserva_cupo_codigo ON public.reserva_cupo(codigo_reserva);
      CREATE INDEX IF NOT EXISTS idx_reserva_cupo_recibo ON public.reserva_cupo(codigo_recibo);
    `);

    await client.query('COMMIT');
    console.log('✅ Migración reserva_cupo ejecutada exitosamente.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en la migración:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
