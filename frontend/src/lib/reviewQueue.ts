import type { Grade } from '@/contracts';

// docs/studysheet-build-prompt.md §5: "sessions... offline-tolerant
// queueing" — a grade tapped on a spotty connection (a bus ride is the
// spec's own example) must never be silently lost. Pure queue operations
// (testable without a browser or localStorage) plus a thin persistence
// wrapper around them.
export interface QueuedGrade {
  id: string;
  cardId: string;
  grade: Grade;
  msTaken: number;
  queuedAt: number;
}

export function addToQueue(queue: QueuedGrade[], item: QueuedGrade): QueuedGrade[] {
  return [...queue, item];
}

export function removeFromQueue(queue: QueuedGrade[], id: string): QueuedGrade[] {
  return queue.filter((item) => item.id !== id);
}

const STORAGE_KEY = 'studysheet:review-queue';

export function loadQueue(): QueuedGrade[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedGrade[]) : [];
  } catch {
    // Corrupted storage shouldn't crash the review session — worst case, a
    // handful of past grades are lost, not the ability to keep studying.
    return [];
  }
}

export function saveQueue(queue: QueuedGrade[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

// Submits every queued grade in order; a grade that fails (still offline,
// or a transient error) stays queued for the next flush attempt, and
// everything queued *after* it is left alone too — grading order matters
// for SM-2's interval math (each grade depends on the card's state as of
// the previous one), so this must not reorder or skip ahead on a failure.
export async function flushQueue(
  queue: QueuedGrade[],
  submit: (item: QueuedGrade) => Promise<void>,
): Promise<QueuedGrade[]> {
  let remaining = queue;
  for (const item of queue) {
    if (!remaining.some((q) => q.id === item.id)) continue;
    try {
      await submit(item);
      remaining = removeFromQueue(remaining, item.id);
    } catch {
      break;
    }
  }
  return remaining;
}
