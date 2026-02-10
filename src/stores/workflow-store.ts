import { create } from "zustand";
import type { Edge, Node } from "@xyflow/react";
import type { N8nWorkflow, NodeExecutionStatus, NodeStatus } from "@/lib/n8n/types";
import { n8nToReactFlow, autoLayout } from "@/lib/n8n/converter";

interface NodeOutputData {
  input: Record<string, unknown>[];
  output: Record<string, unknown>[];
}

interface WorkflowState {
  // n8n workflow data
  workflow: N8nWorkflow | null;

  // React Flow state
  nodes: Node[];
  edges: Edge[];

  // Execution
  executionId: string | null;
  executionStatus: "idle" | "running" | "success" | "error";
  nodeStatuses: Record<string, NodeStatus>;
  nodeOutputs: Record<string, NodeOutputData>;

  // Selection
  selectedNodeId: string | null;
  isDrawerOpen: boolean;

  // Actions
  setWorkflow: (wf: N8nWorkflow) => void;
  clearWorkflow: () => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: unknown[]) => void;
  onEdgesChange: (changes: unknown[]) => void;
  updateNodeStatus: (nodeId: string, status: NodeStatus) => void;
  setNodeOutput: (nodeId: string, data: NodeOutputData) => void;
  setSelectedNode: (nodeId: string | null) => void;
  startExecution: (executionId: string) => void;
  finishExecution: (status: "success" | "error" | "idle") => void;
  resetExecution: () => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflow: null,
  nodes: [],
  edges: [],
  executionId: null,
  executionStatus: "idle",
  nodeStatuses: {},
  nodeOutputs: {},
  selectedNodeId: null,
  isDrawerOpen: false,

  setWorkflow: (wf) => {
    const flowData = n8nToReactFlow(wf);
    // Check if nodes need auto-layout (all at 0,0 or overlapping)
    const needsLayout = flowData.nodes.every(
      (n) => n.position.x === 0 && n.position.y === 0
    );
    const laid = needsLayout ? autoLayout(flowData) : flowData;
    set({
      workflow: wf,
      nodes: laid.nodes,
      edges: laid.edges,
      nodeStatuses: {},
      nodeOutputs: {},
      executionStatus: "idle",
      executionId: null,
    });
  },

  clearWorkflow: () =>
    set({
      workflow: null,
      nodes: [],
      edges: [],
      nodeStatuses: {},
      nodeOutputs: {},
      executionStatus: "idle",
      executionId: null,
      selectedNodeId: null,
      isDrawerOpen: false,
    }),

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  onNodesChange: () => {
    // Handled by React Flow's onNodesChange callback
  },
  onEdgesChange: () => {
    // Handled by React Flow's onEdgesChange callback
  },

  updateNodeStatus: (nodeId, status) => {
    set((state) => {
      const newStatuses = { ...state.nodeStatuses, [nodeId]: status };
      // Also update the node data for rendering
      const newNodes = state.nodes.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              executionStatus: status.status,
              itemCount: status.itemCount ?? 0,
              executionTime: status.executionTime,
              error: status.error,
            },
          };
        }
        return n;
      });
      // Update edge status
      const completedNodes = new Set(
        Object.entries(newStatuses)
          .filter(([, s]) => s.status === "success")
          .map(([id]) => id)
      );
      const newEdges = state.edges.map((e) => {
        if (completedNodes.has(e.source) && completedNodes.has(e.target)) {
          return { ...e, animated: false, data: { ...e.data, status: "success" } };
        }
        if (completedNodes.has(e.source)) {
          return { ...e, animated: true, data: { ...e.data, status: "running" } };
        }
        return e;
      });
      return { nodeStatuses: newStatuses, nodes: newNodes, edges: newEdges };
    });
  },

  setNodeOutput: (nodeId, data) => {
    set((state) => ({
      nodeOutputs: { ...state.nodeOutputs, [nodeId]: data },
    }));
  },

  setSelectedNode: (nodeId) => {
    set({ selectedNodeId: nodeId, isDrawerOpen: nodeId !== null });
  },

  startExecution: (executionId) => {
    const state = get();
    const pendingStatuses: Record<string, NodeStatus> = {};
    for (const node of state.nodes) {
      pendingStatuses[node.id] = { status: "pending" as NodeExecutionStatus };
    }
    const pendingNodes = state.nodes.map((n) => ({
      ...n,
      data: { ...n.data, executionStatus: "pending", itemCount: 0 },
    }));
    const resetEdges = state.edges.map((e) => ({
      ...e,
      animated: false,
      data: { ...e.data, status: "idle" },
    }));
    set({
      executionId,
      executionStatus: "running",
      nodeStatuses: pendingStatuses,
      nodeOutputs: {},
      nodes: pendingNodes,
      edges: resetEdges,
    });
  },

  finishExecution: (status) => {
    set({ executionStatus: status });
  },

  resetExecution: () => {
    const state = get();
    const resetNodes = state.nodes.map((n) => ({
      ...n,
      data: { ...n.data, executionStatus: "idle", itemCount: 0 },
    }));
    const resetEdges = state.edges.map((e) => ({
      ...e,
      animated: false,
      data: { ...e.data, status: "idle" },
    }));
    set({
      executionId: null,
      executionStatus: "idle",
      nodeStatuses: {},
      nodeOutputs: {},
      nodes: resetNodes,
      edges: resetEdges,
    });
  },
}));
