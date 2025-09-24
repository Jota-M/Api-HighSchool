import { pool } from '../src/db/pool.js';

async function createTables(client) {
    const userTable = `
        CREATE TABLE IF NOT EXISTS roles (
            id SERIAL PRIMARY KEY,
            name VARCHAR(50) UNIQUE NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL
        );
    `;

    await client.query(userTable);
    await client.query(`INSERT INTO roles (name) VALUES ('admin'), ('user') ON CONFLICT DO NOTHING;`);
}

async function seed() {
    const client = await pool.connect();
    try {
        console.log('Conectado a la BD');
        await createTables(client);
        console.log('Tablas creadas y roles insertados');
    } catch (error) {
        console.error('Error en el seeding:', error);
    } finally {
        client.release();
    }
}

seed();
