import { pool } from '../db/pool.js';
import bcrypt from 'bcrypt';

export async function createUser({ username, password, role }) {
    const hashed = await bcrypt.hash(password, 10);

    const roleRes = await pool.query('SELECT id FROM roles WHERE name = $1', [role]);
    const roleId = roleRes.rows[0]?.id;

    if (!roleId) throw new Error("Rol no válido");

    const res = await pool.query(
        `INSERT INTO users (username, password, role_id) VALUES ($1, $2, $3) RETURNING id, username`,
        [username, hashed, roleId]
    );

    return res.rows[0];
}

export async function findUserByUsername(username) {
    const res = await pool.query(
        `SELECT users.*, roles.name AS role FROM users JOIN roles ON users.role_id = roles.id WHERE username = $1`,
        [username]
    );
    return res.rows[0];
}
