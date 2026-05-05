import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const widgetPath = path.join(__dirname, '..', 'widget', 'dist', 'widget.js');

  try {
    const content = fs.readFileSync(widgetPath, 'utf-8');
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(content);
  } catch {
    res.status(404).json({ error: 'Widget not found — run npm run build:widget first' });
  }
}
