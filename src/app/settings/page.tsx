"use client";

import { useSettings } from "@/contexts/settings-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, RefreshCw, Database } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ConnectionState = "idle" | "testing" | "success" | "error";

interface SyncStatus {
  lastSync: {
    status: string;
    source: string;
    nodesProcessed: number;
    error: string | null;
    syncedAt: string;
  } | null;
  message?: string;
}

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const [aiConnState, setAiConnState] = useState<ConnectionState>("idle");
  const [aiConnError, setAiConnError] = useState("");
  const [n8nConnState, setN8nConnState] = useState<ConnectionState>("idle");
  const [n8nConnError, setN8nConnError] = useState("");

  // Sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    nodesProcessed?: number;
    chunksCreated?: number;
    error?: string;
  } | null>(null);

  // Fetch sync status on mount
  useEffect(() => {
    fetchSyncStatus();
  }, []);

  const fetchSyncStatus = async () => {
    try {
      const res = await fetch("/api/sync-docs");
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
      }
    } catch {
      // Silently fail — DB may not be configured
    }
  };

  const triggerSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync-docs", {
        method: "POST",
        headers: {
          "x-sync-key": settings.aiApiKey || "manual-trigger",
        },
      });
      const data = await res.json();
      setSyncResult(data);
      // Refresh status after sync
      await fetchSyncStatus();
    } catch (err) {
      setSyncResult({
        success: false,
        error: err instanceof Error ? err.message : "Sync failed",
      });
    } finally {
      setIsSyncing(false);
    }
  }, [settings.aiApiKey]);

  const testAiConnection = useCallback(async () => {
    setAiConnState("testing");
    setAiConnError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ai-key": settings.aiApiKey,
          "x-ai-model": settings.aiModel,
          "x-ai-provider": settings.aiProvider,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Say hello in 3 words." }],
          test: true,
        }),
      });
      if (res.ok) {
        setAiConnState("success");
      } else {
        const text = await res.text().catch(() => "");
        setAiConnError(text || `HTTP ${res.status}`);
        setAiConnState("error");
      }
    } catch (err) {
      setAiConnError(err instanceof Error ? err.message : "Connection failed");
      setAiConnState("error");
    }
  }, [settings]);

  const testN8nConnection = useCallback(async () => {
    setN8nConnState("testing");
    setN8nConnError("");
    try {
      const res = await fetch("/api/n8n/workflows?limit=1", {
        headers: {
          "x-n8n-key": settings.n8nApiKey,
          "x-n8n-url": settings.n8nBaseUrl,
        },
      });
      if (res.ok) {
        setN8nConnState("success");
      } else {
        const text = await res.text().catch(() => "");
        setN8nConnError(text || `HTTP ${res.status}`);
        setN8nConnState("error");
      }
    } catch (err) {
      setN8nConnError(err instanceof Error ? err.message : "Connection failed");
      setN8nConnState("error");
    }
  }, [settings]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure your AI provider and n8n instance
            </p>
          </div>
        </div>

        {/* AI Configuration */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              AI Configuration
              <StatusDot state={aiConnState} />
            </CardTitle>
            <CardDescription>
              Configure the AI model used to generate workflows
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={settings.aiProvider}
                onValueChange={(v) =>
                  updateSettings({ aiProvider: v as AppSettings["aiProvider"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gateway">Vercel AI Gateway</SelectItem>
                  <SelectItem value="openai">OpenAI Direct</SelectItem>
                  <SelectItem value="anthropic">Anthropic Direct</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                placeholder={
                  settings.aiProvider === "gateway"
                    ? "AI Gateway API key..."
                    : settings.aiProvider === "openai"
                      ? "sk-..."
                      : "sk-ant-..."
                }
                value={settings.aiApiKey}
                onChange={(e) => updateSettings({ aiApiKey: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              <Select
                value={settings.aiModel}
                onValueChange={(v) => updateSettings({ aiModel: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai/gpt-4o">GPT-4o</SelectItem>
                  <SelectItem value="openai/gpt-4o-mini">GPT-4o Mini</SelectItem>
                  <SelectItem value="anthropic/claude-sonnet-4-20250514">Claude Sonnet 4</SelectItem>
                  <SelectItem value="anthropic/claude-haiku-3.5">Claude 3.5 Haiku</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={testAiConnection}
                disabled={!settings.aiApiKey || aiConnState === "testing"}
                variant="outline"
                size="sm"
              >
                {aiConnState === "testing" && (
                  <Loader2 className="mr-2 size-3 animate-spin" />
                )}
                Test Connection
              </Button>
              {aiConnState === "error" && (
                <p className="text-xs text-destructive">{aiConnError}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Separator className="my-6" />

        {/* n8n Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              n8n Configuration
              <StatusDot state={n8nConnState} />
            </CardTitle>
            <CardDescription>
              Connect to your n8n instance to create and execute workflows
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Instance URL</Label>
              <Input
                type="url"
                placeholder="https://your-n8n.example.com"
                value={settings.n8nBaseUrl}
                onChange={(e) => updateSettings({ n8nBaseUrl: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                The URL of your self-hosted or cloud n8n instance
              </p>
            </div>

            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                placeholder="n8n API key..."
                value={settings.n8nApiKey}
                onChange={(e) => updateSettings({ n8nApiKey: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Create one in n8n: Settings → n8n API → Create API Key
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={testN8nConnection}
                disabled={
                  !settings.n8nApiKey ||
                  !settings.n8nBaseUrl ||
                  n8nConnState === "testing"
                }
                variant="outline"
                size="sm"
              >
                {n8nConnState === "testing" && (
                  <Loader2 className="mr-2 size-3 animate-spin" />
                )}
                Test Connection
              </Button>
              {n8nConnState === "error" && (
                <p className="text-xs text-destructive">{n8nConnError}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Separator className="my-6" />

        {/* Node Documentation Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-5" />
              Node Documentation
            </CardTitle>
            <CardDescription>
              Sync n8n node documentation so the AI uses the latest node versions,
              parameters, and configurations when building workflows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Last sync info */}
            {syncStatus?.lastSync ? (
              <div className="rounded-lg border bg-muted/30 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Last Synced</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(syncStatus.lastSync.syncedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-sm">
                      <span
                        className={
                          syncStatus.lastSync.status === "success"
                            ? "text-green-600"
                            : "text-destructive"
                        }
                      >
                        {syncStatus.lastSync.status === "success" ? "Success" : "Error"}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {syncStatus.lastSync.nodesProcessed} nodes indexed
                    </p>
                  </div>
                </div>
                {syncStatus.lastSync.error && (
                  <p className="mt-2 text-xs text-destructive">
                    {syncStatus.lastSync.error}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  {syncStatus?.message ?? "No sync has been performed yet. Click \"Sync Now\" to index n8n node documentation."}
                </p>
              </div>
            )}

            {/* Sync result (after triggering) */}
            {syncResult && (
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  syncResult.success
                    ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
                    : "border-destructive/50 bg-destructive/10 text-destructive"
                }`}
              >
                {syncResult.success ? (
                  <p>
                    Sync completed: {syncResult.nodesProcessed} nodes processed,{" "}
                    {syncResult.chunksCreated} documentation chunks created.
                  </p>
                ) : (
                  <p>Sync failed: {syncResult.error}</p>
                )}
              </div>
            )}

            {/* Sync button */}
            <div className="flex items-center gap-3">
              <Button
                onClick={triggerSync}
                disabled={isSyncing}
                variant="outline"
                size="sm"
              >
                {isSyncing ? (
                  <Loader2 className="mr-2 size-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 size-3" />
                )}
                {isSyncing ? "Syncing..." : "Sync Now"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Fetches latest node docs from GitHub. May take a few minutes.
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Documentation is automatically synced weekly via Vercel Cron.
              You can also manually sync anytime after an n8n update.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type AppSettings = { aiProvider: "gateway" | "openai" | "anthropic" };

function StatusDot({ state }: { state: ConnectionState }) {
  if (state === "success")
    return <CheckCircle2 className="size-4 text-green-500" />;
  if (state === "error") return <XCircle className="size-4 text-destructive" />;
  return null;
}
