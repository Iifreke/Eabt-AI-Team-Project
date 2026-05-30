import { applyCors } from '../../src/utils/cors.js';
import supabase from '../../src/db/supabase.js';
import { openaiClient } from '../../src/clients/index.js';
import { v4 as uuidv4 } from 'uuid';

const EXT_MAP = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
  'audio/mp4': 'mp4', 'audio/m4a': 'm4a', 'audio/webm': 'webm',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv', 'video/quicktime': 'mov',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

const ALLOWED_TYPES = new Set(Object.keys(EXT_MAP));

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body || {};
    const { action } = body;

    // ── action=presign ─────────────────────────────────────────────────────────
    // Returns a signed upload URL so the browser uploads directly to Supabase
    // storage — no file bytes ever pass through this Vercel function.
    if (action === 'presign') {
      const { mimeType, fileName, schoolId = 'general' } = body;

      if (!mimeType || !ALLOWED_TYPES.has(mimeType)) {
        return res.status(400).json({ error: 'File type not allowed' });
      }

      const ext  = EXT_MAP[mimeType] || 'bin';
      const path = `${schoolId}/${Date.now()}-${uuidv4().slice(0, 8)}.${ext}`;

      const { data, error } = await supabase.storage
        .from('chat-attachments')
        .createSignedUploadUrl(path);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(path);

      return res.status(200).json({
        signedUrl: data.signedUrl,
        token:     data.token,
        publicUrl,
        type: mimeType,
        name: fileName || path.split('/').pop(),
      });
    }

    // ── action=transcribe ──────────────────────────────────────────────────────
    // Accepts base64-encoded audio as JSON — no multipart/busboy needed.
    if (action === 'transcribe') {
      const { data: b64, mimeType = 'audio/webm' } = body;
      if (!b64) return res.status(400).json({ error: 'No audio data' });

      const audioBuffer = Buffer.from(b64, 'base64');
      if (audioBuffer.length === 0) return res.status(400).json({ error: 'Empty audio' });

      const baseMime = mimeType.split(';')[0].trim();
      const extMap   = {
        'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/m4a': 'm4a',
        'audio/mpeg': 'mp3',  'audio/wav': 'wav',  'audio/ogg': 'ogg',
      };
      const ext       = extMap[baseMime] || 'webm';
      const audioFile = new File([audioBuffer], `audio.${ext}`, { type: baseMime });

      const transcription = await openaiClient.audio.transcriptions.create({
        model: 'whisper-1',
        file: audioFile,
        language: 'en',
      });

      return res.status(200).json({ text: transcription.text });
    }

    return res.status(400).json({ error: 'Invalid action. Use presign or transcribe.' });
  } catch (err) {
    console.error('media error:', err);
    return res.status(500).json({ error: 'Request failed' });
  }
}
