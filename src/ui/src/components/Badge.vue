<script setup lang="ts">
type Tone = "good" | "warning" | "serious" | "critical" | "neutral";

defineProps<{
  label: string;
  tone: Tone;
}>();
</script>

<template>
  <span class="badge" :class="tone">
    <span class="dot" aria-hidden="true" />
    {{ label }}
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  background: var(--surface-1);
  white-space: nowrap;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
}

.good .dot {
  background: var(--status-good);
}
.warning .dot {
  background: var(--status-warning);
}
.serious .dot {
  background: var(--status-serious);
}
.critical .dot {
  background: var(--status-critical);
}
.neutral .dot {
  background: var(--text-muted);
}
</style>
