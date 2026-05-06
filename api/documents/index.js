import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import { getSchool } from '../../src/utils/validate.js';
import supabase from '../../src/db/supabase.js';
import { processDocument } from '../../src/services/rag.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  // GET /api/documents?schoolId=xxx  → list documents
  if (req.method === 'GET') {
    try {
      const { schoolId } = req.query;
      const school = await getSchool(schoolId, res);
      if (!school) return;

      const { data: documents, error } = await supabase
        .from('documents')
        .select('id, name, file_type, file_size, chunk_count, status, error_message, created_at')
        .eq('school_id', school.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ documents });
    } catch (error) {
      console.error('list error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/documents  → process/upload a document
  if (req.method === 'POST') {
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

      await processDocument(doc.id, school.id, storagePath, fileType);

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

  // DELETE /api/documents  → delete a document
  if (req.method === 'DELETE') {
    try {
      const { documentId } = req.body;
      if (!documentId) return res.status(400).json({ error: 'Missing documentId' });

      const { data: doc, error: fetchError } = await supabase
        .from('documents')
        .select('storage_path')
        .eq('id', documentId)
        .single();

      if (fetchError || !doc) return res.status(404).json({ error: 'Document not found' });

      if (doc.storage_path) {
        await supabase.storage.from('documents').remove([doc.storage_path]);
      }

      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (deleteError) throw deleteError;
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('delete error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).end();
}
