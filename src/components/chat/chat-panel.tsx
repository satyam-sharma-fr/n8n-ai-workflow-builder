"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, getToolName } from "ai";
import { useSettings } from "@/contexts/settings-context";
import { useWorkflowStore } from "@/stores/workflow-store";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Workflow, Bot, User, Wrench, Send, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { N8nWorkflow } from "@/lib/n8n/types";
import type { UIMessage, UIMessagePart } from "ai";

const SUGGESTIONS = [
  "Create a webhook that receives data and saves it to Google Sheets",
  "Build a scheduled workflow that checks an API every hour",
  "Make an endpoint that validates data and returns a response",
  "Set up a notification pipeline with Slack and email",
];

const FRIENDLY_TOOL_NAMES: Record<string, string> = {
  getNodeDocumentation: "Looking up node docs",
  getNodeDetails: "Fetching node details",
  getWorkflowTemplates: "Searching workflow templates",
  createWorkflow: "Creating workflow",
  updateWorkflow: "Updating workflow",
  addNode: "Adding node",
  removeNode: "Removing node",
  listWorkflows: "Listing workflows",
  activateWorkflow: "Toggling workflow",
  executeWorkflow: "Executing workflow",
};

export function ChatPanel() {
  const { settings, isAiConfigured } = useSettings();
  const setWorkflow = useWorkflowStore((s) => s.setWorkflow);
  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use a ref so the headers callback always reads the latest settings,
  // even though the transport instance is created once.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: () => ({
          "x-ai-key": settingsRef.current.aiApiKey,
          "x-ai-model": settingsRef.current.aiModel,
          "x-ai-provider": settingsRef.current.aiProvider,
          "x-n8n-key": settingsRef.current.n8nApiKey,
          "x-n8n-url": settingsRef.current.n8nBaseUrl,
        }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // stable — headers fn reads from ref
  );

  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
  } = useChat({
    transport,
    onError: (err) => {
      console.error("[chat error]", err);
    },
  });

  // Watch for workflow creation/update in tool results
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant" || !msg.parts) continue;
      for (const part of msg.parts) {
        // Check if this is a tool part with output-available
        if (isToolUIPart(part)) {
          const toolPart = part as unknown as {
            state: string;
            output?: Record<string, unknown>;
          };
          if (
            toolPart.state === "output-available" &&
            toolPart.output?.success &&
            toolPart.output?.workflow
          ) {
            setWorkflow(toolPart.output.workflow as N8nWorkflow);
          }
        }
      }
    }
  }, [messages, setWorkflow]);

  // Auto-scroll to bottom when messages change or while streaming
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, status]);

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      sendMessage({ text: text.trim() });
      setInputText("");
    },
    [sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend(inputText);
      }
    },
    [handleSend, inputText]
  );

  const isStreaming = status === "streaming" || status === "submitted";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Messages area — plain div for reliable scrolling */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 p-6 pt-16">
            <Workflow className="size-10 text-muted-foreground/40" />
            <div className="space-y-1 text-center">
              <h3 className="font-semibold text-sm">AI Workflow Builder</h3>
              <p className="max-w-xs text-xs text-muted-foreground">
                Describe the automation you want to build and I&apos;ll create a
                real n8n workflow for you.
              </p>
            </div>
            {!isAiConfigured && (
              <Badge variant="outline" className="text-amber-500">
                Configure AI key in Settings to start
              </Badge>
            )}
            <div className="mt-2 grid w-full gap-2 px-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="rounded-lg border bg-muted/30 px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isStreaming && (
              <div className="flex items-start gap-2 px-3 py-2">
                <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="size-3.5 text-primary" />
                </div>
                <Shimmer className="text-sm">Thinking...</Shimmer>
              </div>
            )}
            {error && (
              <div className="mx-3 my-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <p className="font-medium">Error</p>
                <p>{error.message}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t p-3">
        <div className="flex gap-2">
          <Textarea
            placeholder={
              isAiConfigured
                ? "Describe your workflow..."
                : "Configure AI key in Settings first"
            }
            disabled={!isAiConfigured || isStreaming}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            className="min-h-[60px] resize-none text-sm"
          />
          <div className="flex flex-col gap-1">
            {isStreaming ? (
              <Button
                size="icon"
                variant="destructive"
                className="size-8"
                onClick={stop}
              >
                <Square className="size-3" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="size-8"
                onClick={() => handleSend(inputText)}
                disabled={!isAiConfigured || !inputText.trim()}
              >
                <Send className="size-3" />
              </Button>
            )}
          </div>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex items-start gap-2 rounded-lg px-3 py-2 ${
        isUser ? "flex-row-reverse bg-muted/30" : ""
      }`}
    >
      <div
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-secondary" : "bg-primary/10"
        }`}
      >
        {isUser ? (
          <User className="size-3.5" />
        ) : (
          <Bot className="size-3.5 text-primary" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {message.parts?.map((part, i) => (
          <MessagePart key={i} part={part} />
        ))}
        {/* Fallback for empty parts */}
        {!message.parts?.length && (
          <div className="text-xs text-muted-foreground">Empty message</div>
        )}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MessagePart({ part }: { part: any }) {
  // Text content
  if (part.type === "text") {
    if (!part.text) return null;
    return (
      <div className="whitespace-pre-wrap text-sm leading-relaxed">
        {part.text}
      </div>
    );
  }

  // Tool invocations (both static tool-* and dynamic-tool types)
  if (isToolUIPart(part)) {
    const toolName = getToolName(part);
    const isComplete = part.state === "output-available";
    const isError = part.state === "output-error";
    const output = isComplete ? (part as any).output : undefined;
    // A tool is successful if it completed AND either:
    // - has success: true, or
    // - does not have an explicit success: false (i.e. no `success` field means OK)
    const success = Boolean(
      isComplete && (output?.success !== false)
    );

    const errorMsg = isError
      ? (part as any).errorText
      : isComplete && !success
        ? output?.error
        : undefined;

    return (
      <div className="my-1 space-y-1">
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
          <Wrench className="size-3 text-muted-foreground" />
          <span className="text-muted-foreground">
            {FRIENDLY_TOOL_NAMES[toolName] ?? toolName}
          </span>
          {isComplete && success && (
            <Badge
              variant="secondary"
              className="ml-auto h-4 bg-green-500/10 text-[10px] text-green-600"
            >
              Done
            </Badge>
          )}
          {(isError || (isComplete && !success)) && (
            <Badge variant="destructive" className="ml-auto h-4 text-[10px]">
              Failed
            </Badge>
          )}
          {!isComplete && !isError && (
            <Shimmer className="ml-auto text-[10px]">Processing...</Shimmer>
          )}
        </div>
        {errorMsg && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive">
            {String(errorMsg)}
          </div>
        )}
      </div>
    );
  }

  // Reasoning / thinking
  if (part.type === "reasoning" && part.text) {
    return (
      <div className="my-1 rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs italic text-muted-foreground">
        {part.text}
      </div>
    );
  }

  // Step boundaries — ignore silently
  if (part.type === "step-start") {
    return null;
  }

  // Source references
  if (part.type === "source-url" || part.type === "source-document") {
    return null;
  }

  // File parts
  if (part.type === "file") {
    return null;
  }

  // Catch-all: log unknown part types during development
  if (typeof part.type === "string") {
    console.log("[chat] unhandled part type:", part.type, part);
  }

  return null;
}
