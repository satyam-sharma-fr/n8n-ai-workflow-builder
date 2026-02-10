import { N8nClient } from "@/lib/n8n/client";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const n8nUrl = req.headers.get("x-n8n-url") || process.env.N8N_BASE_URL || "";
  const n8nKey = req.headers.get("x-n8n-key") || process.env.N8N_API_KEY || "";
  if (!n8nUrl || !n8nKey) {
    return Response.json({ error: "n8n not configured" }, { status: 400 });
  }

  const client = new N8nClient(n8nUrl, n8nKey);
  try {
    const workflowId = req.nextUrl.searchParams.get("workflowId") ?? undefined;
    const limit = req.nextUrl.searchParams.get("limit");
    const result = await client.listExecutions({
      workflowId,
      limit: limit ? parseInt(limit, 10) : 10,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
