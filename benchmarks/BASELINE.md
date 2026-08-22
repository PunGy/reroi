# Idiomatic performance baseline before optimization

Captured on 2026-08-23. No reroi runtime optimization from the first
performance pass is included in this baseline.

## Environment

- Reroi runtime source: fc7ae58
- Node: 26.2.0
- V8: 14.6.202.34-node.20
- OS: Linux 7.0.11-arch1-1, x64
- CPU: AMD Ryzen 5 7600X, 6 cores / 12 logical CPUs
- Memory: 30.5 GiB
- Vitest: 4.1.10
- @preact/signals-core: 1.14.4
- solid-js: 1.9.14, production client runtime
- Measured time per task: 500 ms after a 100 ms warmup

Raw results are in `results/baseline.json`. Numbers should be compared only on
the same host and software environment.

## Comparison policy

Each adapter expresses the same logical workload using its library's
recommended graph shape. In particular, the converging Reroi graph subscribes
the two branches and their join to the common trigger. Priorities invalidate
the branches before the join, and the join explicitly reads both branches.
Preact and Solid use automatically tracked diamond graphs. Every adapter emits
one final effect per write.

This is an idiomatic product-level comparison, not an identical-internal-graph
comparison. Reroi's natural `deriveAll([left, right], join)` diamond remains a
useful non-idiomatic stress test, but it should not determine the main
cross-library result.

## Results

The reroi column is operations per second. Comparator columns are comparator
throughput divided by reroi throughput: above 1 means the comparator was
faster; below 1 means reroi was faster.

| Scenario | reroi ops/s | Preact / reroi | Solid / reroi |
| --- | ---: | ---: | ---: |
| Primitive changed write and read | 13,635,858 | 2.24x | 2.37x |
| Cached read, depth 32 | 16,110,442 | 2.11x | 2.11x |
| Cold write, unobserved depth 100 | 233,164 | 124.49x | 0.39x |
| Pull write and read, depth 32 | 386,417 | 4.06x | 0.75x |
| Hot write to effect, depth 32 | 379,532 | 3.26x | 0.76x |
| Fan-out to 100 derived effects | 91,303 | 2.41x | 0.63x |
| Fan-in from 100 inputs | 712,972 | 1.38x | 0.24x |
| Idiomatic eight-layer converging graph | 374,905 | 3.85x | 1.00x |
| Atomic eight-input shared sum | 404,179 | 9.78x | 2.82x |
| Atomic 64-root disjoint fan-out | 9,725 | 38.26x | 14.19x |
| 100-item cart update | 341,649 | 2.07x | 0.47x |
| Create and dispose depth 32 | 90,174 | 5.08x | 4.58x |

All reroi relative margins of error were at or below 0.50 percent in this run.

## Interpretation

Preact was faster in every baseline scenario. Reroi was faster than this Solid
runtime in cold writes, pull and hot chains, fan-out, fan-in, and the cart
workload. Idiomatic convergence was effectively tied with Solid.

The atomic comparison is not semantically identical. Reroi transactions
validate every result and can roll back the full operation; Preact and Solid
only batch notifications. The disjoint atomic case is also intentionally a
wide scaling stress test.

## Validated baseline costs

- Notification materialized and reversed every listener Set before adding it
  to the DFS stack. A same-priority fan-out of 150,000 also exceeded the
  JavaScript spread argument limit.
- `notifyAll` rebuilt the accumulated priority pool for every transaction
  target, and transaction evaluation copied its growing result prefix with
  `concat`. Disjoint transaction notification was therefore quadratic.
- Every empty reactive dependency pool eagerly allocated a Map. In a retained
  heap probe, an empty `val` occupied approximately 288 bytes versus 40 bytes
  for a plain value object.
- Internal derivation and listener reads repeated public structural
  validation even though their sources had already been validated.
- Cold invalidation still traversed every descendant on every write. This is a
  separate architectural issue and was not addressed in the first pass.
- Uncached chain evaluation remained recursive and overflowed around depth
  16,000 in this Node environment.

Reroi intentionally performs no equality comparison. Same-value writes and
their notifications are part of its contract and are not treated as an
optimization target.
