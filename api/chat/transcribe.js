import Busboy from 'busboy';
import { toFile } from 'openai';
import { applyCors } from '../../src/utils/cors.js';
import { openaiClient } from '../../src/clients/index.js';

export const config = { api: { bodyParser: false } };

const MAX_SIZE = 25 * 1024 * 1024; // Whisper limit

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { audioBuffer, mimeType } = await parseAudio(req);

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: 'No audio data received' });
    }
    if (audioBuffer.length > MAX_SIZE) {
      return res.status(400).json({ error: 'Audio file too large (max 25MB)' });
    }

    // Map browser MIME types to file extensions Whisper recognises
    const extMap = {
      'audio/webm': 'webm', 'audio/webm;codecs=opus': 'webm',
      'audio/mp4': 'mp4', 'audio/m4a': 'm4a',
      'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
    };
    const baseMime = mimeType?.split(';')[0].trim() || 'audio/webm';
    const ext = extMap[baseMime] || extMap[mimeType] || 'webm';

    const audioFile = await toFile(audioBuffer, `audio.${ext}`, { type: baseMime });

    const transcription = await openaiClient.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioFile,
      language: 'en',
    });

    return res.status(200).json({ text: transcription.text });
  } catch (err) {
    console.error('transcribe error:', err);
    return res.status(500).json({ error: 'Transcription failed' });
  }
}

function parseAudio(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_SIZE + 1 } });
    const fields = {};
    let audioBuffer = null;
    let fileMime = null;

    bb.on('field', (name, val) => { fields[name] = val; });

    bb.on('file', (_name, stream, info) => {
      fileMime = info.mimeType;
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => { audioBuffer = Buffer.concat(chunks); });
      stream.on('error', reject);
    });

    bb.on('finish', () => {
      resolve({
        audioBuffer,
        mimeType: fields.mimeType || fileMime || 'audio/webm',
      });
    });

    bb.on('error', reject);
    req.pipe(bb);
  });
}
