import { N8nClient } from "@/lib/n8n/client";
import { NextRequest } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const n8nUrl = req.headers.get("x-n8n-url") || process.env.N8N_BASE_URL || "";
  const n8nKey = req.headers.get("x-n8n-key") || process.env.N8N_API_KEY || "";
  if (!n8nUrl || !n8nKey) {
    return Response.json({ error: "n8n not configured" }, { status: 400 });
  }

  const { executionId } = await params;
  const client = new N8nClient(n8nUrl, n8nKey);

  try {
    const execution = await client.getExecution(executionId);
    return Response.json(execution);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to get execution" },
      { status: 500 }
    );
  }
}
