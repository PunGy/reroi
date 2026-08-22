import {
  batch as preactBatch,
  computed as preactComputed,
  effect as preactEffect,
  signal as preactSignal,
} from "@preact/signals-core"
import {
  batch as solidBatch,
  createComputed as solidCreateComputed,
  createMemo as solidCreateMemo,
  createRoot as solidCreateRoot,
  createSignal as solidCreateSignal,
} from "solid-js/dist/solid.js"
import * as R from "../src/index"
import type { Reactive, ReactiveDerivation } from "../src/index"

export interface BenchmarkScenario {
  step(): void;
  value(): number;
  emissions(): number;
  dispose(): void;
}

export interface ReactiveImplementation {
  name: string;
  primitive(): BenchmarkScenario;
  cachedChain(depth: number): BenchmarkScenario;
  coldChain(depth: number): BenchmarkScenario;
  pullChain(depth: number): BenchmarkScenario;
  hotChain(depth: number): BenchmarkScenario;
  fanOut(width: number): BenchmarkScenario;
  fanIn(width: number): BenchmarkScenario;
  idiomaticDiamond(layers: number): BenchmarkScenario;
  atomic(width: number): BenchmarkScenario;
  atomicFanOut(width: number): BenchmarkScenario;
  cart(size: number): BenchmarkScenario;
  lifecycle(depth: number): BenchmarkScenario;
}

const blackhole = new Float64Array(256)
let nextSinkSlot = 0

const allocateSinkSlot = () => {
  const slot = nextSinkSlot
  nextSinkSlot = (nextSinkSlot + 1) % blackhole.length
  return slot
}

const consume = (slot: number, value: number) => {
  blackhole[slot] = value
}

const consumed = (slot: number) => blackhole[slot] ?? 0
const noEmissions = () => 0
const noop = () => undefined

const makeReroiChain = (depth: number) => {
  const root = R.val(0)
  let leaf: Reactive<number> = root
  let first: ReactiveDerivation<number> | undefined

  for (let i = 0; i < depth; i++) {
    const child: ReactiveDerivation<number> = R.derive(leaf, value => value + 1)
    first ??= child
    leaf = child
  }

  return {
    root,
    leaf,
    dispose: () => {
      if (first) R.destroy(first)
    },
  }
}

const makePreactChain = (depth: number) => {
  const root = preactSignal(0)
  let leaf: { readonly value: number } = root

  for (let i = 0; i < depth; i++) {
    const source = leaf
    leaf = preactComputed(() => source.value + 1)
  }

  return { root, leaf }
}

const makeSolidChain = (depth: number) => {
  const [root, setRoot] = solidCreateSignal(0)
  let leaf: () => number = root

  for (let i = 0; i < depth; i++) {
    const source = leaf
    leaf = solidCreateMemo(() => source() + 1)
  }

  return { root, setRoot, leaf }
}

