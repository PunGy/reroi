# List of things to be done

## Debug

Debbuging toolkit for inspecting reactive system:

- **recording**: track what reactions was triggered during a period of
time.
    - **startRecording**: start recording reactions
    - **finishRecording**: stop recording and print results
- **mark**: assign some ID to reactive object to see it name during
recordings.
- **info**: print information about reactive object: either it value or
derivation, what dependencies does it have, etc.

## Framework connection

### reroi/react

React integration utils:

```typescript
import { Reactive } from 'reroi'

/**
 * Subscribe to a value of the reactive object
 * re-render component on update
 */
function useReactive<T>(_reactive_: Reactive<T>): T;
```

## Minor

- Add `literateFn` to `transaction.write`.

