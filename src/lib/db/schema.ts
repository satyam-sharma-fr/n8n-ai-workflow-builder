import {
  pgTable,
  text,
  serial,
  integer,
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
    typeVersion: integer("type_version").notNull(), // e.g. 4 (latest)
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
  source: text("source").notNull(), // "github-docs" | "npm-package"
  status: text("status").notNull(), // "success" | "error"
  nodesProcessed: integer("nodes_processed").default(0),
  error: text("error"),
  syncedAt: timestamp("synced_at").defaultNow(),
});
