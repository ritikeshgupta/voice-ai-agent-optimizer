<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "./api/client";
import type { AgentRecord } from "./api/types";
import OverviewView from "./views/OverviewView.vue";
import CallLogsView from "./views/CallLogsView.vue";
import TestCasesView from "./views/TestCasesView.vue";
import RecommendationsView from "./views/RecommendationsView.vue";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "call-logs", label: "Call Logs & Issues" },
  { key: "test-cases", label: "Test Cases" },
  { key: "recommendations", label: "Recommendations" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const agents = ref<AgentRecord[]>([]);
const selectedAgentId = ref<string>("");
const activeTab = ref<TabKey>("overview");
const syncing = ref(false);

const selectedAgent = computed(() => agents.value.find((a) => a.id === selectedAgentId.value) ?? null);

async function loadAgents() {
  agents.value = await api.listAgents();
  if (!selectedAgentId.value && agents.value.length > 0) {
    selectedAgentId.value = agents.value[0].id;
  }
}

async function syncAgents() {
  syncing.value = true;
  try {
    agents.value = await api.syncAgents();
    if (!selectedAgentId.value && agents.value.length > 0) {
      selectedAgentId.value = agents.value[0].id;
    }
  } finally {
    syncing.value = false;
  }
}

onMounted(loadAgents);
</script>

<template>
  <div class="shell">
    <header>
      <div class="title">
        <strong>Voice AI Agent Optimizer</strong>
        <span class="muted">Analyze &middot; Generate Tests &middot; Recommend</span>
      </div>
      <div class="agent-controls">
        <select v-model="selectedAgentId">
          <option v-if="agents.length === 0" value="">No agents cached</option>
          <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.agentName }}</option>
        </select>
        <button :disabled="syncing" @click="syncAgents">
          {{ syncing ? "Syncing..." : "Sync agents from HighLevel" }}
        </button>
      </div>
    </header>

    <nav v-if="selectedAgent" class="tabs">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </nav>

    <main>
      <div v-if="!selectedAgent" class="card muted">
        No agent cached locally yet. Click "Sync agents from HighLevel" once the sandbox PIT and
        location id are configured on the server.
      </div>
      <template v-else>
        <OverviewView v-if="activeTab === 'overview'" :agent-id="selectedAgent.id" />
        <CallLogsView v-else-if="activeTab === 'call-logs'" :agent-id="selectedAgent.id" />
        <TestCasesView v-else-if="activeTab === 'test-cases'" :agent-id="selectedAgent.id" />
        <RecommendationsView v-else :agent-id="selectedAgent.id" />
      </template>
    </main>
  </div>
</template>

<style scoped>
.shell {
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.title strong {
  font-size: 18px;
}

.agent-controls {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.tabs {
  display: flex;
  gap: var(--space-2);
  border-bottom: 1px solid var(--gridline);
  padding-bottom: var(--space-2);
}

.tabs button {
  border: none;
  background: transparent;
  padding: 6px 4px;
  color: var(--text-muted);
}

.tabs button.active {
  color: var(--text-primary);
  border-bottom: 2px solid var(--cat-1);
  border-radius: 0;
}
</style>
