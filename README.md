# reroi

[![npm](https://img.shields.io/npm/v/reroi.svg)](https://www.npmjs.com/package/reroi)

Zero-dependency library for creating reactive systems with maximum control.

## Content

- [Overview](#overview)
- [Implementation](#implementation)
  - [Reactive type](#reactive-type)
    - [val: ReactiveValue](#val-reactivevalue)
    - [derive: ReactiveDerivation](#derive-reactivederivation)
    - [deriveAll: ReactiveDerivation of multiple sources](#deriveall-reactivederivation-of-multiple-sources)
  - [Reading and Writing](#reading-and-writing)
    - [write](#write)
    - [read](#read)
  - [Listening](#listening)
    - [listen](#listen)
    - [listenAll](#listenall)
  - [Priorities](#priorities)
    - [Levels](#levels)
    - [priorities.before](#prioritiesbefore)
    - [priorities.after](#prioritiesafter)
    - [Prioritization usage](#prioritization-usage)
- [Transactions](#transactions)
  - [Transactional write](#transactional-write)
    - [transaction.write](#transactionwrite)
    - [ReactiveTransaction](#reactivetransaction)
  - [Helper functions](#helper-functions)
    - [transaction.success](#transactionsuccess)
    - [transaction.error](#transactionerror)
    - [transaction.isSuccess](#transactionissuccess)
    - [transaction.isError](#transactioniserror)
    - [transaction.mapS](#transactionmaps)
    - [transaction.mapE](#transactionmape)
    - [transaction.fold](#transactionfold)
  - [Composing transactions](#composing-transactions)
    - [No changes applied until entire transaction is completed](#no-changes-applied-until-entire-transaction-is-completed)
    - [No changes applied if any transaction is error](#no-changes-applied-if-any-transaction-is-error)
    - [Transaction context and peek](#transaction-context-and-peek)
- [Other Functions](#other-functions)
  - [peek](#peek)
  - [destroy](#destroy)
- [Examples](#examples)
  - [React](#react)
    - [React connector](#react-connector)
    - [Shopping Cart](#shopping-cart)

## Overview

You can read the overview article here: [https://blog.pungy.me/articles/reroi]

Every reactive system has defining characteristics that determine its behavior.
Here is a list of them, along with how they are implemented in `reroi`:

- Execution flow: **Synchronous**
- Change propagation: **Push-Based**
- Update process: **Dataflow**
- Dependency graph: **Explicitly defined by the programmer (data flow differentiation)**
- Cycle dependencies: **Not handled automatically**
- Transactions: **Fully supported**
- Evaluation:
  - [derivations](#derive): **Lazy**
  - [listeners](#listen): **Proactive**
- Determinism: **Deterministic in practice, but might be non-deterministic due to caching and laziness**.

### Implementation

The key features of `reroi`:

- Reactive entities are [Type Constructors](#reactive-type).
- No side-effect subscription - You only subscribe to entities that you
explicitly list as dependencies.
- [Control of execution order](#order-of-evaluation) - you can manipulate when
your reaction will be recalculated.
- Full-featured [Transactions](#transactions) - Group multiple state changes
into atomic operations that can be rolled back if any part fails.
- High-Order Reactive Entities - reactive entities can contain other reactive
entities, enabling complex and dynamic dataflow patterns.

Here is a basic example of `reroi`:

```typescript
import * as R from 'reroi'

const _name_    = R.val("Michal")
const _surname_ = R.val("Smith")

const _surnameUpper_ = R.derive(_surname_, str => str.toUpperCase())

const _fullName_ = R.deriveAll(
    [_name_, _surnameUpper_],
    (name, surname) => name + " " + surname
)

console.log(R.read(_fullName_)) // Michal Smith

R.listen(
    _fullName_,
    fullName => console.log("Hello, " + fullName)
)

R.write(_name_, "George")
// log: Hello, George SMITH

console.log(R.read(_name_)) // George
console.log(R.read(_fullName_)) // George SMITH
```

The `_name_` and `_surname_` are `ReactiveValue<string>`. The `_fullName_` is
`ReactiveDerivation<string>`. These can be generalized as: `type
Reactive<A> = ReactiveValue<A> | ReactiveDerivation<A>`.

`listen` provides a way to proactively react to changes in any `Reactive` entity.

> Typically, variable names for reactive entities are wrapped with `_` around them. So, they kind of *float* on the *water* :))

> In the following text, the term *reactive entity* refers to `Reactive<A>`.
> Otherwise, clarification will specify whether it is a `derive` or a `value`.

### Reactive type

Any reactive object is a type constructor. This means it cannot be used as a
plain value, but rather as a *container* of *something*.

Similar to how you treat a `Promise`, you cannot read the value directly; you
need to unwrap it first. For example, you can unwrap a promise with `await`,
like so:

```typescript
import * as R from 'reroi'

const reactive_a: Reactive<number> = R.val(10)
const promise_a: Promise<number> = Promise.resolve(10)

console.log(await promise_a) // 10
console.log(R.read(reactive_a)) // 10
```

There are two types of reactive objects:

- `R.val` (Read-Write): Can be used with `R.read` and `R.write`.
- `R.derive` (Read-only): Can be used only with `R.read`.

> NOTE: ReactiveValue and ReactiveDerivation do not have any internal
> properties or methods. Every operation on them should use functions that
> accept them as parameters.

#### val: ReactiveValue

`ReactiveValue` or `val` is an independent container with some value inside it.
To read it, pass it to `read` (which can also consume
`ReactiveDerivation`). To modify it, set the new value with `write`.

```typescript
function val<V>(value: V): ReactiveValue<V>;
```

#### derive: ReactiveDerivation

The `ReactiveDerivation`, created with `derive`, is a way to create a new
computed value derived from an existing `Reactive` entity.

```typescript
function derive<V, V2>(
    _source_: Reactive<V>,
    computation: (value: V) => V2,
    props?: { priority?: Priority },
): ReactiveDerivation<V2>;
```

- **\_source\_**: A single reactive dependency we deriving from.
- **computation**: A function that takes a single value, based on the source. The return value becomes the state of the derivation.
- **props**:
  - **priority**: See [priorities](#priorities). Default is `priorities.base`.

The result of the derivation is cached between calls and recomputed only after dependency updates.

```typescript
import * as R from 'reroi'

const _cost_ = R.val(200)
const _discounted_ = R.derive(_cost_, cost => cost * 0.85) // 15% discount

console.log(R.read(_discounted_)) // 170, computed
console.log(R.read(_discounted_)) // 170, cached

R.write(_cost_, 100)
R.write(_cost_, 500)

// 85 was ignored since not read
console.log(R.read(_discounted_)) // 425, computed
```

> NOTE: Derivation update is a **passive** listener, meaning the
> **computation** is not called immediately after a dependency update, only
> upon direct **reading**. For an active listener, use
> [listen](#listen).

> IMPORTANT EXCEPTION: If a derive is in the dependency list for listen/listenAll,
> it will be recomputed when the listener is about to execute.

#### deriveAll: ReactiveDerivation of multiple sources

The `ReactiveDerivation`, created with `derive`, is a way to create a new
computed value derived from an existing `Reactive` entity.

```typescript
function deriveAll<Vs extends Array<unknown>, V2>(
    _sources_: { [K in keyof Vs]: Reactive<Vs[K]> },
    computation: (value: Vs) => V2,
    props?: { priority?: Priority },
): ReactiveDerivation<V2>;
```

- ***sources***: A list of reactive dependencies we deriving from.
- **computation**: A function that takes a list of values from the
dependencies, and returns a state of the derivation.
- **props**:
  - **priority**: See [priorities](#priorities). Default is `priorities.base`.

```typescript
const _a_ = val("a")
const _b_ = val("c")
const _d_ = val("d")
const _e_ = val("e")

const deps = [_a_, _b_, _c_, _d_, _e_]
const _word_ = deriveAll(deps, sources =>
    sources.reduce((str, x) => str + x, ""))

read(_word_) // abcde

const _f_ = val(10)

const _compound_ = deriveAll([_e_, _f_], ([str, num]) =>
    str.toUpperCase() + ": " + num.toFixed(5))

read(_compound_) // E: 10.00000
```

### Reading and Writing

#### write

```typescript
function write<A>(
    _value_: ReactiveValue<A>,
    newValue: A | ((value: A) => A),
    props?: { literateFn?: boolean },
): ReactiveValue<A>;
```

- ***value***: Reactive value to write to.
- **newValue**: Value producer or a plain value.
- **props**:
  - **literateFn**: Treat a function passed as `newValue` as a value, not as
    a value producer.

```typescript
import { val, read, write } from 'reroi'

const _x_ = val(10)

write(_x_, 20)
expect(read(_x_)).toBe(20)

write(_x_, x => x * 2)
expect(read(_x_)).toBe(40)

// LiterateFn
const _lazyX_ = val(() => 10)
const x20 = () => 20
write(_lazyX_, x20, { literateFn: true })

expect(read(_lazyX_)).toBe(x20)
```

`write` has no memoization, and even if you write the same value
repeatedly, it will always propagate changes to dependencies:

```typescript
import { val, write, listen } from 'reroi'

const _x_ = val(5)
listen(_x_, x => console.log(`I'm on ${x}`))

write(_x_, 10) // I'm on 10
write(_x_, 10) // I'm on 10
write(_x_, 10) // I'm on 10
```

#### read

```typescript
function read<V>(_reactive_: Reactive<V>): V;
```

- If it's a `ReactiveValue`, returns the associated value.
- If it's a `ReactiveDerivation`, computes the value if not cached.

### Listening

#### listen

Active listener with side effects on single dependency:

```typescript
type Unsub = () => void;

function listen<V>(
    _source_: Reactive<V>,
    sideEffect: (value: V) => void,
    props?: { priority?: Priority, immediate?: boolean },
): Unsub;
```

- **\_source\_**: A single reactive dependency we listen and fire effect on update.
- **sideEffect**: An effect called on update of the source. `sideEffect`
is called on **every** dependency update.
- **props**:
  - **priority**: See [priorities](#priorities). Default is
    `priorities.base`.
  - **immediate**: Call the listen effect upon declaration. Default is
    `false`.

#### listenAll

Active listener with side effects:

```typescript
type Unsub = () => void;

function listenAll<Vs extends Array<unknown>, V2>(
    _sources_: { [K in keyof Vs]: Reactive<Vs[K]> },
    sideEffect: (values: Vs) => void,
    props?: { priority?: Priority, immediate?: boolean },
): Unsub;
```

- **\_sources\_**: A list of dependencies.
- **sideEffect**: An effect to be called on update of dependencies.
- **props**:
  - **priority**: See [priorities](#priorities). Default is
    `priorities.base`.
  - **immediate**: Call the listen effect upon declaration. Default is
    `false`.

### Priorities

For details on controlling evaluation order with prioritization, read here:
[controlling evaluation order](https://blog.pungy.me/articles/reroi#1-controlling-evaluation-order)

Basically, `reroi` **DOES NOT** automatically resolve issues with evaluation
order. If your derivation or listener subscribes to a source more than once
(e.g., implicitly through a chain), it will update **multiple times**.

```typescript
import * as R from 'reroi'

const _price_ = R.val(0)

const _tax_ = R.derive(
  _price_,
  price => price * 0.08, // 8% tax
)
const _shipping_ = R.derive(
  _price_,
  price => price > 50 ? 0 : 5.00, // free shipping over $50
)

R.listenAll(
    [_price_, _tax_, _shipping_],
    ([price, tax, shipping]) => {
        const total = price + tax + shipping
        console.log(`Final price: $${total.toFixed(2)} (incl. tax: $${tax.toFixed(2)}, shipping: $${shipping.toFixed(2)})`)
    }
)

R.write(_price_, 20.00)
// Final price: $26.60 (incl. tax: $1.60, shipping: $5.00)
// Would be logged THREE TIMES
```

This occurs because the listener subscribes to `_price_` three times:
explicitly in the dependency list, and implicitly through `_tax_` and
`_shipping_` (`_price_` updates `_tax_`, which updates the listener).

This behavior is **intended**. To correct it, use priorities, which explicitly
define the position of a `listener` or `derivation` in the dependency list of
its sources.

The fixed solution looks like this:

```typescript
import * as R from 'reroi'

R.listen(
    _price_, // We only need to subscribe to the root dependency.
    (price) => {
        const total = price + R.read(_tax_) + R.read(_shipping_)
        console.log(`Final price: $${total.toFixed(2)} (incl. tax: $${tax.toFixed(2)}, shipping: $${shipping.toFixed(2)})`)
    },
    { priority: R.priorities.after(R.priorities.base) },
)
```

Now, the internal dependency graph would look like this:

```
price
 |
 +---> tax
 +---> shipping
 |
 +---> listener
```

The listener executes **after** shipping and tax.

#### Levels

A priority level is essentially a number. There are three default levels:

- **priorities.highest**: Maximum priority level, executed **before all** others.
- **priorities.base**: Default priority for dependencies, equivalent to
`0`.
- **priorities.lowest**: Opposite of `highest` - executed **after all**
others.

```typescript
import { val, listen } from 'reroi'

const _msg_ = val("")
const log = console.log

listen(_msg_, (msg) => log("3: " + msg), { priority: 3 })
listen(_msg_, (msg) => log("2: " + msg), { priority: 2 })
listen(_msg_, (msg) => log("4: " + msg), { priority: 4 })
listen(_msg_, (msg) => log("1: " + msg), { priority: 1 })

write(_msg_, "Hi?")

// 4: Hi?
// 3: Hi?
// 2: Hi?
// 1: Hi?
```

No priority should be higher than `highest`, neither lower than `lowest`.

- `highest`: `1000`.
- `lowest`: `-1000`.

`2000` of levels should be enough for all ;)

#### priorities.before

```typescript
function before(p0: ReactiveDerivation<unknown> | Priority): Priority;
```

Helper function that provides a priority **higher** than the one passed as an
argument. You can also pass a derivation, meaning your priority will be
**higher** than that of the derivation.

#### priorities.after

```typescript
function after(p0: ReactiveDerivation<unknown> | Priority): Priority;
```

`after` is the opposite of `before`. It decreases the priority relative to the
one passed.

#### Prioritization usage

```typescript
import * as R from 'reroi'

const base = R.priorities.base

expect(R.priorities.before(base)).toBe(1)
expect(R.priorities.after(base)).toBe(-1)

const _a_ = R.val(0)
const _der1_ = R.derive(_a_, a => a + 1, { priority: 15 })

expect(R.priorities.before(_der1_)).toBe(16)
expect(R.priorities.after(_der1_)).toBe(14)
```

Rather than memorizing numerical directions, use the helpers :)

## Transactions

For an overview of transactions, read here:
[transactions](https://blog.pungy.me/articles/reroi#2-transactions).

### Transactional write

#### transaction.write

The function interface for `transaction.write` is complex due to compositional
transactions:

```typescript
type TransactionState<R, E> = TransactionSuccess<R> | TransactionError<E>
type TransactionFN = <R, E, C>(aVal: R, context: C) => TransactionState<R, E>

function writeT<R, E, C = {}, ID extends string = string>(
  _value_: ReactiveValue<R>,
  newValue: TransactionFN<R, E, C> | R,
  id?: ID
): ReactiveTransaction<R, E, C, ID>;
```

Generics:

- **R**: Result of the transaction to be written to `ReactiveValue`.
- **E**: Type of error with which the transaction can be rejected.
- **C**: Context of the transaction. Used for composition.
- **ID**: ID of the transaction for further use in `context`.

Parameters:

- ***value***: Reactive value to write the transaction result to.
- **newValue**: Either a function that accepts the current value and
transaction context, or a plain value to resolve the transaction with.
- **id**: Optional ID of the transaction.

```typescript
import { val, transaction, read } from 'reroi'

const _a_ = val('a')
const tr = transaction.write(_a_, 'A')

expect(read(_a_)).toBe('a')
```

#### ReactiveTransaction

The transaction object returned by transactional write provides an interface
for the created transaction. The primary method of interest is `run`, which
executes the transaction.

```typescript
export interface ReactiveTransaction<
  R = unknown, // Might be success with
  E = unknown, // Might be error with
> {
  run(): TransactionState<R, E>;
}
```

```typescript
import * as R from 'reroi'

const _a_ = R.val('a')
const tr = R.transaction.write(_a_, 'A')

tr.run();
expect(R.read(_a_)).toBe('A')
```

### Helper functions

#### transaction.success

Use this inside a `TransactionFN` to produce a success value to be written to
the `ReactiveValue`.

```typescript
type TransactionSuccess<R> = { value: R }
const success = <R>(value: R): TransactionSuccess<R> => ({
```

```typescript
import * as R from 'reroi'

const _a_ = R.val('a')
const tr = R.transaction.write(_a_, () => R.transaction.success('A'))

tr.run();
expect(R.read(_a_)).toBe('A')
```

#### transaction.error

Use this inside a `TransactionFN` to reject the transaction execution.

```typescript
type TransactionError<E> = { error: E }
function error<E>(error: E): TransactionError<E>
```

```typescript
import * as R from 'reroi'

const _a_ = R.val('a')
const tr = R.transaction.write(_a_, () => R.transaction.error('A'))

tr.run();
expect(R.read(_a_)).toBe('a')
```

#### transaction.isSuccess

Checks whether the transaction result was success.

```typescript
function isSuccess<R, E>(transaction: TransactionState<R, E>): transaction is TransactionSuccess<R>
```

```typescript
import * as R from 'reroi'

const _a_ = R.val('a')
const tr = R.transaction.write(_a_, () => R.transaction.success('A'))

const state = tr.run();
expect(R.transaction.isSuccess(state)).toBe(true)

if (R.transaction.isSuccess(state)) {
    console.log(state.value) // 'A'
}
```

#### transaction.isError

Checks whether the transaction result was error.

```typescript
function isError<R, E>(transaction: TransactionState<R, E>): transaction is TransactionError<E>
```

```typescript
import * as R from 'reroi'

const _a_ = R.val('a')
const tr = R.transaction.write(_a_, () => R.transaction.error('A'))

const state = tr.run();
expect(R.transaction.isError(state)).toBe(true)

if (R.transaction.isError(state)) {
    console.log(state.error) // 'A'
}
```

#### transaction.mapS

> The following utilities are optional and provide a more functional
> programming flavor to reroi :)

> Transaction is essentially an `IO (Either E R)` ADT with Functor and Foldable
> type classes.

Maps `TransactionSuccess<R>` to `TransactionSuccess<R2>`. Can be used to
*peek* into a success transaction's value.

```typescript
import * as R from 'reroi'

const _a_ = R.val('a')
const tr = R.transaction.write(_a_, () => R.transaction.success('A'))

const beautify = R.transaction.mapS((value: string) => `I was success with: "${value}"`)

const state = beautify(tr.run())

if (R.transaction.isSuccess(state)) {
    console.log(state.value) // I was success with: "A"
}
```

#### transaction.mapE

Maps `TransactionError<E>` to `TransactionError<E2>`.

```typescript
import * as R from 'reroi'

const _a_ = R.val('a')
const tr = R.transaction.write(_a_, () => R.transaction.error('A'))

const beautify = R.transaction.mapE(error => `I was rejected with: "${error}"`)

const state = beautify(tr.run())

if (R.transaction.isError(state)) {
    console.log(state.error) // I was error with: "A"
}
```

#### transaction.fold

Folds or reduces the transaction result into a single value.

```typescript
import * as R from 'reroi'

const _a_ = R.val('a')
const trS = R.transaction.write(_a_, () => R.transaction.success('A'))
const trE = R.transaction.write(_a_, () => R.transaction.error('A'))

const toBoolean = R.transaction.fold(
    () => false, // on error 
    () => true,  // on success
)

console.log(toBoolean(trS.run())) // true
console.log(toBoolean(trE.run())) // false
```

### Composing transactions

The key strength of transactions is composition. You can combine multiple transactions into a single one, preserving atomicity and other transactional properties.

```typescript
import * as R from 'reroi'

const _name_ = R.val("George")
const _surname_ = R.val("Kowalski")

R.listenAll([_name_, _surname_], ([name, surname]) => {
    console.log(`Hello, ${name} ${surname}!`)
})

const tr = R.transaction.compose(
               R.transaction.write(_name_, "Grzegosz"),
               R.transaction.write(_surname_, "Smith"),
           )

tr.run()
// Only once:
// Hello, Grzegosz Smith!
```

#### No changes applied until entire transaction is completed

Even if one part of the transaction completes, no values are written until the entire transaction finishes:

```typescript
import * as R from 'reroi'

const _a_ = R.val("a")
const _b_ = R.val("b")
const _c_ = R.val("c")

const _A_ = R.derive(_a_, (a) => a.toUpperCase())

const tr = R.transaction.compose(
    R.transaction.write(_a_, "F"),
    R.transaction.write(_b_, () => {
        console.log(R.read(_a_)) // a
        console.log(R.read(_A_)) // A
        return R.transaction.success("B")
    }),
    R.transaction.write(_c_, () => {
        console.log(R.read(_b_)) // b
        return R.transaction.success("C")
    }),
)
```

#### No changes applied if any transaction is error

```typescript
import * as R from 'reroi'

const _a_ = R.val("a")
const _b_ = R.val("b")
const _c_ = R.val("c")

R.listen(_a_, console.log)
R.listen(_b_, console.log)
R.listen(_c_, console.log)

const tr = R.transaction.compose(
    R.transaction.write(_a_, "A"),
    R.transaction.write(_b_, () => R.transaction.error("error")),
    R.transaction.write(_c_, "C"),
)

tr.run()

console.log(R.read(_a_)) // logs: 'a' // Wasn't changed
// No console logs from `listen` reactions
```

This allows rejecting the entire transaction if any part fails, but it raises
questions:

1. How to access new values from previously success actions?
2. How to compute a derivation's new state?

The answers involve transaction context and `peek`.

#### Transaction context and peek

During execution, the `ctx` parameter (second argument in the handler for
`transaction.write`) provides access to context. Assign an `id` to
actions to identify values in the context.

`peek` allows previewing how a derivation's value **would** look based on
provided dependency values. It calls the inner function of `derive`
without affecting the derivation.

The API is more complex, but it enables true transactional behavior.

```typescript
import * as R from 'reroi'

const _name_ = R.val("George")
const _surname_ = R.val("Kowalski")
const _fullName_ = R.deriveAll(
    [_name_, _surname_],
    ([name, surname]) => name + " " + surname
)

const _messagePool_ = R.val<Array<string>>([])

const addPerson = (name, surname) => (
    R.transaction.compose(
        //                  r_val   val   id
        R.transaction.write(_name_, name, "name"),
        R.transaction.write(_surname_, surname, "surname"),
        R.transaction.write(_messagePool_, (pool, ctx) => {
            const fullName = R.peek(_fullName_, [ctx.name, ctx.surname])

            pool.push(`The user "${fullName}" has been added!`)
            return pool
        })
    )
)

addPerson("Oda", "Nobunaga").run()

console.log(
    R.read(_messagePool_).at(-1) // The user "Oda Nobunaga" has been added!
)
```

## Other Functions

### peek

Reads a derive with dependencies provided as a list in the second parameter.
Completely pure and does not affect the `derivation` in any way.

```typescript
function peek<R extends ReactiveDerivation>(_derive_: R, dependencies: R['dependencies']): R['value'];
```

### destroy

You may need to destroy a derivation so it no longer reacts to changes (and no
one reacts to its changes).

To ensure all links are cleared and avoid garbage accumulation, use
`destroy`.

```typescript
function destroy(
    _derivation_: ReactiveDerivation,
): void;
```

Once destroyed, it notifies all listeners, which stop listening. If it was the
last dependency, dependents are cascadedly destroyed.

## Examples

List of complete examples of `reroi` usage.

### React

To connect `reroi` with React, create a custom hook: `useReactive` (this could become a separate package).

#### React connector

The `useReactive` hook listens to updates from `_reactive_`, stores the value
in a ref, and forces a state update (since `useState` memoizes identical
values, which `reroi` does not).

```typescript
import { useEffect, useReducer, useRef } from "react";
import { Reactive, listen } from "reroi";

export function useReactive<V>(_reactive_: Reactive<V>): V {
  const [, forceUpdate] = useReducer(() => [], [])
  const listener = useRef<ReturnType<typeof listen> | null>(null)
  const value = useRef(R.read(_reactive_))

  useEffect(
    () => {
      if (listener.current !== null) {
        // unsub from old reactive
        listener.current()
      }

      listener.current = listen(
        _reactive_,
        v => {
          value.current = v
          forceUpdate()
        }
      )
      return listener.current
    },
    [_reactive_]
  )

  return value.current
}
```

Based on this hook, `reroi` serves as an effective state manager. Here is an example.

#### Shopping Cart

[Try on codesandbox](https://codesandbox.io/p/sandbox/q3r8cm)

An app with numerous reactions, featuring a shopping cart with discounts: add
items, observe price increases, apply discount rates based on total price, and
add/remove discount rates. Note the clean state usage: no prop drilling, no
complex structures.

The entire state is in `model.ts`, connected to components via the `useReactive` hook.
