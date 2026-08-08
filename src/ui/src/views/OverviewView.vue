<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { api } from "../api/client";
import type { CallLogRecord, CategoryAggregate, RecommendationRecord, TestCaseRecord } from "../api/types";
import StatTile from "../components/StatTile.vue";
import CategoryBars from "../components/CategoryBars.vue";

const props = defineProps<{ agentId: string }>();

const callLogs = ref<CallLogRecord[]>([]);
const aggregates = ref<CategoryAggregate[]>([]);
const testCases = ref<TestCaseRecord[]>([]);
const recommendations = ref<RecommendationRecord[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const [logs, issues, cases, recs] = await Promise.all([
      api.listCallLogs(props.agentId),
      api.getIssues(props.agentId),
      api.listTestCases(props.agentId),
      api.listRecommendations(props.agentId),
    ]);
    callLogs.value = logs;
    aggregates.value = issues.aggregates;
    testCases.value = cases;
    recommendations.value = recs;
  } finally {
    loading.value = false;
  }
}

watch(() => props.agentId, load, { immediate: true });
defineExpose({ reload: load });

const realCount = computed(() => callLogs.value.filter((c) => c.source === "real").length);
const syntheticCount = computed(() => callLogs.value.filter((c) => c.source === "synthetic").length);

const latestRunPerCase = computed(() =>
  testCases.value.map((tc) => tc.runs[0]).filter((r): r is NonNullable<typeof r> => !!r)
);
const passedCount = computed(() => latestRunPerCase.value.filter((r) => r.passed).length);

const appliedCount = computed(() => recommendations.value.filter((r) => r.status === "applied").length);
</script>

<template>
  <div class="overview">
    <div class="tiles">
      <StatTile
        label="Calls ingested"
        :value="callLogs.length"
        :subtitle="`${realCount} real · ${syntheticCount} synthetic`"
      />
      <StatTile label="Issues found" :value="aggregates.reduce((sum, a) => sum + a.count, 0)" />
      <StatTile
        label="Test cases"
        :value="testCases.length"
        :subtitle="latestRunPerCase.length ? `${passedCount}/${latestRunPerCase.length} passing` : 'not yet run'"
      />
      <StatTile
        label="Recommendations"
        :value="recommendations.length"
        :subtitle="`${appliedCount} applied`"
      />
    </div>

    <div class="card">
      <h3>Recurring issues by category</h3>
      <p class="muted">Aggregated across every analyzed call for this agent.</p>
      <CategoryBars :aggregates="aggregates" />
    </div>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.tiles {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
}

h3 {
  margin: 0 0 var(--space-1) 0;
}

.card p {
  margin-top: 0;
}
</style>
