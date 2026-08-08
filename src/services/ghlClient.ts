import type { GHLAgent, GHLCallLog } from "../types";

const BASE_URL = process.env.GHL_API_DOMAIN || "https://services.leadconnectorhq.com";
const API_VERSION = process.env.GHL_API_VERSION || "v3";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name} -- see .env.example`);
  }
  return value;
}

async function ghlFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const pit = requireEnv("GHL_PIT");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${pit}`,
      Version: API_VERSION,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HighLevel API ${init.method || "GET"} ${path} -> ${res.status}: ${body}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export interface ListCallLogsParams {
  agentId?: string;
  callType?: "LIVE" | "TRIAL";
  startDate?: number;
  endDate?: number;
  page?: number;
  pageSize?: number;
}

export const ghlClient = {
  async listAgents(): Promise<GHLAgent[]> {
    const locationId = requireEnv("GHL_LOCATION_ID");
    const agents: GHLAgent[] = [];
    let page = 1;
    const pageSize = 50; // API max
    for (;;) {
      const data = await ghlFetch<{ total: number; agents: GHLAgent[] }>(
        `/voice-ai/agents?locationId=${encodeURIComponent(locationId)}&page=${page}&pageSize=${pageSize}`
      );
      agents.push(...data.agents);
      if (agents.length >= data.total || data.agents.length === 0) break;
      page += 1;
    }
    return agents;
  },

  async getAgent(agentId: string): Promise<GHLAgent> {
    const locationId = requireEnv("GHL_LOCATION_ID");
    return ghlFetch<GHLAgent>(
      `/voice-ai/agents/${agentId}?locationId=${encodeURIComponent(locationId)}`
    );
  },

  async patchAgent(agentId: string, patch: Partial<GHLAgent>): Promise<GHLAgent> {
    const locationId = requireEnv("GHL_LOCATION_ID");
    return ghlFetch<GHLAgent>(
      `/voice-ai/agents/${agentId}?locationId=${encodeURIComponent(locationId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      }
    );
  },

  async listCallLogs(params: ListCallLogsParams = {}): Promise<{
    // The real API returns `totalRecords`, not `total`, and omits `page`/`pageSize` entirely --
    // verified against the live sandbox, not just the OpenAPI spec (see SKILL.md).
    totalRecords: number;
    callLogs: GHLCallLog[];
  }> {
    const locationId = requireEnv("GHL_LOCATION_ID");
    const query = new URLSearchParams({ locationId });
    if (params.agentId) query.set("agentId", params.agentId);
    if (params.callType) query.set("callType", params.callType);
    if (params.startDate) query.set("startDate", String(params.startDate));
    if (params.endDate) query.set("endDate", String(params.endDate));
    query.set("page", String(params.page ?? 1));
    query.set("pageSize", String(params.pageSize ?? 50));

    return ghlFetch(`/voice-ai/dashboard/call-logs?${query.toString()}`);
  },

  async getCallLog(callId: string): Promise<GHLCallLog> {
    const locationId = requireEnv("GHL_LOCATION_ID");
    return ghlFetch<GHLCallLog>(
      `/voice-ai/dashboard/call-logs/${callId}?locationId=${encodeURIComponent(locationId)}`
    );
  },

  async createAction(agentId: string, action: {
    actionType: string;
    name: string;
    actionParameters: Record<string, unknown>;
  }): Promise<{ id: string; actionType: string; name: string; actionParameters: Record<string, unknown> }> {
    const locationId = requireEnv("GHL_LOCATION_ID");
    return ghlFetch(`/voice-ai/actions`, {
      method: "POST",
      body: JSON.stringify({ agentId, locationId, ...action }),
    });
  },
};
