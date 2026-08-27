import supabase from '../db/supabase.js';
import { generateEmbedding } from './embeddings.js';
import { ragQueryCache } from '../utils/cache.js';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';

export async function downloadFromStorage(storagePath) {
  const { data, error } = await supabase.storage
    .from('documents')
    .download(storagePath);

  if (error) throw new Error('Storage download failed: ' + error.message);

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function extractText(fileBuffer, fileType) {
  if (fileType === 'application/pdf') {
    const data = await pdfParse(fileBuffer);
    return data.text;
  }

  if (
    fileType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  }

  if (fileType === 'text/plain') {
    return fileBuffer.toString('utf-8');
  }

  throw new Error('Unsupported file type: ' + fileType);
}

export function chunkText(text) {
  // Normalize whitespace and remove excessive blank lines
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  const TARGET_WORDS = 450;
  const OVERLAP_WORDS = 50;

  // Split into sentences
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = [];
  let wordCount = 0;

  for (const sentence of sentences) {
    const words = sentence.split(' ');
    wordCount += words.length;
    current.push(sentence);

    if (wordCount >= TARGET_WORDS) {
      chunks.push(current.join(' '));

      // Keep last OVERLAP_WORDS worth of sentences for overlap
      const overlapSentences = [];
      let overlapCount = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const w = current[i].split(' ').length;
        if (overlapCount + w > OVERLAP_WORDS) break;
        overlapSentences.unshift(current[i]);
        overlapCount += w;
      }

      current = overlapSentences;
      wordCount = overlapCount;
    }
  }

  if (current.length > 0) {
    chunks.push(current.join(' '));
  }

  return chunks.filter(c => c.split(' ').length >= 30);
}

export async function processDocument(documentId, schoolId, storagePath, fileType) {
  try {
    const fileBuffer = await downloadFromStorage(storagePath);
    const text = await extractText(fileBuffer, fileType);
    const chunks = chunkText(text);

    const embeddings = await Promise.all(
      chunks.map(chunk => generateEmbedding(chunk))
    );

    const rows = chunks.map((content, index) => ({
      document_id: documentId,
      school_id: schoolId,
      content,
      embedding: embeddings[index],
      chunk_index: index,
      metadata: { chunk_index: index, total_chunks: chunks.length },
    }));

    const { error: insertError } = await supabase
      .from('document_chunks')
      .insert(rows);

    if (insertError) throw new Error('Chunk insert failed: ' + insertError.message);

    await supabase
      .from('documents')
      .update({ status: 'ready', chunk_count: chunks.length })
      .eq('id', documentId);
  } catch (error) {
    console.error('processDocument error:', error);
    await supabase
      .from('documents')
      .update({ status: 'error', error_message: error.message })
      .eq('id', documentId);
  }
}

export async function searchKnowledgeBase(query, schoolId, topK = 5) {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery || !schoolId) return [];

  const cacheKey = `${schoolId}:${cleanQuery.toLowerCase()}`;
  const cachedChunks = ragQueryCache.get(cacheKey);
  if (cachedChunks) {
    return cachedChunks;
  }

  try {
    const embedding = await generateEmbedding(cleanQuery);
    if (!embedding || embedding.length === 0) return [];

    const { data, error } = await supabase.rpc('match_chunks', {
      query_embedding: embedding,
      match_school_id: schoolId,
      match_count: topK,
    });

    if (error || !data) return [];

    const mapped = data.map(row => ({
      content: row.content,
      similarity: row.similarity,
      metadata: row.metadata,
    }));

    if (mapped.length > 0) {
      ragQueryCache.set(cacheKey, mapped);
    }

    return mapped;
  } catch (err) {
    console.warn('[RAG] searchKnowledgeBase fallback:', err.message);
    return [];
  }
}
