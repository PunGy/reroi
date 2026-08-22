import { describe, expect, it } from "vitest"
import { implementations, type BenchmarkScenario } from "./scenarios"

const check = (
  makeScenario: () => BenchmarkScenario,
  expectedValue: number,
  expectedEmissions?: number,
) => {
  const scenario = makeScenario()
  try {
    scenario.step()
    expect(scenario.value()).toBeCloseTo(expectedValue)
    if (expectedEmissions !== undefined) {
      expect(scenario.emissions()).toBe(expectedEmissions)
    }
  } finally {
    scenario.dispose()
  }
}

implementations.forEach(implementation => {
  describe(implementation.name + " benchmark scenarios", () => {
    it("runs primitive operations", () => {
      const scenario = implementation.primitive()
      try {
        scenario.step()
        scenario.step()
        expect(scenario.value()).toBe(2)
      } finally {
        scenario.dispose()
      }
    })

    it("reads a cached chain", () => {
      const scenario = implementation.cachedChain(4)
      try {
        scenario.step()
        expect(scenario.value()).toBe(4)
      } finally {
        scenario.dispose()
      }
    })

    it("updates an unobserved chain", () => {
      check(() => implementation.coldChain(4), 5)
    })

    it("updates and pulls a chain", () => {
      check(() => implementation.pullChain(4), 5)
    })

    it("updates a hot chain once", () => {
      check(() => implementation.hotChain(4), 5, 1)
    })

    it("updates every fan-out effect", () => {
      check(() => implementation.fanOut(4), 4, 4)
    })

    it("updates a broad fan-in once", () => {
      check(() => implementation.fanIn(4), 11, 1)
    })

    it("updates an idiomatic converging graph once", () => {
      check(() => implementation.idiomaticDiamond(3), 29, 1)
    })

    it("updates a sum atomically", () => {
      check(() => implementation.atomic(4), 14, 1)
    })

    it("updates disjoint effects atomically", () => {
      check(() => implementation.atomicFanOut(4), 14, 4)
    })

    it("updates one item in an application graph", () => {
      check(() => implementation.cart(4), 13.2, 1)
    })

    it("creates and disposes a graph", () => {
      check(() => implementation.lifecycle(4), 5)
    })
  })
})
