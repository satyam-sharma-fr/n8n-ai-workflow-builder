"use client";

import { useSettings } from "@/contexts/settings-context";
import { useWorkflowStore } from "@/stores/workflow-store";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Settings, Workflow, CircleDot } from "lucide-react";
import Link from "next/link";

export function TopBar() {
  const { isAiConfigured, isN8nConfigured } = useSettings();
  const workflow = useWorkflowStore((s) => s.workflow);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-4">
      {/* Left: Logo */}
      <div className="flex items-center gap-2">
        <Workflow className="size-5 text-primary" />
        <span className="font-bold text-sm">n8n AI Builder</span>
      </div>

      {/* Center: Workflow name */}
      <div className="flex items-center gap-2">
        {workflow ? (
          <span className="text-sm font-medium">{workflow.name}</span>
        ) : (
          <span className="text-sm text-muted-foreground">No workflow</span>
        )}
      </div>

      {/* Right: Status dots + Settings */}
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger>
            <div className="flex items-center gap-1.5">
              <CircleDot
                className={`size-3 ${isAiConfigured ? "text-green-500" : "text-red-500"}`}
              />
              <span className="text-[10px] text-muted-foreground">AI</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {isAiConfigured ? "AI connected" : "AI not configured"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger>
            <div className="flex items-center gap-1.5">
              <CircleDot
                className={`size-3 ${isN8nConfigured ? "text-green-500" : "text-red-500"}`}
              />
              <span className="text-[10px] text-muted-foreground">n8n</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {isN8nConfigured ? "n8n connected" : "n8n not configured"}
          </TooltipContent>
        </Tooltip>

        <Link href="/settings">
          <Button variant="ghost" size="icon" className="size-8">
            <Settings className="size-4" />
          </Button>
        </Link>
      </div>
    </header>
  );
}
