import type { AppSettings } from "@/contexts/settings-context";
import { useWorkflowStore } from "@/stores/workflow-store";

let pollingInterval: ReturnType<typeof setInterval> | null = null;

export async function runWorkflow(
  workflowId: string,
  settings: AppSettings,
  testData?: Record<string, unknown>
) {
  const store = useWorkflowStore.getState();

  // Start execution UI
  store.startExecution("pending");

  try {
    const res = await fetch("/api/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-n8n-key": settings.n8nApiKey,
        "x-n8n-url": settings.n8nBaseUrl,
      },
      body: JSON.stringify({ workflowId, testData }),
    });

    const data = await res.json();

    if (!data.success) {
      store.finishExecution("error");
      return { success: false, error: data.error || "Execution failed" };
    }

    if (!data.executionId) {
      // Workflow was activated but no execution could be tracked
      // (e.g. non-webhook workflow, or webhook not yet registered)
      store.finishExecution("idle");
      return {
        success: true,
        executionId: null,
        message: data.message || "Workflow activated — no live execution to track.",
      };
    }

    // Start polling
    store.startExecution(data.executionId);
    startPolling(data.executionId, settings);

    return { success: true, executionId: data.executionId };
  } catch (err) {
    store.finishExecution("error");
    return {
      success: false,
      error: err instanceof Error ? err.message : "Execution failed",
    };
  }
}

function startPolling(executionId: string, settings: AppSettings) {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }

  const store = useWorkflowStore.getState;

  pollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/execute/${executionId}`, {
        headers: {
          "x-n8n-key": settings.n8nApiKey,
          "x-n8n-url": settings.n8nBaseUrl,
        },
      });

      if (!res.ok) return;

      const execution = await res.json();
      const currentStore = store();

      // Map n8n node names to our node IDs
      const nameToId = new Map<string, string>();
      for (const node of currentStore.nodes) {
        nameToId.set(node.data.label as string, node.id);
      }

      // Update per-node status from runData
      const runData = execution.data?.resultData?.runData;
      if (runData) {
        for (const [nodeName, results] of Object.entries(runData)) {
          const nodeId = nameToId.get(nodeName);
          if (!nodeId) continue;

          const resultArr = results as Array<{
            executionTime?: number;
            data?: { main?: Array<Array<{ json: Record<string, unknown> }>> };
            error?: { message: string };
          }>;
          const result = resultArr[0];
          if (!result) continue;

          const items = result.data?.main?.[0] ?? [];

          currentStore.updateNodeStatus(nodeId, {
            status: result.error ? "error" : "success",
            itemCount: items.length,
            executionTime: result.executionTime,
            error: result.error?.message,
          });

          // Store output data
          currentStore.setNodeOutput(nodeId, {
            input: [], // n8n API doesn't always expose input separately
            output: items.map((item) => item.json),
          });
        }
      }

      // Check if execution is finished
      if (execution.finished) {
        stopPolling();
        currentStore.finishExecution(
          execution.status === "success" ? "success" : "error"
        );
      }
    } catch {
      // Silently continue polling on network errors
    }
  }, 1000);
}

export function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}
