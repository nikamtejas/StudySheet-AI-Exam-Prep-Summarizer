import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addToQueue, removeFromQueue, loadQueue, saveQueue, flushQueue, type QueuedGrade } from './reviewQueue';

function item(overrides: Partial<QueuedGrade> = {}): QueuedGrade {
  return { id: 'a', cardId: 'card-1', grade: 'good', msTaken: 1000, queuedAt: Date.now(), ...overrides };
}

// jsdom (this project's Node/jsdom version combination, confirmed directly)
// throws/leaves `window.localStorage` unusable regardless of the
// environment's configured origin — a minimal in-memory stand-in sidesteps
// that entirely rather than depending on jsdom's own Web Storage support.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => void store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe('addToQueue / removeFromQueue', () => {
  it('appends without mutating the original array', () => {
    const original: QueuedGrade[] = [];
    const next = addToQueue(original, item());
    expect(original).toHaveLength(0);
    expect(next).toHaveLength(1);
  });

  it('removes only the matching id', () => {
    const queue = [item({ id: 'a' }), item({ id: 'b' })];
    const next = removeFromQueue(queue, 'a');
    expect(next.map((i) => i.id)).toEqual(['b']);
  });
});

describe('localStorage persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  it('round-trips a queue through save/load', () => {
    const queue = [item({ id: 'a' }), item({ id: 'b', grade: 'again' })];
    saveQueue(queue);
    expect(loadQueue()).toEqual(queue);
  });

  it('returns an empty queue when nothing is stored', () => {
    expect(loadQueue()).toEqual([]);
  });

  it('returns an empty queue rather than throwing on corrupted storage', () => {
    window.localStorage.setItem('studysheet:review-queue', 'not valid json{{{');
    expect(loadQueue()).toEqual([]);
  });
});

describe('flushQueue', () => {
  it('removes every item that submits successfully', async () => {
    const queue = [item({ id: 'a' }), item({ id: 'b' })];
    const submitted: string[] = [];
    const remaining = await flushQueue(queue, async (i) => {
      submitted.push(i.id);
    });
    expect(remaining).toEqual([]);
    expect(submitted).toEqual(['a', 'b']);
  });

  it('stops at the first failure, leaving it and everything after it queued', async () => {
    const queue = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })];
    const submitted: string[] = [];
    const remaining = await flushQueue(queue, async (i) => {
      submitted.push(i.id);
      if (i.id === 'b') throw new Error('offline');
    });
    expect(submitted).toEqual(['a', 'b']);
    expect(remaining.map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('preserves grading order across a partial flush and retry — never reorders', async () => {
    const queue = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })];
    let attempt = 0;
    const submitted: string[] = [];
    const submit = async (i: QueuedGrade) => {
      attempt += 1;
      // 'b' fails only on the very first attempt across the whole run.
      if (i.id === 'b' && attempt === 2) throw new Error('offline');
      submitted.push(i.id);
    };

    const afterFirstFlush = await flushQueue(queue, submit);
    expect(submitted).toEqual(['a']);
    expect(afterFirstFlush.map((i) => i.id)).toEqual(['b', 'c']);

    const afterRetry = await flushQueue(afterFirstFlush, submit);
    expect(submitted).toEqual(['a', 'b', 'c']);
    expect(afterRetry).toEqual([]);
  });

  it('returns the original queue unchanged when everything fails', async () => {
    const queue = [item({ id: 'a' })];
    const remaining = await flushQueue(queue, async () => {
      throw new Error('offline');
    });
    expect(remaining).toEqual(queue);
  });
});
