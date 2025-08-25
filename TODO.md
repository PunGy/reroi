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

## Fluid.listen

- **once** option: run listener once and then destroy.

## Fluid.notifier

Special object for message broadcasting. Difference from `Fluid.val`: no read
or write allowed, no state is keeped. You can only `notify` subscribers with
new message.

Can be without parameters:

```typescript
const saved = Fluid.notifier()

Fluid.listen(
    saved,
    () => {
        console.log('File is saved')
    },
)

saved.notify() // File is saved
```

And with parameters:

```typescript
const save = Fluid.notifier<string>()

const button = document.getElementById('save-button').addEventListener('click', () => {
    const filename = getFileName()
    save.notify(filename)
})

Fluid.listen(
    save,
    filename => {
        console.log(`saving file "${filename}"`)
    }
)
```

TODO: think about integrating with **transactions**.

## Minor

- Add `literateFn` to `transaction.write`.
- Replace `mapF` with `mapE`.
- Change order of arguments in `transaction.fold`.
- Consider rename `transaction.success` to `transaction.success`, and
`transaction.error` to `transaction.error`.

