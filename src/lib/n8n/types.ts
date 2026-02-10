// n8n API types -- matches n8n REST API v1 JSON format
// Note: All IDs are strings (n8n OpenAPI spec bug types some as number, but they're alphanumeric)

export interface N8nNode {
  id: string;
  name: string;
  type: string; // e.g., "n8n-nodes-base.webhook"
  typeVersion: number;
  position: [number, number]; // [x, y] coordinates
  parameters: Record<string, unknown>;
  credentials?: Record<string, { id: string; name: string }>;
}

export interface N8nConnection {
  node: string; // target node name
  type: "main";
  index: number; // input index on target node
}

// connections map: sourceNodeName -> { main: [[connections from output 0], [connections from output 1]] }
export interface N8nWorkflow {
  id?: string;
  name: string;
  nodes: N8nNode[];
  connections: Record<string, { main: N8nConnection[][] }>;
  active: boolean;
  settings: Record<string, unknown>;
  tags?: Array<{ id: string; name: string }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface N8nExecution {
  id: string;
  finished: boolean;
  mode: "manual" | "trigger" | "webhook";
  status: "success" | "error" | "running" | "waiting" | "new" | "unknown";
  startedAt: string;
  stoppedAt?: string;
  workflowId: string;
  data?: {
    resultData: {
      runData: Record<string, NodeExecutionResult[]>;
      error?: { message: string; description?: string };
    };
  };
}

// Per-node execution result
export interface NodeExecutionResult {
  startTime: number;
  executionTime: number; // milliseconds
  // data.main[outputIndex][itemIndex]
  data: {
    main: Array<Array<{ json: Record<string, unknown>; binary?: Record<string, unknown> }>>;
  };
  error?: { message: string; description?: string };
}

export type NodeExecutionStatus = "idle" | "pending" | "running" | "success" | "error";

export interface NodeStatus {
  status: NodeExecutionStatus;
  itemCount?: number;
  executionTime?: number;
  error?: string;
}
