import { api } from "../api";
import { ipcErrorMessage } from "./errors";
import type { SearchResultItem } from "../types/shared";

export function suggestionKey(item: Pick<SearchResultItem, "externalSource" | "externalId">): string {
  return `${item.externalSource}-${item.externalId}`;
}

export interface AddQueueSnapshot {
  queuedKeys: string[];
  addingKey: string | null;
  pending: number;
  completed: number;
  lastError: string | null;
  lastCompletedKey: string | null;
}

type Listener = () => void;

const listeners = new Set<Listener>();
const queue: SearchResultItem[] = [];
let current: SearchResultItem | null = null;
let pumping = false;
let completed = 0;
let lastError: string | null = null;
let lastCompletedKey: string | null = null;

let snapshot: AddQueueSnapshot = {
  queuedKeys: [],
  addingKey: null,
  pending: 0,
  completed: 0,
  lastError: null,
  lastCompletedKey: null,
};

function emit() {
  snapshot = {
    queuedKeys: queue.map(suggestionKey),
    addingKey: current ? suggestionKey(current) : null,
    pending: queue.length + (current ? 1 : 0),
    completed,
    lastError,
    lastCompletedKey,
  };
  for (const listener of listeners) listener();
}

export function subscribeAddQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAddQueueSnapshot(): AddQueueSnapshot {
  return snapshot;
}

function alreadyTracked(key: string): boolean {
  if (current && suggestionKey(current) === key) return true;
  return queue.some((item) => suggestionKey(item) === key);
}

export function enqueueAdd(item: SearchResultItem): boolean {
  const key = suggestionKey(item);
  if (alreadyTracked(key)) return false;
  lastError = null;
  queue.push(item);
  emit();
  void pump();
  return true;
}

async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length > 0) {
    current = queue.shift() ?? null;
    if (!current) break;
    lastError = null;
    emit();
    const key = suggestionKey(current);
    try {
      await api().add.fromSearchResult(current);
      lastCompletedKey = key;
      completed += 1;
    } catch (err) {
      lastError = ipcErrorMessage(err);
      lastCompletedKey = null;
    }
    current = null;
    emit();
  }
  pumping = false;
}
