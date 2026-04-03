/**
 * In-memory Redis mock that implements the Upstash Redis API surface
 * used by the OPump netlify functions.
 */
import { vi } from 'vitest';

// Internal storage types
export type RedisValue = string | number | Map<string, string> | Set<string> | SortedSet;

interface SortedSetEntry {
  score: number;
  member: string;
}

class SortedSet {
  entries: SortedSetEntry[] = [];

  add(score: number, member: string): number {
    const idx = this.entries.findIndex(e => e.member === member);
    if (idx >= 0) {
      this.entries[idx].score = score;
      return 0;
    }
    this.entries.push({ score, member });
    return 1;
  }

  incrby(increment: number, member: string): number {
    const idx = this.entries.findIndex(e => e.member === member);
    if (idx >= 0) {
      this.entries[idx].score += increment;
      return this.entries[idx].score;
    }
    this.entries.push({ score: increment, member });
    return increment;
  }

  remove(member: string): number {
    const idx = this.entries.findIndex(e => e.member === member);
    if (idx >= 0) {
      this.entries.splice(idx, 1);
      return 1;
    }
    return 0;
  }

  score(member: string): number | null {
    const entry = this.entries.find(e => e.member === member);
    return entry ? entry.score : null;
  }

  card(): number {
    return this.entries.length;
  }

  range(start: number, stop: number, opts?: { rev?: boolean; withScores?: boolean; byLex?: boolean }): string[] {
    if (opts?.byLex) {
      return this.rangeByLex(start as unknown as string, stop as unknown as string);
    }

    const sorted = [...this.entries].sort((a, b) => a.score - b.score);
    const list = opts?.rev ? [...sorted].reverse() : sorted;

    const actualStop = stop < 0 ? list.length + stop : stop;
    const sliced = list.slice(start, actualStop + 1);

    if (opts?.withScores) {
      const result: string[] = [];
      for (const e of sliced) {
        result.push(e.member, String(e.score));
      }
      return result;
    }
    return sliced.map(e => e.member);
  }

  rangeByLex(min: string, max: string): string[] {
    const minVal = min.startsWith('[') ? min.slice(1) : min;
    const maxVal = max.startsWith('[') ? max.slice(1) : max;
    const sorted = [...this.entries].sort((a, b) => a.member.localeCompare(b.member));
    return sorted
      .filter(e => e.member >= minVal && e.member <= maxVal)
      .map(e => e.member);
  }

  rangeByScore(min: number, max: number): string[] {
    return this.entries
      .filter(e => e.score >= min && e.score <= max)
      .sort((a, b) => a.score - b.score)
      .map(e => e.member);
  }
}

// The mock Redis store
const store = new Map<string, RedisValue>();
const ttls = new Map<string, number>();

function getHash(key: string): Map<string, string> {
  let h = store.get(key);
  if (!h || !(h instanceof Map)) {
    h = new Map<string, string>();
    store.set(key, h);
  }
  return h as Map<string, string>;
}

function getSet(key: string): Set<string> {
  let s = store.get(key);
  if (!s || !(s instanceof Set)) {
    s = new Set<string>();
    store.set(key, s);
  }
  return s as Set<string>;
}

function getSortedSet(key: string): SortedSet {
  let ss = store.get(key);
  if (!ss || !(ss instanceof SortedSet)) {
    ss = new SortedSet();
    store.set(key, ss);
  }
  return ss as SortedSet;
}

// Pipeline class — queues commands and executes them
class MockPipeline {
  private commands: Array<() => Promise<unknown>> = [];

  hset(key: string, fields: Record<string, unknown>): this {
    this.commands.push(async () => mockRedis.hset(key, fields));
    return this;
  }

  hget(key: string, field: string): this {
    this.commands.push(async () => mockRedis.hget(key, field));
    return this;
  }

  hgetall(key: string): this {
    this.commands.push(async () => mockRedis.hgetall(key));
    return this;
  }

  hmget(key: string, ...fields: string[]): this {
    this.commands.push(async () => {
      const h = store.get(key);
      if (!h || !(h instanceof Map)) return fields.map(() => null);
      return fields.map(f => h.get(f) ?? null);
    });
    return this;
  }

  hdel(key: string, ...fields: string[]): this {
    this.commands.push(async () => {
      const h = store.get(key);
      if (!h || !(h instanceof Map)) return 0;
      let count = 0;
      for (const f of fields) {
        if (h.delete(f)) count++;
      }
      return count;
    });
    return this;
  }

  hincrby(key: string, field: string, increment: number): this {
    this.commands.push(async () => mockRedis.hincrby(key, field, increment));
    return this;
  }

  set(key: string, value: unknown, opts?: { nx?: boolean; ex?: number }): this {
    this.commands.push(async () => mockRedis.set(key, value, opts));
    return this;
  }

  get(key: string): this {
    this.commands.push(async () => mockRedis.get(key));
    return this;
  }

  incr(key: string): this {
    this.commands.push(async () => mockRedis.incr(key));
    return this;
  }

