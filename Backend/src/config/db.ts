import { Pool, QueryResult, QueryResultRow } from 'pg';
import { env } from './env';

export const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
});

/**
 * Execute a raw parameterized SQL query against the PostgreSQL pool.
 * Parameterized queries prevent SQL injection ($1, $2, ...).
 */
export const query = async <T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> => {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (env.NODE_ENV === 'development') {
    // Log query in debug mode without exposing sensitive params
    // console.debug('[PostgreSQL query]', { text, duration: `${duration}ms`, rows: res.rowCount });
  }
  return res;
};

/**
 * Verifies database connectivity on application startup.
 */
export const testDbConnection = async (): Promise<void> => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() AS current_time');
    client.release();
    console.log(`[PostgreSQL] Connected successfully to "${env.DB_NAME}" at ${env.DB_HOST}:${env.DB_PORT} (db time: ${result.rows[0].current_time})`);
  } catch (error: any) {
    console.error(`[PostgreSQL] Failed to connect to database "${env.DB_NAME}":`, error.message);
    throw error;
  }
};
