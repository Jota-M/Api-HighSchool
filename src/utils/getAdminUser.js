// utils/getAdminUser.js
import { pool } from '../db/pool.js';

/**
 * Obtiene el usuario admin por su username (definido en .env).
 * Devuelve { id, username } o null si no existe.
 */
export async function getAdminUser() {
    const username = process.env.ADMIN_USERNAME;

    if (username) {
        const result = await pool.query(
            `SELECT id, username
       FROM usuarios
       WHERE username = $1
         AND activo = true
         AND deleted_at IS NULL
       LIMIT 1`,
            [username]
        );

        if (result.rows[0]) {
            return result.rows[0];
        }

        console.warn(`[getAdminUser] ADMIN_USERNAME "${username}" no encontrado o inactivo`);
    }

    const result = await pool.query(
        `SELECT u.id, u.username
     FROM usuarios u
     INNER JOIN usuario_roles ur ON ur.usuario_id = u.id
     INNER JOIN roles r ON r.id = ur.rol_id
     WHERE r.nombre = 'super_admin'
       AND u.activo = true
       AND u.deleted_at IS NULL
     ORDER BY u.id ASC
     LIMIT 1`
    );

    return result.rows[0] ?? null;
}

/**
 * Devuelve el número de WhatsApp del admin desde .env.
 */
export function getAdminWhatsapp() {
    return process.env.ADMIN_WHATSAPP_NUMBER ?? null;
}
