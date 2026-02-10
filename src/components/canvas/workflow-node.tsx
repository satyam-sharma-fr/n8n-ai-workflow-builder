"use client";

import { memo } from "react";
import type { NodeProps as RFNodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import {
  Node,
  NodeHeader,
  NodeTitle,
  NodeDescription,
  NodeContent,
} from "@/components/ai-elements/node";
import { Badge } from "@/components/ui/badge";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";
import { getNodeInfo } from "@/lib/n8n/node-registry";
import {
  Webhook,
  Globe,
  GitBranch,
  GitFork,
  Code,
  PenLine,
  Clock,
  Play,
  Send,
  MessageSquare,
  Database,
  Filter,
  Merge,
  Bot,
  Box,
  CheckCircle2,
  XCircle,
  Mail,
  Sheet,
  Repeat,
  Timer,
  Reply,
  Braces,
  Lock,
  FileCode,
  FileText,
  ArrowUpDown,
  ChevronsDown,
  Copy,
  List,
  Calendar,
  HardDrive,
  File,
  Table,
  MessageCircle,
  Circle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  Webhook,
  Globe,
  GitBranch,
  GitFork,
  Code,
  PenLine,
  Clock,
  Play,
  Send,
  MessageSquare,
  Database,
  Filter,
  Merge,
  Bot,
  Box,
  Mail,
  Sheet,
  Repeat,
  Timer,
  Reply,
  Braces,
  Lock,
  FileCode,
  FileText,
  ArrowUpDown,
  ChevronsDown,
  Copy,
  List,
  Calendar,
  HardDrive,
  File,
  Table,
  MessageCircle,
  Circle,
};

const statusStyles: Record<string, string> = {
  idle: "border-border",
  pending: "border-muted-foreground/30 opacity-60",
  running: "border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.3)] animate-pulse",
  success: "border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.2)]",
  error: "border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.2)]",
};

function WorkflowNodeComponent({ data, selected }: RFNodeProps) {
  const n8nType = data.n8nType as string;
  const info = getNodeInfo(n8nType);
  const status = (data.executionStatus as string) || "idle";
  const itemCount = data.itemCount as number;
  const executionTime = data.executionTime as number | undefined;
  const IconComp = ICON_MAP[info.icon] || Box;
  const isCategory = info.category === "trigger";

  return (
    <Node
      handles={{ target: !isCategory, source: true }}
      className={cn(
        "!w-56 transition-all duration-300",
        statusStyles[status],
        selected && "ring-2 ring-primary"
      )}
    >
      <NodeHeader className="flex-row items-center gap-2">
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded"
          style={{ backgroundColor: `${info.color}20` }}
        >
          <IconComp className="size-4" style={{ color: info.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <NodeTitle className="truncate text-xs font-semibold">
            {data.label as string}
          </NodeTitle>
          <NodeDescription className="truncate text-[10px]">
            {info.label}
          </NodeDescription>
        </div>
        {status === "success" && (
          <CheckCircle2 className="size-4 shrink-0 text-green-500" />
        )}
        {status === "error" && (
          <XCircle className="size-4 shrink-0 text-red-500" />
        )}
        {status === "running" && (
          <Shimmer className="text-[10px]">Running...</Shimmer>
        )}
      </NodeHeader>
      {(status === "success" || status === "error") && (
        <NodeContent className="flex items-center gap-2 !p-2">
          {status === "success" && itemCount > 0 && (
            <Badge
              variant="secondary"
              className="h-5 bg-green-500/10 text-[10px] text-green-600 dark:text-green-400"
            >
              {itemCount} item{itemCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {executionTime !== undefined && (
            <span className="text-[10px] text-muted-foreground">
              {executionTime < 1000
                ? `${Math.round(executionTime)}ms`
                : `${(executionTime / 1000).toFixed(1)}s`}
            </span>
          )}
          {status === "error" && typeof data.error === "string" && (
            <span className="truncate text-[10px] text-red-500">
              {data.error}
            </span>
          )}
        </NodeContent>
      )}
    </Node>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
