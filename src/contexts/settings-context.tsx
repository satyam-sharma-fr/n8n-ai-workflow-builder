"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface AppSettings {
  // AI
  aiProvider: "gateway" | "openai" | "anthropic";
  aiApiKey: string;
  aiModel: string;
  // n8n
  n8nBaseUrl: string;
  n8nApiKey: string;
}

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  isConfigured: boolean;
  isAiConfigured: boolean;
  isN8nConfigured: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  aiProvider: "gateway",
  aiApiKey: "",
  aiModel: "openai/gpt-4o",
  n8nBaseUrl: "",
  n8nApiKey: "",
};

const STORAGE_KEY = "n8n-ai-settings";

const SettingsContext = createContext<SettingsContextValue | null>(null);

function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: AppSettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // quota exceeded or private browsing
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setMounted(true);
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        saveSettings(next);
        return next;
      });
    },
    []
  );

  const isAiConfigured = mounted && settings.aiApiKey.length > 0;
  const isN8nConfigured =
    mounted && settings.n8nBaseUrl.length > 0 && settings.n8nApiKey.length > 0;
  const isConfigured = isAiConfigured && isN8nConfigured;

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      updateSettings,
      isConfigured,
      isAiConfigured,
      isN8nConfigured,
    }),
    [settings, updateSettings, isConfigured, isAiConfigured, isN8nConfigured]
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return ctx;
}
