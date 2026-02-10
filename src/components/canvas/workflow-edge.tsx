"use client";

import { memo } from "react";
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

function WorkflowEdgeComponent(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
  } = props;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const status = (data?.status as string) || "idle";

  const strokeColor =
    status === "success"
      ? "#22c55e"
      : status === "error"
        ? "#ef4444"
        : status === "running"
          ? "#3b82f6"
          : "var(--border)";

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: status === "idle" ? 1.5 : 2,
          transition: "stroke 0.3s ease, stroke-width 0.3s ease",
        }}
      />
      {status === "running" && (
        <circle r="4" fill="#3b82f6">
          <animateMotion dur="1s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
      {status === "success" && (
        <circle r="3" fill="#22c55e" opacity="0.6">
          <animateMotion dur="1.5s" repeatCount="1" path={edgePath} />
        </circle>
      )}
    </>
  );
}

export const WorkflowEdge = memo(WorkflowEdgeComponent);
