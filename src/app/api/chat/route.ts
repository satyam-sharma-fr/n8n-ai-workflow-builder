import { streamText, convertToModelMessages, generateText } from "ai";
import { createGatewayProvider } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { createWorkflowTools } from "@/lib/ai/tools";
import type { LanguageModel } from "ai";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json();
  const { messages } = body;

  // Read keys from headers (sent by client from localStorage)
  const aiKey =
    req.headers.get("x-ai-key") || process.env.AI_GATEWAY_API_KEY || "";
  const aiModel = req.headers.get("x-ai-model") || "openai/gpt-4o";
  const aiProvider = req.headers.get("x-ai-provider") || "gateway";
  const n8nKey =
    req.headers.get("x-n8n-key") || process.env.N8N_API_KEY || "";
  const n8nUrl =
    req.headers.get("x-n8n-url") || process.env.N8N_BASE_URL || "";

  if (!aiKey) {
    return new Response(
      JSON.stringify({ error: "No AI API key configured. Go to Settings." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // For test connections, return quickly
  if (body.test) {
    try {
      const model = createModel(aiProvider, aiModel, aiKey);
      const { text } = await generateText({
        model,
        prompt: "Say hello in 3 words.",
      });
      return Response.json({ ok: true, text });
    } catch (err) {
      return Response.json(
        { ok: false, error: err instanceof Error ? err.message : "Failed" },
        { status: 400 }
      );
    }
  }

  // Build tools only if n8n is configured
  const tools =
    n8nUrl && n8nKey ? createWorkflowTools(n8nUrl, n8nKey) : undefined;

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: createModel(aiProvider, aiModel, aiKey),
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools,
  });

  return result.toUIMessageStreamResponse();
}

function createModel(
  provider: string,
  model: string,
  apiKey: string
): LanguageModel {
  if (provider === "gateway") {
    const gw = createGatewayProvider({ apiKey });
    return gw(model);
  }

  if (provider === "openai") {
    const openai = createOpenAI({ apiKey });
    // Strip "openai/" prefix if present
    const modelId = model.startsWith("openai/")
      ? model.slice("openai/".length)
      : model;
    return openai(modelId);
  }

  if (provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey });
    const modelId = model.startsWith("anthropic/")
      ? model.slice("anthropic/".length)
      : model;
    return anthropic(modelId);
  }

  // Fallback: try gateway
  const gw = createGatewayProvider({ apiKey });
  return gw(model);
}
