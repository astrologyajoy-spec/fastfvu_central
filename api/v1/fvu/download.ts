import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { pool } from '../../../api/_lib/db.js';

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const filename = url.searchParams.get('filename') || req.query?.filename;
  const wantsJson = url.searchParams.get('json') === 'true' || req.headers.accept?.includes('application/json');

  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: "Filename is required" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  const bucketName = process.env.SUPABASE_BUCKET_NAME || 'fvu-reports';

  try {
    // 1. Check DB job status first if database pool is available
    if (pool) {
      try {
        const connection = await pool.getConnection();
        try {
          const [rows]: any = await connection.query(
            `SELECT id, filename, output_filename, status, download_url 
             FROM fvu_logs 
             WHERE filename = ? OR output_filename = ? 
             ORDER BY id DESC LIMIT 1`,
            [filename, filename]
          );

          if (rows && rows.length > 0) {
            const log = rows[0];
            if (log.status === 'PENDING' || log.status === 'PROCESSING') {
              // Respond with status: "PROCESSING" so client continues polling without throwing a 404 error
              return res.status(200).json({ 
                status: "PROCESSING", 
                message: "Validation job still running on GitHub Actions runner..." 
              });
            }

            const publicUrl = log.download_url || (supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/${bucketName}/${log.output_filename || filename}` : null);
            if (publicUrl) {
              if (wantsJson) {
                return res.status(200).json({
                  status: log.status === 'FAILED' ? 'FAILED' : 'COMPLETED',
                  filename: log.output_filename || filename,
                  publicUrl,
                  downloadUrl: publicUrl
                });
              }
              // Redirect directly to Supabase Storage public URL
              return res.redirect(302, publicUrl);
            }
          }
        } finally {
          connection.release();
        }
      } catch (dbErr) {
        console.warn("DB check in download route skipped:", dbErr);
      }
    }

    // 2. Direct Supabase Storage Check
    if (supabaseUrl) {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${filename}`;
      const response = await fetch(publicUrl, { method: 'HEAD' });

      if (response.ok) {
        if (wantsJson) {
          return res.status(200).json({
            status: "COMPLETED",
            filename,
            publicUrl,
            downloadUrl: publicUrl
          });
        }
        return res.redirect(302, publicUrl);
      }
    }

    // 3. Fallback: Check local temporary directories (for local dev / serverless session execution)
    const parts = filename.split('_');
    const sessionId = parts.length >= 2 ? parts[1].split('.')[0] : 'default';
    const candidatePaths = [
      path.resolve(os.tmpdir(), 'fastfvu', sessionId, filename),
      path.resolve(os.tmpdir(), filename),
      path.resolve(process.cwd(), 'temp', sessionId, filename),
      path.resolve(process.cwd(), filename)
    ];

    for (const cPath of candidatePaths) {
      try {
        const fileBuffer = await fs.readFile(cPath);
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Type", "application/octet-stream");
        return res.status(200).send(fileBuffer);
      } catch (e) {}
    }

    // If file is not ready yet, return status PROCESSING to keep client polling
    return res.status(200).json({ 
      status: "PROCESSING", 
      message: "File processing or awaiting storage upload." 
    });

  } catch (error: any) {
    console.error("Download error:", error?.message || error);
    return res.status(200).json({ status: "PROCESSING", error: "Checking file status..." });
  }
}
