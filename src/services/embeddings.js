import { openaiClient } from '../clients/index.js';

export async function generateEmbedding(text) {
  const response = await openaiClient.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}

export async function generateEmbeddings(textsArray) {
  const response = await openaiClient.embeddings.create({
    model: 'text-embedding-3-small',
    input: textsArray.map(t => t.slice(0, 8000)),
  });
  return response.data.map(d => d.embedding);
}
