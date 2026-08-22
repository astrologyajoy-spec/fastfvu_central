import mysql from 'mysql2/promise';

let poolInstance: mysql.Pool | null = null;

export function getDbPool(): mysql.Pool | null {
  if (poolInstance) {
    return poolInstance;
  }

  const host = process.env.DB_HOST || process.env.TIDB_HOST || "gateway01.ap-southeast-1.prod.aws.tidbcloud.com";
  const user = process.env.DB_USER || process.env.TIDB_USER || "2eNMjq4nRAhJLGj.root";
  const password = process.env.DB_PASSWORD || process.env.TIDB_PASSWORD || "Q5RkIDlfG3lqUlOL";
  const database = process.env.DB_NAME || process.env.TIDB_DATABASE || "fastfvu_central";
  const port = Number(process.env.DB_PORT || process.env.TIDB_PORT || 4000);

  try {
    poolInstance = mysql.createPool({
      host,
      user,
      password,
      database,
      port,
      ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      },
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 10000
    });
    return poolInstance;
  } catch (err) {
    console.warn("Failed to initialize TiDB connection pool:", err);
    return null;
  }
}

export const pool = getDbPool();
export default pool;
