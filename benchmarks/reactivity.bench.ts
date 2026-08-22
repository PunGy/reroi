import { afterAll, bench, describe } from "vitest"
import {
  implementations,
  type BenchmarkScenario,
  type ReactiveImplementation,
} from "./scenarios"

const readPositiveNumber = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(name + " must be a positive number")
  }
  return value
}

const options = {
  time: readPositiveNumber("REROI_BENCH_TIME", 500),
  warmupTime: readPositiveNumber("REROI_BENCH_WARMUP", 100),
  iterations: readPositiveNumber("REROI_BENCH_ITERATIONS", 10),
  warmupIterations: readPositiveNumber("REROI_BENCH_WARMUP_ITERATIONS", 5),
  throws: true,
}

type ScenarioFactory = (implementation: ReactiveImplementation) => BenchmarkScenario

let groupIndex = 0

const register = (name: string, factory: ScenarioFactory) => {
  const offset = groupIndex++ % implementations.length
  const ordered = implementations.map(
    (_, index) => implementations[(index + offset) % implementations.length]!,
  )

  describe(name, () => {
    const entries = ordered.map(implementation => ({
      implementation,
      scenario: factory(implementation),
    }))

    afterAll(() => {
      entries.forEach(({ scenario }) => scenario.dispose())
    })

    entries.forEach(({ implementation, scenario }) => {
      bench(implementation.name, scenario.step, options)
    })
  })
}

register("primitive / changed write + read", implementation => implementation.primitive())
register("cached / read depth-32 chain", implementation => implementation.cachedChain(32))
register("cold / write root of unobserved depth-100 chain", implementation => implementation.coldChain(100))
register("pull / changed write + read depth-32 chain", implementation => implementation.pullChain(32))
register("hot / changed write through depth-32 effect", implementation => implementation.hotChain(32))
register("fan-out / one write to 100 derived effects", implementation => implementation.fanOut(100))
register("fan-in / update one of 100 inputs", implementation => implementation.fanIn(100))
register("converging / idiomatic 8-layer diamond effect", implementation => implementation.idiomaticDiamond(8))
register("atomic / update 8 inputs and one sum effect", implementation => implementation.atomic(8))
register("atomic fan-out / update 64 roots with 64 effects", implementation => implementation.atomicFanOut(64))
register("application / update one item in 100-item cart", implementation => implementation.cart(100))
register("lifecycle / create, observe, dispose depth-32 chain", implementation => implementation.lifecycle(32))
