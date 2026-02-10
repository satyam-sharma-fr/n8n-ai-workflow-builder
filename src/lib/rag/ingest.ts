import { neon } from "@neondatabase/serverless";
import { getDbUnpooled } from "@/lib/db";
import { nodeDocs, syncLog } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateEmbeddings } from "./embedding";
import { runTemplateIngestion } from "./ingest-templates";

// Max content length per chunk (in characters).
const MAX_CONTENT_LENGTH = 2000;

/**
 * Get a raw neon SQL template-tag function for direct queries.
 * This bypasses Drizzle ORM's parameter serialization, which can fail for
 * large vector embeddings via the Neon HTTP driver.
 */
function getRawSql() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface NodeDocChunk {
  nodeType: string;
  displayName: string;
  typeVersion: number;
  chunkType: "overview" | "parameters" | "credentials" | "examples";
  content: string;
  metadata: {
    category: string;
    subcategory?: string;
    credentialTypes?: string[];
    operations?: string[];
  };
}

interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree";
  url: string;
}

interface NodeSourceInfo {
  nodeType: string;
  displayName: string;
  defaultVersion: number;
  description: string;
  category: string;
  credentials: string[];
  properties: string; // stringified summary of parameters
}

// ─── GitHub Helpers ───────────────────────────────────────────────────────────

const GITHUB_API = "https://api.github.com";

async function githubFetch(url: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "n8n-rag-sync",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }
  return res;
}

/**
 * Fetch the file tree of a GitHub repository path.
 */
async function fetchGitHubTree(
  repo: string,
  path: string
): Promise<GitHubTreeItem[]> {
  // First get the default branch SHA
  const repoRes = await githubFetch(`${GITHUB_API}/repos/${repo}`);
  const repoData = await repoRes.json();
  const branch = repoData.default_branch ?? "main";

  // Get the tree for the path
  const treeRes = await githubFetch(
    `${GITHUB_API}/repos/${repo}/git/trees/${branch}?recursive=1`
  );
  const treeData = await treeRes.json();

  return (treeData.tree ?? []).filter(
    (item: GitHubTreeItem) =>
      item.path.startsWith(path) && item.type === "blob"
  );
}

/**
 * Fetch raw file content from GitHub.
 */
async function fetchRawFile(repo: string, path: string): Promise<string> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${repo}/main/${path}`,
    {
      headers: { "User-Agent": "n8n-rag-sync" },
    }
  );
  if (!res.ok) {
    // Try master branch
    const resMaster = await fetch(
      `https://raw.githubusercontent.com/${repo}/master/${path}`,
      {
        headers: { "User-Agent": "n8n-rag-sync" },
      }
    );
    if (!resMaster.ok) {
      throw new Error(`Failed to fetch ${repo}/${path}: ${resMaster.status}`);
    }
    return resMaster.text();
  }
  return res.text();
}

// ─── Source 1: n8n-docs (Markdown documentation) ─────────────────────────────

/**
 * Fetch and parse markdown documentation files from n8n-io/n8n-docs.
 * These contain human-readable parameter descriptions, usage guides, etc.
 */
async function fetchDocsFromGitHub(): Promise<
  Map<string, { content: string; path: string }>
