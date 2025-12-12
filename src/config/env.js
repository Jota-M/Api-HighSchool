const envs = {
    development: {
        PORT: process.env.PORT || 3000,
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
    },
    production: {
        // En producción, usar DATABASE_URL si existe
        connectionString: process.env.DATABASE_URL,
        PORT: process.env.PORT || 10000,
    }
};

export function getEnv(){
    return envs[process.env.NODE_ENV || 'development'];
};