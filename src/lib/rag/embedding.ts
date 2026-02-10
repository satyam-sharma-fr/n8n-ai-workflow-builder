import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

// Use a dedicated OpenAI client for embeddings (uses OPENAI_API_KEY env var)
function getEmbeddingModel() {
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  return openai.embedding("text-embedding-3-small");
}

/**
 * Generate a single embedding vector for a text string.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: getEmbeddingModel(),
    value: text,
  });
  return embedding;
}

/**
 * Generate embeddings for multiple texts in a single batch call.
 * More efficient than calling generateEmbedding() in a loop.
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  // OpenAI allows max 2048 inputs per batch; chunk if needed
  const BATCH_SIZE = 512;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: getEmbeddingModel(),
      values: batch,
    });
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}
