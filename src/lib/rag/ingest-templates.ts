import { neon } from "@neondatabase/serverless";
import { getDbUnpooled } from "@/lib/db";
import { workflowTemplates, syncLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateEmbeddings } from "./embedding";

// ─── Constants ────────────────────────────────────────────────────────────────

const N8N_TEMPLATES_API = "https://api.n8n.io/api";

/** Max semantic content length per template (for embedding). */
const MAX_CONTENT_LENGTH = 3000;

/** How many templates to fetch per search page. */
const ROWS_PER_PAGE = 50;

/** How many individual template detail requests to run concurrently. */
const CONCURRENCY = 5;

/** Delay in ms between concurrent batches (rate-limit politeness). */
const BATCH_DELAY_MS = 300;

/** Max retries on HTTP 429 with exponential backoff. */
const MAX_RETRIES = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateSearchResult {
  id: number;
  name: string;
  description?: string;
  totalViews?: number;
  nodes?: Array<{ id: number; name: string; type?: string }>;
  category?: { name: string };
  categories?: Array<{ name: string }>;
  user?: { username: string };
}

interface TemplateSearchResponse {
  workflows: TemplateSearchResult[];
  totalWorkflows?: number;
}

/**
 * The /templates/workflows/<id> endpoint returns:
 * { workflow: { id, name, description, totalViews, categories, workflow: { nodes, connections }, ... } }
 * Note: the actual n8n workflow JSON (with typed nodes + connections) is doubly nested
 * under response.workflow.workflow.
 */
interface TemplateDetailApiResponse {
  workflow: {
    id: number;
    name: string;
    description?: string;
    totalViews?: number;
    categories?: Array<{ id: number; name: string }>;
    user?: { username: string };
    workflow?: {
      nodes?: Array<{
        id?: string;
        name: string;
        type: string;
        typeVersion?: number;
        parameters?: Record<string, unknown>;
        position?: [number, number];
        credentials?: Record<string, unknown>;
      }>;
      connections?: Record<string, unknown>;
    };
  };
}

/** Flattened template detail after extracting from the nested API response. */
interface TemplateDetail {
  id: number;
  name: string;
  description?: string;
  totalViews?: number;
  categories?: Array<{ name: string }>;
  workflowNodes: Array<{
    id?: string;
    name: string;
    type: string;
    typeVersion?: number;
    parameters?: Record<string, unknown>;
    position?: [number, number];
    credentials?: Record<string, unknown>;
  }>;
  workflowConnections: Record<string, unknown>;
}

interface TemplateRecord {
  templateId: number;
  name: string;
  description: string | null;
  category: string | null;
  totalViews: number;
  nodeTypes: string[];
  workflowJson: { nodes: unknown[]; connections: Record<string, unknown> } | null;
  content: string;
}

export interface TemplateSyncResult {
  success: boolean;
  templatesProcessed: number;
  errors: string[];
  duration: number;
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

function getRawSql() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

/**
 * Fetch with retry on 429 (rate limit) using exponential backoff.
 */
async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "n8n-workflow-builder-rag",
        Accept: "application/json",
      },
    });

    if (res.status === 429 && attempt < retries) {
      const backoff = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      console.warn(
        `[ingest-templates] 429 rate limited, retrying in ${backoff}ms (attempt ${attempt + 1}/${retries})`
      );
      await sleep(backoff);
      continue;
    }

    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status} fetching ${url}: ${await res.text().catch(() => "")}`
      );
    }

    return res;
  }

  throw new Error(`Exhausted retries for ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Template Fetching ────────────────────────────────────────────────────────

/**
 * Fetch paginated template summaries from the search endpoint.
 * Returns deduplicated template IDs with basic metadata.
 */
