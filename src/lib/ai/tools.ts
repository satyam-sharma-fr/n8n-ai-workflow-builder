import { tool } from "ai";
import { z } from "zod";
import { N8nClient } from "@/lib/n8n/client";
import {
  findRelevantNodeDocs,
  getNodeDocsByType,
  findRelevantTemplates,
} from "@/lib/rag/retrieval";

const n8nNodeSchema = z.object({
  id: z.string().describe("Unique UUID for the node"),
  name: z.string().describe("Display name (must be unique in workflow)"),
  type: z.string().describe("n8n node type, e.g. n8n-nodes-base.webhook"),
  typeVersion: z
    .number()
    .describe(
      "The node type version — MUST match the latest version from getNodeDocumentation results. Do NOT default to 1."
    ),
  position: z
    .object({
      x: z.number().describe("X coordinate"),
      y: z.number().describe("Y coordinate"),
    })
    .describe("Node position as {x, y}"),
  parameters: z.record(z.string(), z.unknown()).default({}),
});

const n8nConnectionSchema = z.object({
  node: z.string().describe("Target node name"),
  type: z.string().default("main").describe('Connection type, always "main"'),
  index: z.number().default(0).describe("Target input index, usually 0"),
});

const connectionsSchema = z.record(
  z.string(),
  z.object({
    main: z.array(z.array(n8nConnectionSchema)),
  })
);

import type { N8nConnection, N8nNode } from "@/lib/n8n/types";

// Convert AI-friendly {x,y} positions to n8n [x,y] tuples
function toN8nNodes(
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    typeVersion: number;
    position: { x: number; y: number };
    parameters: Record<string, unknown>;
  }>
): N8nNode[] {
  return nodes.map((n) => ({
    ...n,
    position: [n.position.x, n.position.y] as [number, number],
  }));
}

// Convert AI connection format to n8n connection format
function toN8nConnections(
  connections: Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>
): Record<string, { main: N8nConnection[][] }> {
  const result: Record<string, { main: N8nConnection[][] }> = {};
  for (const [key, value] of Object.entries(connections)) {
    result[key] = {
      main: value.main.map((arr) =>
        arr.map((c) => ({
          node: c.node,
          type: "main" as const,
          index: c.index,
        }))
      ),
    };
  }
  return result;
}

/**
 * Trim a workflow JSON for context-window-safe LLM consumption.
 * Strips position, IDs, and other non-essential fields; keeps the
 * node structure (name, type, typeVersion, parameters) and connections.
 * Caps total serialized size per template.
 */
function trimWorkflowJson(
  workflowJson: {
    nodes: unknown[];
    connections: Record<string, unknown>;
  } | null
): unknown | null {
  if (!workflowJson) return null;

  const MAX_JSON_LENGTH = 3000;

  try {
    const trimmedNodes = (workflowJson.nodes as Array<Record<string, unknown>>).map((node) => {
      const trimmed: Record<string, unknown> = {
        name: node.name,
        type: node.type,
      };
      if (node.typeVersion != null) trimmed.typeVersion = node.typeVersion;
      if (node.parameters && Object.keys(node.parameters as object).length > 0) {
        trimmed.parameters = node.parameters;
      }
      if (node.credentials) trimmed.credentials = node.credentials;
      return trimmed;
    });

    const result = {
      nodes: trimmedNodes,
      connections: workflowJson.connections,
    };

    const serialized = JSON.stringify(result);
    if (serialized.length > MAX_JSON_LENGTH) {
      // If too large, further strip parameters to just keys
      const compactNodes = trimmedNodes.map((n) => {
        if (n.parameters && typeof n.parameters === "object") {
          return {
            ...n,
            parameters: Object.fromEntries(
              Object.entries(n.parameters as Record<string, unknown>).map(
                ([k, v]) => [k, typeof v === "string" && v.length > 100 ? v.slice(0, 100) + "…" : v]
              )
            ),
          };
        }
        return n;
      });
      return { nodes: compactNodes, connections: workflowJson.connections };
    }

    return result;
  } catch {
    return null;
  }
}

