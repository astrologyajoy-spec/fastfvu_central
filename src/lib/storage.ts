export async function uploadToSupabase(fileName: string, fileContent: string | Buffer): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const bucketName = process.env.SUPABASE_BUCKET_NAME || 'fvu-logs';

  if (!supabaseUrl || !supabaseKey) {
    console.warn("Supabase credentials not configured. Skipping upload for:", fileName);
    return null;
  }

  try {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucketName}/${fileName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': typeof fileContent === 'string' ? 'text/plain;charset=UTF-8' : 'application/octet-stream',
        'x-upsert': 'true'
      },
      body: fileContent
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Supabase upload failed for ${fileName}:`, response.status, errorText);
      return null;
    }
    
    return `${supabaseUrl}/storage/v1/object/public/${bucketName}/${fileName}`;
  } catch (error) {
    console.error(`Error uploading ${fileName} to Supabase:`, error);
    return null;
  }
}