  expire(key: string, seconds: number): this {
    this.commands.push(async () => mockRedis.expire(key, seconds));
    return this;
  }

  del(key: string): this {
    this.commands.push(async () => mockRedis.del(key));
    return this;
  }

  zadd(key: string, entry: { score: number; member: string }): this {
    this.commands.push(async () => mockRedis.zadd(key, entry));
    return this;
  }

  zrange(key: string, start: unknown, stop: unknown, opts?: Record<string, unknown>): this {
    this.commands.push(async () => mockRedis.zrange(key, start, stop, opts));
    return this;
  }

  zrem(key: string, member: string): this {
    this.commands.push(async () => mockRedis.zrem(key, member));
    return this;
  }

  zscore(key: string, member: string): this {
    this.commands.push(async () => mockRedis.zscore(key, member));
    return this;
  }

  sadd(key: string, ...members: string[]): this {
    this.commands.push(async () => mockRedis.sadd(key, ...members));
    return this;
  }

  srem(key: string, ...members: string[]): this {
    this.commands.push(async () => {
      const s = store.get(key);
      if (!s || !(s instanceof Set)) return 0;
      let count = 0;
      for (const m of members) {
        if (s.delete(m)) count++;
      }
      return count;
    });
    return this;
  }

  eval(script: string, keys: string[], args: (string | number)[]): this {
    this.commands.push(async () => mockRedis.eval(script, keys, args));
    return this;
  }

  async exec(): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const cmd of this.commands) {
      results.push(await cmd());
    }
    return results;
  }
}