export function createWorkflowTools(n8nUrl: string, n8nKey: string) {
  const client = new N8nClient(n8nUrl, n8nKey);

  return {
    // ── RAG Tools ──────────────────────────────────────────────────────────
    getNodeDocumentation: tool({
      description:
        "Search the n8n node documentation database for information about specific nodes, " +
        "their parameters, versions, and configurations. Call this BEFORE creating or " +
        "updating workflows to ensure you use correct node types, latest typeVersions, " +
        "and valid parameters. You can search by node name, functionality, or use case.",
      inputSchema: z.object({
        query: z.string().describe(
          "What to search for, e.g. 'HTTP Request node parameters' or 'Slack message sending' or 'Google Sheets credentials' or 'schedule trigger cron'"
        ),
      }),
      execute: async ({ query }) => {
        try {
          const docs = await findRelevantNodeDocs(query, 8);
          if (docs.length === 0) {
            return {
              success: true as const,
              results: [],
              message:
                "No documentation found. The node docs database may need to be synced. " +
                "Try using common n8n node types or ask the user to sync the documentation from Settings.",
            };
          }
          return {
            success: true as const,
            results: docs.map((d) => ({
              nodeType: d.nodeType,
              displayName: d.displayName,
              latestVersion: d.typeVersion,
              section: d.chunkType,
              documentation: d.content,
              similarity: Math.round(d.similarity * 100) / 100,
            })),
          };
        } catch (err) {
          return {
            success: false as const,
            results: [],
            error:
              err instanceof Error
                ? err.message
                : "Failed to search documentation",
            message:
              "Documentation database is not available. Proceed with best-effort knowledge, " +
              "but warn the user that node versions may not be up to date.",
          };
        }
      },
    }),

    getNodeDetails: tool({
      description:
        "Get all documentation chunks for a specific n8n node type. Use this when you already " +
        "know the exact node type identifier and need its full details (parameters, credentials, examples).",
      inputSchema: z.object({
        nodeType: z
          .string()
          .describe(
            "Exact node type identifier, e.g. 'n8n-nodes-base.httpRequest' or 'n8n-nodes-base.slack'"
          ),
      }),
      execute: async ({ nodeType }) => {
        try {
          const docs = await getNodeDocsByType(nodeType);
          if (docs.length === 0) {
            return {
              success: true as const,
              found: false,
              message: `No documentation found for "${nodeType}". It may not exist or the docs may need syncing.`,
            };
          }
          return {
            success: true as const,
            found: true,
            nodeType: docs[0].nodeType,
            displayName: docs[0].displayName,
            latestVersion: docs[0].typeVersion,
            sections: Object.fromEntries(
              docs.map((d) => [d.chunkType, d.content])
            ),
          };
        } catch (err) {
          return {
            success: false as const,
            found: false,
            error:
              err instanceof Error
                ? err.message
                : "Failed to fetch node details",
          };
        }
      },
    }),

    getWorkflowTemplates: tool({
      description:
        "Search for official n8n workflow templates that match what the user wants to build. " +
        "Returns real, production-tested workflow examples with complete node configurations " +
        "and connections. ALWAYS call this BEFORE creating a new workflow to find a relevant " +
        "template to use as a blueprint. This dramatically improves accuracy.",
      inputSchema: z.object({
        query: z.string().describe(
          "What kind of workflow the user wants, e.g. 'AI agent with tools', " +
          "'Slack notification on new email', 'RAG chatbot with vector store'"
        ),
      }),
      execute: async ({ query }) => {
        try {
          const templates = await findRelevantTemplates(query, 3);
          if (templates.length === 0) {
            return {
              success: true as const,
              results: [],
              message:
                "No workflow templates found. The templates database may need to be synced. " +
                "Fall back to node documentation and your built-in patterns. " +
                "Ask the user to sync from Settings if needed.",
            };
          }
          return {
            success: true as const,
            results: templates.map((t) => ({
              templateId: t.templateId,
              name: t.name,
              description: t.description,
              category: t.category,
              nodeTypes: t.nodeTypes,
              similarity: Math.round(t.similarity * 100) / 100,
              workflow: trimWorkflowJson(t.workflowJson),
            })),
          };
        } catch (err) {
          return {
            success: false as const,
            results: [],
            error:
              err instanceof Error
                ? err.message
                : "Failed to search templates",
            message:
              "Template database is not available. Proceed with node documentation " +
              "and built-in patterns.",
          };
        }
      },
    }),

    // ── Workflow Tools ──────────────────────────────────────────────────────
    createWorkflow: tool({
      description:
        "Create a complete n8n workflow. Use this when the user describes a new workflow they want to build.",
      inputSchema: z.object({
        name: z.string().describe("Workflow name"),
        nodes: z.array(n8nNodeSchema).describe("Array of workflow nodes"),
        connections: connectionsSchema.describe(
          "Connection map: sourceNodeName -> { main: [[{node, type, index}]] }"
        ),
      }),
      execute: async ({ name, nodes, connections }) => {
        try {
          const n8nNodes = toN8nNodes(nodes);
          const n8nConns = toN8nConnections(connections);
          console.log("[createWorkflow] Sending to n8n:", JSON.stringify({ name, nodes: n8nNodes, connections: n8nConns }, null, 2).slice(0, 2000));
          const workflow = await client.createWorkflow({
            name,
            nodes: n8nNodes,
            connections: n8nConns,
            settings: {},
          });
          return {
            success: true as const,
            workflow,
            message: `Created workflow "${name}" with ${nodes.length} nodes.`,
          };
        } catch (err) {
          console.error("[createWorkflow] Error:", err);
          return {
            success: false as const,
            error: err instanceof Error ? err.message : "Failed to create workflow",
          };
        }
      },
    }),

    updateWorkflow: tool({
      description:
        "Update an existing workflow with new nodes and connections. Use when modifying a workflow.",
      inputSchema: z.object({
        workflowId: z.string().describe("ID of the workflow to update"),
        name: z.string().optional().describe("New workflow name"),
        nodes: z.array(n8nNodeSchema).describe("Complete updated nodes array"),
        connections: connectionsSchema.describe("Complete updated connections"),
      }),
      execute: async ({ workflowId, name, nodes, connections }) => {
        try {
          const workflow = await client.updateWorkflow(workflowId, {
            ...(name ? { name } : {}),
            nodes: toN8nNodes(nodes),
            connections: toN8nConnections(connections),
          });
          return {
            success: true as const,
            workflow,
            message: `Updated workflow with ${nodes.length} nodes.`,
          };
        } catch (err) {
          return {
            success: false as const,
            error: err instanceof Error ? err.message : "Failed to update workflow",
          };
        }
      },
    }),

    addNode: tool({
      description:
        "Add a single node to an existing workflow and optionally connect it after another node.",
      inputSchema: z.object({
        workflowId: z.string(),
        node: n8nNodeSchema,
        connectAfterNodeName: z
          .string()
          .optional()
          .describe("Name of the node to connect this new node after"),
      }),
      execute: async ({ workflowId, node, connectAfterNodeName }) => {
        try {
          const existing = await client.getWorkflow(workflowId);
          const n8nNode = toN8nNodes([node])[0];
          const updatedNodes = [...existing.nodes, n8nNode];
          const updatedConnections = { ...existing.connections };

          if (connectAfterNodeName) {
            if (!updatedConnections[connectAfterNodeName]) {
              updatedConnections[connectAfterNodeName] = { main: [[]] };
            }
            if (!updatedConnections[connectAfterNodeName].main[0]) {
              updatedConnections[connectAfterNodeName].main[0] = [];
            }
            updatedConnections[connectAfterNodeName].main[0].push({
              node: node.name,
              type: "main",
              index: 0,
            });
          }

          const workflow = await client.updateWorkflow(workflowId, {
            nodes: updatedNodes,
            connections: updatedConnections,
          });
          return {
            success: true as const,
            workflow,
            message: `Added "${node.name}" node.`,
          };
        } catch (err) {
          return {
            success: false as const,
            error: err instanceof Error ? err.message : "Failed to add node",
          };
        }
      },
    }),

    removeNode: tool({
      description: "Remove a node from an existing workflow and clean up its connections.",
      inputSchema: z.object({
        workflowId: z.string(),
        nodeName: z.string().describe("Name of the node to remove"),
      }),
      execute: async ({ workflowId, nodeName }) => {
        try {
          const existing = await client.getWorkflow(workflowId);
          const updatedNodes = existing.nodes.filter((n) => n.name !== nodeName);
          const updatedConnections = { ...existing.connections };

          delete updatedConnections[nodeName];

          for (const [source, conn] of Object.entries(updatedConnections)) {
            updatedConnections[source] = {
              main: conn.main.map((outputConns) =>
                outputConns.filter((c) => c.node !== nodeName)
              ),
            };
          }

          const workflow = await client.updateWorkflow(workflowId, {
            nodes: updatedNodes,
            connections: updatedConnections,
          });
          return {
            success: true as const,
            workflow,
            message: `Removed "${nodeName}" node.`,
          };
        } catch (err) {
          return {
            success: false as const,
            error: err instanceof Error ? err.message : "Failed to remove node",
          };
        }
      },
    }),

    listWorkflows: tool({
      description: "List existing workflows on the n8n instance.",
      inputSchema: z.object({
        limit: z.number().optional().default(10),
        active: z.boolean().optional(),
      }),
      execute: async ({ limit, active }) => {
        try {
          const result = await client.listWorkflows({ limit, active });
          return {
            success: true as const,
            workflows: result.data.map((w) => ({
              id: w.id,
              name: w.name,
              active: w.active,
              nodeCount: w.nodes?.length ?? 0,
            })),
          };
        } catch (err) {
          return {
            success: false as const,
            error: err instanceof Error ? err.message : "Failed to list workflows",
          };
        }
      },
    }),

    activateWorkflow: tool({
      description: "Activate or deactivate a workflow.",
      inputSchema: z.object({
        workflowId: z.string(),
        active: z.boolean(),
      }),
      execute: async ({ workflowId, active }) => {
        try {
          await client.activateWorkflow(workflowId, active);
          return {
            success: true as const,
            message: `Workflow ${active ? "activated" : "deactivated"}.`,
          };
        } catch (err) {
          return {
            success: false as const,
            error: err instanceof Error ? err.message : "Failed to toggle workflow",
          };
        }
      },
    }),

    executeWorkflow: tool({
      description:
        "Execute/run a workflow. For webhook workflows, this sends a test request to the webhook URL.",
      inputSchema: z.object({
        workflowId: z.string(),
        testData: z.record(z.string(), z.unknown()).optional().describe("Test data to send to the webhook"),
      }),
      execute: async ({ workflowId, testData }) => {
        try {
          const workflow = await client.activateWorkflow(workflowId, true);

          const webhookNode = workflow.nodes.find(
            (n) => n.type === "n8n-nodes-base.webhook"
          );

          if (webhookNode) {
            const path =
              (webhookNode.parameters.path as string) || webhookNode.id;
            const n8nBaseUrl = n8nUrl.replace(/\/api\/v1$/, "");
            const webhookUrl = `${n8nBaseUrl}/webhook/${path}`;

            const triggerRes = await fetch(webhookUrl, {
              method: (webhookNode.parameters.httpMethod as string) || "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(testData ?? { test: true }),
            });

            return {
              success: true as const,
              workflowId,
              message: `Workflow executed via webhook. Status: ${triggerRes.status}`,
              triggered: true,
            };
          }

          return {
            success: true as const,
            workflowId,
            message:
              "Workflow activated. For non-webhook workflows, trigger it from the n8n UI or wait for the schedule.",
            triggered: false,
          };
        } catch (err) {
          return {
            success: false as const,
            error: err instanceof Error ? err.message : "Failed to execute workflow",
          };
        }
      },
    }),
  };
}
