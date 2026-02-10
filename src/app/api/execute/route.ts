import { N8nClient } from "@/lib/n8n/client";
import { NextRequest } from "next/server";

/**
 * Retry a function up to `retries` times with a delay between attempts.
 */
async function retry<T>(
  fn: () => Promise<T>,
  retries: number,
  delayMs: number
): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    const result = await fn();
    if (result !== null && result !== undefined) return result;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

export async function POST(req: NextRequest) {
  const n8nUrl =
    req.headers.get("x-n8n-url") || process.env.N8N_BASE_URL || "";
  const n8nKey =
    req.headers.get("x-n8n-key") || process.env.N8N_API_KEY || "";
  if (!n8nUrl || !n8nKey) {
    return Response.json({ error: "n8n not configured" }, { status: 400 });
  }

  const client = new N8nClient(n8nUrl, n8nKey);
  const { workflowId, testData } = await req.json();

  if (!workflowId) {
    return Response.json(
      { success: false, error: "workflowId is required" },
      { status: 400 }
    );
  }

  try {
    // 1. Fetch the workflow from n8n (to get actual node data, webhookIds, etc.)
    const workflow = await client.getWorkflow(workflowId);
    console.log(
      `[execute] Workflow "${workflow.name}" (${workflowId}): ${workflow.nodes.length} nodes`
    );

    // 2. Activate the workflow so triggers are registered
    await client.activateWorkflow(workflowId, true);
    console.log(`[execute] Workflow activated`);

    // 3. Find a webhook node
    const webhookNode = workflow.nodes.find(
      (n) =>
        n.type === "n8n-nodes-base.webhook" ||
        n.type === "@n8n/n8n-nodes-base.webhook"
    );

    if (webhookNode) {
      // Determine the webhook path:
      // Priority: node parameter "path" > node "webhookId" (set by n8n) > node id
      const webhookPath =
        (webhookNode.parameters.path as string) ||
        ((webhookNode as unknown as Record<string, unknown>).webhookId as string) ||
        webhookNode.id;

      const method = (
        (webhookNode.parameters.httpMethod as string) || "POST"
      ).toUpperCase();

      // n8n registers production webhooks at {baseUrl}/webhook/{path}
      const webhookUrl = `${n8nUrl}/webhook/${webhookPath}`;
      console.log(`[execute] Triggering webhook: ${method} ${webhookUrl}`);

      // Give n8n a moment to register the webhook after activation
      await new Promise((r) => setTimeout(r, 500));

      // Trigger the webhook
      const triggerRes = await fetch(webhookUrl, {
        method,
        headers: { "Content-Type": "application/json" },
        body:
          method !== "GET"
            ? JSON.stringify(testData ?? { test: true, timestamp: Date.now() })
            : undefined,
      });

      console.log(`[execute] Webhook response: ${triggerRes.status}`);

      if (!triggerRes.ok) {
        const body = await triggerRes.text().catch(() => "");
        console.error(`[execute] Webhook trigger failed: ${body}`);
        // Still try to find the execution — sometimes n8n returns errors
        // but the execution was created anyway
      }

      // 4. Poll for the latest execution (retry up to 5 times, 1s apart)
      const executionId = await retry(
        async () => {
          const executions = await client.listExecutions({
            workflowId,
            limit: 1,
          });
          return executions.data?.[0]?.id ?? null;
        },
        5,
        1000
      );

      if (executionId) {
        console.log(`[execute] Found execution: ${executionId}`);
        return Response.json({
          success: true,
          executionId,
          webhookStatus: triggerRes.status,
        });
      }

      // Webhook triggered but no execution found
      return Response.json({
        success: true,
        executionId: null,
        webhookStatus: triggerRes.status,
        message:
          triggerRes.ok
            ? "Webhook triggered but no execution recorded yet. Check n8n UI."
            : `Webhook returned ${triggerRes.status}. The webhook path may not be registered yet — try again in a moment.`,
      });
    }

    // 5. Non-webhook workflow — look for manual/schedule triggers
    const triggerTypes = workflow.nodes
      .filter((n) => n.type.includes("trigger") || n.type.includes("Trigger"))
      .map((n) => n.type);

    return Response.json({
      success: true,
      executionId: null,
      message: triggerTypes.length
        ? `Workflow activated with trigger(s): ${triggerTypes.join(", ")}. It will run when triggered.`
        : "Workflow activated but has no trigger node. Add a trigger node (Webhook, Schedule, etc.) to run it.",
    });
  } catch (err) {
    console.error("[execute] Error:", err);
    return Response.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Execution failed",
      },
      { status: 500 }
    );
  }
}
