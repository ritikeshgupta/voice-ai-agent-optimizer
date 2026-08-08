import { db } from "./index";
import type { GHLAgent, GHLAgentAction } from "../types";

export interface AgentRecord {
  id: string;
  agentName: string;
  businessName: string | null;
  agentPrompt: string;
  actions: GHLAgentAction[];
  raw: GHLAgent;
  updatedAt: string;
}

interface AgentRow {
  id: string;
  agent_name: string;
  business_name: string | null;
  agent_prompt: string;
  actions_json: string;
  raw_json: string;
  updated_at: string;
}

const upsertStmt = db.prepare(`
  INSERT INTO agents (id, agent_name, business_name, agent_prompt, actions_json, raw_json, updated_at)
  VALUES (@id, @agentName, @businessName, @agentPrompt, @actionsJson, @rawJson, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    agent_name = excluded.agent_name,
    business_name = excluded.business_name,
    agent_prompt = excluded.agent_prompt,
    actions_json = excluded.actions_json,
    raw_json = excluded.raw_json,
    updated_at = excluded.updated_at
`);

export function upsertAgent(agent: GHLAgent): void {
  upsertStmt.run({
    id: agent.id,
    agentName: agent.agentName,
    businessName: agent.businessName ?? null,
    agentPrompt: agent.agentPrompt,
    actionsJson: JSON.stringify(agent.actions ?? []),
    rawJson: JSON.stringify(agent),
    updatedAt: new Date().toISOString(),
  });
}

const getStmt = db.prepare(`SELECT * FROM agents WHERE id = ?`);

export function getAgent(id: string): AgentRecord | null {
  const row = getStmt.get(id) as AgentRow | undefined;
  return row ? rowToRecord(row) : null;
}

const listStmt = db.prepare(`SELECT * FROM agents ORDER BY agent_name`);

export function listStoredAgents(): AgentRecord[] {
  return (listStmt.all() as unknown as AgentRow[]).map(rowToRecord);
}

function rowToRecord(row: AgentRow): AgentRecord {
  return {
    id: row.id,
    agentName: row.agent_name,
    businessName: row.business_name,
    agentPrompt: row.agent_prompt,
    actions: JSON.parse(row.actions_json),
    raw: JSON.parse(row.raw_json),
    updatedAt: row.updated_at,
  };
}
