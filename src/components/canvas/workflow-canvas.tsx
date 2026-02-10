"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlowProvider,
  type NodeTypes,
  type EdgeTypes,
  Controls,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Canvas } from "@/components/ai-elements/canvas";
import { WorkflowNode } from "./workflow-node";
import { WorkflowEdge } from "./workflow-edge";
import { CanvasToolbar } from "./canvas-toolbar";
import { NodeDetailDrawer } from "./node-detail-drawer";
import { useWorkflowStore } from "@/stores/workflow-store";
import { Workflow } from "lucide-react";

const nodeTypes: NodeTypes = {
  workflowNode: WorkflowNode as unknown as NodeTypes["workflowNode"],
};

const edgeTypes: EdgeTypes = {
  workflowEdge: WorkflowEdge as unknown as EdgeTypes["workflowEdge"],
};

function CanvasInner() {
  const { nodes, edges, setSelectedNode, workflow } = useWorkflowStore();

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string }) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode]
  );

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  if (!workflow) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Workflow className="size-12 opacity-30" />
        <div className="text-center">
          <p className="font-medium text-sm">No workflow yet</p>
          <p className="text-xs">
            Describe what you want to build in the chat
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative size-full">
      <CanvasToolbar />
      <Canvas
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        panOnDrag
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Controls
          position="bottom-left"
          className="!bottom-2 !left-2"
          showInteractive={false}
        />
      </Canvas>
      <NodeDetailDrawer />
    </div>
  );
}

export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
