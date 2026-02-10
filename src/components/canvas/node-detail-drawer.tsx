"use client";

import { useWorkflowStore } from "@/stores/workflow-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, CheckCircle2, XCircle, Clock } from "lucide-react";
import { getNodeInfo } from "@/lib/n8n/node-registry";

export function NodeDetailDrawer() {
  const {
    selectedNodeId,
    isDrawerOpen,
    setSelectedNode,
    nodes,
    nodeStatuses,
    nodeOutputs,
  } = useWorkflowStore();

  if (!isDrawerOpen || !selectedNodeId) return null;

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const info = getNodeInfo(node.data.n8nType as string);
  const status = nodeStatuses[selectedNodeId];
  const output = nodeOutputs[selectedNodeId];

  return (
    <div className="absolute inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">{node.data.label as string}</span>
          <Badge variant="outline" className="text-[10px]">
            {info.label}
          </Badge>
          {status?.status === "success" && (
            <div className="flex items-center gap-1 text-green-500">
              <CheckCircle2 className="size-3" />
              <span className="text-[10px]">
                {status.itemCount ?? 0} item{(status.itemCount ?? 0) !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          {status?.status === "error" && (
            <div className="flex items-center gap-1 text-red-500">
              <XCircle className="size-3" />
              <span className="text-[10px]">{status.error ?? "Error"}</span>
            </div>
          )}
          {status?.executionTime !== undefined && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="size-3" />
              <span className="text-[10px]">
                {status.executionTime < 1000
                  ? `${Math.round(status.executionTime)}ms`
                  : `${(status.executionTime / 1000).toFixed(1)}s`}
              </span>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => setSelectedNode(null)}
        >
          <X className="size-3" />
        </Button>
      </div>

      <div className="grid h-64 grid-cols-2 divide-x">
        {/* INPUT */}
        <div className="flex flex-col">
          <div className="border-b px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">INPUT</span>
          </div>
          <ScrollArea className="flex-1 p-3">
            {output?.input && output.input.length > 0 ? (
              <pre className="text-[11px] leading-relaxed text-foreground">
                {JSON.stringify(output.input, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground">
                {status ? "No input data available" : "Run the workflow to see data"}
              </p>
            )}
          </ScrollArea>
        </div>

        {/* OUTPUT */}
        <div className="flex flex-col">
          <div className="border-b px-3 py-1.5">
            <Tabs defaultValue="json" className="w-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">OUTPUT</span>
                <TabsList className="h-6">
                  <TabsTrigger value="json" className="h-5 px-2 text-[10px]">
                    JSON
                  </TabsTrigger>
                  <TabsTrigger value="table" className="h-5 px-2 text-[10px]">
                    Table
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="json" className="mt-0">
                <ScrollArea className="h-52 p-3">
                  {output?.output && output.output.length > 0 ? (
                    <pre className="text-[11px] leading-relaxed text-foreground">
                      {JSON.stringify(output.output, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {status ? "No output data" : "Run the workflow to see data"}
                    </p>
                  )}
                </ScrollArea>
              </TabsContent>
              <TabsContent value="table" className="mt-0">
                <ScrollArea className="h-52 p-3">
                  {output?.output && output.output.length > 0 ? (
                    <DataTable data={output.output} />
                  ) : (
                    <p className="text-xs text-muted-foreground">No data</p>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}

function DataTable({ data }: { data: Record<string, unknown>[] }) {
  if (data.length === 0) return null;
  const keys = [...new Set(data.flatMap((item) => Object.keys(item)))];

  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b">
          {keys.map((key) => (
            <th
              key={key}
              className="px-2 py-1 text-left font-medium text-muted-foreground"
            >
              {key}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((item, i) => (
          <tr key={i} className="border-b border-border/50">
            {keys.map((key) => (
              <td key={key} className="max-w-[200px] truncate px-2 py-1">
                {typeof item[key] === "object"
                  ? JSON.stringify(item[key])
                  : String(item[key] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
