import { pool } from '../_lib/db.js';

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const filename = url.searchParams.get('filename') || req.query?.filename || url.searchParams.get('file_name');
  const jobId = url.searchParams.get('jobId') || req.query?.jobId;

  if (!filename && !jobId) {
    return res.status(200).json({ status: "PROCESSING", message: "No filename or jobId provided yet" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const bucketName = process.env.SUPABASE_BUCKET_NAME || 'fvu-reports';

  try {
    if (!pool) {
      return res.status(200).json({ status: "PROCESSING", message: "Database pool initialising" });
    }

    const connection = await pool.getConnection();
    try {
      // Query recent log
      const [rows]: any = await connection.query(
        `SELECT id, filename, output_filename, status, error_details, download_url 
         FROM fvu_logs 
         WHERE filename = ? OR output_filename = ? 
         ORDER BY id DESC LIMIT 1`,
        [filename, filename]
      );

      if (!rows || rows.length === 0) {
        // Return PROCESSING instead of 404 so client polling continues smoothly
        return res.status(200).json({ 
          status: "PROCESSING", 
          message: "Job dispatched, awaiting worker execution..." 
        });
      }

      const log = rows[0];
      const targetFile = log.output_filename || filename;
      let publicUrl = log.download_url;

      if (!publicUrl && supabaseUrl && targetFile) {
        publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${targetFile}`;
      }

      if (log.status === 'PENDING' || log.status === 'PROCESSING') {
        return res.status(200).json({
          status: "PROCESSING",
          message: "Validation in progress on GitHub Actions Runner..."
        });
      }

      if (log.status === 'COMPLETED' || log.status === 'SUCCESS') {
        return res.status(200).json({
          status: "COMPLETED",
          filename: targetFile,
          publicUrl,
          downloadUrl: publicUrl,
          message: "Validation completed successfully."
        });
      }

      // FAILED
      return res.status(200).json({
        status: "FAILED",
        filename: targetFile,
        publicUrl,
        downloadUrl: publicUrl,
        error_details: log.error_details,
        message: "Validation failed."
      });

    } finally {
      connection.release();
    }
  } catch (err: any) {
    console.error("Error in /api/fvu/status handler:", err);
    return res.status(200).json({ status: "PROCESSING", message: "Checking status..." });
  }
}
