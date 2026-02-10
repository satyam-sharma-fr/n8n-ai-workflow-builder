"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkflowStore } from "@/stores/workflow-store";
import { useSettings } from "@/contexts/settings-context";
import { runWorkflow, stopPolling } from "@/lib/execution/execution-manager";
import {
  Play,
  Square,
  RotateCcw,
  Download,
  Loader2,
} from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

export function CanvasToolbar() {
  const { workflow, executionStatus, resetExecution } = useWorkflowStore();
  const { settings, isN8nConfigured } = useSettings();

  const handleRun = useCallback(async () => {
    if (!workflow?.id) {
      toast.error("No workflow to run");
      return;
    }
    if (!isN8nConfigured) {
      toast.error("Configure n8n in Settings first");
      return;
    }
    const result = await runWorkflow(workflow.id, settings);
    if (result.success) {
      if (result.executionId) {
        toast.success("Execution started — tracking progress");
      } else {
        toast.info(result.message || "Workflow activated");
      }
    } else {
      toast.error(result.error || "Execution failed");
    }
  }, [workflow, settings, isN8nConfigured]);

  const handleStop = useCallback(() => {
    stopPolling();
    useWorkflowStore.getState().finishExecution("error");
    toast.info("Execution stopped");
  }, []);

  const handleReset = useCallback(() => {
    resetExecution();
  }, [resetExecution]);

  const handleExport = useCallback(() => {
    if (!workflow) return;
    const json = JSON.stringify(workflow, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workflow.name || "workflow"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Workflow exported");
  }, [workflow]);

  const isRunning = executionStatus === "running";

  return (
    <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
      {executionStatus !== "idle" && (
        <Badge
          variant={
            executionStatus === "success"
              ? "default"
              : executionStatus === "error"
                ? "destructive"
                : "secondary"
          }
          className={
            executionStatus === "success"
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : executionStatus === "running"
                ? "animate-pulse"
                : ""
          }
        >
          {executionStatus === "running"
            ? "Running..."
            : executionStatus === "success"
              ? "Completed"
              : "Failed"}
        </Badge>
      )}

      {isRunning ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="destructive" onClick={handleStop}>
              <Square className="mr-1 size-3" />
              Stop
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stop execution</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              onClick={handleRun}
              disabled={!workflow?.id || !isN8nConfigured}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              <Play className="mr-1 size-3" />
              Run
            </Button>
          </TooltipTrigger>
          <TooltipContent>Execute workflow</TooltipContent>
        </Tooltip>
      )}

      {executionStatus !== "idle" && !isRunning && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" onClick={handleReset}>
              <RotateCcw className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reset execution state</TooltipContent>
        </Tooltip>
      )}

      {workflow && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" onClick={handleExport}>
              <Download className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export workflow JSON</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
