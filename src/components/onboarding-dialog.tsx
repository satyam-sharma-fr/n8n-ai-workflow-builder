"use client";

import { useSettings } from "@/contexts/settings-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Workflow, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export function OnboardingDialog() {
  const { settings, updateSettings, isConfigured } = useSettings();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "success" | "error">("idle");

  // Show dialog only after mount if not configured
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isConfigured) {
        setOpen(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [isConfigured]);

  const handleTestN8n = useCallback(async () => {
    setTesting(true);
    setTestResult("idle");
    try {
      const res = await fetch("/api/n8n/workflows?limit=1", {
        headers: {
          "x-n8n-key": settings.n8nApiKey,
          "x-n8n-url": settings.n8nBaseUrl,
        },
      });
      setTestResult(res.ok ? "success" : "error");
    } catch {
      setTestResult("error");
    }
    setTesting(false);
  }, [settings]);

  const handleFinish = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Workflow className="size-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Welcome to n8n AI Builder</DialogTitle>
          <DialogDescription className="text-center">
            {step === 0
              ? "Let's connect your AI provider to get started."
              : "Now let's connect to your n8n instance."}
          </DialogDescription>
        </DialogHeader>

        {step === 0 ? (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>AI Provider</Label>
              <Select
                value={settings.aiProvider}
                onValueChange={(v) =>
                  updateSettings({ aiProvider: v as "gateway" | "openai" | "anthropic" })
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
                placeholder="Your API key..."
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
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => setStep(1)}
              disabled={!settings.aiApiKey}
            >
              Next
              <ArrowRight className="ml-2 size-4" />
            </Button>
            <Button
              variant="ghost"
              className="w-full text-xs text-muted-foreground"
              onClick={handleFinish}
            >
              Skip for now
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>n8n Instance URL</Label>
              <Input
                type="url"
                placeholder="https://your-n8n.example.com"
                value={settings.n8nBaseUrl}
                onChange={(e) => updateSettings({ n8nBaseUrl: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>n8n API Key</Label>
              <Input
                type="password"
                placeholder="n8n API key..."
                value={settings.n8nApiKey}
                onChange={(e) => updateSettings({ n8nApiKey: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleTestN8n}
                disabled={!settings.n8nBaseUrl || !settings.n8nApiKey || testing}
                className="flex-1"
              >
                {testing && <Loader2 className="mr-2 size-3 animate-spin" />}
                {testResult === "success" && (
                  <CheckCircle2 className="mr-2 size-3 text-green-500" />
                )}
                Test Connection
              </Button>
            </div>
            {testResult === "error" && (
              <p className="text-xs text-destructive">
                Could not connect. Check URL and API key.
              </p>
            )}
            <Button
              className="w-full"
              onClick={handleFinish}
              disabled={!settings.n8nBaseUrl || !settings.n8nApiKey}
            >
              Get Started
            </Button>
            <Button
              variant="ghost"
              className="w-full text-xs text-muted-foreground"
              onClick={handleFinish}
            >
              Skip for now
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
