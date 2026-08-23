// scripts/migracionProductos.js
// Migración: módulo de venta de uniformes/deportivos
// Agrega tablas producto/producto_variante/pedido_producto/pago_producto,
// el tipo_ingreso VENTA_PRODUCTO y la función+trigger de centralización
// (mismo patrón que centralizar_pago_transporte / centralizar_pago_mensualidad).
// Uso: node scripts/migracionProductos.js

import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
function ask(q) {
    return new Promise((resolve) => rl.question(q, resolve));
}

async function migrar() {
    const client = await pool.connect();
    try {
        console.log('\n🛍️  MIGRACIÓN: MÓDULO DE VENTA DE UNIFORMES/DEPORTIVOS');
        console.log('\n📋 COMPONENTES A AGREGAR:');
        console.log('  ✅ Tablas: producto, producto_variante, pedido_producto, pedido_producto_detalle, pago_producto');
        console.log('  ✅ tipo_ingreso VENTA_PRODUCTO');
        console.log('  ✅ Función centralizar_pago_producto()');
        console.log('  ✅ Trigger auto_centralizar_pago_producto (AFTER INSERT OR UPDATE)\n');

        const confirm = await ask('¿Deseas continuar? (SI para confirmar): ');
        if (confirm !== 'SI') {
            console.log('\n❌ Cancelado — no se realizaron cambios.');
            process.exit(0);
        }

        await client.query('BEGIN');
        console.log('\n⏳ Procesando...\n');

        // =============================================
        // 1️⃣ SEQUENCES
        // =============================================
        console.log('📋 Creando sequences...');
        const sequences = [
            'producto_id_seq',
            'producto_variante_id_seq',
            'pedido_producto_id_seq',
            'pedido_producto_detalle_id_seq',
            'pago_producto_id_seq',
        ];
        for (const seq of sequences) {
            await client.query(`CREATE SEQUENCE IF NOT EXISTS public.${seq} START 1 INCREMENT 1;`);
        }
        console.log(`  ✅ ${sequences.length} sequences creados\n`);

        // =============================================
        // 2️⃣ TABLAS
        // =============================================
        console.log('📋 Creando tablas...');

        await client.query(`
      CREATE TABLE IF NOT EXISTS "producto" (
        "id"                  integer DEFAULT nextval('producto_id_seq'::regclass) NOT NULL,
        "codigo"              character varying(50)  NOT NULL,
        "categoria"           character varying(20)  NOT NULL,
        "nombre"              character varying(200) NOT NULL,
        "descripcion"         text,
        "tiene_variantes"     boolean DEFAULT true,
        "precio_base"         numeric NOT NULL,
        "nivel_academico_id"  integer,
        "foto_url"            text,
        "foto_public_id"      character varying(200),
        "activo"              boolean DEFAULT true,
        "created_at"          timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"          timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "deleted_at"          timestamp without time zone,
        PRIMARY KEY ("id"),
        UNIQUE ("codigo"),
        CONSTRAINT producto_categoria_check CHECK (categoria IN ('uniforme','deportivo','utiles','otro')),
        CONSTRAINT producto_precio_base_check CHECK (precio_base >= 0),
        CONSTRAINT producto_nivel_academico_id_fkey FOREIGN KEY (nivel_academico_id) REFERENCES nivel_academico(id)
      );
    `);
        console.log('  ✅ producto');

        await client.query(`
      CREATE TABLE IF NOT EXISTS "producto_variante" (
        "id"                integer DEFAULT nextval('producto_variante_id_seq'::regclass) NOT NULL,
        "producto_id"       integer NOT NULL,
        "talla"             character varying(20),
        "color"             character varying(50),
        "sku"               character varying(50),
        "precio"            numeric,
        "stock_total"       integer NOT NULL DEFAULT 0,
        "stock_reservado"   integer NOT NULL DEFAULT 0,
        "activo"            boolean DEFAULT true,
        "created_at"        timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"        timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("sku"),
        CONSTRAINT producto_variante_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES producto(id),
        CONSTRAINT producto_variante_stock_check CHECK (stock_reservado <= stock_total AND stock_total >= 0 AND stock_reservado >= 0)
      );
    `);
        console.log('  ✅ producto_variante');

        await client.query(`
      CREATE TABLE IF NOT EXISTS "pedido_producto" (
        "id"                    integer DEFAULT nextval('pedido_producto_id_seq'::regclass) NOT NULL,
        "codigo_pedido"         character varying(50) NOT NULL,
        "matricula_id"          integer NOT NULL,
        "padre_familia_id"      integer NOT NULL,
        "periodo_academico_id"  integer NOT NULL,
        "monto_total"           numeric NOT NULL,
        "estado"                character varying(20) DEFAULT 'pendiente_pago',
        "fecha_pedido"          timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "fecha_limite_pago"     timestamp without time zone,
        "entregado_en"          timestamp without time zone,
        "entregado_por"         integer,
        "observaciones"         text,
        "created_at"            timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"            timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "deleted_at"            timestamp without time zone,
        PRIMARY KEY ("id"),
        UNIQUE ("codigo_pedido"),
        CONSTRAINT pedido_producto_estado_check CHECK (estado IN ('pendiente_pago','pagado','entregado','cancelado','expirado')),
        CONSTRAINT pedido_producto_matricula_id_fkey FOREIGN KEY (matricula_id) REFERENCES matricula(id),
        CONSTRAINT pedido_producto_padre_familia_id_fkey FOREIGN KEY (padre_familia_id) REFERENCES padre_familia(id),
        CONSTRAINT pedido_producto_periodo_academico_id_fkey FOREIGN KEY (periodo_academico_id) REFERENCES periodo_academico(id),
        CONSTRAINT pedido_producto_entregado_por_fkey FOREIGN KEY (entregado_por) REFERENCES usuarios(id)
      );
    `);
        console.log('  ✅ pedido_producto');

        await client.query(`
      CREATE TABLE IF NOT EXISTS "pedido_producto_detalle" (
        "id"                     integer DEFAULT nextval('pedido_producto_detalle_id_seq'::regclass) NOT NULL,
        "pedido_producto_id"     integer NOT NULL,
        "producto_variante_id"   integer NOT NULL,
        "cantidad"               integer NOT NULL,
        "precio_unitario"        numeric NOT NULL,
        "subtotal"               numeric NOT NULL,
        "created_at"             timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        CONSTRAINT pedido_producto_detalle_cantidad_check CHECK (cantidad > 0),
        CONSTRAINT pedido_producto_detalle_pedido_id_fkey FOREIGN KEY (pedido_producto_id) REFERENCES pedido_producto(id),
        CONSTRAINT pedido_producto_detalle_variante_id_fkey FOREIGN KEY (producto_variante_id) REFERENCES producto_variante(id)
      );
    `);
        console.log('  ✅ pedido_producto_detalle');

        await client.query(`
      CREATE TABLE IF NOT EXISTS "pago_producto" (
        "id"                  integer DEFAULT nextval('pago_producto_id_seq'::regclass) NOT NULL,
        "codigo_pago"         character varying(50) NOT NULL,
        "pedido_producto_id"  integer NOT NULL,
        "monto_pagado"        numeric NOT NULL,
        "metodo_pago"         character varying(20) NOT NULL,
        "numero_comprobante"  character varying(100),
        "comprobante_url"     text,
        "banco_origen"        character varying(100),
        "numero_referencia"   character varying(100),
        "fecha_pago"          timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "registrado_por"      integer NOT NULL,
        "observaciones"       text,
        "anulado"             boolean DEFAULT false,
        "motivo_anulacion"    text,
        "anulado_por"         integer,
        "fecha_anulacion"     timestamp without time zone,
        "qr_data"             text,
        "qr_image_url"        text,
        "qr_expiracion"       timestamp without time zone,
        "qr_estado"           character varying(20),
        "transaccion_id"      character varying(100),
        "created_at"          timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        "updated_at"          timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id"),
        UNIQUE ("codigo_pago"),
        CONSTRAINT pago_producto_metodo_check CHECK (metodo_pago IN ('efectivo','transferencia','qr','tarjeta')),
        CONSTRAINT pago_producto_qr_estado_check CHECK (qr_estado IS NULL OR qr_estado IN ('generado','pagado','expirado','cancelado')),
        CONSTRAINT pago_producto_pedido_id_fkey FOREIGN KEY (pedido_producto_id) REFERENCES pedido_producto(id),
        CONSTRAINT pago_producto_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES usuarios(id),
        CONSTRAINT pago_producto_anulado_por_fkey FOREIGN KEY (anulado_por) REFERENCES usuarios(id)
      );
    `);
        console.log('  ✅ pago_producto');

        await client.query(`CREATE INDEX IF NOT EXISTS idx_pedido_producto_matricula ON pedido_producto(matricula_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_pedido_producto_estado ON pedido_producto(estado);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_pago_producto_pedido ON pago_producto(pedido_producto_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_producto_variante_producto ON producto_variante(producto_id);`);
        console.log('  ✅ índices\n');

        // =============================================
        // 3️⃣ TIPO_INGRESO
        // =============================================
        console.log('📋 Registrando tipo_ingreso VENTA_PRODUCTO...');
        await client.query(`
      INSERT INTO tipo_ingreso (codigo, nombre, descripcion, categoria, requiere_estudiante, color, orden)
      VALUES ('VENTA_PRODUCTO', 'Venta de uniformes/deportivos', 'Ingresos por venta de uniformes, ropa deportiva y útiles', 'productos', true, '#0288d1', 5)
      ON CONFLICT (codigo) DO NOTHING;
    `);
        console.log('  ✅ tipo_ingreso VENTA_PRODUCTO\n');

        // =============================================
        // 4️⃣ FUNCIÓN centralizar_pago_producto
        // =============================================
        console.log('🔧 Creando función centralizar_pago_producto...');
        await client.query(`
      CREATE OR REPLACE FUNCTION centralizar_pago_producto(
        p_pago_producto_id INTEGER
      )
      RETURNS INTEGER AS $$
      DECLARE
        v_ingreso_id INTEGER;
        v_tipo_ingreso_id INTEGER;
        v_codigo_ingreso VARCHAR;
        v_pago RECORD;
        v_pedido RECORD;
        v_matricula RECORD;
      BEGIN
        SELECT id INTO v_tipo_ingreso_id FROM tipo_ingreso WHERE codigo = 'VENTA_PRODUCTO';
        IF v_tipo_ingreso_id IS NULL THEN
          RAISE EXCEPTION 'Tipo de ingreso VENTA_PRODUCTO no encontrado';
        END IF;

        -- Idempotente: si ya está centralizado, no duplicar
        SELECT id INTO v_ingreso_id
        FROM ingreso
        WHERE referencia_tipo = 'pago_producto' AND referencia_id = p_pago_producto_id;

        IF v_ingreso_id IS NOT NULL THEN
          RETURN v_ingreso_id;
        END IF;

        SELECT * INTO v_pago FROM pago_producto WHERE id = p_pago_producto_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Pago de producto % no encontrado', p_pago_producto_id;
        END IF;

        IF v_pago.anulado THEN
          RETURN NULL;
        END IF;

        SELECT * INTO v_pedido FROM pedido_producto WHERE id = v_pago.pedido_producto_id;
        SELECT * INTO v_matricula FROM matricula WHERE id = v_pedido.matricula_id;

        v_codigo_ingreso := 'ING-' || TO_CHAR(v_pago.fecha_pago, 'YYYYMMDD') ||
                            '-' || LPAD(nextval('ingreso_id_seq')::TEXT, 6, '0');

        INSERT INTO ingreso (
          codigo_ingreso, tipo_ingreso_id, fecha_ingreso,
          periodo_academico_id, estudiante_id, padre_familia_id, matricula_id,
          referencia_tipo, referencia_id, referencia_codigo,
          monto, metodo_pago, numero_comprobante, comprobante_url,
          banco, numero_referencia, registrado_por, observaciones,
          estado, verificado
        )
        VALUES (
          v_codigo_ingreso, v_tipo_ingreso_id, v_pago.fecha_pago,
          v_pedido.periodo_academico_id, v_matricula.estudiante_id, v_pedido.padre_familia_id, v_pedido.matricula_id,
          'pago_producto', p_pago_producto_id, v_pago.codigo_pago,
          v_pago.monto_pagado, v_pago.metodo_pago, v_pago.numero_comprobante, v_pago.comprobante_url,
          v_pago.banco_origen, v_pago.numero_referencia, v_pago.registrado_por,
          'Compra de productos - Pedido ' || v_pedido.codigo_pedido,
          'registrado', true
        )
        RETURNING id INTO v_ingreso_id;

        RETURN v_ingreso_id;
      END;
      $$ LANGUAGE plpgsql;
    `);
        console.log('  ✅ Función centralizar_pago_producto creada\n');

        // =============================================
        // 5️⃣ TRIGGER
        // =============================================
        // IMPORTANTE: a diferencia del trigger de mensualidad (que dispara en
        // cualquier INSERT y por eso puede llegar a centralizar un QR recién
        // generado, todavía sin pagar), acá el trigger dispara en INSERT *y*
        // UPDATE, pero solo centraliza cuando el pago está efectivamente
        // confirmado: pago directo (efectivo/transferencia/tarjeta, que sólo
        // se inserta cuando ya hubo plata), o QR con qr_estado = 'pagado'.
        console.log('⚡ Creando función y trigger automático...');
        await client.query(`
      CREATE OR REPLACE FUNCTION trigger_centralizar_pago_producto()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NOT NEW.anulado AND (NEW.metodo_pago != 'qr' OR NEW.qr_estado = 'pagado') THEN
          PERFORM centralizar_pago_producto(NEW.id);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

        await client.query('DROP TRIGGER IF EXISTS auto_centralizar_pago_producto ON pago_producto');
        await client.query(`
      CREATE TRIGGER auto_centralizar_pago_producto
      AFTER INSERT OR UPDATE ON pago_producto
      FOR EACH ROW EXECUTE FUNCTION trigger_centralizar_pago_producto()
    `);
        console.log('  ✅ Trigger auto_centralizar_pago_producto creado\n');

        await client.query('COMMIT');
        console.log('==============================');
        console.log('✅ MIGRACIÓN COMPLETADA EXITOSAMENTE');
        console.log('==============================\n');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n❌ Error durante la migración — se hizo ROLLBACK');
        console.error(err);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrar();