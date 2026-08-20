import { pool } from '../../src/lib/db';

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const connection = await pool.getConnection();
    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS fvu_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NULL,
          api_key_id INT NULL,
          filename VARCHAR(255) NOT NULL,
          csi_filename VARCHAR(255) NULL,
          output_filename VARCHAR(255) NULL,
          status VARCHAR(50) NOT NULL,
          processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          error_details TEXT NULL
        )
      `);

      const [rows]: any = await connection.query(
        "SELECT id, filename as file_name, csi_filename, output_filename, status, processed_at as created_at, error_details FROM fvu_logs ORDER BY processed_at DESC LIMIT 50"
      );

      return res.status(200).json({ logs: rows });
    } finally {
      connection.release();
    }
  } catch (err: any) {
    console.error("Fetch Logs Error:", err);
    return res.status(200).json({ logs: [] });
  }
}
