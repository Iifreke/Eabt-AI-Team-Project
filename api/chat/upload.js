import Busboy from 'busboy';
import { applyCors } from '../../src/utils/cors.js';
import supabase from '../../src/db/supabase.js';
import { v4 as uuidv4 } from 'uuid';

export const config = { api: { bodyParser: false } };

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/webm',
]);
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const EXT_MAP = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
  'audio/mp4': 'mp4', 'audio/m4a': 'm4a', 'audio/webm': 'webm',
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { file, schoolId, mimeType, fileName } = await parseMultipart(req);

    if (!ALLOWED_TYPES.has(mimeType)) {
      return res.status(400).json({ error: 'File type not allowed' });
    }
    if (file.length > MAX_SIZE) {
      return res.status(400).json({ error: 'File too large (max 10MB)' } );
    }

    const ext = EXT_MAP[mimeType] || 'bin';
    const school = schoolId || 'general';
    const storagePath = `${school}/${Date.now()}-${uuidv4().slice(0, 8)}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('chat-attachments')
      .upload(storagePath, file, { contentType: mimeType, upsert: false });

    if (uploadErr) throw uploadErr;

    const { data: { publicUrl } } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(storagePath);

    return res.status(200).json({
      url: publicUrl,
      type: mimeType,
      name: fileName || storagePath.split('/').pop(),
      size: file.length,
    });
  } catch (err) {
    console.error('upload error:', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_SIZE + 1 } });
    const fields = {};
    let fileBuffer = null;
    let fileMime = null;
    let fileOrigName = null;

    bb.on('field', (name, val) => { fields[name] = val; });

    bb.on('file', (name, stream, info) => {
      const chunks = [];
      fileMime = info.mimeType;
      fileOrigName = info.filename;
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => { fileBuffer = Buffer.concat(chunks); });
      stream.on('error', reject);
    });

    bb.on('finish', () => {
      resolve({
        file: fileBuffer || Buffer.alloc(0),
        schoolId: fields.schoolId,
        mimeType: fields.mimeType || fileMime || 'application/octet-stream',
        fileName: fileOrigName || fields.fileName,
      });
    });

    bb.on('error', reject);
    req.pipe(bb);
  });
}
