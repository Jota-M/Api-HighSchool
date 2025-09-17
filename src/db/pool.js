import pg from 'pg';
import { getEnv } from '../config/env.js';

const { user, host, port, database, password } = getEnv();
export const pool = new pg.Pool({
    user: user,
    host: host,
    port: port,
    database: database,
    password: password,
});