> {
  const docs = new Map<string, { content: string; path: string }>();
  const docPaths = [
    "docs/integrations/builtin/app-nodes",
    "docs/integrations/builtin/core-nodes",
    "docs/integrations/builtin/trigger-nodes",
    "docs/integrations/builtin/cluster-nodes",
  ];

  for (const basePath of docPaths) {
    try {
      const tree = await fetchGitHubTree("n8n-io/n8n-docs", basePath);
      const mdFiles = tree.filter(
        (f) => f.path.endsWith(".md") || f.path.endsWith("index.md")
      );

      // Limit to index.md files which contain the main node docs
      const indexFiles = mdFiles.filter(
        (f) =>
          f.path.endsWith("/index.md") ||
          (f.path.endsWith(".md") && !f.path.includes("/"))
      );

      for (const file of indexFiles) {
        try {
          const content = await fetchRawFile("n8n-io/n8n-docs", file.path);
          // Extract node type from the path, e.g.:
          // docs/integrations/builtin/app-nodes/n8n-nodes-base.slack/index.md -> n8n-nodes-base.slack
          const pathParts = file.path.split("/");
          const nodeFolder = pathParts[pathParts.length - 2]; // folder name before index.md
          if (nodeFolder && nodeFolder.startsWith("n8n-nodes-base.")) {
            docs.set(nodeFolder, { content, path: file.path });
          }
        } catch {
          // Skip files that fail to fetch
          console.warn(`[ingest] Failed to fetch doc: ${file.path}`);
        }
      }
    } catch {
      console.warn(`[ingest] Failed to fetch tree for: ${basePath}`);
    }
  }

  return docs;
}

// ─── Source 2: n8n source (node type metadata) ───────────────────────────────

/**
 * Parse a node's .node.ts or .node.json file to extract version, parameters, etc.
 * We extract structured data from the TypeScript source using regex patterns.
 */
