import Busboy from 'busboy';
import { toFile } from 'openai';
import { applyCors } from '../../src/utils/cors.js';
import supabase from '../../src/db/supabase.js';
import { openaiClient } from '../../src/clients/index.js';
import { v4 as uuidv4 } from 'uuid';

export const config = { api: { bodyParser: false } };

// ── Upload constants ───────────────────────────────────────────
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/webm',
]);
const MAX_UPLOAD = 10 * 1024 * 1024;  // 10MB
const MAX_AUDIO  = 25 * 1024 * 1024;  // 25MB (Whisper limit)

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
    const { fields, fileBuffer, fileMime, fileOrigName } = await parseMultipart(req, MAX_AUDIO + 1);
    const action = fields.action;

    // ── action=upload ──────────────────────────────────────────
    if (action === 'upload') {
      const mimeType = fields.mimeType || fileMime || 'application/octet-stream';
      const fileName = fileOrigName || fields.fileName;
      const schoolId = fields.schoolId || 'general';

      if (!ALLOWED_TYPES.has(mimeType)) {
        return res.status(400).json({ error: 'File type not allowed' });
      }
      if (!fileBuffer || fileBuffer.length > MAX_UPLOAD) {
        return res.status(400).json({ error: 'File too large (max 10MB)' });
      }

      const ext = EXT_MAP[mimeType] || 'bin';
      const storagePath = `${schoolId}/${Date.now()}-${uuidv4().slice(0, 8)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('chat-attachments')
        .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false });

      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(storagePath);

      return res.status(200).json({
        url: publicUrl,
        type: mimeType,
        name: fileName || storagePath.split('/').pop(),
        size: fileBuffer.length,
      });
    }

    // ── action=transcribe ──────────────────────────────────────
    if (action === 'transcribe') {
      if (!fileBuffer || fileBuffer.length === 0) {
        return res.status(400).json({ error: 'No audio data received' });
      }
      if (fileBuffer.length > MAX_AUDIO) {
        return res.status(400).json({ error: 'Audio file too large (max 25MB)' });
      }

      const mimeType = fields.mimeType || fileMime || 'audio/webm';
      const extMap = {
        'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/m4a': 'm4a',
        'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
      };
      const baseMime = mimeType.split(';')[0].trim();
      const ext = extMap[baseMime] || 'webm';

      const audioFile = await toFile(fileBuffer, `audio.${ext}`, { type: baseMime });
      const transcription = await openaiClient.audio.transcriptions.create({
        model: 'whisper-1',
        file: audioFile,
        language: 'en',
      });

      return res.status(200).json({ text: transcription.text });
    }

    return res.status(400).json({ error: 'Missing or invalid action (upload|transcribe)' });
  } catch (err) {
    console.error('media error:', err);
    return res.status(500).json({ error: 'Request failed' });
  }
}

function parseMultipart(req, maxFileSize) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: maxFileSize } });
    const fields = {};
    let fileBuffer = null;
    let fileMime = null;
    let fileOrigName = null;

    bb.on('field', (name, val) => { fields[name] = val; });

    bb.on('file', (_name, stream, info) => {
      fileMime = info.mimeType;
      fileOrigName = info.filename;
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => { fileBuffer = Buffer.concat(chunks); });
      stream.on('error', reject);
    });

    bb.on('finish', () => resolve({ fields, fileBuffer, fileMime, fileOrigName }));
    bb.on('error', reject);
    req.pipe(bb);
  });
}
