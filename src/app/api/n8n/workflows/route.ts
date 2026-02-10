import { N8nClient } from "@/lib/n8n/client";
import { NextRequest } from "next/server";

function getClient(req: NextRequest) {
  const n8nUrl = req.headers.get("x-n8n-url") || process.env.N8N_BASE_URL || "";
  const n8nKey = req.headers.get("x-n8n-key") || process.env.N8N_API_KEY || "";
  if (!n8nUrl || !n8nKey) {
    return null;
  }
  return new N8nClient(n8nUrl, n8nKey);
}

export async function GET(req: NextRequest) {
  const client = getClient(req);
  if (!client) {
    return Response.json({ error: "n8n not configured" }, { status: 400 });
  }
  try {
    const limit = req.nextUrl.searchParams.get("limit");
    const active = req.nextUrl.searchParams.get("active");
    const result = await client.listWorkflows({
      limit: limit ? parseInt(limit, 10) : undefined,
      active: active ? active === "true" : undefined,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const client = getClient(req);
  if (!client) {
    return Response.json({ error: "n8n not configured" }, { status: 400 });
  }
  try {
    const body = await req.json();
    const workflow = await client.createWorkflow(body);
    return Response.json(workflow);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