function parseNodeSource(content: string, nodeType: string): NodeSourceInfo | null {
  try {
    // Extract displayName
    const displayNameMatch = content.match(
      /displayName\s*[:=]\s*['"`]([^'"`]+)['"`]/
    );
    const displayName = displayNameMatch?.[1] ?? nodeType.split(".").pop() ?? "Unknown";

    // Extract defaultVersion or version
    const defaultVersionMatch = content.match(
      /defaultVersion\s*[:=]\s*(\d+(?:\.\d+)?)/
    );
    const versionMatch = content.match(
      /version\s*[:=]\s*(\[[\d,\s.]+\]|\d+(?:\.\d+)?)/
    );

    let defaultVersion = 1;
    if (defaultVersionMatch) {
      defaultVersion = parseFloat(defaultVersionMatch[1]);
    } else if (versionMatch) {
      const vStr = versionMatch[1];
      if (vStr.startsWith("[")) {
        // Array of versions — take the highest
        const versions = vStr
          .replace(/[\[\]]/g, "")
          .split(",")
          .map((v) => parseFloat(v.trim()))
          .filter((v) => !isNaN(v));
        defaultVersion = Math.max(...versions, 1);
      } else {
        defaultVersion = parseFloat(vStr) || 1;
      }
    }

    // Extract description
    const descMatch = content.match(
      /description\s*[:=]\s*['"`]([^'"`]+)['"`]/
    );
    const description = descMatch?.[1] ?? "";

    // Extract group/category
    const groupMatch = content.match(/group\s*[:=]\s*\[['"`]([^'"`]*)['"`]\]/);
    const category = groupMatch?.[1] ?? "action";

    // Extract credential types
    const credentialMatches = [
      ...content.matchAll(/name\s*[:=]\s*['"`]([\w]+(?:OAuth2)?Api)['"`]/g),
    ];
    const credentials = credentialMatches
      .map((m) => m[1])
      .filter((c) => c.endsWith("Api") || c.includes("OAuth"));

    // Extract property names and types for parameter summary
    const propMatches = [
      ...content.matchAll(
        /{\s*displayName\s*[:=]\s*['"`]([^'"`]+)['"`],\s*name\s*[:=]\s*['"`]([^'"`]+)['"`],\s*type\s*[:=]\s*['"`]([^'"`]+)['"`]/g
      ),
    ];
    const properties = propMatches
      .slice(0, 30) // Limit to avoid excessively long content
      .map((m) => `- ${m[1]} (${m[2]}): type=${m[3]}`)
      .join("\n");

    return {
      nodeType,
      displayName,
      defaultVersion,
      description,
      category,
      credentials,
      properties,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch node source files from the n8n GitHub repo to get type versions and parameters.
 */
async function fetchNodeSourceInfo(): Promise<Map<string, NodeSourceInfo>> {
  const nodeInfoMap = new Map<string, NodeSourceInfo>();

  try {
    const tree = await fetchGitHubTree(
      "n8n-io/n8n",
      "packages/nodes-base/nodes"
    );

    // Find .node.ts files (the main node definition files)
    const nodeFiles = tree.filter(
      (f) =>
        f.path.endsWith(".node.ts") &&
        !f.path.includes(".test.") &&
        !f.path.includes("__tests__")
    );

    // Process in batches to avoid rate limits
    const BATCH = 15;
    for (let i = 0; i < nodeFiles.length; i += BATCH) {
      const batch = nodeFiles.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const content = await fetchRawFile("n8n-io/n8n", file.path);
          // Derive node type from filename, e.g. HttpRequest.node.ts
          const fileBaseName = file.path.split("/").pop()?.replace(".node.ts", "") ?? "";

          // Try to find the exact node type name in the source
          const nameMatch = content.match(
            /name\s*[:=]\s*['"`](n8n-nodes-base\.\w+)['"`]|name\s*[:=]\s*['"`](\w+)['"`]/
          );
          const nodeTypeName = nameMatch?.[1]
            ?? `n8n-nodes-base.${fileBaseName.charAt(0).toLowerCase() + fileBaseName.slice(1)}`;

          const info = parseNodeSource(content, nodeTypeName);
          if (info) {
            nodeInfoMap.set(info.nodeType, info);
          }
        })
      );

      // Log failures
      results.forEach((r, idx) => {
        if (r.status === "rejected") {
          console.warn(
            `[ingest] Failed to process: ${batch[idx].path} - ${r.reason}`
          );
        }
      });

      // Small delay between batches to be nice to GitHub
      if (i + BATCH < nodeFiles.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  } catch (err) {
    console.error("[ingest] Failed to fetch node source tree:", err);
  }

  return nodeInfoMap;
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

/**
 * Create documentation chunks for a single node by combining docs and source info.
 */
function createNodeChunks(
  nodeType: string,
  docContent: string | null,
  sourceInfo: NodeSourceInfo | null
): NodeDocChunk[] {
  const chunks: NodeDocChunk[] = [];
  const displayName =
    sourceInfo?.displayName ?? nodeType.split(".").pop() ?? "Unknown";
  const typeVersion = sourceInfo?.defaultVersion ?? 1;
  const category = sourceInfo?.category ?? "action";

  // 1. Overview chunk
  const overviewParts = [
    `Node: ${displayName}`,
    `Type: ${nodeType}`,
    `Latest Version: ${typeVersion}`,
    `Category: ${category}`,
  ];
  if (sourceInfo?.description) {
    overviewParts.push(`Description: ${sourceInfo.description}`);
  }
  if (sourceInfo?.credentials.length) {
    overviewParts.push(
      `Required Credentials: ${sourceInfo.credentials.join(", ")}`
    );
  }
  // Add the first section of markdown docs as overview context
  if (docContent) {
    const firstSection = extractMarkdownSection(docContent, 0, 500);
    if (firstSection) {
      overviewParts.push(`\nDocumentation:\n${firstSection}`);
    }
  }

  chunks.push({
    nodeType,
    displayName,
    typeVersion,
    chunkType: "overview",
    content: overviewParts.join("\n"),
    metadata: {
      category,
      credentialTypes: sourceInfo?.credentials,
    },
  });

  // 2. Parameters chunk
  if (sourceInfo?.properties || docContent) {
    const paramParts = [
      `Parameters for ${displayName} (${nodeType}) v${typeVersion}:`,
    ];
    if (sourceInfo?.properties) {
      paramParts.push(`\nSource parameters:\n${sourceInfo.properties}`);
    }
    // Extract parameter sections from docs
    if (docContent) {
      const paramSection = extractParameterSection(docContent);
      if (paramSection) {
        paramParts.push(`\nDocumented parameters:\n${paramSection}`);
      }
    }

    chunks.push({
      nodeType,
      displayName,
      typeVersion,
      chunkType: "parameters",
      content: paramParts.join("\n"),
      metadata: { category },
    });
  }

  // 3. Credentials chunk
  if (sourceInfo?.credentials.length || docContent) {
    const credParts = [
      `Credentials for ${displayName} (${nodeType}):`,
    ];
    if (sourceInfo?.credentials.length) {
      credParts.push(`Credential types: ${sourceInfo.credentials.join(", ")}`);
    }
    if (docContent) {
      const credSection = extractCredentialSection(docContent);
      if (credSection) {
        credParts.push(`\n${credSection}`);
      }
    }
    if (credParts.length > 1) {
      chunks.push({
        nodeType,
        displayName,
        typeVersion,
        chunkType: "credentials",
        content: credParts.join("\n"),
        metadata: {
          category,
          credentialTypes: sourceInfo?.credentials,
        },
      });
    }
  }

  // 4. Examples chunk (from docs)
  if (docContent) {
    const examplesSection = extractExamplesSection(docContent);
    if (examplesSection) {
      chunks.push({
        nodeType,
        displayName,
        typeVersion,
        chunkType: "examples",
        content: `Examples for ${displayName} (${nodeType}) v${typeVersion}:\n${examplesSection}`,
        metadata: { category },
      });
    }
  }

  return chunks;
}

// ─── Markdown Parsing Helpers ─────────────────────────────────────────────────

function extractMarkdownSection(
  content: string,
  startIndex: number,
  maxLength: number
): string {
  // Remove frontmatter
  const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n?/, "");
  const section = withoutFrontmatter.slice(startIndex, startIndex + maxLength);
  // Trim to last complete sentence or paragraph
  const lastPeriod = section.lastIndexOf(".");
  if (lastPeriod > maxLength * 0.5) {
    return section.slice(0, lastPeriod + 1);
  }
  return section.trim();
}

function extractParameterSection(content: string): string | null {
  // Look for sections about parameters, options, or fields
  const paramHeaders = [
    /## (?:Parameters|Node parameters|Options|Fields|Operations)[\s\S]*?(?=\n## |\n---|\Z)/i,
    /### (?:Parameters|Node parameters|Options|Fields|Operations)[\s\S]*?(?=\n### |\n## |\n---|\Z)/i,
  ];

  for (const regex of paramHeaders) {
    const match = content.match(regex);
    if (match) {
      return match[0].slice(0, 2000); // Cap at 2000 chars
    }
  }

  // Fallback: look for table-like parameter docs
  const tableMatch = content.match(
    /\|.*\|.*\|[\s\S]*?\n(?:\|.*\|.*\|\n)+/
  );
  if (tableMatch) {
    return tableMatch[0].slice(0, 1500);
  }

  return null;
}

function extractCredentialSection(content: string): string | null {
  const credHeaders = [
    /## (?:Credentials|Authentication|Prerequisites)[\s\S]*?(?=\n## |\n---|\Z)/i,
    /### (?:Credentials|Authentication|Prerequisites)[\s\S]*?(?=\n### |\n## |\n---|\Z)/i,
  ];

  for (const regex of credHeaders) {
    const match = content.match(regex);
    if (match) {
      return match[0].slice(0, 1000);
    }
  }

  return null;
}

function extractExamplesSection(content: string): string | null {
  const exampleHeaders = [
    /## (?:Examples?|Templates|Common operations|Usage)[\s\S]*?(?=\n## |\n---|\Z)/i,
    /### (?:Examples?|Templates|Common operations|Usage)[\s\S]*?(?=\n### |\n## |\n---|\Z)/i,
  ];

  for (const regex of exampleHeaders) {
    const match = content.match(regex);
    if (match) {
      return match[0].slice(0, 1500);
    }
  }

  // Fallback: look for code blocks as examples
  const codeBlocks = content.match(/```[\s\S]*?```/g);
  if (codeBlocks && codeBlocks.length > 0) {
    return codeBlocks.slice(0, 3).join("\n\n").slice(0, 1500);
  }

  return null;
}

// ─── Main Ingestion ───────────────────────────────────────────────────────────

export interface SyncResult {
  success: boolean;
  nodesProcessed: number;
  chunksCreated: number;
  templatesProcessed: number;
  errors: string[];
  duration: number;
}

/**
 * Run the full ingestion pipeline:
 * 1. Fetch docs from n8n-docs GitHub repo
 * 2. Fetch node source info from n8n GitHub repo
 * 3. Combine and chunk
 * 4. Generate embeddings
 * 5. Upsert into database
 */
export async function runIngestion(): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let nodesProcessed = 0;
  let chunksCreated = 0;
  let templatesProcessed = 0;

  try {
    console.log("[ingest] Starting ingestion pipeline...");

    // Step 1 & 2: Fetch from both sources in parallel
    console.log("[ingest] Fetching from GitHub sources...");
    const [docsMap, sourceMap] = await Promise.all([
      fetchDocsFromGitHub().catch((err) => {
        errors.push(`Docs fetch failed: ${err.message}`);
        return new Map<string, { content: string; path: string }>();
      }),
      fetchNodeSourceInfo().catch((err) => {
        errors.push(`Source fetch failed: ${err.message}`);
        return new Map<string, NodeSourceInfo>();
      }),
    ]);

    console.log(
      `[ingest] Fetched ${docsMap.size} doc files, ${sourceMap.size} source files`
    );

    // Step 3: Merge all known node types
    const allNodeTypes = new Set([...docsMap.keys(), ...sourceMap.keys()]);
    console.log(`[ingest] Total unique node types: ${allNodeTypes.size}`);

    // Step 4: Create chunks for each node
    const allChunks: NodeDocChunk[] = [];
    for (const nodeType of allNodeTypes) {
      const docContent = docsMap.get(nodeType)?.content ?? null;
      const sourceInfo = sourceMap.get(nodeType) ?? null;
      const chunks = createNodeChunks(nodeType, docContent, sourceInfo);
      allChunks.push(...chunks);
      nodesProcessed++;
    }

    console.log(
      `[ingest] Created ${allChunks.length} chunks from ${nodesProcessed} nodes`
    );

    if (allChunks.length === 0) {
      errors.push("No chunks generated — check GitHub API access");
      await logSync("github-docs", "error", 0, errors.join("; "));
      // Don't return — still run template ingestion below
    }

    if (allChunks.length > 0) {
      // Step 5: Generate embeddings in batches
      console.log("[ingest] Generating embeddings...");
      const chunkTexts = allChunks.map((c) => c.content);
      const embeddings = await generateEmbeddings(chunkTexts);

      // Step 6: Upsert into database
      console.log("[ingest] Upserting into database...");
      const UPSERT_BATCH = 50;

      // Use raw SQL via the neon() driver for inserts.
      // Drizzle ORM's pgvector serialization through the Neon HTTP driver fails
      // for certain records because the 1536-float embedding array, when encoded
      // as a JSON parameter, can exceed the driver's internal limits.
      // By sending the embedding as a text literal with ::vector cast, we avoid this.
      const rawSql = getRawSql();

      // Use Drizzle for deletes (no embedding involved, so no size issue)
      const ingestionDb = getDbUnpooled();

      for (let i = 0; i < allChunks.length; i += UPSERT_BATCH) {
        const batchChunks = allChunks.slice(i, i + UPSERT_BATCH);
        const batchEmbeddings = embeddings.slice(i, i + UPSERT_BATCH);

        for (let j = 0; j < batchChunks.length; j++) {
          const chunk = batchChunks[j];
          const embedding = batchEmbeddings[j];

          try {
            // Delete existing row for this node + chunk type
            await ingestionDb
              .delete(nodeDocs)
              .where(
                and(
                  eq(nodeDocs.nodeType, chunk.nodeType),
                  eq(nodeDocs.chunkType, chunk.chunkType)
                )
              );

            // Truncate content to a reasonable length
            const truncatedContent =
              chunk.content.length > MAX_CONTENT_LENGTH
                ? chunk.content.slice(0, MAX_CONTENT_LENGTH) + "\n…[truncated]"
                : chunk.content;

            // Convert embedding array to PostgreSQL vector literal string
            const embeddingLiteral = `[${embedding.join(",")}]`;

            // Insert using raw SQL — embedding sent as text with ::vector cast
            await rawSql`
              INSERT INTO node_docs
                (node_type, display_name, type_version, chunk_type, content, metadata, embedding, updated_at)
              VALUES
                (${chunk.nodeType}, ${chunk.displayName}, ${chunk.typeVersion},
                 ${chunk.chunkType}, ${truncatedContent},
                 ${JSON.stringify(chunk.metadata ?? {})}::jsonb,
                 ${embeddingLiteral}::vector,
                 NOW())
            `;

            chunksCreated++;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Unknown";
            // Truncate error message to avoid huge logs (embedding text in error)
            const shortErr =
              errMsg.length > 200
                ? errMsg.slice(0, 200) + "…"
                : errMsg;
            errors.push(
              `Upsert failed for ${chunk.nodeType}/${chunk.chunkType}: ${shortErr}`
            );
            console.error(
              `[ingest] Failed ${chunk.nodeType}/${chunk.chunkType}:`,
              shortErr
            );
          }
        }
      }

      console.log(
        `[ingest] Done. ${chunksCreated} chunks upserted, ${errors.length} errors.`
      );

      // Log node docs sync
      await logSync(
        "github-docs",
        errors.length === 0 ? "success" : "error",
        nodesProcessed,
        errors.length > 0 ? errors.slice(0, 5).join("; ") : undefined
      );
    }

    // ── Template ingestion (independent, fault-isolated) ──
    try {
      console.log("[ingest] Starting template ingestion...");
      const templateResult = await runTemplateIngestion();
      templatesProcessed = templateResult.templatesProcessed;
      if (templateResult.errors.length > 0) {
        errors.push(
          ...templateResult.errors.slice(0, 5).map((e) => `[templates] ${e}`)
        );
      }
      console.log(
        `[ingest] Template ingestion done: ${templatesProcessed} templates processed`
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown";
      errors.push(`Template ingestion failed: ${errMsg}`);
      console.error("[ingest] Template ingestion failed:", errMsg);
    }

    return {
      success: errors.length === 0,
      nodesProcessed,
      chunksCreated,
      templatesProcessed,
      errors,
      duration: Date.now() - startTime,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    errors.push(errMsg);
    await logSync("github-docs", "error", nodesProcessed, errMsg).catch(
      () => {}
    );
    return {
      success: false,
      nodesProcessed,
      chunksCreated,
      templatesProcessed,
      errors,
      duration: Date.now() - startTime,
    };
  }
}

async function logSync(
  source: string,
  status: string,
  nodesProcessed: number,
  error?: string
) {
  try {
    const ingestionDb = getDbUnpooled();
    // Truncate error text to avoid oversized insert as well
    const truncatedError = error
      ? error.length > 500
        ? error.slice(0, 500) + "…[truncated]"
        : error
      : null;
    await ingestionDb.insert(syncLog).values({
      source,
      status,
      nodesProcessed,
      error: truncatedError,
    });
  } catch (err) {
    console.error("[ingest] Failed to log sync:", err);
  }
}
