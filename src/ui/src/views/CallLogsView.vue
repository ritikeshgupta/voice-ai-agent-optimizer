<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { api } from "../api/client";
import type { CallLogRecord, Issue } from "../api/types";
import Badge from "../components/Badge.vue";

const props = defineProps<{ agentId: string }>();

const callLogs = ref<CallLogRecord[]>([]);
const issues = ref<Issue[]>([]);
const expandedId = ref<string | null>(null);
const busy = ref<"" | "syncing" | "analyzing">("");
const message = ref("");

async function load() {
  const [logs, issueData] = await Promise.all([api.listCallLogs(props.agentId), api.getIssues(props.agentId)]);
  callLogs.value = logs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  issues.value = issueData.issues;
}

watch(() => props.agentId, load, { immediate: true });

function issuesFor(callLogId: string): Issue[] {
  return issues.value.filter((i) => i.callLogId === callLogId);
}

async function syncFromHighLevel() {
  busy.value = "syncing";
  message.value = "";
  try {
    const { pulled } = await api.syncCallLogs(props.agentId);
    message.value = `Pulled ${pulled} real call(s) from the Call Logs API.`;
    await load();
  } finally {
    busy.value = "";
  }
}

async function analyze() {
  busy.value = "analyzing";
  message.value = "";
  try {
    const { callsAnalyzed, issuesFound } = await api.analyzeCallLogs(props.agentId);
    message.value = `Analyzed ${callsAnalyzed} call(s), found ${issuesFound} issue(s).`;
    await load();
  } finally {
    busy.value = "";
  }
}

const severityTone = (s: Issue["severity"]) => (s === "high" ? "critical" : s === "medium" ? "warning" : "good");
</script>

<template>
  <div class="call-logs">
    <div class="toolbar">
      <button :disabled="!!busy" @click="syncFromHighLevel">
        {{ busy === "syncing" ? "Syncing..." : "Sync real calls from HighLevel" }}
      </button>
      <button :disabled="!!busy" @click="analyze">
        {{ busy === "analyzing" ? "Analyzing..." : "Analyze unprocessed calls" }}
      </button>
      <span v-if="message" class="muted">{{ message }}</span>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Source</th>
            <th>Summary</th>
            <th>Duration</th>
            <th>Issues</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="log in callLogs" :key="log.id">
            <tr class="row" @click="expandedId = expandedId === log.id ? null : log.id">
              <td class="muted">{{ expandedId === log.id ? "−" : "+" }}</td>
              <td><Badge :label="log.source" :tone="log.source === 'real' ? 'good' : 'neutral'" /></td>
              <td>{{ log.summary || "(no summary)" }}</td>
              <td class="secondary">{{ log.durationSec ? `${log.durationSec}s` : "—" }}</td>
              <td>
                <span v-if="issuesFor(log.id).length === 0" class="muted">none</span>
                <Badge
                  v-for="issue in issuesFor(log.id)"
                  :key="issue.id"
                  :label="issue.category"
                  :tone="severityTone(issue.severity)"
                  style="margin-right: 4px"
                />
              </td>
              <td class="secondary">{{ new Date(log.createdAt).toLocaleString() }}</td>
            </tr>
            <tr v-if="expandedId === log.id" class="expanded-row">
              <td colspan="6">
                <pre class="transcript">{{ log.transcript }}</pre>
                <div v-if="issuesFor(log.id).length" class="issue-list">
                  <div v-for="issue in issuesFor(log.id)" :key="issue.id" class="issue-item">
                    <Badge :label="issue.category" :tone="severityTone(issue.severity)" />
                    <span class="secondary">{{ issue.explanation }}</span>
                    <blockquote v-if="issue.evidenceQuote" class="muted">"{{ issue.evidenceQuote }}"</blockquote>
                  </div>
                </div>
              </td>
            </tr>
          </template>
          <tr v-if="callLogs.length === 0">
            <td colspan="6" class="muted">No call logs yet -- sync from HighLevel or run the seed script.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.call-logs {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.row {
  cursor: pointer;
}

.row:hover {
  background: var(--page-plane);
}

.expanded-row td {
  background: var(--page-plane);
}

.transcript {
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  margin: 0 0 var(--space-3) 0;
  color: var(--text-secondary);
}

.issue-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.issue-item blockquote {
  margin: 4px 0 0 0;
  padding-left: var(--space-3);
  border-left: 2px solid var(--gridline);
}
</style>
