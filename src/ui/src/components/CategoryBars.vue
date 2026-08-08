<script setup lang="ts">
import { computed } from "vue";
import type { CategoryAggregate, IssueCategory } from "../api/types";

const props = defineProps<{
  aggregates: CategoryAggregate[];
}>();

const CATEGORY_ORDER: IssueCategory[] = [
  "qualification",
  "objection_handling",
  "tone",
  "booking_flow",
  "follow_up",
  "policy_violation",
];

const CATEGORY_LABELS: Record<IssueCategory, string> = {
  qualification: "Missed qualification",
  objection_handling: "Poor objection handling",
  tone: "Off-brand tone",
  booking_flow: "Incomplete booking flow",
  follow_up: "Weak follow-up",
  policy_violation: "Policy violation",
};

const rows = computed(() => {
  const byCategory = new Map(props.aggregates.map((a) => [a.category, a]));
  const max = Math.max(1, ...props.aggregates.map((a) => a.count));
  return CATEGORY_ORDER.map((category, i) => {
    const agg = byCategory.get(category);
    return {
      category,
      label: CATEGORY_LABELS[category],
      count: agg?.count ?? 0,
      callCount: agg?.callCount ?? 0,
      widthPct: agg ? Math.max(4, (agg.count / max) * 100) : 0,
      colorVar: `var(--cat-${i + 1})`,
    };
  });
});
</script>

<template>
  <div class="category-bars">
    <div v-if="aggregates.length === 0" class="muted">No issues recorded yet.</div>
    <div v-for="row in rows" v-else :key="row.category" class="row">
      <div class="row-label secondary">{{ row.label }}</div>
      <div class="track">
        <div
          v-if="row.count > 0"
          class="fill"
          :style="{ width: row.widthPct + '%', background: row.colorVar }"
        />
      </div>
      <div class="row-value">
        {{ row.count }}
        <span v-if="row.count > 0" class="muted">/ {{ row.callCount }} call(s)</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.category-bars {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.row {
  display: grid;
  grid-template-columns: 180px 1fr 140px;
  align-items: center;
  gap: var(--space-3);
}

.row-label {
  font-size: 13px;
}

.track {
  height: 16px;
  background: var(--gridline);
  border-radius: 4px;
  overflow: hidden;
}

.fill {
  height: 100%;
  border-radius: 4px;
  min-width: 6px;
}

.row-value {
  font-size: 12px;
  white-space: nowrap;
}
</style>
