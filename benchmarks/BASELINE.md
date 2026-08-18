# Performance baseline before optimization

Captured on 2026-08-18. No reroi source optimization is included in this
baseline.

## Environment

- Reroi source commit: fc7ae58
- Node: 26.2.0
- V8: 14.6.202.34-node.20
- OS: Linux 7.0.11-arch1-1, x64
- CPU: AMD Ryzen 5 7600X, 6 cores / 12 logical CPUs
- Memory: 30.5 GiB
- Vitest: 4.1.10
- @preact/signals-core: 1.14.4
- solid-js: 1.9.14, production client runtime
- Measured time per task: 500 ms after a 100 ms warmup

Raw results are in results/baseline.json. Numbers should be compared only on
the same host and software environment.

## Results

The reroi column is operations per second. Comparator columns are comparator
throughput divided by reroi throughput: above 1 means the comparator was
faster; below 1 means reroi was faster.

| Scenario | reroi ops/s | Preact / reroi | Solid / reroi |
| --- | ---: | ---: | ---: |
| Primitive changed write and read | 13,907,585 | 1.95x | 2.17x |
| Cached read, depth 32 | 16,286,188 | 1.93x | 1.96x |
| Cold write, unobserved depth 100 | 234,068 | 116.77x | 0.40x |
| Pull write and read, depth 32 | 423,486 | 3.73x | 0.67x |
| Hot write to effect, depth 32 | 390,400 | 3.46x | 0.74x |
| Fan-out to 100 derived effects | 94,267 | 2.55x | 0.60x |
| Fan-in from 100 inputs | 767,081 | 1.41x | 0.24x |
| Eight-layer converging graph | 9,990 | 148.73x | 35.36x |
| Atomic eight-input shared sum | 412,627 | 8.87x | 2.85x |
| Atomic 64-root disjoint fan-out | 9,705 | 40.15x | 13.43x |
| 100-item cart update | 370,187 | 2.05x | 0.42x |
| Create and dispose depth 32 | 90,865 | 5.12x | 4.56x |

All reroi relative margins of error were at or below 0.50 percent in this run.
The two preliminary and full runs agreed on the ordering and approximate
ratios.

## Interpretation

Preact was faster in every measured scenario. Reroi was faster than this Solid
runtime in cold writes, pull and hot chains, fan-out, fan-in, and the cart
workload. In the application-shaped cart graph, reroi was about 2.05 times
slower than Preact and 2.36 times faster than Solid.

The atomic comparison is not semantically identical. Reroi transactions
validate every result and can roll back the full operation; Preact and Solid
only batch notifications. That stronger guarantee explains some constant
overhead, but not the disjoint fan-out scaling described below.

## Algorithmic assessment

The overall design is a push-invalidated, pull-computed graph with explicit
dependencies. Static edges avoid automatic dependency tracking and cleanup,
cached derivations make repeated reads constant-time, and deriveAll reuses its
value array. Sets also deduplicate duplicate subscriptions within one source.
These choices are sound for small, mostly tree-shaped, explicitly managed
graphs and help explain the wins over Solid in several propagation workloads.

The main costs are:

| Operation | Current behavior |
| --- | --- |
| Value or cached derivation read | O(1), with repeated structural tag checks |
| Uncached chain read | O(depth), recursively |
| DeriveAll or listenAll reaction | O(number of sources) |
| Tree-shaped write | O(reachable nodes and edges) |
| Converging-DAG write | O(number of root-to-descendant paths), which can be exponential in layered graphs |
| New priority bucket | O(number of occupied priority buckets) |
| Atomic update with disjoint subscriber pools | O(targets squared) pool rebuilding, plus transaction work |
| Graph storage | O(nodes, edges, and occupied priority buckets) |

### Converging graphs

Notification uses a depth-first stack. After a parent is notified, its
dependents are pushed ahead of siblings that were already waiting. There is no
per-propagation visited or scheduled set below the initial pool.

In a repeated split/join graph, one logical write therefore reaches the final
effect once per root-to-leaf path:

- One layer: 2 effect calls
- Eight layers: 256 effect calls
- Ten layers: 1,024 effect calls

This is also a consistency issue. At one layer the effect observed 4 and then
5 for a write whose final result was 5. At eight layers it emitted 256
intermediate values before reaching the final 1,021. The 148.73x benchmark
gap therefore includes duplicated user effects and not merely bookkeeping.

### Cold graphs

Reroi computations are lazy, but invalidation is eager across every descendant
on every write, including a descendant that is already dirty and has never
been observed. A direct scaling probe measured approximately:

- Depth 10: 354 ns per write
- Depth 100: 3,604 ns per write
- Depth 500: 19,583 ns per write
- Depth 1,000: 38,845 ns per write

This confirms linear write cost in chain depth. Preact leaves an unobserved
computed chain detached, explaining its roughly 117x advantage in the fixed
depth-100 benchmark. Solid eagerly maintains the chain in this setup, so
reroi was about 2.5x faster than Solid there.

### Atomic updates

notifyAll repeatedly merges the accumulated PriorityPool with the next
target's pool, rebuilding maps, sets, sparse nodes, and all accumulated
entries each time. With disjoint effects, doubling target count approaches
four times the cost:

- 64 roots: 115 microseconds per transaction
- 128 roots: 432 microseconds
- 256 roots: 1,595 microseconds
- 512 roots: 6,427 microseconds

Transaction evaluation also grows the result list with concat on every step,
which repeatedly copies the prefix and becomes superlinear at large widths.
The shared-sum scenario is less affected because pool merging deduplicates the
same downstream listener early; the disjoint fan-out exposes the worst shape.

### Constant factors and lifecycle

Each notification materializes and reverses every listener Set before adding
it to the stack. Even a value with no dependencies allocates a notification
stack. Each reactive node also owns a PriorityPool backed by a Map, and each
derivation creates multiple closures. These choices show up in the roughly 2x
primitive/cached-read gaps and the 4.6x to 5.1x lifecycle gaps.

Reroi intentionally performs no equality check, so same-value writes pay full
propagation and effect cost. The benchmark uses changed values for fairness,
but real applications that repeat assignments will widen the gap versus
libraries that suppress equal writes.

Finally, notification is iterative, but uncached chain evaluation is recursive.
It succeeded at depth 8,000 and overflowed the call stack at depth 16,000 in
this Node environment.

## Priority of future investigation

This is an assessment, not an implementation plan. The highest-impact areas
suggested by the baseline are:

1. One scheduled notification per node per propagation wave, with glitch-free
   ordering for converging DAGs.
2. Stop propagating through already-dirty, unobserved lazy subgraphs.
3. Replace repeated atomic pool merges and growing-array concatenation with
   linear accumulation.
4. Remove transient arrays from the notification hot path.
5. Consider optional equality semantics and cheaper trusted internal reads.
6. Reduce per-node allocation and make deep evaluation iterative if extremely
   deep graphs are in scope.
