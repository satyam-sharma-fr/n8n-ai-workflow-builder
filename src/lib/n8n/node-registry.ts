export interface NodeTypeInfo {
  label: string;
  category: "trigger" | "action" | "logic" | "output";
  icon: string; // lucide icon name
  color: string;
  description: string;
}

export const NODE_REGISTRY: Record<string, NodeTypeInfo> = {
  // ── Triggers ──────────────────────────────────────────────
  "n8n-nodes-base.webhook": {
    label: "Webhook",
    category: "trigger",
    icon: "Webhook",
    color: "#6366f1",
    description: "Starts workflow on HTTP request",
  },
  "n8n-nodes-base.scheduleTrigger": {
    label: "Schedule",
    category: "trigger",
    icon: "Clock",
    color: "#6366f1",
    description: "Runs workflow on a schedule",
  },
  "n8n-nodes-base.manualTrigger": {
    label: "Manual Trigger",
    category: "trigger",
    icon: "Play",
    color: "#6366f1",
    description: "Start workflow manually",
  },
  "n8n-nodes-base.emailReadImap": {
    label: "Email Trigger (IMAP)",
    category: "trigger",
    icon: "Mail",
    color: "#6366f1",
    description: "Triggers on new emails",
  },

  // ── HTTP & API ────────────────────────────────────────────
  "n8n-nodes-base.httpRequest": {
    label: "HTTP Request",
    category: "action",
    icon: "Globe",
    color: "#f59e0b",
    description: "Make HTTP requests to any API",
  },
  "n8n-nodes-base.respondToWebhook": {
    label: "Respond to Webhook",
    category: "output",
    icon: "Reply",
    color: "#f59e0b",
    description: "Send response back to webhook caller",
  },
  "n8n-nodes-base.graphql": {
    label: "GraphQL",
    category: "action",
    icon: "Braces",
    color: "#f59e0b",
    description: "Execute GraphQL queries",
  },

  // ── Logic & Flow ──────────────────────────────────────────
  "n8n-nodes-base.if": {
    label: "IF",
    category: "logic",
    icon: "GitBranch",
    color: "#10b981",
    description: "Route items based on conditions",
  },
  "n8n-nodes-base.switch": {
    label: "Switch",
    category: "logic",
    icon: "GitFork",
    color: "#10b981",
    description: "Route items to multiple outputs",
  },
  "n8n-nodes-base.merge": {
    label: "Merge",
    category: "logic",
    icon: "Merge",
    color: "#10b981",
    description: "Combine data from multiple branches",
  },
  "n8n-nodes-base.splitInBatches": {
    label: "Loop Over Items",
    category: "logic",
    icon: "Repeat",
    color: "#10b981",
    description: "Process items in batches",
  },
  "n8n-nodes-base.wait": {
    label: "Wait",
    category: "logic",
    icon: "Timer",
    color: "#10b981",
    description: "Pause workflow execution",
  },
  "n8n-nodes-base.noOp": {
    label: "No Operation",
    category: "logic",
    icon: "Circle",
    color: "#6b7280",
    description: "Does nothing, passes data through",
  },
  "n8n-nodes-base.filter": {
    label: "Filter",
    category: "logic",
    icon: "Filter",
    color: "#10b981",
    description: "Filter items based on conditions",
  },
  "n8n-nodes-base.removeDuplicates": {
    label: "Remove Duplicates",
    category: "logic",
    icon: "Copy",
    color: "#10b981",
    description: "Remove duplicate items",
  },
  "n8n-nodes-base.limit": {
    label: "Limit",
    category: "logic",
    icon: "ChevronsDown",
    color: "#10b981",
    description: "Limit number of items",
  },
  "n8n-nodes-base.sort": {
    label: "Sort",
    category: "logic",
    icon: "ArrowUpDown",
    color: "#10b981",
    description: "Sort items",
  },

  // ── Data Transformation ───────────────────────────────────
  "n8n-nodes-base.set": {
    label: "Edit Fields",
    category: "action",
    icon: "PenLine",
    color: "#8b5cf6",
    description: "Set or modify field values",
  },
  "n8n-nodes-base.code": {
    label: "Code",
    category: "action",
    icon: "Code",
    color: "#8b5cf6",
    description: "Run custom JavaScript or Python",
  },
  "n8n-nodes-base.itemLists": {
    label: "Item Lists",
    category: "action",
    icon: "List",
    color: "#8b5cf6",
    description: "Manipulate item lists",
  },
  "n8n-nodes-base.dateTime": {
    label: "Date & Time",
    category: "action",
    icon: "Calendar",
    color: "#8b5cf6",
    description: "Format and manipulate dates",
  },
  "n8n-nodes-base.crypto": {
    label: "Crypto",
    category: "action",
    icon: "Lock",
    color: "#8b5cf6",
    description: "Hash, encrypt, or generate tokens",
  },
  "n8n-nodes-base.html": {
    label: "HTML",
    category: "action",
    icon: "FileCode",
    color: "#8b5cf6",
    description: "Extract data from HTML",
  },
  "n8n-nodes-base.xml": {
    label: "XML",
    category: "action",
    icon: "FileText",
    color: "#8b5cf6",
    description: "Convert between XML and JSON",
  },

  // ── Communication ─────────────────────────────────────────
  "n8n-nodes-base.slack": {
    label: "Slack",
    category: "action",
    icon: "MessageSquare",
    color: "#e11d48",
    description: "Send messages to Slack",
  },
  "n8n-nodes-base.emailSend": {
    label: "Send Email",
    category: "action",
    icon: "Send",
    color: "#e11d48",
    description: "Send emails via SMTP",
  },
  "n8n-nodes-base.telegram": {
    label: "Telegram",
    category: "action",
    icon: "Send",
    color: "#e11d48",
    description: "Send Telegram messages",
  },
  "n8n-nodes-base.discord": {
    label: "Discord",
    category: "action",
    icon: "MessageCircle",
    color: "#e11d48",
    description: "Send Discord messages",
  },

  // ── Data Storage ──────────────────────────────────────────
  "n8n-nodes-base.googleSheets": {
    label: "Google Sheets",
    category: "action",
    icon: "Sheet",
    color: "#0ea5e9",
    description: "Read/write Google Sheets data",
  },
  "n8n-nodes-base.postgres": {
    label: "Postgres",
    category: "action",
    icon: "Database",
    color: "#0ea5e9",
    description: "Query PostgreSQL database",
  },
  "n8n-nodes-base.mysql": {
    label: "MySQL",
    category: "action",
    icon: "Database",
    color: "#0ea5e9",
    description: "Query MySQL database",
  },
  "n8n-nodes-base.redis": {
    label: "Redis",
    category: "action",
    icon: "Database",
    color: "#0ea5e9",
    description: "Read/write Redis data",
  },
  "n8n-nodes-base.mongoDb": {
    label: "MongoDB",
    category: "action",
    icon: "Database",
    color: "#0ea5e9",
    description: "Query MongoDB database",
  },
  "n8n-nodes-base.airtable": {
    label: "Airtable",
    category: "action",
    icon: "Table",
    color: "#0ea5e9",
    description: "Read/write Airtable records",
  },

  // ── Files & Storage ───────────────────────────────────────
  "n8n-nodes-base.googleDrive": {
    label: "Google Drive",
    category: "action",
    icon: "HardDrive",
    color: "#0ea5e9",
    description: "Manage Google Drive files",
  },
  "n8n-nodes-base.readWriteFile": {
    label: "Read/Write File",
    category: "action",
    icon: "File",
    color: "#0ea5e9",
    description: "Read or write local files",
  },

  // ── AI & LLM ──────────────────────────────────────────────
  "n8n-nodes-base.openAi": {
    label: "OpenAI",
    category: "action",
    icon: "Bot",
    color: "#a855f7",
    description: "Use OpenAI GPT models",
  },
};

export function getNodeInfo(type: string): NodeTypeInfo {
  return (
    NODE_REGISTRY[type] ?? {
      label: type.split(".").pop() ?? "Unknown",
      category: "action" as const,
      icon: "Box",
      color: "#6b7280",
      description: type,
    }
  );
}
