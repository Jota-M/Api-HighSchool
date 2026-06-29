// import { pool } from '../src/db/pool.js';

// async function crearTablaSolicitudFactura() {
//     const client = await pool.connect();

//     try {
//         console.log('\n🧾 CREANDO TABLA SOLICITUD_FACTURA\n');

//         await client.query('BEGIN');

//         // Crear tabla
//         await client.query(`
//             CREATE TABLE IF NOT EXISTS solicitud_factura (
//                 id SERIAL PRIMARY KEY,

//                 pago_mensualidad_id INTEGER NOT NULL
//                     REFERENCES pago_mensualidad(id),

//                 solicitado_por INTEGER NOT NULL
//                     REFERENCES usuarios(id),

//                 fecha_solicitud TIMESTAMPTZ NOT NULL
//                     DEFAULT CURRENT_TIMESTAMP,

//                 estado VARCHAR(20) NOT NULL
//                     DEFAULT 'pendiente'
//                     CHECK (estado IN ('pendiente', 'completada')),

//                 factura_url TEXT,
//                 factura_public_id TEXT,

//                 subido_por INTEGER
//                     REFERENCES usuarios(id),

//                 fecha_subida TIMESTAMPTZ,

//                 observaciones TEXT,

//                 created_at TIMESTAMPTZ NOT NULL
//                     DEFAULT CURRENT_TIMESTAMP,

//                 updated_at TIMESTAMPTZ NOT NULL
//                     DEFAULT CURRENT_TIMESTAMP,

//                 CONSTRAINT uq_solicitud_factura_pago
//                     UNIQUE (pago_mensualidad_id)
//             );
//         `);

//         console.log('✅ Tabla solicitud_factura creada');

//         // Índice estado
//         await client.query(`
//             CREATE INDEX IF NOT EXISTS idx_solicitud_factura_estado
//             ON solicitud_factura(estado);
//         `);

//         console.log('✅ Índice estado creado');

//         // Índice solicitante
//         await client.query(`
//             CREATE INDEX IF NOT EXISTS idx_solicitud_factura_solicit
//             ON solicitud_factura(solicitado_por);
//         `);

//         console.log('✅ Índice solicitante creado');

//         // Función updated_at
//         await client.query(`
//             CREATE OR REPLACE FUNCTION update_solicitud_factura_timestamp()
//             RETURNS TRIGGER AS $$
//             BEGIN
//                 NEW.updated_at = CURRENT_TIMESTAMP;
//                 RETURN NEW;
//             END;
//             $$ LANGUAGE plpgsql;
//         `);

//         console.log('✅ Función update_solicitud_factura_timestamp creada');

//         // Trigger
//         await client.query(`
//             DROP TRIGGER IF EXISTS trg_solicitud_factura_updated_at
//             ON solicitud_factura;
//         `);

//         await client.query(`
//             CREATE TRIGGER trg_solicitud_factura_updated_at
//             BEFORE UPDATE ON solicitud_factura
//             FOR EACH ROW
//             EXECUTE FUNCTION update_solicitud_factura_timestamp();
//         `);

//         console.log('✅ Trigger updated_at creado');

//         await client.query('COMMIT');

//         console.log('\n═══════════════════════════════════════');
//         console.log('✅ Migración completada correctamente');
//         console.log('═══════════════════════════════════════\n');

//     } catch (error) {
//         await client.query('ROLLBACK');
//         console.error('\n💥 Error:', error.message);
//     } finally {
//         client.release();
//         await pool.end();
//     }
// }

// crearTablaSolicitudFactura();
import { pool } from '../src/db/pool.js';

async function crearPermisosSolicitudFactura() {
    const client = await pool.connect();

    try {
        console.log('\n🧾 CREANDO PERMISOS DE SOLICITUD DE FACTURA\n');

        await client.query('BEGIN');

        const permisos = [
            ['solicitud_factura', 'leer', 'Ver solicitudes de factura'],
            ['solicitud_factura', 'gestionar', 'Subir facturas a solicitudes'],
        ];

        let creados = 0;

        for (const [modulo, accion, descripcion] of permisos) {

            const nombre = `${modulo}.${accion}`;

            const existe = await client.query(
                `SELECT id FROM permisos WHERE nombre = $1`,
                [nombre]
            );

            if (existe.rows.length === 0) {
                await client.query(
                    `
                    INSERT INTO permisos (modulo, accion, nombre, descripcion)
                    VALUES ($1, $2, $3, $4)
                    `,
                    [modulo, accion, nombre, descripcion]
                );

                console.log(`✅ ${nombre}`);
                creados++;
            } else {
                console.log(`⚠️ Ya existe: ${nombre}`);
            }
        }

        // Asignar permisos a super_admin y admin
        const roles = ['super_admin', 'admin'];

        let asignados = 0;

        for (const rol of roles) {
            for (const [modulo, accion] of permisos) {

                const nombre = `${modulo}.${accion}`;

                await client.query(
                    `
                    INSERT INTO rol_permisos (rol_id, permiso_id)
                    SELECT r.id, p.id
                    FROM roles r
                    JOIN permisos p ON p.nombre = $2
                    WHERE r.nombre = $1
                    ON CONFLICT DO NOTHING
                    `,
                    [rol, nombre]
                );

                console.log(`🔑 ${nombre} → ${rol}`);
                asignados++;
            }
        }

        await client.query('COMMIT');

        console.log('\n═══════════════════════════════════════');
        console.log(`✅ Permisos creados: ${creados}`);
        console.log(`✅ Asignaciones realizadas: ${asignados}`);
        console.log('═══════════════════════════════════════\n');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n💥 Error:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

crearPermisosSolicitudFactura();