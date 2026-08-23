import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
function ask(q) { return new Promise(resolve => rl.question(q, resolve)); }

// Permisos requeridos por egresoRoutes.js
const PERMISOS_EGRESOS = [
    ['leer', 'Ver egresos y tipos de egreso'],
    ['crear', 'Registrar nuevos egresos'],
    ['verificar', 'Verificar egresos registrados'],
    ['anular', 'Anular egresos registrados'],
    ['administrar', 'Crear y editar tipos de egreso'],
];

// Roles a los que se les asigna acceso completo al módulo.
// Ajustá esta lista si querés que otro rol (ej. "contador") también tenga acceso.
const ROLES_CON_ACCESO = ['super_admin', 'secretaria'];

async function seedPermisosEgresos() {
    const client = await pool.connect();
    try {
        console.log('\n🌱 Creando permisos del módulo de Egresos...');
        const confirm = await ask('¿Continuar? (SI para confirmar): ');
        if (confirm !== 'SI') {
            console.log('❌ Cancelado.');
            process.exit(0);
        }

        await client.query('BEGIN');

        // 1. Crear permisos (idempotente por el UNIQUE en nombre)
        console.log('  → Insertando permisos en tabla permisos...');
        const permisosCreados = [];
        for (const [accion, descripcion] of PERMISOS_EGRESOS) {
            const nombre = `egresos.${accion}`;
            const result = await client.query(
                `INSERT INTO permisos (modulo, accion, nombre, descripcion)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (nombre) DO NOTHING
         RETURNING *`,
                ['egresos', accion, nombre, descripcion]
            );
            if (result.rows[0]) {
                permisosCreados.push(result.rows[0]);
            } else {
                // Ya existía: lo recuperamos para poder asignarlo igual
                const existente = await client.query(
                    'SELECT * FROM permisos WHERE nombre = $1',
                    [nombre]
                );
                permisosCreados.push(existente.rows[0]);
            }
            console.log(`     ✓ ${nombre}`);
        }

        // 2. Asignar todos los permisos a los roles indicados
        console.log('  → Asignando permisos a roles...');
        for (const nombreRol of ROLES_CON_ACCESO) {
            const rolResult = await client.query(
                'SELECT * FROM roles WHERE nombre = $1',
                [nombreRol]
            );

            if (rolResult.rows.length === 0) {
                console.log(`     ⚠️  Rol "${nombreRol}" no encontrado, se omite.`);
                continue;
            }

            const rol = rolResult.rows[0];
            for (const permiso of permisosCreados) {
                await client.query(
                    `INSERT INTO rol_permisos (rol_id, permiso_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
                    [rol.id, permiso.id]
                );
            }
            console.log(`     ✓ ${nombreRol}: ${permisosCreados.length} permisos asignados`);
        }

        await client.query('COMMIT');
        console.log('✅ Permisos del módulo de Egresos creados y asignados exitosamente.\n');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('💥 Error:', error.message);
    } finally {
        client.release();
        rl.close();
        process.exit(0);
    }
}

seedPermisosEgresos().catch(err => { console.error(err); process.exit(1); });