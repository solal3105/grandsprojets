<template>
  <article class="bg-white rounded-2xl border border-gray-border p-6 sm:p-8">
    <slot />
  </article>
</template>

<style scoped>
/* Steps */
:deep(.steps) {
  counter-reset: step;
  list-style: none;
  padding: 0;
}
:deep(.steps li) {
  position: relative;
  padding: 0 0 18px 44px;
  font-size: 14px;
  line-height: 1.65;
  color: #555;
}
:deep(.steps li:last-child) { padding-bottom: 0; }
:deep(.steps li::before) {
  counter-increment: step;
  content: counter(step);
  position: absolute;
  left: 0; top: 0;
  width: 28px; height: 28px;
  border-radius: 50%;
  background: #FF0037;
  color: white;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
:deep(.steps li::after) {
  content: '';
  position: absolute;
  left: 13px; top: 32px;
  width: 2px; bottom: 4px;
  background: rgba(0,0,0,0.06);
}
:deep(.steps li:last-child::after) { display: none; }
:deep(.steps li strong) { color: #111; }

/* Info blocks */
:deep(.tip), :deep(.info), :deep(.warn) {
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.6;
}
:deep(.tip) { background: rgba(90,171,125,0.08); color: #3d7a56; }
:deep(.info) { background: rgba(37,99,235,0.06); color: #1e40af; }
:deep(.warn) { background: rgba(255,0,55,0.06); color: #b91c1c; }

/* Details */
:deep(details summary) { list-style: none; }
:deep(details summary::-webkit-details-marker) { display: none; }
:deep(details[open] summary) { margin-bottom: 4px; }

:deep(code) {
  background: rgba(0,0,0,0.04);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
}

:deep(table) {
  @apply w-full text-sm border-collapse;
}
:deep(thead tr) {
  @apply bg-gray-50;
}
:deep(thead th) {
  @apply text-left p-2;
}
:deep(thead th:first-child) {
  @apply rounded-l-lg;
}
:deep(thead th:last-child) {
  @apply rounded-r-lg;
}
:deep(tbody tr) {
  @apply border-b border-gray-100;
}
:deep(tbody tr:last-child) {
  @apply border-b-0;
}
:deep(tbody td) {
  @apply p-2;
}
:deep(tbody td.font-medium) {
  font-weight: 500;
}

:deep(ul) {
  @apply list-disc pl-5 space-y-1;
}

:deep(h2) {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1.25rem;
  color: var(--color-dark);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
}
:deep(h3) {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-dark);
}
:deep(p.text-sm) {
  font-size: 0.875rem;
  color: var(--color-gray-text);
}
</style>
