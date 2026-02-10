import type { Edge, Node } from "@xyflow/react";
import dagre from "dagre";
import type { N8nConnection, N8nWorkflow } from "./types";
import { getNodeInfo } from "./node-registry";

export interface ReactFlowData {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Convert n8n workflow JSON to React Flow nodes and edges
 */
export function n8nToReactFlow(workflow: N8nWorkflow): ReactFlowData {
  const nodes: Node[] = workflow.nodes.map((n8nNode) => {
    const info = getNodeInfo(n8nNode.type);
    return {
      id: n8nNode.id,
      type: "workflowNode",
      position: { x: n8nNode.position[0], y: n8nNode.position[1] },
      data: {
        label: n8nNode.name,
        n8nType: n8nNode.type,
        category: info.category,
        icon: info.icon,
        color: info.color,
        description: info.description,
        parameters: n8nNode.parameters,
        executionStatus: "idle" as const,
        itemCount: 0,
      },
    };
  });

  const edges: Edge[] = [];
  const nodeNameToId = new Map<string, string>();
  for (const n of workflow.nodes) {
    nodeNameToId.set(n.name, n.id);
  }

  for (const [sourceName, conn] of Object.entries(workflow.connections)) {
    const sourceId = nodeNameToId.get(sourceName);
    if (!sourceId || !conn.main) continue;

    for (let outputIdx = 0; outputIdx < conn.main.length; outputIdx++) {
      const targets: N8nConnection[] = conn.main[outputIdx] ?? [];
      for (const target of targets) {
        const targetId = nodeNameToId.get(target.node);
        if (!targetId) continue;

        edges.push({
          id: `${sourceId}-${outputIdx}-${targetId}-${target.index}`,
          source: sourceId,
          target: targetId,
          sourceHandle: outputIdx > 0 ? `source-${outputIdx}` : undefined,
          targetHandle: target.index > 0 ? `target-${target.index}` : undefined,
          type: "workflowEdge",
          animated: false,
          data: { status: "idle" },
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Auto-layout nodes using dagre when positions are missing or overlapping
 */
export function autoLayout(flowData: ReactFlowData): ReactFlowData {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120 });

  for (const node of flowData.nodes) {
    g.setNode(node.id, { width: 240, height: 80 });
  }

  for (const edge of flowData.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedNodes = flowData.nodes.map((node) => {
    const dagreNode = g.node(node.id);
    return {
      ...node,
      position: {
        x: dagreNode.x - 120,
        y: dagreNode.y - 40,
      },
    };
  });

  return { nodes: layoutedNodes, edges: flowData.edges };
}

/**
 * Convert React Flow nodes/edges back to n8n workflow format
 */
export function reactFlowToN8n(
  nodes: Node[],
  edges: Edge[],
  existingWorkflow?: Partial<N8nWorkflow>
): N8nWorkflow {
  const n8nNodes = nodes.map((node) => ({
    id: node.id,
    name: node.data.label as string,
    type: node.data.n8nType as string,
    typeVersion: 1,
    position: [Math.round(node.position.x), Math.round(node.position.y)] as [number, number],
    parameters: (node.data.parameters as Record<string, unknown>) ?? {},
  }));

  const nodeIdToName = new Map<string, string>();
  for (const n of n8nNodes) {
    nodeIdToName.set(n.id, n.name);
  }

  const connections: Record<string, { main: N8nConnection[][] }> = {};

  for (const edge of edges) {
    const sourceName = nodeIdToName.get(edge.source);
    const targetName = nodeIdToName.get(edge.target);
    if (!sourceName || !targetName) continue;

    if (!connections[sourceName]) {
      connections[sourceName] = { main: [[]] };
    }

    const outputIdx = edge.sourceHandle
      ? parseInt(edge.sourceHandle.replace("source-", ""), 10)
      : 0;
    const targetIdx = edge.targetHandle
      ? parseInt(edge.targetHandle.replace("target-", ""), 10)
      : 0;

    // Ensure array is large enough
    while (connections[sourceName].main.length <= outputIdx) {
      connections[sourceName].main.push([]);
    }

    connections[sourceName].main[outputIdx].push({
      node: targetName,
      type: "main",
      index: targetIdx,
    });
  }

  return {
    name: existingWorkflow?.name ?? "Untitled Workflow",
    nodes: n8nNodes,
    connections,
    active: existingWorkflow?.active ?? false,
    settings: existingWorkflow?.settings ?? {},
    ...(existingWorkflow?.id ? { id: existingWorkflow.id } : {}),
  };
}
