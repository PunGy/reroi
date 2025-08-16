# List of things to be done

## Fluid.debug

Debbuging toolkit for inspecting reactive system:

- **recording**: track what reactions was triggered during a period of
time.
    - **startRecording**: start recording reactions
    - **finishRecording**: stop recording and print results
- **mark**: assign some ID to reactive object to see it name during
recordings.
- **info**: print information about reactive object: either it value or
derivation, what dependencies does it have, etc.

## Minor

- Add `literateFn` to `transaction.write`.
- Replace `mapF` with `mapE`.
- Change order of arguments in `transaction.fold`.
- Consider rename `transaction.resolved` to `transaction.success`, and
`transaction.rejected` to `transaction.error`.