export const mockRedis = {
  // ─── Hash operations ───
  async hset(key: string, fields: Record<string, unknown>): Promise<number> {
    const h = getHash(key);
    let added = 0;
    for (const [k, v] of Object.entries(fields)) {
      if (!h.has(k)) added++;
      h.set(k, String(v));
    }
    return added;
  },

  async hget(key: string, field: string): Promise<string | null> {
    const h = store.get(key);
    if (!h || !(h instanceof Map)) return null;
    return h.get(field) ?? null;
  },

  async hgetall(key: string): Promise<Record<string, string> | null> {
    const h = store.get(key);
    if (!h || !(h instanceof Map) || h.size === 0) return null;
    const obj: Record<string, string> = {};
    for (const [k, v] of h.entries()) {
      obj[k] = v;
    }
    return obj;
  },

  async hdel(key: string, ...fields: string[]): Promise<number> {
    const h = store.get(key);
    if (!h || !(h instanceof Map)) return 0;
    let count = 0;
    for (const f of fields) {
      if (h.delete(f)) count++;
    }
    return count;
  },

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    const h = getHash(key);
    const current = parseInt(h.get(field) || '0');
    const newVal = current + increment;
    h.set(field, String(newVal));
    return newVal;
  },

  // ─── String operations ───
  async set(key: string, value: unknown, opts?: { nx?: boolean; ex?: number }): Promise<string | null> {
    if (opts?.nx && store.has(key)) return null;
    store.set(key, String(value));
    if (opts?.ex) ttls.set(key, Date.now() + opts.ex * 1000);
    return 'OK';
  },

  async get<T = string>(key: string): Promise<T | null> {
    const val = store.get(key);
    if (val === undefined) return null;
    if (typeof val === 'string' || typeof val === 'number') return val as unknown as T;
    return null;
  },

  async incr(key: string): Promise<number> {
    const val = store.get(key);
    const current = typeof val === 'string' ? parseInt(val) || 0 : typeof val === 'number' ? val : 0;
    const next = current + 1;
    store.set(key, String(next));
    return next;
  },

  async expire(key: string, seconds: number): Promise<number> {
    if (!store.has(key)) return 0;
    ttls.set(key, Date.now() + seconds * 1000);
    return 1;
  },

  async del(key: string): Promise<number> {
    const existed = store.has(key);
    store.delete(key);
    ttls.delete(key);
    return existed ? 1 : 0;
  },

  // ─── Sorted set operations ───
  async zadd(key: string, entry: { score: number; member: string }): Promise<number> {
    return getSortedSet(key).add(entry.score, entry.member);
  },

  async zincrby(key: string, increment: number, member: string): Promise<number> {
    return getSortedSet(key).incrby(increment, member);
  },

  async zrange(key: string, start: unknown, stop: unknown, opts?: Record<string, unknown>): Promise<string[]> {
    const ss = store.get(key);
    if (!ss || !(ss instanceof SortedSet)) return [];
    if (opts?.byLex) {
      return ss.rangeByLex(start as string, stop as string);
    }
    return ss.range(start as number, stop as number, opts as { rev?: boolean; withScores?: boolean });
  },

  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    const ss = store.get(key);
    if (!ss || !(ss instanceof SortedSet)) return [];
    return ss.rangeByScore(min, max);
  },

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    const ss = store.get(key);
    if (!ss || !(ss instanceof SortedSet)) return [];
    return ss.range(start, stop, { rev: true });
  },

  async zrem(key: string, member: string): Promise<number> {
    const ss = store.get(key);
    if (!ss || !(ss instanceof SortedSet)) return 0;
    return ss.remove(member);
  },

  async zcard(key: string): Promise<number> {
    const ss = store.get(key);
    if (!ss || !(ss instanceof SortedSet)) return 0;
    return ss.card();
  },

  async zscore(key: string, member: string): Promise<number | null> {
    const ss = store.get(key);
    if (!ss || !(ss instanceof SortedSet)) return null;
    return ss.score(member);
  },

  // ─── Set operations ───
  async sadd(key: string, ...members: string[]): Promise<number> {
    const s = getSet(key);
    let added = 0;
    for (const m of members) {
      if (!s.has(m)) {
        s.add(m);
        added++;
      }
    }
    return added;
  },

  async smembers(key: string): Promise<string[]> {
    const s = store.get(key);
    if (!s || !(s instanceof Set)) return [];
    return [...s];
  },

  async scard(key: string): Promise<number> {
    const s = store.get(key);
    if (!s || !(s instanceof Set)) return 0;
    return s.size;
  },

  async sismember(key: string, member: string): Promise<number> {
    const s = store.get(key);
    if (!s || !(s instanceof Set)) return 0;
    return s.has(member) ? 1 : 0;
  },

  async srem(key: string, ...members: string[]): Promise<number> {
    const s = store.get(key);
    if (!s || !(s instanceof Set)) return 0;
    let count = 0;
    for (const m of members) {
      if (s.delete(m)) count++;
    }
    return count;
  },

  // ─── Lua eval ───
  async eval(script: string, keys: string[], args: (string | number)[]): Promise<number> {
    const key = keys[0];

    // Detect CAS (compareAndSwapReserves) script by checking for reserveVersion
    if (script.includes('reserveVersion')) {
      const tokenKey = keys[0];
      const appliedKey = keys[1];
      const expectedVersion = parseInt(String(args[0]));
      const txHash = String(args[1]);

      // Gate 1: dedup — check applied-trades set
      const appliedSet = store.get(appliedKey);
      if (appliedSet instanceof Set && appliedSet.has(txHash)) return -1;

      // Gate 2: optimistic lock on reserveVersion
      const h = store.get(tokenKey);
      const hMap = h instanceof Map ? h : new Map<string, string>();
      const currentVersion = parseInt(hMap.get('reserveVersion') || '0');
      if (currentVersion !== expectedVersion) return 0;

      // Apply fields: args layout is [expectedVersion, txHash, field1, val1, ..., updatedAt]
      const newVersion = currentVersion + 1;
      for (let i = 2; i < args.length - 2; i += 2) {
        hMap.set(String(args[i]), String(args[i + 1]));
      }
      hMap.set('reserveVersion', String(newVersion));
      hMap.set('updatedAt', String(args[args.length - 1]));
      store.set(tokenKey, hMap);

      // Record this trade as applied
      let set = store.get(appliedKey);
      if (!(set instanceof Set)) {
        set = new Set<string>();
        store.set(appliedKey, set);
      }
      (set as Set<string>).add(txHash);

      return 1;
    }

    // OHLCV candle update
    const price = parseFloat(String(args[0]));
    const volume = parseFloat(String(args[1]));

    const h = store.get(key);
    if (!h || !(h instanceof Map) || h.size === 0) {
      const newH = new Map<string, string>();
      newH.set('o', String(price));
      newH.set('h', String(price));
      newH.set('l', String(price));
      newH.set('c', String(price));
      newH.set('v', String(volume));
      store.set(key, newH);
    } else {
      const hMap = h as Map<string, string>;
      const currentH = parseFloat(hMap.get('h') || '0');
      const currentL = parseFloat(hMap.get('l') || String(Number.MAX_SAFE_INTEGER));
      if (price > currentH) hMap.set('h', String(price));
      if (price < currentL) hMap.set('l', String(price));
      hMap.set('c', String(price));
      const currentV = parseFloat(hMap.get('v') || '0');
      hMap.set('v', String(currentV + volume));
    }
    return 1;
  },

  // ─── Pipeline ───
  pipeline(): MockPipeline {
    return new MockPipeline();
  },

  // ─── Utility ───
  async ping(): Promise<string> {
    return 'PONG';
  },

  async keys(pattern?: string): Promise<string[]> {
    const allKeys = [...store.keys()];
    if (!pattern || pattern === '*') return allKeys;
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return allKeys.filter(k => regex.test(k));
  },
};

export function resetMockRedis(): void {
  store.clear();
  ttls.clear();
}

/** Direct access to the backing store — use in tests to simulate
 *  crashes (delete a key to mimic TTL expiry) or inspect state. */
export function getStore(): Map<string, RedisValue> {
  return store;
}

// Register the mock — replaces getRedis() in all modules
vi.mock('../../functions/_shared/redis.mts', () => ({
  getRedis: () => mockRedis,
}));
