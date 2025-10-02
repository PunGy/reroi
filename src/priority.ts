import { SparseArray } from "./lib/sparseArray"
import { phighest, plowest } from "./symbols"
import type { Priorities, Priority, ReactiveDerivation, Pool, _ReactiveDerivation } from "./type"

export class PriorityPool extends SparseArray<Pool> {
  getOrMake(index: Priority): Pool {
    let pool = this.get(index)
    if (pool === undefined) {
      pool = new Set()
      this.push(pool, index)
    }
    return pool
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
    const result = new PriorityPool()

    // put entire p1 to result
    p1.forEachBackward((pool, priority) => {
      result.push(pool, priority)
    })
    p2.forEachBackward((pool, priority) => {
      const p = result.get(priority)
      if (p) {
        result.push(p.union(pool), priority)
      } else {
        result.push(pool, priority)
      }
    })

    return result
  }
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

    if (p >= this.highest) {
      throw new Error("Fluid: Cannot use 'before' with priority bigger then the highest!")
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

    if (p <= this.lowest) {
      throw new Error("Fluid: Cannot use 'after' with priority lower then the lowest!")
    }
    return p - 1
  },
}
