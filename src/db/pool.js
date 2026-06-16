// import pg from 'pg';
// import { getEnv } from '../config/env.js';

// const { user, host, port, database, password } = getEnv();
// export const pool = new pg.Pool({
//     user: user,
//     host: host,
//     port: port,
//     database: database,
//     password: password,
// });
import pg from 'pg';
import dotenv from 'dotenv';
import { getEnv } from '../config/env.js';
import dns from 'dns';

// Forzar resolución DNS a IPv4
dns.setDefaultResultOrder('ipv4first');

dotenv.config();

const env = getEnv();

console.log('Pool config:', env.connectionString ? 'Using connectionString' : 'Using individual params');

export const pool = new pg.Pool(
    env.connectionString
        ? {
            connectionString: env.connectionString,
            ssl: { rejectUnauthorized: false }
        }
        : {
            user: env.user,
            host: env.host,
            port: env.port,
            database: env.database,
            password: env.password,
            ssl: { rejectUnauthorized: false },
            family: 4
        }
);