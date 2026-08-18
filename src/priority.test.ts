import { describe, expect, it, vi } from "vitest"
import { PriorityPool } from "./priority"
import type { _ReactiveListener } from "./type"

const listener = (): _ReactiveListener => ({ _onMessage: vi.fn() })

describe("PriorityPool", () => {
  it("merges three single-bucket pools without losing the middle pool", () => {
    const a = listener()
    const b = listener()
    const c = listener()
    const p1 = new PriorityPool()
    const p2 = new PriorityPool()
    const p3 = new PriorityPool()

    p1.subscribe(0, a)
    p2.subscribe(0, b)
    p3.subscribe(0, c)

    const merged = PriorityPool.merge(PriorityPool.merge(p1, p2), p3)

    expect([...merged.get(0)!]).toEqual([a, b, c])
  })

  it("owns merged buckets instead of aliasing source buckets", () => {
    const a = listener()
    const b = listener()
    const p1 = new PriorityPool()
    const p2 = new PriorityPool()
    p1.subscribe(0, a)
    p2.subscribe(0, b)

    const merged = PriorityPool.merge(p1, p2)
    p1.unsubscribe(0, a)
    p2.unsubscribe(0, b)

    expect([...merged.get(0)!]).toEqual([a, b])
  })

  it("keeps a duplicated listener only at its highest priority", () => {
    const shared = listener()
    const p1 = new PriorityPool()
    const p2 = new PriorityPool()
    p1.subscribe(-1, shared)
    p2.subscribe(2, shared)

    const merged = PriorityPool.merge(p1, p2)

    expect(merged.get(-1)).toBeUndefined()
    expect(merged.get(2)).toEqual(new Set([shared]))
  })

  it("removes empty buckets on unsubscribe", () => {
    const pool = new PriorityPool()
    const item = listener()
    pool.subscribe(42, item)

    pool.unsubscribe(42, item)

    expect(pool.get(42)).toBeUndefined()
    expect(pool.isEmpty).toBe(true)
  })
})