async function fetchTemplateList(): Promise<TemplateSearchResult[]> {
  const allTemplates: TemplateSearchResult[] = [];
  const seenIds = new Set<number>();

  // Phase 1: AI category first (most important for reducing hallucinations)
  const aiPages = 4;
  for (let page = 1; page <= aiPages; page++) {
    try {
      const url = `${N8N_TEMPLATES_API}/templates/search?page=${page}&rows=${ROWS_PER_PAGE}&category=ai`;
      const res = await fetchWithRetry(url);
      const data: TemplateSearchResponse = await res.json();

      if (!data.workflows || data.workflows.length === 0) break;

      for (const t of data.workflows) {
        if (!seenIds.has(t.id)) {
          seenIds.add(t.id);
          allTemplates.push(t);
        }
      }

      console.log(
        `[ingest-templates] AI page ${page}: ${data.workflows.length} templates`
      );
    } catch (err) {
      console.warn(
        `[ingest-templates] Failed AI page ${page}:`,
        err instanceof Error ? err.message : err
      );
      break;
    }
  }

  // Phase 2: General/top templates across other categories
  const generalPages = 2;
  for (let page = 1; page <= generalPages; page++) {
    try {
      const url = `${N8N_TEMPLATES_API}/templates/search?page=${page}&rows=${ROWS_PER_PAGE}`;
      const res = await fetchWithRetry(url);
      const data: TemplateSearchResponse = await res.json();

      if (!data.workflows || data.workflows.length === 0) break;

      for (const t of data.workflows) {
        if (!seenIds.has(t.id)) {
          seenIds.add(t.id);
          allTemplates.push(t);
        }
      }

      console.log(
        `[ingest-templates] General page ${page}: ${data.workflows.length} templates`
      );
    } catch (err) {
      console.warn(
        `[ingest-templates] Failed general page ${page}:`,
        err instanceof Error ? err.message : err
      );
      break;
    }
  }

  console.log(
    `[ingest-templates] Total unique templates collected: ${allTemplates.length}`
  );
  return allTemplates;
}

/**
 * Fetch the full workflow JSON for a single template.
 * Extracts from the doubly-nested API response shape.
 */