const reroiImplementation: ReactiveImplementation = {
  name: "reroi",

  primitive() {
    const slot = allocateSinkSlot()
    const root = R.val(0)
    let next = 0

    return {
      step() {
        R.write(root, ++next)
        consume(slot, R.read(root))
      },
      value: () => R.read(root),
      emissions: noEmissions,
      dispose: noop,
    }
  },

  cachedChain(depth) {
    const slot = allocateSinkSlot()
    const chain = makeReroiChain(depth)
    R.read(chain.leaf)

    return {
      step: () => consume(slot, R.read(chain.leaf)),
      value: () => R.read(chain.leaf),
      emissions: noEmissions,
      dispose: chain.dispose,
    }
  },

  coldChain(depth) {
    const slot = allocateSinkSlot()
    const chain = makeReroiChain(depth)
    let next = 0

    return {
      step() {
        R.write(chain.root, ++next)
        consume(slot, R.read(chain.root))
      },
      value: () => R.read(chain.leaf),
      emissions: noEmissions,
      dispose: chain.dispose,
    }
  },

  pullChain(depth) {
    const slot = allocateSinkSlot()
    const chain = makeReroiChain(depth)
    let next = 0
    R.read(chain.leaf)

    return {
      step() {
        R.write(chain.root, ++next)
        consume(slot, R.read(chain.leaf))
      },
      value: () => R.read(chain.leaf),
      emissions: noEmissions,
      dispose: chain.dispose,
    }
  },

  hotChain(depth) {
    const slot = allocateSinkSlot()
    const chain = makeReroiChain(depth)
    let next = 0
    let emissions = 0
    const stop = R.listen(chain.leaf, value => {
      emissions++
      consume(slot, value)
    }, { immediate: true })
    emissions = 0

    return {
      step: () => R.write(chain.root, ++next),
      value: () => R.read(chain.leaf),
      emissions: () => emissions,
      dispose() {
        stop()
        chain.dispose()
      },
    }
  },

  fanOut(width) {
    const slot = allocateSinkSlot()
    const root = R.val(0)
    const children: Array<ReactiveDerivation<number>> = []
    const stops: Array<() => void> = []
    let emissions = 0
    let next = 0

    for (let i = 0; i < width; i++) {
      const child = R.derive(root, value => value + i)
      children.push(child)
      stops.push(R.listen(child, value => {
        emissions++
        consume(slot, value)
      }, { immediate: true }))
    }
    emissions = 0

    return {
      step: () => R.write(root, ++next),
      value: () => R.read(children[children.length - 1]!),
      emissions: () => emissions,
      dispose() {
        stops.forEach(stop => stop())
        children.forEach(child => R.destroy(child))
      },
    }
  },

  fanIn(width) {
    const slot = allocateSinkSlot()
    const values = Array.from({ length: width }, (_, index) => index + 1)
    const roots = values.map(value => R.val(value))
    const total = R.deriveAll(roots, sources => sources.reduce((sum, value) => sum + value, 0))
    let index = 0
    let emissions = 0
    const stop = R.listen(total, value => {
      emissions++
      consume(slot, value)
    }, { immediate: true })
    emissions = 0

    return {
      step() {
        values[index]!++
        R.write(roots[index]!, values[index]!)
        index = (index + 1) % width
      },
      value: () => R.read(total),
      emissions: () => emissions,
      dispose() {
        stop()
        R.destroy(total)
      },
    }
  },

  idiomaticDiamond(layers) {
    const slot = allocateSinkSlot()
    const root = R.val(0)
    const nodes: Array<ReactiveDerivation<number>> = []
    let leaf: Reactive<number> = root
    let next = 0
    let emissions = 0

    for (let i = 0; i < layers; i++) {
      const left: ReactiveDerivation<number> = R.derive(
        leaf,
        value => value + 1,
        { priority: R.priorities.base },
      )
      const right: ReactiveDerivation<number> = R.derive(
        leaf,
        value => value + 2,
        { priority: R.priorities.after(left) },
      )
      const join: ReactiveDerivation<number> = R.derive(
        leaf,
        () => R.read(left) + R.read(right),
        { priority: R.priorities.after(right) },
      )
      nodes.push(left, right, join)
      leaf = join
    }

    const stop = R.listen(leaf, value => {
      emissions++
      consume(slot, value)
    }, { immediate: true })
    emissions = 0

    return {
      step: () => R.write(root, ++next),
      value: () => R.read(leaf),
      emissions: () => emissions,
      dispose() {
        stop()
        nodes.reverse().forEach(node => R.destroy(node))
      },
    }
  },

  atomic(width) {
    const slot = allocateSinkSlot()
    const roots = Array.from({ length: width }, (_, index) => R.val(index + 1))
    const total = R.deriveAll(roots, values => values.reduce((sum, value) => sum + value, 0))
    const transactions = roots.map(root => R.transaction.write(
      root,
      value => R.transaction.success(value + 1),
    ))
    const composed = Reflect.apply(
      R.transaction.compose,
      undefined,
      transactions,
    ) as { run(): unknown }
    let emissions = 0
    const stop = R.listen(total, value => {
      emissions++
      consume(slot, value)
    }, { immediate: true })
    emissions = 0

    return {
      step: () => {
        composed.run()
      },
      value: () => R.read(total),
      emissions: () => emissions,
      dispose() {
        stop()
        R.destroy(total)
      },
    }
  },

  atomicFanOut(width) {
    const slot = allocateSinkSlot()
    const roots = Array.from({ length: width }, (_, index) => R.val(index + 1))
    const stops: Array<() => void> = []
    const transactions = roots.map(root => R.transaction.write(
      root,
      value => R.transaction.success(value + 1),
    ))
    const composed = Reflect.apply(
      R.transaction.compose,
      undefined,
      transactions,
    ) as { run(): unknown }
    let emissions = 0

    roots.forEach(root => {
      stops.push(R.listen(root, value => {
        emissions++
        consume(slot, value)
      }, { immediate: true }))
    })
    emissions = 0

    return {
      step: () => {
        composed.run()
      },
      value: () => roots.reduce((sum, root) => sum + R.read(root), 0),
      emissions: () => emissions,
      dispose: () => stops.forEach(stop => stop()),
    }
  },

  cart(size) {
    const slot = allocateSinkSlot()
    const quantities = Array.from({ length: size }, () => R.val(1))
    const subtotals = quantities.map((quantity, index) => {
      const price = R.val(index % 10 + 1)
      return R.deriveAll([price, quantity], ([p, q]) => p * q)
    })
    const total = R.deriveAll(subtotals, values => values.reduce((sum, value) => sum + value, 0))
    const grandTotal = R.derive(total, value => value * 1.2)
    let index = 0
    let emissions = 0
    const stop = R.listen(grandTotal, value => {
      emissions++
      consume(slot, value)
    }, { immediate: true })
    emissions = 0

    return {
      step() {
        R.write(quantities[index]!, value => value + 1)
        index = (index + 1) % size
      },
      value: () => R.read(grandTotal),
      emissions: () => emissions,
      dispose() {
        stop()
        R.destroy(grandTotal)
        R.destroy(total)
        subtotals.forEach(subtotal => R.destroy(subtotal))
      },
    }
  },

  lifecycle(depth) {
    const slot = allocateSinkSlot()
    let next = 0

    return {
      step() {
        const root = R.val(++next)
        let leaf: Reactive<number> = root
        let first: ReactiveDerivation<number> | undefined

        for (let i = 0; i < depth; i++) {
          const child: ReactiveDerivation<number> = R.derive(leaf, value => value + 1)
          first ??= child
          leaf = child
        }

        const stop = R.listen(leaf, value => consume(slot, value), { immediate: true })
        stop()
        if (first) R.destroy(first)
      },
      value: () => consumed(slot),
      emissions: noEmissions,
      dispose: noop,
    }
  },
}

