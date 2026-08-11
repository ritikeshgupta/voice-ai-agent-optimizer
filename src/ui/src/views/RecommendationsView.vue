<script setup lang="ts">
import { ref, watch } from "vue";
import { api } from "../api/client";
import type { RecommendationCategory, RecommendationRecord } from "../api/types";
import Badge from "../components/Badge.vue";

const props = defineProps<{ agentId: string }>();

const recommendations = ref<RecommendationRecord[]>([]);
const generating = ref(false);
const applyingId = ref<string | null>(null);
const dismissingId = ref<string | null>(null);
const error = ref("");

async function load() {
  recommendations.value = await api.listRecommendations(props.agentId);
}

watch(() => props.agentId, load, { immediate: true });

async function generate() {
  generating.value = true;
  error.value = "";
  try {
    await api.generateRecommendations(props.agentId);
    await load();
  } finally {
    generating.value = false;
  }
}

async function apply(rec: RecommendationRecord) {
  applyingId.value = rec.id;
  error.value = "";
  try {
    await api.applyRecommendation(rec.id);
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    applyingId.value = null;
  }
}

async function dismiss(rec: RecommendationRecord) {
  dismissingId.value = rec.id;
  error.value = "";
  try {
    await api.dismissRecommendation(rec.id);
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    dismissingId.value = null;
  }
}

const CATEGORY_LABELS: Record<RecommendationCategory, string> = {
  prompt: "Prompt",
  actions: "Actions",
  knowledge_base: "Knowledge base",
  guardrails: "Guardrails",
  model: "Model",
  temperature: "Temperature",
};
</script>

<template>
  <div class="recommendations">
    <div class="toolbar">
      <button :disabled="generating" @click="generate">
        {{ generating ? "Generating..." : "Generate recommendations" }}
      </button>
      <span v-if="error" class="muted" style="color: var(--status-critical)">{{ error }}</span>
    </div>

    <div v-if="recommendations.length === 0" class="card muted">
      No recommendations yet -- analyze some calls and run test cases first so there's evidence to reason from.
    </div>

    <div v-for="rec in recommendations" :key="rec.id" class="card recommendation">
      <div class="rec-header">
        <Badge :label="CATEGORY_LABELS[rec.category]" tone="neutral" />
        <Badge v-if="!rec.appliesViaApi" label="advisory only" tone="warning" />
        <Badge v-else-if="rec.status === 'applied'" label="applied" tone="good" />
        <span class="spacer" />
      </div>

      <p class="reasoning">{{ rec.reasoning }}</p>
      <ul class="evidence muted">
        <li v-for="(e, i) in rec.evidence" :key="i">{{ e }}</li>
      </ul>

      <div class="diff">
        <div v-if="rec.beforeValue" class="diff-block before">
          <div class="diff-label">Before</div>
          <pre>{{ rec.beforeValue }}</pre>
        </div>
        <div class="diff-block after">
          <div class="diff-label">After</div>
          <pre>{{ rec.afterValue }}</pre>
        </div>
      </div>

      <div class="actions">
        <button
          v-if="rec.appliesViaApi && rec.status === 'suggested'"
          class="primary"
          :disabled="applyingId === rec.id"
          @click="apply(rec)"
        >
          {{ applyingId === rec.id ? "Applying..." : "Apply to agent" }}
        </button>
        <span v-else-if="!rec.appliesViaApi" class="muted">
          HighLevel's public API has no lever for this category -- advisory only.
        </span>
        <button
          v-if="rec.status === 'suggested'"
          :disabled="dismissingId === rec.id"
          @click="dismiss(rec)"
        >
          {{ dismissingId === rec.id ? "Dismissing..." : "Dismiss" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recommendations {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.recommendation {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.rec-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.reasoning {
  margin: 0;
  font-size: 14px;
}

.evidence {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
}

.diff {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.diff-block {
  background: var(--page-plane);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
}

.diff-block.before {
  border-left: 3px solid var(--status-critical);
}

.diff-block.after {
  border-left: 3px solid var(--status-good);
}

.diff-label {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.diff-block pre {
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  margin: 0;
  max-height: 240px;
  overflow-y: auto;
}
</style>
