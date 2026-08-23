import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
function ask(q) { return new Promise(resolve => rl.question(q, resolve)); }

// Categorías por defecto para tipo_egreso.
// Ajustá nombre/codigo/color a gusto antes de correr el script si querés otro set inicial.
const CATEGORIAS_EGRESO = [
    { codigo: 'PLANILLA_DOCENTE', nombre: 'Planilla docente', categoria: 'personal', requiere_docente: true, color: '#F59E0B', orden: 1 },
    { codigo: 'PLANILLA_ADMIN', nombre: 'Personal administrativo', categoria: 'personal', requiere_docente: false, color: '#EAB308', orden: 2 },
    { codigo: 'SERVICIOS_BASICOS', nombre: 'Servicios básicos (luz, agua, internet)', categoria: 'operativo', requiere_docente: false, color: '#3B82F6', orden: 3 },
    { codigo: 'MANTENIMIENTO', nombre: 'Infraestructura y mantenimiento', categoria: 'operativo', requiere_docente: false, color: '#6366F1', orden: 4 },
    { codigo: 'MATERIAL_DIDACTICO', nombre: 'Material didáctico y de oficina', categoria: 'operativo', requiere_docente: false, color: '#8B5CF6', orden: 5 },
    { codigo: 'TRANSPORTE', nombre: 'Transporte (combustible, mantenimiento, choferes)', categoria: 'operativo', requiere_docente: false, color: '#06B6D4', orden: 6 },
    { codigo: 'IMPUESTOS_LEGAL', nombre: 'Impuestos y trámites legales', categoria: 'administrativo', requiere_docente: false, color: '#EF4444', orden: 7 },
    { codigo: 'MARKETING', nombre: 'Marketing y difusión', categoria: 'administrativo', requiere_docente: false, color: '#EC4899', orden: 8 },
    { codigo: 'EVENTOS', nombre: 'Eventos institucionales', categoria: 'administrativo', requiere_docente: false, color: '#14B8A6', orden: 9 },
    { codigo: 'OTROS', nombre: 'Otros / imprevistos', categoria: 'otro', requiere_docente: false, color: '#94A3B8', orden: 10 },
];

