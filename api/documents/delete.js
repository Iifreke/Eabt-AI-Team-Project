import { applyCors } from '../../src/utils/cors.js';
import { requireAuth } from '../../src/utils/auth.js';
import supabase from '../../src/db/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'DELETE') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { documentId } = req.body;

    if (!documentId) return res.status(400).json({ error: 'Missing documentId' });

    // Fetch document to get storage path
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('storage_path')
      .eq('id', documentId)
      .single();

    if (fetchError || !doc) return res.status(404).json({ error: 'Document not found' });

    // Delete from storage
    if (doc.storage_path) {
      await supabase.storage.from('documents').remove([doc.storage_path]);
    }

    // Delete from DB (chunks cascade automatically)
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
