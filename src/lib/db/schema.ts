import {
  pgTable,
  text,
  serial,
  integer,
  real,
  timestamp,
  jsonb,
  index,
  vector,
} from "drizzle-orm/pg-core";

export const nodeDocs = pgTable(
  "node_docs",
  {
    id: serial("id").primaryKey(),
    nodeType: text("node_type").notNull(), // e.g. "n8n-nodes-base.httpRequest"
    displayName: text("display_name").notNull(), // e.g. "HTTP Request"
    typeVersion: real("type_version").notNull(), // e.g. 2.1 (supports fractional versions)
    chunkType: text("chunk_type").notNull(), // "overview" | "parameters" | "credentials" | "examples"
    content: text("content").notNull(), // the actual doc text
    metadata: jsonb("metadata").$type<{
      category: string;
      subcategory?: string;
      credentialTypes?: string[];
      operations?: string[];
    }>(),
    embedding: vector("embedding", { dimensions: 1536 }),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("node_docs_embedding_idx").using(
      "ivfflat",
      table.embedding.op("vector_cosine_ops")
    ),
    index("node_docs_node_type_idx").on(table.nodeType),
  ]
);

// Track sync metadata
export const syncLog = pgTable("sync_log", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(), // "github-docs" | "n8n-templates"
  status: text("status").notNull(), // "success" | "error"
  nodesProcessed: integer("nodes_processed").default(0),
  error: text("error"),
  syncedAt: timestamp("synced_at").defaultNow(),
});

// Official n8n workflow templates (fetched from https://api.n8n.io/api)
export const workflowTemplates = pgTable(
  "workflow_templates",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    totalViews: integer("total_views").default(0),
    nodeTypes: jsonb("node_types").$type<string[]>(),
    workflowJson: jsonb("workflow_json").$type<{
      nodes: unknown[];
      connections: Record<string, unknown>;
    }>(),
    content: text("content").notNull(), // semantic text for embedding (NOT raw JSON)
    embedding: vector("embedding", { dimensions: 1536 }),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("wf_templates_embedding_idx").using(
      "ivfflat",
      table.embedding.op("vector_cosine_ops")
    ),
    index("wf_templates_template_id_idx").on(table.templateId),
    index("wf_templates_category_idx").on(table.category),
  ]
);
