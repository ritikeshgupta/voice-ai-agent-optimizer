import type {
  AgentRecord,
  CallLogRecord,
  CategoryAggregate,
  Issue,
  RecommendationRecord,
  TestCaseRecord,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });

export const api = {
  listAgents: () => request<AgentRecord[]>("/agents"),
  syncAgents: () => post<AgentRecord[]>("/agents/sync"),
  getAgent: (id: string) => request<AgentRecord>(`/agents/${id}`),

  listCallLogs: (agentId: string) => request<CallLogRecord[]>(`/agents/${agentId}/call-logs`),
  syncCallLogs: (agentId: string) => post<{ pulled: number }>(`/agents/${agentId}/call-logs/sync`),
  analyzeCallLogs: (agentId: string) =>
    post<{ callsAnalyzed: number; issuesFound: number }>(`/agents/${agentId}/call-logs/analyze`),
  getIssues: (agentId: string) =>
    request<{ aggregates: CategoryAggregate[]; issues: Issue[] }>(`/agents/${agentId}/call-logs/issues`),

  listTestCases: (agentId: string) => request<TestCaseRecord[]>(`/agents/${agentId}/test-cases`),
  generateTestCases: (agentId: string, count = 8) =>
    post<{ generated: number }>(`/agents/${agentId}/test-cases/generate`, { count }),
  runSimulatedTest: (testCaseId: string) => post(`/test-cases/${testCaseId}/run`),
  recordRealCallTest: (testCaseId: string, transcript: string) =>
    post(`/test-cases/${testCaseId}/record-real-call`, { transcript }),

  listRecommendations: (agentId: string) => request<RecommendationRecord[]>(`/agents/${agentId}/recommendations`),
  generateRecommendations: (agentId: string) =>
    post<{ generated: number }>(`/agents/${agentId}/recommendations/generate`),
  applyRecommendation: (id: string) => post<{ status: string }>(`/recommendations/${id}/apply`),
};
