import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// TiDB Cloud Database Connection Pool
export const pool = mysql.createPool({
  host: "gateway01.ap-southeast-1.prod.aws.tidbcloud.com",
  user: "2eNMjq4nRAhJLGj.root",
  password: "Q5RkIDlfG3lqUlOL",
  database: "fastfvu_central",
  port: 4000,
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
