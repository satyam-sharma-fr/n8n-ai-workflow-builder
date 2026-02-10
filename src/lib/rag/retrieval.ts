import { db } from "@/lib/db";
import { nodeDocs } from "@/lib/db/schema";
import { cosineDistance, desc, gt, sql } from "drizzle-orm";
import { generateEmbedding } from "./embedding";

export interface RelevantNodeDoc {
  nodeType: string;
  displayName: string;
  typeVersion: number;
  chunkType: string;
  content: string;
  metadata: {
    category: string;
    subcategory?: string;
    credentialTypes?: string[];
    operations?: string[];
  } | null;
  similarity: number;
}

/**
 * Find node documentation chunks that are semantically relevant to the query.
 * Uses cosine similarity search against pgvector embeddings.
 *
 * @param query - Natural language query (e.g., "How to send a Slack message")
 * @param limit - Maximum number of chunks to return (default 8)
 * @param minSimilarity - Minimum cosine similarity threshold (default 0.3)
 */
export async function findRelevantNodeDocs(
  query: string,
  limit = 8,
  minSimilarity = 0.3
): Promise<RelevantNodeDoc[]> {
  const queryEmbedding = await generateEmbedding(query);

  const similarity = sql<number>`1 - (${cosineDistance(
    nodeDocs.embedding,
    queryEmbedding
  )})`;

  const results = await db
    .select({
      nodeType: nodeDocs.nodeType,
      displayName: nodeDocs.displayName,
      typeVersion: nodeDocs.typeVersion,
      chunkType: nodeDocs.chunkType,
      content: nodeDocs.content,
      metadata: nodeDocs.metadata,
      similarity,
    })
    .from(nodeDocs)
    .where(gt(similarity, minSimilarity))
    .orderBy(desc(similarity))
    .limit(limit);

  return results;
}

/**
 * Get all documentation chunks for a specific node type.
 * Useful when the LLM already knows which node it wants and needs full details.
 */
export async function getNodeDocsByType(
  nodeType: string
): Promise<RelevantNodeDoc[]> {
  const { eq } = await import("drizzle-orm");

  const results = await db
    .select({
      nodeType: nodeDocs.nodeType,
      displayName: nodeDocs.displayName,
      typeVersion: nodeDocs.typeVersion,
      chunkType: nodeDocs.chunkType,
      content: nodeDocs.content,
      metadata: nodeDocs.metadata,
      similarity: sql<number>`1.0`, // perfect match
    })
    .from(nodeDocs)
    .where(eq(nodeDocs.nodeType, nodeType));

  return results;
}
