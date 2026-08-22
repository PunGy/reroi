# First contract-preserving optimization pass

Captured on 2026-08-23 against the idiomatic pre-optimization baseline in
`BASELINE.md`. Raw results are in `results/optimized.json`.

The pass preserves unconditional writes, explicit dependencies, lazy
derivations, numeric priorities, insertion order, depth-first synchronous
propagation, reentrant writes, and transaction validation/rollback. It does
not add equality suppression or automatic graph solving.

## Results

| Scenario | Before ops/s | After ops/s | Speedup |
| --- | ---: | ---: | ---: |
| Primitive changed write and read | 13,635,858 | 14,325,313 | 1.05x |
| Cached read, depth 32 | 16,110,442 | 17,008,684 | 1.06x |
| Cold write, unobserved depth 100 | 233,164 | 339,875 | 1.46x |
| Pull write and read, depth 32 | 386,417 | 566,639 | 1.47x |
| Hot write to effect, depth 32 | 379,532 | 535,350 | 1.41x |
| Fan-out to 100 derived effects | 91,303 | 111,621 | 1.22x |
| Fan-in from 100 inputs | 712,972 | 838,485 | 1.18x |
| Idiomatic eight-layer converging graph | 374,905 | 548,776 | 1.46x |
| Atomic eight-input shared sum | 404,179 | 1,134,280 | 2.81x |
| Atomic 64-root disjoint fan-out | 9,725 | 114,866 | 11.81x |
| 100-item cart update | 341,649 | 526,287 | 1.54x |
| Create and dispose depth 32 | 90,174 | 102,368 | 1.14x |

## Changes

- Notification now reverses appended stack segments in place. It no longer
  allocates and reverses an array for every priority bucket or relies on a
  large spread call.
- Multi-root notification merges all priority pools once. Transaction result
  entries are appended once instead of repeatedly copying their prefix.
- Validated internal sources use a trusted read path, while the public `read`
  validation and error contract remain unchanged.
- Empty sparse dependency pools allocate their backing Map only on first
  subscription and release it when emptied.

## Additional probes

- A write with 150,000 same-priority listeners completed and notified all
  listeners; the baseline threw `RangeError: Maximum call stack size exceeded`.
- Approximate retained heap per empty `val` fell from 288 to 104 bytes in the
  same 200,000-object Node probe.
- Disjoint composed transaction latency changed from approximately 115 to 16
  microseconds at width 64, and from 6,427 to 60 microseconds at width 512.
  The latter is more than 100 times faster and no longer follows quadratic
  pool-rebuilding growth.

Performance measurements remain machine-local. Re-run `pnpm bench:compare`
after subsequent changes rather than using these numbers as test thresholds.
