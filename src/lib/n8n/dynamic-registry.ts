import { db } from "@/lib/db";
import { nodeDocs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { NODE_REGISTRY, type NodeTypeInfo } from "./node-registry";

/**
 * In-memory cache for dynamically resolved node info.
 * Avoids repeated DB queries for the same node types within a session.
 */
const cache = new Map<string, NodeTypeInfo>();

// Color palette for categories not in the static registry
const CATEGORY_COLORS: Record<string, string> = {
  trigger: "#6366f1",
  action: "#f59e0b",
  logic: "#10b981",
  output: "#e11d48",
};

/**
 * Get node display info, first checking the static registry, then the in-memory cache,
 * and finally falling back to a database lookup from the RAG node_docs table.
 *
 * This is an async version of `getNodeInfo` that can resolve ANY node type
 * that exists in the documentation database — not just the hardcoded ~30.
 */
export async function getNodeInfoDynamic(
  type: string
): Promise<NodeTypeInfo> {
  // 1. Check static registry (fast, synchronous)
  if (NODE_REGISTRY[type]) {
    return NODE_REGISTRY[type];
  }

  // 2. Check in-memory cache
  if (cache.has(type)) {
    return cache.get(type)!;
  }

  // 3. Query database for the overview chunk of this node type
  try {
    const docs = await db
      .select({
        displayName: nodeDocs.displayName,
        content: nodeDocs.content,
        metadata: nodeDocs.metadata,
      })
      .from(nodeDocs)
      .where(
        and(eq(nodeDocs.nodeType, type), eq(nodeDocs.chunkType, "overview"))
      )
      .limit(1);

    if (docs.length > 0) {
      const doc = docs[0];
      const category = mapCategory(doc.metadata?.category);
      const info: NodeTypeInfo = {
        label: doc.displayName,
        category,
        icon: inferIcon(type, category),
        color: CATEGORY_COLORS[category] ?? "#6b7280",
        description: extractShortDescription(doc.content),
      };
      cache.set(type, info);
      return info;
    }
  } catch {
    // Database not available — fall through to generic fallback
  }

  // 4. Final fallback: derive from the type string itself
  const fallback: NodeTypeInfo = {
    label: formatNodeName(type),
    category: "action",
    icon: "Box",
    color: "#6b7280",
    description: type,
  };
  cache.set(type, fallback);
  return fallback;
}

/**
 * Synchronous version that checks static registry + cache only.
 * Use this in render paths where async is not possible.
 * Falls back to the generic info if not cached yet.
 */
export function getNodeInfoCached(type: string): NodeTypeInfo {
  if (NODE_REGISTRY[type]) {
    return NODE_REGISTRY[type];
  }
  if (cache.has(type)) {
    return cache.get(type)!;
  }
  return {
    label: formatNodeName(type),
    category: "action",
    icon: "Box",
    color: "#6b7280",
    description: type,
  };
}

/**
 * Pre-warm the cache by loading all node overview docs from the database.
 * Call this once on app init or when the sync completes.
 */
export async function warmNodeInfoCache(): Promise<number> {
  try {
    const docs = await db
      .select({
        nodeType: nodeDocs.nodeType,
        displayName: nodeDocs.displayName,
        content: nodeDocs.content,
        metadata: nodeDocs.metadata,
      })
      .from(nodeDocs)
      .where(eq(nodeDocs.chunkType, "overview"));

    let count = 0;
    for (const doc of docs) {
      if (!NODE_REGISTRY[doc.nodeType] && !cache.has(doc.nodeType)) {
        const category = mapCategory(doc.metadata?.category);
        cache.set(doc.nodeType, {
          label: doc.displayName,
          category,
          icon: inferIcon(doc.nodeType, category),
          color: CATEGORY_COLORS[category] ?? "#6b7280",
          description: extractShortDescription(doc.content),
        });
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapCategory(
  raw: string | undefined
): "trigger" | "action" | "logic" | "output" {
  if (!raw) return "action";
  const lower = raw.toLowerCase();
  if (lower.includes("trigger") || lower === "schedule") return "trigger";
  if (lower.includes("logic") || lower === "transform") return "logic";
  if (lower.includes("output")) return "output";
  return "action";
}

function inferIcon(
  nodeType: string,
  category: "trigger" | "action" | "logic" | "output"
): string {
  // Try to infer a reasonable icon from the node type name
  const name = nodeType.split(".").pop()?.toLowerCase() ?? "";
  if (name.includes("webhook")) return "Webhook";
  if (name.includes("schedule") || name.includes("cron")) return "Clock";
  if (name.includes("http") || name.includes("request")) return "Globe";
  if (name.includes("email") || name.includes("mail")) return "Mail";
  if (name.includes("slack")) return "MessageSquare";
  if (name.includes("telegram")) return "Send";
  if (name.includes("discord")) return "MessageCircle";
  if (name.includes("database") || name.includes("postgres") || name.includes("mysql") || name.includes("mongo"))
    return "Database";
  if (name.includes("google") && name.includes("sheet")) return "Sheet";
  if (name.includes("google") && name.includes("drive")) return "HardDrive";
  if (name.includes("if") || name.includes("switch") || name.includes("filter"))
    return "GitBranch";
  if (name.includes("code")) return "Code";
  if (name.includes("set") || name.includes("edit")) return "PenLine";
  if (name.includes("merge")) return "Merge";
  if (name.includes("wait") || name.includes("delay")) return "Timer";
  if (name.includes("ai") || name.includes("openai") || name.includes("llm"))
    return "Bot";

  // Category-based fallback
  if (category === "trigger") return "Zap";
  if (category === "logic") return "GitBranch";
  if (category === "output") return "ArrowRight";
  return "Box";
}

function extractShortDescription(content: string): string {
  // Get the description line from the overview content
  const descMatch = content.match(/Description:\s*(.+)/);
  if (descMatch) return descMatch[1].slice(0, 100);

  // Otherwise take the first meaningful line
  const lines = content.split("\n").filter((l) => l.trim().length > 10);
  return lines[0]?.slice(0, 100) ?? content.slice(0, 100);
}

function formatNodeName(type: string): string {
  const raw = type.split(".").pop() ?? "Unknown";
  // Convert camelCase to Title Case
  return raw
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
