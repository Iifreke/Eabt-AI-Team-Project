import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import { getSchool } from '../../src/utils/validate.js';
import supabase from '../../src/db/supabase.js';
import { processDocument } from '../../src/services/rag.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { schoolId, storagePath, fileType, fileName, fileSize } = req.body;

    const school = await getSchool(schoolId, res);
    if (!school) return;

    const { data: doc, error } = await supabase
      .from('documents')
      .insert({
        school_id: school.id,
        name: fileName,
        file_type: fileType,
        file_size: fileSize,
        storage_path: storagePath,
        status: 'processing',
      })
      .select()
      .single();

    if (error) throw error;

    // Await processing synchronously — fire-and-forget is killed by Vercel after res.end()
    await processDocument(doc.id, school.id, storagePath, fileType);

    // Re-fetch to get final status (ready or error)
    const { data: updated } = await supabase
      .from('documents')
      .select('status, chunk_count, error_message')
      .eq('id', doc.id)
      .single();

    return res.status(200).json({
      documentId: doc.id,
      status: updated?.status || 'ready',
      chunkCount: updated?.chunk_count || 0,
    });
  } catch (error) {
    console.error('process error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
