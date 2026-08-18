# Reactivity benchmarks

This suite measures the reactive core in steady-state and application-shaped
workloads. It compares reroi with two synchronous, fine-grained reactive
systems:

- @preact/signals-core 1.14.4
- solid-js 1.9.14

The versions are pinned in package.json and pnpm-lock.yaml. Solid is imported
from its client runtime, solid-js/dist/solid.js. Importing the default
server-conditioned entry in a Node benchmark would turn client effects into
server behavior and produce invalid comparisons.

Vitest is also pinned to 4.1.10 because its benchmark API is experimental.

## Run

Run the full suite:

    pnpm bench

Run a short smoke benchmark:

    pnpm bench:quick

Save a machine-local baseline:

    pnpm bench:save

Compare the current code with that saved baseline:

    pnpm bench:compare

The save command replaces benchmarks/results/baseline.json. Compare results
only on the same machine, Node version, power profile, and with similar
background load.

The duration can be tuned without editing the suite:

    REROI_BENCH_TIME=1000 \
    REROI_BENCH_WARMUP=250 \
    REROI_BENCH_ITERATIONS=20 \
    pnpm bench

Times are milliseconds. Each benchmark is warmed independently. Vitest runs
benchmark files sequentially, and the library order rotates between groups to
reduce first/last-run bias.

## Scenarios

| Group | Timed operation | Shape and purpose |
| --- | --- | --- |
| primitive | changed write and direct read | Public API floor |
| cached | cached read | Depth-32 derivation chain |
| cold | changed root write and root read | Depth-100 chain that has never been observed |
| pull | changed write and leaf read | Depth-32 lazy chain recomputation |
| hot | changed root write | Depth-32 chain ending in a synchronous effect |
| fan-out | changed root write | 100 derived values, each with an effect |
| fan-in | changed write to one rotating input | One derived sum over 100 inputs |
| converging | changed root write | Eight repeated split/join layers ending in an effect |
| atomic | one atomic update | Eight roots feeding one sum effect |
| atomic fan-out | one atomic update | 64 roots with 64 disjoint effects |
| application | change one rotating cart quantity | 100 item subtotals, aggregate, tax, and effect |
| lifecycle | construct, observe, and dispose | A depth-32 chain; setup is intentionally timed |

## Fairness and limits

- Graph setup is outside the timed operation except in the lifecycle group.
- Every timed write changes its value, so equality suppression cannot turn a
  library's operation into a no-op.
- Effects are synchronous in all three adapters. Initial effect runs are
  excluded from emission counts and from timed work.
- Scenario callbacks use each library's public API directly. A shared typed
  array consumes results so the engine cannot discard observable work.
- Correctness tests in scenarios.test.ts verify the same final values and
  expected effect counts before performance numbers are trusted.
- Reroi uses explicit dependencies; Preact and Solid pay for automatic
  dependency tracking. This is an intentional product-level comparison.
- Reroi transactions provide rollback and validation, while the comparator
  atomic scenario uses batching only. The atomic result must be interpreted
  with that stronger semantic guarantee in mind.
- This measures JavaScript graph maintenance and computation under Node/V8. It
  does not measure DOM rendering, framework integration, bundle parsing, or
  browser scheduling.

Do not add hard throughput assertions to the unit suite. Performance varies
enough between machines and process runs that saved JSON and repeated
same-host comparisons are more reliable than pass/fail thresholds.
