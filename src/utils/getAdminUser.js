// utils/getAdminUser.js
import { pool } from '../db/pool.js';

/**
 * Obtiene el usuario admin por su username (definido en .env).
 * Devuelve { id, username } o null si no existe.
 */
export async function getAdminUser() {
    const username = process.env.ADMIN_USERNAME;
    if (!username) {
        console.warn('[getAdminUser] ADMIN_USERNAME no definido en .env');
        return null;
    }

    const result = await pool.query(
        `SELECT id, username
     FROM usuarios
     WHERE username = $1
       AND activo = true
       AND deleted_at IS NULL
     LIMIT 1`,
        [username]
    );

    return result.rows[0] ?? null;
}

/**
 * Devuelve el número de WhatsApp del admin desde .env.
 */
export function getAdminWhatsapp() {
    return process.env.ADMIN_WHATSAPP_NUMBER ?? null;
}