const preactImplementation: ReactiveImplementation = {
  name: "@preact/signals-core",

  primitive() {
    const slot = allocateSinkSlot()
    const root = preactSignal(0)
    let next = 0

    return {
      step() {
        root.value = ++next
        consume(slot, root.value)
      },
      value: () => root.value,
      emissions: noEmissions,
      dispose: noop,
    }
  },

  cachedChain(depth) {
    const slot = allocateSinkSlot()
    const chain = makePreactChain(depth)
    consume(slot, chain.leaf.value)

    return {
      step: () => consume(slot, chain.leaf.value),
      value: () => chain.leaf.value,
      emissions: noEmissions,
      dispose: noop,
    }
  },

  coldChain(depth) {
    const slot = allocateSinkSlot()
    const chain = makePreactChain(depth)
    let next = 0

    return {
      step() {
        chain.root.value = ++next
        consume(slot, chain.root.value)
      },
      value: () => chain.leaf.value,
      emissions: noEmissions,
      dispose: noop,
    }
  },

  pullChain(depth) {
    const slot = allocateSinkSlot()
    const chain = makePreactChain(depth)
    let next = 0
    consume(slot, chain.leaf.value)

    return {
      step() {
        chain.root.value = ++next
        consume(slot, chain.leaf.value)
      },
      value: () => chain.leaf.value,
      emissions: noEmissions,
      dispose: noop,
    }
  },

  hotChain(depth) {
    const slot = allocateSinkSlot()
    const chain = makePreactChain(depth)
    let next = 0
    let emissions = 0
    const stop = preactEffect(() => {
      emissions++
      consume(slot, chain.leaf.value)
    })
    emissions = 0

    return {
      step: () => {
        chain.root.value = ++next
      },
      value: () => chain.leaf.value,
      emissions: () => emissions,
      dispose: stop,
    }
  },

  fanOut(width) {
    const slot = allocateSinkSlot()
    const root = preactSignal(0)
    const children = Array.from(
      { length: width },
      (_, index) => preactComputed(() => root.value + index),
    )
    let emissions = 0
    let next = 0
    const stops = children.map(child => preactEffect(() => {
      emissions++
      consume(slot, child.value)
    }))
    emissions = 0

    return {
      step: () => {
        root.value = ++next
      },
      value: () => children[children.length - 1]!.value,
      emissions: () => emissions,
      dispose: () => stops.forEach(stop => stop()),
    }
  },

  fanIn(width) {
    const slot = allocateSinkSlot()
    const values = Array.from({ length: width }, (_, index) => index + 1)
    const roots = values.map(value => preactSignal(value))
    const total = preactComputed(
      () => roots.reduce((sum, root) => sum + root.value, 0),
    )
    let index = 0
    let emissions = 0
    const stop = preactEffect(() => {
      emissions++
      consume(slot, total.value)
    })
    emissions = 0

    return {
      step() {
        values[index]!++
        roots[index]!.value = values[index]!
        index = (index + 1) % width
      },
      value: () => total.value,
      emissions: () => emissions,
      dispose: stop,
    }
  },

  idiomaticDiamond(layers) {
    const slot = allocateSinkSlot()
    const root = preactSignal(0)
    let leaf: { readonly value: number } = root
    let next = 0
    let emissions = 0

    for (let i = 0; i < layers; i++) {
      const source = leaf
      const left = preactComputed(() => source.value + 1)
      const right = preactComputed(() => source.value + 2)
      leaf = preactComputed(() => left.value + right.value)
    }

    const stop = preactEffect(() => {
      emissions++
      consume(slot, leaf.value)
    })
    emissions = 0

    return {
      step: () => {
        root.value = ++next
      },
      value: () => leaf.value,
      emissions: () => emissions,
      dispose: stop,
    }
  },

  atomic(width) {
    const slot = allocateSinkSlot()
    const roots = Array.from({ length: width }, (_, index) => preactSignal(index + 1))
    const total = preactComputed(
      () => roots.reduce((sum, root) => sum + root.value, 0),
    )
    let emissions = 0
    const stop = preactEffect(() => {
      emissions++
      consume(slot, total.value)
    })
    emissions = 0

    return {
      step: () => preactBatch(() => {
        roots.forEach(root => {
          root.value++
        })
      }),
      value: () => total.value,
      emissions: () => emissions,
      dispose: stop,
    }
  },

  atomicFanOut(width) {
    const slot = allocateSinkSlot()
    const roots = Array.from({ length: width }, (_, index) => preactSignal(index + 1))
    let emissions = 0
    const stops = roots.map(root => preactEffect(() => {
      emissions++
      consume(slot, root.value)
    }))
    emissions = 0

    return {
      step: () => preactBatch(() => {
        roots.forEach(root => {
          root.value++
        })
      }),
      value: () => roots.reduce((sum, root) => sum + root.value, 0),
      emissions: () => emissions,
      dispose: () => stops.forEach(stop => stop()),
    }
  },

  cart(size) {
    const slot = allocateSinkSlot()
    const quantities = Array.from({ length: size }, () => preactSignal(1))
    const subtotals = quantities.map((quantity, index) => {
      const price = preactSignal(index % 10 + 1)
      return preactComputed(() => price.value * quantity.value)
    })
    const total = preactComputed(
      () => subtotals.reduce((sum, subtotal) => sum + subtotal.value, 0),
    )
    const grandTotal = preactComputed(() => total.value * 1.2)
    let index = 0
    let emissions = 0
    const stop = preactEffect(() => {
      emissions++
      consume(slot, grandTotal.value)
    })
    emissions = 0

    return {
      step() {
        quantities[index]!.value++
        index = (index + 1) % size
      },
      value: () => grandTotal.value,
      emissions: () => emissions,
      dispose: stop,
    }
  },

  lifecycle(depth) {
    const slot = allocateSinkSlot()
    let next = 0

    return {
      step() {
        const root = preactSignal(++next)
        let leaf: { readonly value: number } = root

        for (let i = 0; i < depth; i++) {
          const source = leaf
          leaf = preactComputed(() => source.value + 1)
        }

        const stop = preactEffect(() => consume(slot, leaf.value))
        stop()
      },
      value: () => consumed(slot),
      emissions: noEmissions,
      dispose: noop,
    }
  },
}