async function fetchTemplateDetail(
  templateId: number
): Promise<TemplateDetail | null> {
  try {
    const url = `${N8N_TEMPLATES_API}/templates/workflows/${templateId}`;
    const res = await fetchWithRetry(url);
    const data: TemplateDetailApiResponse = await res.json();

    const outer = data?.workflow;
    if (!outer) return null;

    const innerWf = outer.workflow;
    if (!innerWf?.nodes || innerWf.nodes.length === 0) return null;

    return {
      id: outer.id ?? templateId,
      name: outer.name ?? `Template ${templateId}`,
      description: outer.description,
      totalViews: outer.totalViews,
      categories: outer.categories,
      workflowNodes: innerWf.nodes,
      workflowConnections: innerWf.connections ?? {},
    };
  } catch (err) {
    console.warn(
      `[ingest-templates] Failed to fetch template ${templateId}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Fetch full details for a batch of templates with concurrency control.
 */
async function fetchAllTemplateDetails(
  summaries: TemplateSearchResult[],
  errors: string[]
): Promise<TemplateDetail[]> {
  const details: TemplateDetail[] = [];

  for (let i = 0; i < summaries.length; i += CONCURRENCY) {
    const batch = summaries.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map((s) => fetchTemplateDetail(s.id))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled" && result.value) {
        details.push(result.value);
      } else if (result.status === "rejected") {
        const errMsg =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        errors.push(
          `Template ${batch[j].id} fetch failed: ${errMsg.slice(0, 150)}`
        );
      }
    }

    // Rate-limit delay between batches
    if (i + CONCURRENCY < summaries.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return details;
}

// ─── Content Building ─────────────────────────────────────────────────────────

/**
 * Build a TemplateRecord from API data.
 * The `content` field is human-readable semantic text for embedding.
 * The `workflowJson` stores the raw importable workflow.
 */
function buildTemplateRecord(
  detail: TemplateDetail,
  summary?: TemplateSearchResult
): TemplateRecord | null {
  if (!detail.workflowNodes || detail.workflowNodes.length === 0) {
    return null;
  }

  const name = detail.name || `Template ${detail.id}`;
  const description = detail.description || summary?.description || null;

  // Extract category from the detail or summary
  const category =
    detail.categories?.[0]?.name ||
    summary?.category?.name ||
    summary?.categories?.[0]?.name ||
    null;

  const totalViews = detail.totalViews || summary?.totalViews || 0;

  // Extract node types and display names (skip sticky notes)
  const nodeTypes = detail.workflowNodes
    .map((n) => n.type)
    .filter((t): t is string => Boolean(t) && !t.includes("stickyNote"));
  const uniqueNodeTypes = [...new Set(nodeTypes)];

  const nodeDisplayNames = detail.workflowNodes
    .filter((n) => !n.type?.includes("stickyNote"))
    .map((n) => n.name)
    .filter(Boolean);

  // Build connection flow description
  const flowDescription = buildFlowDescription({
    nodes: detail.workflowNodes,
    connections: detail.workflowConnections,
  });

  // Build semantic content for embedding
  const contentParts = [
    `Template: ${name}`,
    category ? `Category: ${category}` : null,
    description ? `Description: ${description}` : null,
    `Nodes used: ${nodeDisplayNames.join(", ")}`,
    `Node types: ${uniqueNodeTypes.join(", ")}`,
    flowDescription ? `Flow: ${flowDescription}` : null,
  ].filter(Boolean);

  let content = contentParts.join("\n");
  if (content.length > MAX_CONTENT_LENGTH) {
    content = content.slice(0, MAX_CONTENT_LENGTH) + "\n…[truncated]";
  }

  // Build the workflow JSON (nodes + connections)
  const workflowJson = {
    nodes: detail.workflowNodes as unknown[],
    connections: detail.workflowConnections as Record<string, unknown>,
  };

  return {
    templateId: detail.id,
    name,
    description,
    category,
    totalViews,
    nodeTypes: uniqueNodeTypes,
    workflowJson,
    content,
  };
}

/**
 * Build a human-readable flow description from the workflow connections.
 * E.g. "Chat Trigger -> AI Agent (sub-nodes: OpenAI Chat Model, Memory)"
 */
function buildFlowDescription(workflow: {
  nodes?: Array<{ name: string; type: string }>;
  connections?: Record<string, unknown>;
}): string | null {
  if (!workflow.connections || !workflow.nodes) return null;

  try {
    const connections = workflow.connections as Record<
      string,
      { main?: Array<Array<{ node: string }>> } & Record<string, unknown>
    >;

    // Find the trigger node (start of the flow)
    const triggerNode = workflow.nodes.find(
      (n) =>
        n.type?.toLowerCase().includes("trigger") ||
        n.type?.toLowerCase().includes("webhook")
    );

    if (!triggerNode) return null;

    // Build a simple linear flow from the trigger
    const visited = new Set<string>();
    const flowParts: string[] = [];

    function walk(nodeName: string, depth: number) {
      if (visited.has(nodeName) || depth > 10) return;
      visited.add(nodeName);
      flowParts.push(nodeName);

      const conn = connections[nodeName];
      if (!conn) return;

      // Follow "main" connections
      if (conn.main) {
        for (const outputs of conn.main) {
          if (Array.isArray(outputs)) {
            for (const target of outputs) {
              if (target.node) {
                walk(target.node, depth + 1);
              }
            }
          }
        }
      }

      // Also note AI sub-node connections
      const aiTypes = [
        "ai_languageModel",
        "ai_tool",
        "ai_memory",
        "ai_outputParser",
        "ai_vectorStore",
        "ai_embedding",
      ];
      const subNodes: string[] = [];
      for (const aiType of aiTypes) {
        const aiConn = (conn as Record<string, unknown>)[aiType];
        if (
          Array.isArray(aiConn) &&
          aiConn.length > 0 &&
          Array.isArray(aiConn[0])
        ) {
          for (const target of aiConn[0]) {
            if (
              target &&
              typeof target === "object" &&
              "node" in target &&
              typeof target.node === "string"
            ) {
              subNodes.push(target.node);
            }
          }
        }
      }

      if (subNodes.length > 0) {
        // Replace the last entry with an annotated version
        flowParts[flowParts.length - 1] = `${nodeName} (sub-nodes: ${subNodes.join(", ")})`;
      }
    }

    walk(triggerNode.name, 0);

    return flowParts.length > 1 ? flowParts.join(" -> ") : null;
  } catch {
    return null;
  }
}

// ─── Main Ingestion ───────────────────────────────────────────────────────────

/**
 * Run the template ingestion pipeline:
 * 1. Fetch template summaries from the n8n Templates API (paginated, AI-first)
 * 2. Fetch full workflow JSON for each template (concurrent with rate limiting)
 * 3. Build semantic content for embedding
 * 4. Generate embeddings
 * 5. Upsert into the workflow_templates table
 * 6. Log to sync_log
 */
export async function runTemplateIngestion(): Promise<TemplateSyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let templatesProcessed = 0;

  try {
    console.log("[ingest-templates] Starting template ingestion...");

    // Step 1: Fetch template list
    const summaries = await fetchTemplateList();

    if (summaries.length === 0) {
      errors.push("No templates returned from the n8n Templates API");
      await logTemplateSync("error", 0, errors.join("; "));
      return {
        success: false,
        templatesProcessed: 0,
        errors,
        duration: Date.now() - startTime,
      };
    }

    // Step 2: Fetch full details for each template
    console.log(
      `[ingest-templates] Fetching full details for ${summaries.length} templates...`
    );
    const details = await fetchAllTemplateDetails(summaries, errors);
    console.log(
      `[ingest-templates] Got details for ${details.length} templates`
    );

    // Step 3: Build records
    const summaryMap = new Map(summaries.map((s) => [s.id, s]));
    const records: TemplateRecord[] = [];
    for (const detail of details) {
      const record = buildTemplateRecord(detail, summaryMap.get(detail.id));
      if (record) {
        records.push(record);
      }
    }

    console.log(
      `[ingest-templates] Built ${records.length} template records`
    );

    if (records.length === 0) {
      errors.push("No valid template records could be built");
      await logTemplateSync("error", 0, errors.join("; "));
      return {
        success: false,
        templatesProcessed: 0,
        errors,
        duration: Date.now() - startTime,
      };
    }

    // Step 4: Generate embeddings
    console.log("[ingest-templates] Generating embeddings...");
    const contentTexts = records.map((r) => r.content);
    const embeddings = await generateEmbeddings(contentTexts);

    // Step 5: Upsert into database
    console.log("[ingest-templates] Upserting into database...");
    const rawSql = getRawSql();
    const ingestionDb = getDbUnpooled();

    const UPSERT_BATCH = 50;
    for (let i = 0; i < records.length; i += UPSERT_BATCH) {
      const batchRecords = records.slice(i, i + UPSERT_BATCH);
      const batchEmbeddings = embeddings.slice(i, i + UPSERT_BATCH);

      for (let j = 0; j < batchRecords.length; j++) {
        const record = batchRecords[j];
        const embedding = batchEmbeddings[j];

        try {
          // Delete existing row for this template
          await ingestionDb
            .delete(workflowTemplates)
            .where(eq(workflowTemplates.templateId, record.templateId));

          // Convert embedding array to PostgreSQL vector literal
          const embeddingLiteral = `[${embedding.join(",")}]`;

          // Insert using raw SQL to avoid Neon HTTP driver pgvector limits
          await rawSql`
            INSERT INTO workflow_templates
              (template_id, name, description, category, total_views,
               node_types, workflow_json, content, embedding, updated_at)
            VALUES
              (${record.templateId}, ${record.name}, ${record.description},
               ${record.category}, ${record.totalViews},
               ${JSON.stringify(record.nodeTypes)}::jsonb,
               ${JSON.stringify(record.workflowJson)}::jsonb,
               ${record.content},
               ${embeddingLiteral}::vector,
               NOW())
          `;

          templatesProcessed++;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Unknown";
          const shortErr =
            errMsg.length > 200 ? errMsg.slice(0, 200) + "…" : errMsg;
          errors.push(
            `Upsert failed for template ${record.templateId}: ${shortErr}`
          );
          console.error(
            `[ingest-templates] Failed template ${record.templateId}:`,
            shortErr
          );
        }
      }
    }

    console.log(
      `[ingest-templates] Done. ${templatesProcessed} templates upserted, ${errors.length} errors.`
    );

    await logTemplateSync(
      errors.length === 0 ? "success" : "error",
      templatesProcessed,
      errors.length > 0 ? errors.slice(0, 5).join("; ") : undefined
    );

    return {
      success: errors.length === 0,
      templatesProcessed,
      errors,
      duration: Date.now() - startTime,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    errors.push(errMsg);
    await logTemplateSync("error", templatesProcessed, errMsg).catch(() => {});
    return {
      success: false,
      templatesProcessed,
      errors,
      duration: Date.now() - startTime,
    };
  }
}

// ─── Sync Log ─────────────────────────────────────────────────────────────────

async function logTemplateSync(
  status: string,
  templatesProcessed: number,
  error?: string
) {
  try {
    const ingestionDb = getDbUnpooled();
    const truncatedError = error
      ? error.length > 500
        ? error.slice(0, 500) + "…[truncated]"
        : error
      : null;
    await ingestionDb.insert(syncLog).values({
      source: "n8n-templates",
      status,
      nodesProcessed: templatesProcessed,
      error: truncatedError,
    });
  } catch (err) {
    console.error("[ingest-templates] Failed to log sync:", err);
  }
}
