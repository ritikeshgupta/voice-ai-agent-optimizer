-- Cached snapshot of a HighLevel Voice AI agent, refreshed from the real Agents API.
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  business_name TEXT,
  agent_prompt TEXT NOT NULL,
  actions_json TEXT NOT NULL DEFAULT '[]',
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Ingested calls, either pulled for real from the Call Logs API or synthetically generated
-- to backfill history. `source` must never be silently reclassified from synthetic to real.
CREATE TABLE IF NOT EXISTS call_logs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  transcript TEXT NOT NULL,
  summary TEXT,
  source TEXT NOT NULL CHECK (source IN ('real', 'synthetic')),
  duration_sec INTEGER,
  created_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_call_logs_agent ON call_logs(agent_id);

-- Findings from the analyze loop, one row per detected issue in a call.
CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_log_id TEXT NOT NULL REFERENCES call_logs(id),
  category TEXT NOT NULL CHECK (
    category IN ('qualification', 'objection_handling', 'tone', 'booking_flow', 'follow_up', 'policy_violation')
  ),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  evidence_quote TEXT,
  explanation TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_issues_call_log ON issues(call_log_id);

-- Generated test cases with structured (machine-checkable) success criteria.
CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  title TEXT NOT NULL,
  scenario_type TEXT NOT NULL CHECK (scenario_type IN ('happy_path', 'edge_case')),
  persona_prompt TEXT NOT NULL,
  success_criteria_json TEXT NOT NULL,
  source_issue_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_test_cases_agent ON test_cases(agent_id);

-- One row per test case execution, simulated (LLM-vs-LLM) or a real trial call.
CREATE TABLE IF NOT EXISTS test_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_case_id TEXT NOT NULL REFERENCES test_cases(id),
  mode TEXT NOT NULL CHECK (mode IN ('simulated', 'real_call')),
  transcript TEXT NOT NULL,
  criteria_results_json TEXT NOT NULL,
  passed INTEGER NOT NULL,
  run_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_test_runs_test_case ON test_runs(test_case_id);

-- Optimization recommendations. `applies_via_api` is false for categories HighLevel's
-- public API has no lever for (model, temperature) -- those stay advisory-only.
CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  category TEXT NOT NULL CHECK (
    category IN ('prompt', 'actions', 'knowledge_base', 'guardrails', 'model', 'temperature')
  ),
  applies_via_api INTEGER NOT NULL,
  before_value TEXT,
  after_value TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'applied', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recommendations_agent ON recommendations(agent_id);
