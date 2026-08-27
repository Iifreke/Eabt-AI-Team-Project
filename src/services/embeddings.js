import { openaiClient } from '../clients/index.js';
import { embeddingCache } from '../utils/cache.js';

export async function generateEmbedding(text) {
  const cleanText = (text || '').trim().slice(0, 8000);
  if (!cleanText) return [];

  // Check in-memory LRU cache first (sub-millisecond hit)
  const cached = embeddingCache.get(cleanText);
  if (cached) {
    return cached;
  }

  const response = await openaiClient.embeddings.create({
    model: 'text-embedding-3-small',
    input: cleanText,
  });

  const embedding = response.data[0].embedding;
  embeddingCache.set(cleanText, embedding);
  return embedding;
}

export async function generateEmbeddings(textsArray) {
  if (!Array.isArray(textsArray) || textsArray.length === 0) return [];

  const results = new Array(textsArray.length);
  const missingIndices = [];
  const missingTexts = [];

  for (let i = 0; i < textsArray.length; i++) {
    const cleanText = (textsArray[i] || '').trim().slice(0, 8000);
    const cached = embeddingCache.get(cleanText);
    if (cached) {
      results[i] = cached;
    } else {
      missingIndices.push(i);
      missingTexts.push(cleanText);
    }
  }

  if (missingTexts.length > 0) {
    const response = await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: missingTexts,
    });

    response.data.forEach((d, idx) => {
      const originalIdx = missingIndices[idx];
      const emb = d.embedding;
      results[originalIdx] = emb;
      embeddingCache.set(missingTexts[idx], emb);
    });
  }

  return results;
}
