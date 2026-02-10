import { db } from "@/lib/db";
import { nodeDocs, workflowTemplates } from "@/lib/db/schema";
import { cosineDistance, desc, eq, gt, sql } from "drizzle-orm";
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

// ─── Workflow Template Retrieval ──────────────────────────────────────────────

export interface RelevantTemplate {
  templateId: number;
  name: string;
  description: string | null;
  category: string | null;
  nodeTypes: string[] | null;
  workflowJson: {
    nodes: unknown[];
    connections: Record<string, unknown>;
  } | null;
  similarity: number;
}

/**
 * Find workflow templates that are semantically relevant to the query.
 * Uses cosine similarity search against pgvector embeddings.
 *
 * @param query - Natural language query (e.g., "AI agent with tools")
 * @param limit - Maximum number of templates to return (default 3)
 * @param minSimilarity - Minimum cosine similarity threshold (default 0.3)
 */
export async function findRelevantTemplates(
  query: string,
  limit = 3,
  minSimilarity = 0.3
): Promise<RelevantTemplate[]> {
  const queryEmbedding = await generateEmbedding(query);

  const similarity = sql<number>`1 - (${cosineDistance(
    workflowTemplates.embedding,
    queryEmbedding
  )})`;

  const results = await db
    .select({
      templateId: workflowTemplates.templateId,
      name: workflowTemplates.name,
      description: workflowTemplates.description,
      category: workflowTemplates.category,
      nodeTypes: workflowTemplates.nodeTypes,
      workflowJson: workflowTemplates.workflowJson,
      similarity,
    })
    .from(workflowTemplates)
    .where(gt(similarity, minSimilarity))
    .orderBy(desc(similarity))
    .limit(limit);

  return results;
}

/**
 * Get a specific workflow template by its n8n template ID.
 * Useful when the LLM knows exactly which template it wants.
 */
export async function getTemplateById(
  templateId: number
): Promise<RelevantTemplate | null> {
  const results = await db
    .select({
      templateId: workflowTemplates.templateId,
      name: workflowTemplates.name,
      description: workflowTemplates.description,
      category: workflowTemplates.category,
      nodeTypes: workflowTemplates.nodeTypes,
      workflowJson: workflowTemplates.workflowJson,
      similarity: sql<number>`1.0`,
    })
    .from(workflowTemplates)
    .where(eq(workflowTemplates.templateId, templateId))
    .limit(1);

  return results[0] ?? null;
}