const solidImplementation: ReactiveImplementation = {
  name: "solid-js",

  primitive() {
    const slot = allocateSinkSlot()
    const [root, setRoot] = solidCreateSignal(0)
    let next = 0

    return {
      step() {
        setRoot(++next)
        consume(slot, root())
      },
      value: root,
      emissions: noEmissions,
      dispose: noop,
    }
  },

  cachedChain(depth) {
    return solidCreateRoot(disposeRoot => {
      const slot = allocateSinkSlot()
      const chain = makeSolidChain(depth)
      consume(slot, chain.leaf())

      return {
        step: () => consume(slot, chain.leaf()),
        value: chain.leaf,
        emissions: noEmissions,
        dispose: disposeRoot,
      }
    })
  },

  coldChain(depth) {
    return solidCreateRoot(disposeRoot => {
      const slot = allocateSinkSlot()
      const chain = makeSolidChain(depth)
      let next = 0

      return {
        step() {
          chain.setRoot(++next)
          consume(slot, chain.root())
        },
        value: chain.leaf,
        emissions: noEmissions,
        dispose: disposeRoot,
      }
    })
  },

  pullChain(depth) {
    return solidCreateRoot(disposeRoot => {
      const slot = allocateSinkSlot()
      const chain = makeSolidChain(depth)
      let next = 0
      consume(slot, chain.leaf())

      return {
        step() {
          chain.setRoot(++next)
          consume(slot, chain.leaf())
        },
        value: chain.leaf,
        emissions: noEmissions,
        dispose: disposeRoot,
      }
    })
  },

  hotChain(depth) {
    return solidCreateRoot(disposeRoot => {
      const slot = allocateSinkSlot()
      const chain = makeSolidChain(depth)
      let next = 0
      let emissions = 0
      solidCreateComputed(() => {
        emissions++
        consume(slot, chain.leaf())
      })
      emissions = 0

      return {
        step: () => chain.setRoot(++next),
        value: chain.leaf,
        emissions: () => emissions,
        dispose: disposeRoot,
      }
    })
  },

  fanOut(width) {
    return solidCreateRoot(disposeRoot => {
      const slot = allocateSinkSlot()
      const [root, setRoot] = solidCreateSignal(0)
      const children = Array.from(
        { length: width },
        (_, index) => solidCreateMemo(() => root() + index),
      )
      let emissions = 0
      let next = 0
      children.forEach(child => {
        solidCreateComputed(() => {
          emissions++
          consume(slot, child())
        })
      })
      emissions = 0

      return {
        step: () => setRoot(++next),
        value: children[children.length - 1]!,
        emissions: () => emissions,
        dispose: disposeRoot,
      }
    })
  },

  fanIn(width) {
    return solidCreateRoot(disposeRoot => {
      const slot = allocateSinkSlot()
      const values = Array.from({ length: width }, (_, index) => index + 1)
      const roots = values.map(value => solidCreateSignal(value))
      const total = solidCreateMemo(
        () => roots.reduce((sum, [root]) => sum + root(), 0),
      )
      let index = 0
      let emissions = 0
      solidCreateComputed(() => {
        emissions++
        consume(slot, total())
      })
      emissions = 0

      return {
        step() {
          values[index]!++
          roots[index]![1](values[index]!)
          index = (index + 1) % width
        },
        value: total,
        emissions: () => emissions,
        dispose: disposeRoot,
      }
    })
  },

  idiomaticDiamond(layers) {
    return solidCreateRoot(disposeRoot => {
      const slot = allocateSinkSlot()
      const [root, setRoot] = solidCreateSignal(0)
      let leaf: () => number = root
      let next = 0
      let emissions = 0

      for (let i = 0; i < layers; i++) {
        const source = leaf
        const left = solidCreateMemo(() => source() + 1)
        const right = solidCreateMemo(() => source() + 2)
        leaf = solidCreateMemo(() => left() + right())
      }

      solidCreateComputed(() => {
        emissions++
        consume(slot, leaf())
      })
      emissions = 0

      return {
        step: () => setRoot(++next),
        value: leaf,
        emissions: () => emissions,
        dispose: disposeRoot,
      }
    })
  },

  atomic(width) {
    return solidCreateRoot(disposeRoot => {
      const slot = allocateSinkSlot()
      const roots = Array.from({ length: width }, (_, index) => solidCreateSignal(index + 1))
      const total = solidCreateMemo(
        () => roots.reduce((sum, [root]) => sum + root(), 0),
      )
      let emissions = 0
      solidCreateComputed(() => {
        emissions++
        consume(slot, total())
      })
      emissions = 0

      return {
        step: () => solidBatch(() => {
          roots.forEach(([, setRoot]) => setRoot(value => value + 1))
        }),
        value: total,
        emissions: () => emissions,
        dispose: disposeRoot,
      }
    })
  },

  atomicFanOut(width) {
    return solidCreateRoot(disposeRoot => {
      const slot = allocateSinkSlot()
      const roots = Array.from({ length: width }, (_, index) => solidCreateSignal(index + 1))
      let emissions = 0
      roots.forEach(([root]) => {
        solidCreateComputed(() => {
          emissions++
          consume(slot, root())
        })
      })
      emissions = 0

      return {
        step: () => solidBatch(() => {
          roots.forEach(([, setRoot]) => setRoot(value => value + 1))
        }),
        value: () => roots.reduce((sum, [root]) => sum + root(), 0),
        emissions: () => emissions,
        dispose: disposeRoot,
      }
    })
  },

  cart(size) {
    return solidCreateRoot(disposeRoot => {
      const slot = allocateSinkSlot()
      const quantities = Array.from({ length: size }, () => solidCreateSignal(1))
      const subtotals = quantities.map(([quantity], index) => {
        const [price] = solidCreateSignal(index % 10 + 1)
        return solidCreateMemo(() => price() * quantity())
      })
      const total = solidCreateMemo(
        () => subtotals.reduce((sum, subtotal) => sum + subtotal(), 0),
      )
      const grandTotal = solidCreateMemo(() => total() * 1.2)
      let index = 0
      let emissions = 0
      solidCreateComputed(() => {
        emissions++
        consume(slot, grandTotal())
      })
      emissions = 0

      return {
        step() {
          quantities[index]![1](value => value + 1)
          index = (index + 1) % size
        },
        value: grandTotal,
        emissions: () => emissions,
        dispose: disposeRoot,
      }
    })
  },

  lifecycle(depth) {
    const slot = allocateSinkSlot()
    let next = 0

    return {
      step() {
        let disposeRoot: () => void = noop
        solidCreateRoot(dispose => {
          disposeRoot = dispose
          const [root] = solidCreateSignal(++next)
          let leaf: () => number = root

          for (let i = 0; i < depth; i++) {
            const source = leaf
            leaf = solidCreateMemo(() => source() + 1)
          }

          solidCreateComputed(() => consume(slot, leaf()))
        })
        disposeRoot()
      },
      value: () => consumed(slot),
      emissions: noEmissions,
      dispose: noop,
    }
  },
}

export const implementations: ReadonlyArray<ReactiveImplementation> = [
  reroiImplementation,
  preactImplementation,
  solidImplementation,
]
