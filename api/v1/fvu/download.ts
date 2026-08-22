export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { filename } = req.query;

  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: "Filename is required" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const bucketName = process.env.SUPABASE_BUCKET_NAME || 'fvu-logs';

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Storage not configured" });
  }

  try {
    // Fetch the file from Supabase Storage
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucketName}/${filename}`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`File fetch failed for ${filename}:`, response.status, errorText);
      return res.status(404).json({ error: "File not found" });
    }

    // Set headers to force download as an attachment
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/octet-stream");

    // Stream the file back
    const arrayBuffer = await response.arrayBuffer();
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error("Download error:", error);
    return res.status(500).json({ error: "Failed to download file" });
  }
}
