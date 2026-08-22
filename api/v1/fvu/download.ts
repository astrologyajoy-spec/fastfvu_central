import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Use WHATWG URL API to parse safely
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const filename = url.searchParams.get('filename') || req.query?.filename;

  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: "Filename is required" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const bucketName = process.env.SUPABASE_BUCKET_NAME || 'fvu-logs';

  try {
    if (supabaseUrl) {
      // Fetch the file directly from Supabase Public Storage
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${filename}`;
      const response = await fetch(publicUrl);

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const fileBuffer = Buffer.from(arrayBuffer);
        
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Type", "application/octet-stream");
        return res.status(200).send(fileBuffer);
      } else if (supabaseKey) {
        // Fallback to authenticated fetch in case bucket is private
        const authResponse = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/${bucketName}/${filename}`, {
          headers: { 'Authorization': `Bearer ${supabaseKey}` }
        });
        if (authResponse.ok) {
          const arrayBuffer = await authResponse.arrayBuffer();
          const fileBuffer = Buffer.from(arrayBuffer);
          res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
          res.setHeader("Content-Type", "application/octet-stream");
          return res.status(200).send(fileBuffer);
        }
      }
    }

    // Fallback: Check local temporary directories (for local dev / serverless session execution)
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

    return res.status(404).json({ error: "File not found in storage or temp cache." });
  } catch (error: any) {
    console.error("Download error:", error?.message || error);
    return res.status(500).json({ error: "Failed to download file" });
  }
}
