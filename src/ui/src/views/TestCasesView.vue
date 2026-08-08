<script setup lang="ts">
import { ref, watch } from "vue";
import { api } from "../api/client";
import type { SuccessCriterion, TestCaseRecord } from "../api/types";
import Badge from "../components/Badge.vue";

const props = defineProps<{ agentId: string }>();

const testCases = ref<TestCaseRecord[]>([]);
const generating = ref(false);
const runningId = ref<string | null>(null);
const realCallDraftId = ref<string | null>(null);
const realCallTranscript = ref("");

async function load() {
  testCases.value = await api.listTestCases(props.agentId);
}

watch(() => props.agentId, load, { immediate: true });

async function generate() {
  generating.value = true;
  try {
    await api.generateTestCases(props.agentId, 8);
    await load();
  } finally {
    generating.value = false;
  }
}

async function runSimulated(testCaseId: string) {
  runningId.value = testCaseId;
  try {
    await api.runSimulatedTest(testCaseId);
    await load();
  } finally {
    runningId.value = null;
  }
}

async function submitRealCall(testCaseId: string) {
  if (!realCallTranscript.value.trim()) return;
  runningId.value = testCaseId;
  try {
    await api.recordRealCallTest(testCaseId, realCallTranscript.value);
    realCallDraftId.value = null;
    realCallTranscript.value = "";
    await load();
  } finally {
    runningId.value = null;
  }
}

function describeCriterion(c: SuccessCriterion): string {
  switch (c.type) {
    case "must_collect_field":
      return `Must collect: ${c.field}`;
    case "must_follow_booking_flow":
      return "Must follow booking flow";
    case "must_stay_on_brand":
      return "Must stay on-brand";
    case "must_handle_interruption_or_objection":
      return `Must handle objection: ${c.objection}`;
    case "must_not_claim":
      return `Must not claim: ${c.claim}`;
    case "must_offer_transfer_on":
      return `Must offer transfer on: ${c.trigger}`;
    case "custom":
      return c.description;
  }
}
</script>

<template>
  <div class="test-cases">
    <div class="toolbar">
      <button :disabled="generating" @click="generate">
        {{ generating ? "Generating..." : "Generate test cases" }}
      </button>
      <span class="muted">Simulated runs are LLM-vs-LLM. Real-call runs score a transcript you paste in.</span>
    </div>

    <div v-if="testCases.length === 0" class="card muted">
      No test cases yet -- generate some, ideally after analyzing a few calls so they target real issues.
    </div>

    <div v-for="tc in testCases" :key="tc.id" class="card test-case">
      <div class="tc-header">
        <Badge :label="tc.scenarioType === 'happy_path' ? 'happy path' : 'edge case'"
               :tone="tc.scenarioType === 'happy_path' ? 'good' : 'warning'" />
        <h4>{{ tc.title }}</h4>
      </div>
      <p class="secondary persona">{{ tc.personaPrompt }}</p>

      <div class="criteria">
        <div v-for="(c, i) in tc.successCriteria" :key="i" class="criterion">
          <Badge
            v-if="tc.runs[0]"
            :label="tc.runs[0].criteriaResults[i]?.passed ? 'pass' : 'fail'"
            :tone="tc.runs[0].criteriaResults[i]?.passed ? 'good' : 'critical'"
          />
          <Badge v-else label="not run" tone="neutral" />
          <span>{{ describeCriterion(c) }}</span>
        </div>
      </div>

      <div v-if="tc.runs[0]" class="last-run muted">
        Last run: {{ tc.runs[0].mode }}, {{ new Date(tc.runs[0].runAt).toLocaleString() }} --
        <strong :style="{ color: tc.runs[0].passed ? 'var(--status-good)' : 'var(--status-critical)' }">
          {{ tc.runs[0].passed ? "PASSED" : "FAILED" }}
        </strong>
      </div>

      <div class="actions">
        <button :disabled="runningId === tc.id" @click="runSimulated(tc.id)">
          {{ runningId === tc.id ? "Running..." : "Run simulated" }}
        </button>
        <button v-if="realCallDraftId !== tc.id" @click="realCallDraftId = tc.id">
          Record real call result
        </button>
      </div>

      <div v-if="realCallDraftId === tc.id" class="real-call-form">
        <textarea
          v-model="realCallTranscript"
          rows="4"
          placeholder="Paste the real call transcript pulled from the sandbox test-call feature..."
        />
        <div class="actions">
          <button class="primary" :disabled="runningId === tc.id" @click="submitRealCall(tc.id)">
            Score this transcript
          </button>
          <button @click="realCallDraftId = null">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.test-cases {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.test-case {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.tc-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.tc-header h4 {
  margin: 0;
}

.persona {
  margin: 0;
  font-size: 13px;
}

.criteria {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.criterion {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 13px;
}

.actions {
  display: flex;
  gap: var(--space-2);
}

.real-call-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.real-call-form textarea {
  width: 100%;
  resize: vertical;
}
</style>
