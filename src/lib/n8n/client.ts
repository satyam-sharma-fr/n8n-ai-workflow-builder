import type { N8nExecution, N8nWorkflow } from "./types";

export class N8nClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(baseUrl: string, apiKey: string, timeout = 10000) {
    // Remove trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.timeout = timeout;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "X-N8N-API-KEY": this.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...options.headers,
        },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `n8n API error ${res.status}: ${res.statusText}${body ? ` - ${body}` : ""}`
        );
      }

      return res.json() as Promise<T>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── Workflows ───────────────────────────────────────────

  async listWorkflows(params?: {
    limit?: number;
    active?: boolean;
  }): Promise<{ data: N8nWorkflow[]; nextCursor?: string }> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.active !== undefined)
      searchParams.set("active", String(params.active));
    const qs = searchParams.toString();
    return this.request(`/workflows${qs ? `?${qs}` : ""}`);
  }

  async getWorkflow(id: string): Promise<N8nWorkflow> {
    return this.request(`/workflows/${id}`);
  }

  async createWorkflow(
    data: Omit<N8nWorkflow, "id" | "active" | "createdAt" | "updatedAt">
  ): Promise<N8nWorkflow> {
    // n8n API v1 treats 'active' as read-only on create, so we strip it
    const { active: _active, ...rest } = data as Record<string, unknown>;
    return this.request("/workflows", {
      method: "POST",
      body: JSON.stringify(rest),
    });
  }

  async updateWorkflow(
    id: string,
    data: Partial<N8nWorkflow>
  ): Promise<N8nWorkflow> {
    // n8n PUT requires the full workflow body, so fetch first and merge
    const existing = await this.getWorkflow(id);
    const merged = {
      name: data.name ?? existing.name,
      nodes: data.nodes ?? existing.nodes,
      connections: data.connections ?? existing.connections,
      settings: data.settings ?? existing.settings ?? {},
    };
    return this.request(`/workflows/${id}`, {
      method: "PUT",
      body: JSON.stringify(merged),
    });
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.request(`/workflows/${id}`, { method: "DELETE" });
  }

  async activateWorkflow(id: string, active: boolean): Promise<N8nWorkflow> {
    // Use n8n's dedicated activation endpoints (no body required)
    const endpoint = active
      ? `/workflows/${id}/activate`
      : `/workflows/${id}/deactivate`;
    return this.request(endpoint, { method: "POST" });
  }

  // ── Executions ──────────────────────────────────────────

  async listExecutions(params?: {
    workflowId?: string;
    limit?: number;
    status?: string;
  }): Promise<{ data: N8nExecution[]; nextCursor?: string }> {
    const searchParams = new URLSearchParams();
    if (params?.workflowId)
      searchParams.set("workflowId", params.workflowId);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.status) searchParams.set("status", params.status);
    searchParams.set("includeData", "true");
    const qs = searchParams.toString();
    return this.request(`/executions${qs ? `?${qs}` : ""}`);
  }

  async getExecution(id: string): Promise<N8nExecution> {
    return this.request(`/executions/${id}?includeData=true`);
  }

  // ── Health ──────────────────────────────────────────────

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.listWorkflows({ limit: 1 });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }
}

export function createN8nClient(baseUrl: string, apiKey: string): N8nClient {
  return new N8nClient(baseUrl, apiKey);
}
