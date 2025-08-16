# Reactive Fluid

[![npm](https://img.shields.io/npm/v/reactive-fluid.svg)](https://www.npmjs.com/package/reactive-fluid)

Zero-dependency library for creating reactive systems with maximum control.

## Content

- [Overview](#overview)
- [Implementation](#implementation)
  - [Reactive type](#reactive-type)
    - [Fluid.val: ReactiveValue](#fluidval-reactivevalue)
    - [Fluid.derive: ReactiveDerivation](#fluidderive-reactivederivation)
  - [Reading and Writing](#reading-and-writing)
    - [Fluid.write](#fluidwrite)
    - [Fluid.read](#fluidread)
  - [Listening](#listening)
    - [Fluid.listen](#fluidlisten)
  - [Priorities](#priorities)
    - [Levels](#levels)
    - [Fluid.priorities.before](#fluidprioritiesbefore)
    - [Fluid.priorities.after](#fluidprioritiesafter)
    - [Prioritization usage](#prioritization-usage)
- [Transactions](#transactions)
  - [Transactional write](#transactional-write)
    - [Fluid.transaction.write](#fluidtransactionwrite)
    - [ReactiveTransaction](#reactivetransaction)
  - [Helper functions](#helper-functions)
    - [Fluid.transaction.resolved](#fluidtransactionresolved)
    - [Fluid.transaction.rejected](#fluidtransactionrejected)
    - [Fluid.transaction.isResolved](#fluidtransactionisresolved)
    - [Fluid.transaction.isRejected](#fluidtransactionisrejected)
    - [Fluid.transaction.mapR](#fluidtransactionmapr)
    - [Fluid.transaction.mapF](#fluidtransactionmapf)
    - [Fluid.transaction.fold](#fluidtransactionfold)
  - [Composing transactions](#composing-transactions)
    - [No changes applied until entire transaction is completed](#no-changes-applied-until-entire-transaction-is-completed)
    - [No changes applied if any transaction is rejected](#no-changes-applied-if-any-transaction-is-rejected)
    - [Transaction context and Fluid.peek](#transaction-context-and-fluidpeek)
- [Other Functions](#other-functions)
  - [Fluid.peek](#fluidpeek)
  - [Fluid.destroy](#fluiddestroy)
- [Examples](#examples)
  - [React](#react)
    - [React connector](#react-connector)
    - [Shopping Cart](#shopping-cart)

## Overview

You can read the overview article here: [https://blog.pungy.me/articles/fluid]

Every reactive system has defining characteristics that determine its behavior. Here is a list of them, along with how they are implemented in `Fluid`:

- Execution flow: **Synchronous**
- Change propagation: **Push-Based**
- Update process: **Dataflow**
- Dependency graph: **Explicitly defined by the programmer (data flow differentiation)**
- Cycle dependencies: **Not handled automatically**
- Transactions: **Fully supported**
- Evaluation:
  - [derivations](#fluidderive): **Lazy**
  - [listeners](#fluidlisten): **Proactive**
- Determinism: **Deterministic in practice, but might be non-deterministic due to caching and laziness**.

### Implementation

The key features of `Fluid`:

- Reactive entities are [Type Constructors](#reactive-type).
- No side-effect subscription - You only subscribe to entities that you
explicitly list as dependencies.
- [Control of execution order](#order-of-evaluation) - you can manipulate when
your reaction will be recalculated.
- Full-featured [Transactions](#transactions) - Group multiple state changes
into atomic operations that can be rolled back if any part fails.
- High-Order Reactive Entities - reactive entities can contain other reactive
entities, enabling complex and dynamic dataflow patterns.

Here is a basic example of `Fluid`:

```typescript
import { Fluid } from 'reactive-fluid'

const _name_    = Fluid.val("Michal")
const _surname_ = Fluid.val("Smith")

const _fullName_ = Fluid.derive(
    [_name_, _surname_],
    (name, surname) => name + " " + surname
)

console.log(Fluid.read(_fullName_)) // Michal Smith

Fluid.listen(
    _fullName_,
    fullName => console.log("Hello, " + fullName)
)

Fluid.write(_name_, "George")
// Hello, George Smith

console.log(Fluid.read(_name_)) // George
```

The `_name_` and `_surname_` are `ReactiveValue<string>`. The `_fullName_` is
`ReactiveDerivation<string>`. These can be generalized as: `type
Reactive<A> = ReactiveValue<A> | ReactiveDerivation<A>`.

`Fluid.listen` provides a way to proactively react to changes in any `Reactive` entity.

> Typically, variable names for reactive entities are wrapped with `_` around them. So, they kind of *float* on the *water* :))

> In the following text, the term *reactive entity* refers to `Reactive<A>`.
> Otherwise, clarification will specify whether it is a `derive` or a `value`.

### Reactive type

Any reactive object is a type constructor. This means it cannot be used as a
plain value, but rather as a _container_ of *something*.

Similar to how you treat a `Promise`, you cannot read the value directly; you
need to unwrap it first. For example, you can unwrap a promise with `await`,
like so:

```typescript
import { Fluid } from 'reactive-fluid'

const reactive_a: Reactive<number> = Fluid.val(10)
const promise_a: Promise<number> = Promise.resolve(10)

console.log(await promise_a) // 10
console.log(Fluid.read(reactive_a)) // 10
```

There are two types of reactive objects:

- `Fluid.val` (Read-Write): Can be used with `Fluid.read` and `Fluid.write`.
- `Fluid.derive` (Read-only): Can be used only with `Fluid.read`.

> NOTE: ReactiveValue and ReactiveDerivation do not have any internal
> properties or methods. Every operation on them should use functions that
> accept them as parameters.

#### Fluid.val: ReactiveValue

`ReactiveValue` or `val` is an independent container with some value inside it.
To read it, pass it to `Fluid.read` (which can also consume
`ReactiveDerivation`). To modify it, set the new value with `Fluid.write`.

```typescript
function val<V>(value: V): ReactiveValue<V>;
```

#### Fluid.derive: ReactiveDerivation

The `ReactiveDerivation`, created with `Fluid.derive`, is a way to create a new
computed value derived from an existing `Reactive` entity.

```typescript
function derive<V, V2>(
    dependencies: Reactive<V> | Array<Reactive<V>>,
    computation: ((value: V) => V2) | ((values: Array<V>) => V2),
    props?: { priority?: Priority },
): ReactiveDerivation<V2>;
```

- **dependencies**: Either a single dependency or a list of dependencies. The derivation updates when any dependency changes.
- **computation**: A function that takes a single value or a list of values, based on the dependencies. The return value becomes the state of the derivation.
- **props**:
    - **priority**: See [priorities](#fluidpriorities). Default is `Fluid.priorities.base`.

The result of the derivation is cached between calls and recomputed only after dependency updates.

```typescript
import { Fluid } from 'reactive-fluid'

const _cost_ = Fluid.val(200)
const _discounted_ = Fluid.derive(_cost_, cost => cost * 0.85) // 15% discount

console.log(Fluid.read(_discounted_)) // 170, computed
console.log(Fluid.read(_discounted_)) // 170, cached

Fluid.write(_cost_, 100)
Fluid.write(_cost_, 500)

// 85 was ignored since not read
console.log(Fluid.read(_discounted_)) // 425, computed
```

> NOTE: Derivation update is a **passive** listener, meaning the
> **computation** is not called immediately after a dependency update, only
> upon direct **reading**. For an active listener, use
> [Fluid.listen](#fluid-listen).

> IMPORTANT EXCEPTION: If a derive is in the dependency list for Fluid.listen,
> it will be recomputed when the listener is about to execute.

### Reading and Writing

#### Fluid.write

```typescript
function write<A>(
    _value_: ReactiveValue<A>,
    newValue: A | ((value: A) => A),
    props?: { literateFn?: boolean },
): ReactiveValue<A>;
```

- **_value_**: Reactive value to write to.
- **newValue**: Value producer or a plain value.
- **props**:
    - **literateFn**: Treat a function passed as `newValue` as a value, not as
    a value producer.

```typescript
import { Fluid } from 'reactive-fluid'

const _x_ = Fluid.val(10)

Fluid.write(_x_, 20)
expect(Fluid.read(_x_)).toBe(20)

Fluid.write(_x_, x => x * 2)
expect(Fluid.read(_x_)).toBe(40)

// LiterateFn
const _lazyX_ = Fluid.val(() => 10)
const x20 = () => 20
Fluid.write(_lazyX_, x20, { literateFn: true })

expect(Fluid.read(_lazyX_)).toBe(x20)
```

`Fluid.write` has no memoization, and even if you write the same value
repeatedly, it will always propagate changes to dependencies:

```typescript
import { Fluid } from 'reactive-fluid'

const _x_ = Fluid.val(5)
Fluid.listen(_x_, x => console.log(`I'm on ${x}`))

Fluid.write(_x_, 10) // I'm on 10
Fluid.write(_x_, 10) // I'm on 10
Fluid.write(_x_, 10) // I'm on 10
```

#### Fluid.read

```typescript
function read<V>(_reactive_: Reactive<V>): V;
```

- If it's a `ReactiveValue`, returns the associated value.
- If it's a `ReactiveDerivation`, computes the value if not cached.

### Listening

#### Fluid.listen

Active listener with side effects:

```typescript
type Unsub = () => void;

function listen<V>(
    dependencies: Reactive<V> | Array<Reactive<V>>,
    sideEffect: ((value: V) => void) | ((values: Array<V>) => void),
    props?: { priority?: Priority, immediate?: boolean },
): Unsub;
```

- **dependencies**: Either a single dependency or a list of dependencies.
- **sideEffect**: A function that takes a single value or a list of values,
based on the dependencies. `sideEffect` is called on **every** dependency
update.
- **props**:
    - **priority**: See [priorities](#fluidpriorities). Default is
    `Fluid.priorities.base`.
    - **immediate**: Call the listen effect upon declaration. Default is
    `false`.

### Priorities

For details on controlling evaluation order with prioritization, read here:
[controlling evaluation order](https://blog.pungy.me/articles/fluid#1-controlling-evaluation-order)

Basically, `Fluid` **DOES NOT** automatically resolve issues with evaluation
order. If your derivation or listener subscribes to a source more than once
(e.g., implicitly through a chain), it will update **multiple times**.

```typescript
import { Fluid } from 'reactive-fluid'

const _price_ = Fluid.val(0)

const _tax_ = Fluid.derive(
  _price_,
  price => price * 0.08, // 8% tax
)
const _shipping_ = Fluid.derive(
  _price_,
  price => price > 50 ? 0 : 5.00, // free shipping over $50
)

Fluid.listen(
    [_price_, _tax_, _shipping_],
    (price, tax, shipping) => {
        const total = price + tax + shipping
        console.log(`Final price: $${total.toFixed(2)} (incl. tax: $${tax.toFixed(2)}, shipping: $${shipping.toFixed(2)})`)
    }
)

Fluid.write(_price_, 20.00)
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
import { Fluid } from 'reactive-fluid'

Fluid.listen(
    _price_, // We only need to subscribe to the root dependency.
    (price) => {
        const total = price + Fluid.read(_tax_) + Fluid.read(_shipping_)
        console.log(`Final price: $${total.toFixed(2)} (incl. tax: $${tax.toFixed(2)}, shipping: $${shipping.toFixed(2)})`)
    },
    { priority: Fluid.priorities.after(Fluid.priorities.base) },
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

A priority level is essentially a number (with minor exceptions). There are
three default levels:

- **Fluid.priorities.highest**: Special level, executed **before all** others,
even before **+Infinity** (but not before others defined with the same priority
earlier in the code).
- **Fluid.priorities.base**: Default priority for dependencies, equivalent to
`0`.
- **Fluid.priorities.lowest**: Opposite of `highest` - executed **after all**
others.

```typescript
import { Fluid } from 'reactive-fluid'

const _msg_ = Fluid.val("")
const log = console.log

Fluid.listen(_msg_, (msg) => log("3: " + msg), { priority: 3 })
Fluid.listen(_msg_, (msg) => log("2: " + msg), { priority: 2 })
Fluid.listen(_msg_, (msg) => log("4: " + msg), { priority: 4 })
Fluid.listen(_msg_, (msg) => log("1: " + msg), { priority: 1 })

Fluid.write(_msg_, "Hi?")

// 4: Hi?
// 3: Hi?
// 2: Hi?
// 1: Hi?
```

#### Fluid.priorities.before

```typescript
function before(p0: ReactiveDerivation<unknown> | Priority): Priority;
```

Helper function that provides a priority **higher** than the one passed as an
argument. You can also pass a derivation, meaning your priority will be
**higher** than that of the derivation.

#### Fluid.priorities.after

```typescript
function after(p0: ReactiveDerivation<unknown> | Priority): Priority;
```

`after` is the opposite of `before`. It decreases the priority relative to the
one passed.

#### Prioritization usage

```typescript
import { Fluid } from 'reactive-fluid'

const base = Fluid.priorities.base

expect(Fluid.priorities.before(base)).toBe(1)
expect(Fluid.priorities.after(base)).toBe(-1)

const _a_ = Fluid.val(0)
const _der1_ = Fluid.derive(_a_, a => a + 1, { priority: 15 })

expect(Fluid.priorities.before(_der1_)).toBe(16)
expect(Fluid.priorities.after(_der1_)).toBe(14)
```

Rather than memorizing numerical directions, use the helpers :)

## Transactions

For an overview of transactions, read here:
[transactions](https://blog.pungy.me/articles/fluid#2-transactions).

### Transactional write

#### Fluid.transaction.write

The function interface for `transaction.write` is complex due to compositional
transactions:

```typescript
type TransactionState<R, E> = TransactionResolved<R> | TransactionRejected<E>
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

- **_value_**: Reactive value to write the transaction result to.
- **newValue**: Either a function that accepts the current value and
transaction context, or a plain value to resolve the transaction with.
- **id**: Optional ID of the transaction.

```typescript
import { Fluid } from 'reactive-fluid'

const _a_ = Fluid.val('a')
const tr = Fluid.transaction.write(_a_, 'A')

expect(Fluid.read(_a_)).toBe('a')
```

#### ReactiveTransaction

The transaction object returned by transactional write provides an interface
for the created transaction. The primary method of interest is `run`, which
executes the transaction.

```typescript
export interface ReactiveTransaction<
  R = unknown, // Might be resolved with
  E = unknown, // Might be rejected with
> {
  run(): TransactionState<R, E>;
}
```

```typescript
import { Fluid } from 'reactive-fluid'

const _a_ = Fluid.val('a')
const tr = Fluid.transaction.write(_a_, 'A')

tr.run();
expect(Fluid.read(_a_)).toBe('A')
```

### Helper functions

#### Fluid.transaction.resolved

Use this inside a `TransactionFN` to produce a resolved value to be written to
the `ReactiveValue`.

```typescript
type TransactionResolved<R> = { value: R }
const resolved = <R>(value: R): TransactionResolved<R> => ({
```

```typescript
import { Fluid } from 'reactive-fluid'

const _a_ = Fluid.val('a')
const tr = Fluid.transaction.write(_a_, () => Fluid.transaction.resolved('A'))

tr.run();
expect(Fluid.read(_a_)).toBe('A')
```

#### Fluid.transaction.rejected

Use this inside a `TransactionFN` to reject the transaction execution.

```typescript
type TransactionRejected<E> = { error: E }
function rejected<E>(error: E): TransactionRejected<E>
```

```typescript
import { Fluid } from 'reactive-fluid'

const _a_ = Fluid.val('a')
const tr = Fluid.transaction.write(_a_, () => Fluid.transaction.rejected('A'))

tr.run();
expect(Fluid.read(_a_)).toBe('a')
```

#### Fluid.transaction.isResolved

Checks whether the transaction result was resolved.

```typescript
function isResolved<R, E>(transaction: TransactionState<R, E>): transaction is TransactionResolved<R>
```

```typescript
import { Fluid } from 'reactive-fluid'

const _a_ = Fluid.val('a')
const tr = Fluid.transaction.write(_a_, () => Fluid.transaction.resolved('A'))

const state = tr.run();
expect(Fluid.transaction.isResolved(state)).toBe(true)

if (Fluid.transaction.isResolved(state)) {
    console.log(state.value) // 'A'
}
```

#### Fluid.transaction.isRejected

Checks whether the transaction result was rejected.

```typescript
function isRejected<R, E>(transaction: TransactionState<R, E>): transaction is TransactionRejected<E>
```

```typescript
import { Fluid } from 'reactive-fluid'

const _a_ = Fluid.val('a')
const tr = Fluid.transaction.write(_a_, () => Fluid.transaction.rejected('A'))

const state = tr.run();
expect(Fluid.transaction.isRejected(state)).toBe(true)

if (Fluid.transaction.isRejected(state)) {
    console.log(state.error) // 'A'
}
```

#### Fluid.transaction.mapR

> The following utilities are optional and provide a more functional
> programming flavor to Fluid :)

> Transaction is essentially an `IO (Either E R)` ADT with Functor and Foldable
> type classes.

Maps `TransactionResolved<R>` to `TransactionResolved<R2>`. Can be used to
_peek_ into a resolved transaction's value.

```typescript
import { Fluid } from 'reactive-fluid'

const _a_ = Fluid.val('a')
const tr = Fluid.transaction.write(_a_, () => Fluid.transaction.resolved('A'))

const beautify = Fluid.transaction.mapR((value: string) => `I was resolved with: "${value}"`)

const state = beautify(tr.run())

if (Fluid.transaction.isResolved(state)) {
    console.log(state.value) // I was resolved with: "A"
}
```

#### Fluid.transaction.mapF

Maps `TransactionRejected<E>` to `TransactionRejected<E2>`.

```typescript
import { Fluid } from 'reactive-fluid'

const _a_ = Fluid.val('a')
const tr = Fluid.transaction.write(_a_, () => Fluid.transaction.rejected('A'))

const beautify = Fluid.transaction.mapF(error => `I was rejected with: "${error}"`)

const state = beautify(tr.run())

if (Fluid.transaction.isRejected(state)) {
    console.log(state.error) // I was rejected with: "A"
}
```

#### Fluid.transaction.fold

Folds or reduces the transaction result into a single value.

```typescript
import { Fluid } from 'reactive-fluid'

const _a_ = Fluid.val('a')
const trR = Fluid.transaction.write(_a_, () => Fluid.transaction.resolved('A'))
const trF = Fluid.transaction.write(_a_, () => Fluid.transaction.rejected('A'))

const toBoolean = Fluid.transaction.fold(
    () => true,  // on resolved
    () => false, // on rejected 
)

console.log(toBoolean(trR.run())) // true
console.log(toBoolean(trF.run())) // false
```

### Composing transactions

The key strength of transactions is composition. You can combine multiple transactions into a single one, preserving atomicity and other transactional properties.

```typescript
import { Fluid } from 'reactive-fluid'

const _name_ = Fluid.val("George")
const _surname_ = Fluid.val("Kowalski")

Fluid.listen([_name_, _surname_], (name, surname) => {
    console.log(`Hello, ${name} ${surname}!`)
})

const tr = Fluid.transaction.compose(
               Fluid.transaction.write(_name_, "Grzegosz"),
               Fluid.transaction.write(_surname_, "Smith"),
           )

tr.run()
// Only once:
// Hello, Grzegosz Smith!
```

#### No changes applied until entire transaction is completed

Even if one part of the transaction completes, no values are written until the entire transaction finishes:

```typescript
import { Fluid } from 'reactive-fluid'

const _a_ = Fluid.val("a")
const _b_ = Fluid.val("b")
const _c_ = Fluid.val("c")

const _A_ = Fluid.derive(_a_, (a) => a.toUpperCase())

const tr = Fluid.transaction.compose(
    Fluid.transaction.write(_a_, "F"),
    Fluid.transaction.write(_b_, () => {
        console.log(Fluid.read(_a_)) // a
        console.log(Fluid.read(_A_)) // A
        return Fluid.transaction.resolved("B")
    }),
    Fluid.transaction.write(_c_, () => {
        console.log(Fluid.read(_b_)) // b
        return Fluid.transaction.resolved("C")
    }),
)
```

#### No changes applied if any transaction is rejected

```typescript
import { Fluid } from 'reactive-fluid'

const _a_ = Fluid.val("a")
const _b_ = Fluid.val("b")
const _c_ = Fluid.val("c")

Fluid.listen(_a_, console.log)
Fluid.listen(_b_, console.log)
Fluid.listen(_c_, console.log)

const tr = Fluid.transaction.compose(
    Fluid.transaction.write(_a_, "A"),
    Fluid.transaction.write(_b_, () => Fluid.transaction.rejected("error")),
    Fluid.transaction.write(_c_, "C"),
)

tr.run()

console.log(Fluid.read(_a_)) // logs: 'a' // Wasn't changed
// No console logs from `listen` reactions
```

This allows rejecting the entire transaction if any part fails, but it raises
questions:

1. How to access new values from previously resolved actions?
2. How to compute a derivation's new state?

The answers involve transaction context and `Fluid.peek`.

#### Transaction context and Fluid.peek

During execution, the `ctx` parameter (second argument in the handler for
`Fluid.transaction.write`) provides access to context. Assign an `id` to
actions to identify values in the context.

`Fluid.peek` allows previewing how a derivation's value **would** look based on
provided dependency values. It calls the inner function of `Fluid.derive`
without affecting the derivation.

The API is more complex, but it enables true transactional behavior.

```typescript
import { Fluid } from 'reactive-fluid'

const _name_ = Fluid.val("George")
const _surname_ = Fluid.val("Kowalski")
const _fullName_ = Fluid.derive(
    [_name_, _surname_],
    (name, surname) => name + " " + surname
)

const _messagePool_ = Fluid.val<Array<string>>([])

const addPerson = (name, surname) => (
    Fluid.transaction.compose(
        //                      r_val   val   id
        Fluid.transaction.write(_name_, name, "name"),
        Fluid.transaction.write(_surname_, surname, "surname"),
        Fluid.transaction.write(_messagePool_, (pool, ctx) => {
            const fullName = Fluid.peek(_fullName_, [ctx.name, ctx.surname])

            pool.push(`The user "${fullName}" has been added!`)
            return pool
        })
    )
)

addPerson("Oda", "Nobunaga").run()

console.log(
    Fluid.read(_messagePool_).at(-1) // The user "Oda Nobunaga" has been added!
)
```

## Other Functions

### Fluid.peek

Reads a derive with dependencies provided as a list in the second parameter.
Completely pure and does not affect the `derivation` in any way.

```typescript
function peek<R extends ReactiveDerivation>(_derive_: R, dependencies: R['dependencies']): R['value'];
```

### Fluid.destroy

You may need to destroy a derivation so it no longer reacts to changes (and no
one reacts to its changes).

To ensure all links are cleared and avoid garbage accumulation, use
`Fluid.destroy`.

```typescript
function destroy(
    _derivation_: ReactiveDerivation,
): void;
```

Once destroyed, it notifies all listeners, which stop listening. If it was the last dependency, dependents are cascadedly destroyed.

## Examples

List of complete examples of `Fluid` usage.

### React

To connect `Fluid` with React, create a custom hook: `useReactive` (this could become a separate package).

#### React connector

The `useReactive` hook listens to updates from `_reactive_`, stores the value in a ref, and forces a state update (since `useState` memoizes identical values, which `Fluid` does not).

```typescript
import { useEffect, useReducer, useRef } from "react";
import { Fluid, Reactive } from "reactive-fluid";

export function useReactive<V>(_reactive_: Reactive<V>): V {
  const [, forceUpdate] = useReducer(() => [], [])
  const listener = useRef<ReturnType<typeof Fluid.listen> | null>(null)
  const value = useRef(Fluid.read(_reactive_))

  useEffect(
    () => {
      if (listener.current !== null) {
        // unsub from old reactive
        listener.current()
      }

      listener.current = Fluid.listen(
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

Based on this hook, `Fluid` serves as an effective state manager. Here is an example.

#### Shopping Cart

[Try on codesandbox](https://codesandbox.io/p/sandbox/q3r8cm)

An app with numerous reactions, featuring a shopping cart with discounts: add
items, observe price increases, apply discount rates based on total price, and
add/remove discount rates. Note the clean state usage: no prop drilling, no
complex structures.

The entire state is in `model.ts`, connected to components via the `useReactive` hook.