async function crearModuloEgresos() {
    const client = await pool.connect();
    try {
        console.log('\n🔧 Creando módulo de Egresos (tipo_egreso, egreso, balance_financiero_mensual)...');
        const confirm = await ask('¿Continuar? (SI para confirmar): ');
        if (confirm !== 'SI') {
            console.log('❌ Cancelado.');
            process.exit(0);
        }

        await client.query('BEGIN');

        // 1. tipo_egreso — catálogo de categorías, espejo de tipo_ingreso
        console.log('  → Creando tabla tipo_egreso...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS tipo_egreso (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(50) NOT NULL UNIQUE,
        nombre VARCHAR(150) NOT NULL,
        descripcion TEXT,
        categoria VARCHAR(50) NOT NULL,
        requiere_docente BOOLEAN DEFAULT false,
        activo BOOLEAN DEFAULT true,
        color VARCHAR(20),
        orden INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // 2. egreso — movimientos, espejo de ingreso
        console.log('  → Creando tabla egreso...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS egreso (
        id SERIAL PRIMARY KEY,
        codigo_egreso VARCHAR(50) NOT NULL UNIQUE,
        tipo_egreso_id INTEGER NOT NULL REFERENCES tipo_egreso(id),
        fecha_egreso TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        periodo_academico_id INTEGER REFERENCES periodo_academico(id),

        docente_id INTEGER REFERENCES docente(id),
        referencia_tipo VARCHAR(50),
        referencia_id INTEGER,
        referencia_codigo VARCHAR(50),

        concepto VARCHAR(200) NOT NULL,
        descripcion TEXT,

        monto NUMERIC NOT NULL CHECK (monto > 0),
        monto_neto NUMERIC,

        metodo_pago VARCHAR(30) NOT NULL CHECK (metodo_pago IN ('efectivo', 'transferencia', 'qr', 'tarjeta')),
        numero_comprobante VARCHAR(100),
        comprobante_url TEXT,
        banco VARCHAR(100),
        numero_referencia VARCHAR(100),

        beneficiario VARCHAR(200),
        requiere_factura BOOLEAN DEFAULT false,
        factura_recibida BOOLEAN DEFAULT false,
        numero_factura VARCHAR(100),
        nit_proveedor VARCHAR(50),

        estado VARCHAR(30) DEFAULT 'registrado',
        verificado BOOLEAN DEFAULT false,
        verificado_por INTEGER REFERENCES usuarios(id),
        fecha_verificacion TIMESTAMP,

        anulado BOOLEAN DEFAULT false,
        motivo_anulacion TEXT,
        anulado_por INTEGER REFERENCES usuarios(id),
        fecha_anulacion TIMESTAMP,

        observaciones TEXT,
        registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_egreso_tipo_egreso_id ON egreso(tipo_egreso_id)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_egreso_fecha_egreso ON egreso(fecha_egreso)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_egreso_docente_id ON egreso(docente_id)
      WHERE docente_id IS NOT NULL
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_egreso_periodo_academico_id ON egreso(periodo_academico_id)
      WHERE periodo_academico_id IS NOT NULL
    `);

        // 3. balance_financiero_mensual — cierre mensual congelado
        console.log('  → Creando tabla balance_financiero_mensual...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS balance_financiero_mensual (
        id SERIAL PRIMARY KEY,
        periodo_academico_id INTEGER REFERENCES periodo_academico(id),
        anio INTEGER NOT NULL,
        mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),

        total_ingresos NUMERIC NOT NULL DEFAULT 0,
        total_egresos NUMERIC NOT NULL DEFAULT 0,
        utilidad_neta NUMERIC GENERATED ALWAYS AS (total_ingresos - total_egresos) STORED,

        desglose_ingresos JSONB,
        desglose_egresos JSONB,

        estado VARCHAR(20) DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado')),
        cerrado_por INTEGER REFERENCES usuarios(id),
        fecha_cierre TIMESTAMP,
        observaciones TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT balance_financiero_mensual_anio_mes_key UNIQUE (anio, mes)
      )
    `);

        // 4. Vista de balance en tiempo real (no depende de que se haya cerrado el mes)
        console.log('  → Creando vista balance_mensual_vivo...');
        await client.query(`
      CREATE OR REPLACE VIEW balance_mensual_vivo AS
      SELECT
        TO_CHAR(fecha, 'YYYY-MM') AS mes,
        SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END) AS total_ingresos,
        SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END) AS total_egresos,
        SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END) AS utilidad_neta
      FROM (
        SELECT fecha_ingreso AS fecha, COALESCE(monto_neto, monto) AS monto, 'ingreso' AS tipo
        FROM ingreso WHERE anulado = false
        UNION ALL
        SELECT fecha_egreso AS fecha, COALESCE(monto_neto, monto) AS monto, 'egreso' AS tipo
        FROM egreso WHERE anulado = false
      ) movimientos
      GROUP BY TO_CHAR(fecha, 'YYYY-MM')
      ORDER BY mes DESC
    `);

        // 5. Seed de categorías por defecto (idempotente por el UNIQUE en codigo)
        console.log('  → Insertando categorías por defecto en tipo_egreso...');
        for (const cat of CATEGORIAS_EGRESO) {
            await client.query(
                `INSERT INTO tipo_egreso (codigo, nombre, categoria, requiere_docente, color, orden)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (codigo) DO NOTHING`,
                [cat.codigo, cat.nombre, cat.categoria, cat.requiere_docente, cat.color, cat.orden]
            );
        }

        await client.query('COMMIT');
        console.log('✅ Módulo de Egresos creado exitosamente.');
        console.log(`   Tablas: tipo_egreso, egreso, balance_financiero_mensual`);
        console.log(`   Vista:  balance_mensual_vivo`);
        console.log(`   Categorías insertadas: ${CATEGORIAS_EGRESO.length}\n`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('💥 Error:', error.message);
    } finally {
        client.release();
        rl.close();
        process.exit(0);
    }
}

crearModuloEgresos().catch(err => { console.error(err); process.exit(1); });