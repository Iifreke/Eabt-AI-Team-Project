import OpenAI from 'openai';

// OpenRouter client — ALL LLM chat completions
// Uses OpenAI SDK interface pointing to OpenRouter
export const openRouterClient = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL,
    'X-Title': 'School RAG Support Agent',
  },
});

// OpenAI client — ONLY for generating embeddings
// OpenRouter does not support embedding models
export const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
