<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  subtitle?: string;
}>();
</script>

<template>
  <div class="stat-tile">
    <div class="label">{{ label }}</div>
    <div class="value">{{ value }}</div>
    <div v-if="subtitle" class="subtitle muted">{{ subtitle }}</div>
  </div>
</template>

<style scoped>
.stat-tile {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  min-width: 140px;
}

.label {
  color: var(--text-muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.value {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
  margin-top: var(--space-1);
}

.subtitle {
  font-size: 12px;
  margin-top: var(--space-1);
}
</style>
