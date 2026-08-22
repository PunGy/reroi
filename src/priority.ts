import { SparseArray } from "./lib/sparseArray"
import { phighest, plowest } from "./symbols"
import type { Priorities, Priority, ReactiveDerivation, Pool, _ReactiveDerivation, _ReactiveListener } from "./type"

export class PriorityPool extends SparseArray<Pool> {
  getOrMake(index: Priority): Pool {
    let pool = this.get(index)
    if (pool === undefined) {
      pool = new Set()
      this.push(pool, index)
    }
    return pool
  }

  subscribe(index: Priority, listener: _ReactiveListener) {
    this.getOrMake(index).add(listener)
  }

  unsubscribe(index: Priority, listener: _ReactiveListener) {
    const pool = this.get(index)
    if (!pool) return

    pool.delete(listener)
    if (pool.size === 0) {
      this.delete(index)
    }
  }

  /**
   * Merges two priority pools together
   *
   * The merge is not "plain", it also filters out repetitive sources,
   * so the resulting pool is only consists of unique messages
   *
   * Dependencies, in case if they are to the same target,
   * will be succeeded in the following way: the highest priority would take a lead
   */
  static merge(p1: PriorityPool, p2: PriorityPool) {
    return PriorityPool.mergeAll([p1, p2])
  }

  /**
   * Merges any number of pools in one pass.
   */
  static mergeAll(pools: Iterable<PriorityPool>) {
    const result = new PriorityPool()
    const priorities = new Map<_ReactiveListener, Priority>()

    const collect = (pool: Pool, priority: Priority) => {
      for (const listener of pool) {
        const current = priorities.get(listener)
        if (current === undefined || priority > current) {
          priorities.set(listener, priority)
        }
      }
    }

    for (const pool of pools) {
      pool.forEach(collect)
    }

    for (const [listener, priority] of priorities) {
      result.subscribe(priority, listener)
    }

    return result
  }
}

export const validatePriority = (priority: Priority): Priority => {
  if (!Number.isFinite(priority)) {
    throw new Error("reroi: priority must be a finite number")
  }
  if (priority < plowest || priority > phighest) {
    throw new Error(`reroi: priority must be between ${plowest} and ${phighest}`)
  }
  return priority
}

export const priorities: Priorities = {
  lowest: plowest,
  highest: phighest,
  base: 0,
  /**
   * Before means the calculation of P1 happens *BEFORE* the calculation of P0.
   * It means, the result priority(P1) would be *HIGHER* than base priority(P0).
   *
   * @param p0 - the base priority
   * @returns P1
   */
  before(p0: ReactiveDerivation<unknown> | Priority) {
    let p: number
    if (typeof p0 === "number") {
      p = p0
    } else {
      p = (p0 as _ReactiveDerivation).priority
    }

    validatePriority(p)
    if (p >= this.highest) {
      throw new Error("reroi: Cannot use 'before' with priority bigger then the highest!")
    }
    return p + 1
  },

  /**
   * After means the calculation of P1 happens *AFTER* the calculation of P0.
   * It means, the result priority(P1) would be *LESS* than base priority(P0).
   *
   * @param p0 - the base priority
   * @returns P1
   */
  after(p0: ReactiveDerivation<unknown> | Priority) {
    let p: number
    if (typeof p0 === "number") {
      p = p0
    } else {
      p = (p0 as _ReactiveDerivation).priority
    }

    validatePriority(p)
    if (p <= this.lowest) {
      throw new Error("reroi: Cannot use 'after' with priority lower then the lowest!")
    }
    return p - 1
  },
}
