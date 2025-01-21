# Reactive Fluid

[![npm](https://img.shields.io/npm/v/reactive-fluid.svg)](https://www.npmjs.com/package/reactive-fluid)

Library for creating reactive systems with maximum control.

## Content

- [Theory behind](#theory-behind)
- [Implementation](#implementation)
  - [Conceptions](#conceptions)
- [Documentation](#documentation)
  - [Fluid.val](#fluidval)
  - [Fluid.derive](#fluidderive)
  - [Fluid.listen](#fluidlisten)
  - [Fluid.read](#fluidread)
- [Order of evaluation](#order-of-evaluation)
  - [Fluid.priorities](#fluidpriorities)
  - [Vital things to keep in mind](#vital-things-to-keep-in-mind)
  - [Lazy evaluation](#lazy-evaluation)
  - [Conclusion](#conclusion)
- [Examples](#examples)
  - [React](#react)
    - [React connector](#react-connector)
    - [Shopping Cart](#shopping-cart)

## Theory behind

Classical reactivity system, at the core, have two basic entities:

- Reactive **value**: a standalone slot containing a value.
You can **write** a new value to this slot, you can read the value, and,
what gives it the reactivity, you can **listen** changes.
- Reactive **derivation**: a value constructed based on another reactive entities.
You can **read** a value of it, you can listen to changes
which are happens when values of entities it **derives** from are changed.
But you can't **write** to it.

Plus to that, typically the `listen` functionality is needed,
in order to **proactively** listen changes of dependencies.

Based on them, you can create a reactivity system.
Let's use a Domain-Specific language for it:

```
val name    = "Michal"
val surname = "Smith"

der full-name = name + " " + surname

print full-name // Michal Smith

on-change-of full-name
             #(print "Hello, " + full-name)

name = "George"
// Hello, George Smith

print name // George
```

## Implementation

How does the `Fluid` implements it? As natural to general-purpose language like
JavaScript as it can be.

It does treats reactive values as Algebraic Data Types, means there is a type
`Reactive<A>`, which splits to `ReactiveValue<A> | ReactiveDerivation<A>`. In
further text the meaning of *reactive entity* would refer to `Reactive<A>`.
Otherwise some clarification would be applied, rather it `derive` or a `value`.

So, in order to replicate the reactive system from an example, we need to write
this code:

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

### Conceptions

Any reactive entity is an algebraic data type. It means that it can't be used
as a plain value, but rather it's a \_container\_ of *something*.

Same as you treat a `Promise`. You can't read the value under the promise
directly, you need to unwrap it first. For example, you can unwrap it with
`await`, like so:

```typescript
const reactive_a: Reactive<number> = Fluid.val(10)
const promise_a: Promise<number> = Promise.resolve(10)

console.log(await promise_a) // 10
console.log(Fluid.read(reactive_a)) // 10
```

The concept here is the same.

You can even make your own `then`, which is normally called `map`.

```typescript
const reactive_a: Reactive<number> = Fluid.val(10)
const promise_a: Promise<number> = Promise.resolve(10)

const promise_b: Promise<number> = promise_a.then(a => a + 1)

function map<A, B>(_a_: Reactive<A>, fn: (a: A) => B): ReactiveValue<B> {
    //     Wrap      Apply    Unwrap
    return Fluid.val(fn(Fluid.read(_a_)))
}
const reactive_b: Reactive<number> = map(reactive_a, a => a + 1)
```

It's misleadingly similar to `Fluid.derive`, but that is fundamentally a
different thing. `map` here creates a new `Fluid.val` using value of the
existing one. Without ANY subscriptions applied.

That is the key feature of `Fluid` - it doesn't compel you to modify your way
of thinking about the values in your system, as usually happens with systems
like `Mobx`, where a reactive value from the programmer's point of view is a
"plain" value, which contantly causes side-effect subscriptions. Nor is it the
same to opinionated libraries like `RxJS`, which is force you to adapt to it's
own functional-reactive approach, which might not be so easly applied to every
architecture.

In `Fluid` nothing happend **implicitely**.

- When you read with the `Fluid.read`, it is never creates a subscription.
- When you want to subscribe to changes, you need to pass a reactive entities
as a dependency to `Fluid.derive` or `Fluid.listen`.

## Documentaion

### Fluid.val

Creates a reactive value. You can read it with `Fluid.read`, or write to it using `Fluid.write`.
Nothing much special.

### Fluid.derive

Creates a derivation from some other reactive value or even another derivation.

The signature is:

```typescript
function derive<A, B>(
    dependencies: Array<Reactive<A>> | Reactive<A>,
    computeFn: (...dependencies: Array<A>) => B,
    options?: { priority?: Priority },
): ReactiveDerivation<B>;
```

Where:

- `dependencies`: list or a single reactive entity the `derive` is depended from.
- `computeFn`: a function which takes a spreaded list of values from dependencies, and returns the value for a derivation.
- `options`: list of options
  - `priority`: the priority of update. See in [Fluid.priorities]

The `derivation` is lazy and cached, it means that even if the dependency was updated,
it would not be recomputed immidiatelly, but on *demand.

```typescript
const _cost_ = Fluid.val(200)
const _discounted_ = Fluid.derive(_cost_, cost => cost * 0.85) // 15% discount

console.log(Fluid.read(_discounted_)) // 170, computed
console.log(Fluid.read(_discounted_)) // 170, cached

Fluid.write(_cost_, 100)
Fluid.write(_cost_, 500)

// 85 was ignored since not readed
console.log(Fluid.read(_discounted_)) // 425, computed
```

> *if the derive is on the list of dependencies for the Fluid.listen,
it would be recomputed once the listener is about to execute.

### Fluid.listen

Similar interface to `derive`, but rather than create a new entity,
it listen to changes of dependencies, and execute the `effect` once they got an update.

Returns a function needs to be called in order to stop the listener.

```typescript
function listen<A>(
    dependencies: Array<Reactive<A>> | Reactive<A>,
    effect: (...dependencies: Array<A>) => void,
    options?: { priority?: Priority, immidiate?: boolean  },
)
```

- `dependencies`: list or a single reactive entity on update of which the `effect` emit's on.
- `effect`: a side-effect function.
- `options`: list of options.
  - `priority`: the priority of execution. Default is `Fluid.priorities.base`. See in [Fluid.priorities]
  - `immidiate`: run an `effect` just right now. Default is `false`,
    means the first time an `effect` is executed is after some change of dependencies.

### Fluid.read

Basic operation of read. Can take any reactive entity.

```typescript
function read<A>(_reactive_: Reactive<A>): A;
```

### Fluid.write

Operation for writing a new value to `ReactiveValue`.
Sends the message to all dependencies to update themself.

Can take a new value as a parameter, or a value generator function.

```typescript
function write<A, B>(
    _val_: ReactiveValue<A>,
    newVal: B | (current: A) => B,
    options?: { 
        literateFn?: boolean // if true - treat newVal function as literate value
    }
): ReactiveValue<B>;
```

The return `ReactiveValue<B>` is not a new object.
Just the same *\_val\_* you passed as a first parameter.

`Fluid.write` has no any kind of memoisation, and even if you write the same value
over and over - it would always cause a message spread to dependencies:

```typescript
const _x_ = Fluid.val(5)
Fluid.listen(_x_, x => console.log(`I'm on ${x}`))

Fluid.write(_x_, 10) // I'm on 10
Fluid.write(_x_, 10) // I'm on 10
Fluid.write(_x_, 10) // I'm on 10
```

### Fluid.destroy

At some point, you might need to destroy the derivation, so it won't react
on changes anymore(as well as no one will react on it's changes).

We also want to be sure we all links are cleared and we not flooding with
garbage (our `Fluid` is properly botteled ;)

In order to destroy the derivation, you need to use `Fluid.destroy`.

```typescript
function destroy(
    _derivation_: ReactiveDerivation,
): void;
```

Once it's destroyed, it sends a message to all it's listeners about it,
and they will stop listening. If it was the only dependency left,
the depended will also be cascadely destroyed.

## Order of evaluation

Order of evaluation and reactions is a huge topic in reactive systems.
It looks like tho:

```typescript
const _seconds_ = Fluid.val(0)
setInterval(() => {
    Fluid.write(_seconds_, s => s + 1)
}, 1000)

const _ahead_ = Fluid.derive(_seconds_, s => s + 1)

const _isAhead_ = Fluid.derive(_seconds_, (seconds) => {
    return seconds > Fluid.read(_ahead_)
})
```

Would `_isAhead_` always be `true`? Logically speaking it should, but that
is depends on the order of execution. If it call first the recalculation of `isAhead`,
the `ahead` might be still not recalculated, and, suddently, the result would be `false`.

> Of course everything would be good if you just write dependencies properly,
like `[_seconds_, _ahead_]`, or better `[_ahead_]`, but such cases as above can happen
in your code base.

So, to fix the situation above, and make it always execute **after** the _ahead_, without subscribing to it,
you can use `Fluild.priorities.after`:

```typescript
const _isAhead_ = Fluid.derive(
    _seconds_,
    seconds => seconds < Fluid.read(_ahead_),
    { priority: Fluid.priorities.after(_ahead_) }
)
```

Now, the `_isAhead_` derivation would always be **after**. You can also make it always be `before`
the `_ahead_`, so `isAhead` sometimes would evaluate to `false`. In terms of reactivity, the glitch would happen.

### Fluid.priorities

Not only an another derive can be a base for your priority. Any number actually can be used!

Higher the number, higher the priority.

```typescript
const _msg_ = Fluid.val("")

Fluid.listen(
    _msg_,
    (msg) => console.log("3: " + msg),
    { priority: 3 },
)
Fluid.listen(
    _msg_,
    (msg) => console.log("2: " + msg),
    { priority: 2 },
)
Fluid.listen(
    _msg_,
    (msg) => console.log("4: " + msg),
    { priority: 4 },
)
Fluid.listen(
    _msg_,
    (msg) => console.log("1: " + msg),
    { priority: 1 },
)

Fluid.write(_msg_, "Hi?")
// console.log(4: Hi?)
// console.log(3: Hi?)
// console.log(2: Hi?)
// console.log(1: Hi?)
```

But, it still better to use contants from the `Fluid.priorities`:

- Fluid.priorities
    - `base`: basic priority `0`
    - `lowest`: special lowest priority. Always happen at the end, even after `-Infinity`
    - `highest`: special highest priority. Always happend at the start.
    - `after`: happen after provided one. Cannot deal with `lowest`
    - `before`: happen before provided one. Cannot deal with `highest`

### Vital things to keep in mind

### Lazy evaluation

`Fluid.write` is does not revalidate the state of the derive **immidiatelly**, but after direct call.
That's why, if you try to run an example with `_isAhead_` with plain `Fluid.read`, it will always be `true`,
even if we mark it with `priorities.after`.

The reason is simple: for the moment you read `_isAhead_`, the state of
`_ahead_` is already uncached during previous `write` call!

But absolutelly different story would be for a `listen`:

```typescript
Fluid.listen(
    _seconds_,
    () => {
        console.log(Fluid.read(_seconds_) < Fluid.read(_ahead_))
    },
    { priority: Fluid.priorities.before(_ahead_) }
)

Fluid.write(_seconds_, 5) // console.log(false)
```

Since `listener` happens immidiatelly as it receives message, it will run
before clear cache message reach the `_ahead_`.

> Important here is "before clear cache message". It means, if it wasn't cached, it will "glitch" with TRUE!
That's why you need to be very carefull with priority tweaking.

### Conclusion

Normally, you don't need to tweak the priority (well, because usually you deriving
from something that is already derived, so, it would happen after). But, if you
come to conclusion that it would be helpfull to you - go and try it!

## Examples

List of good and complete examples of `Fluid` usage

### React

In order to connect `Fluid` with react, we need to write a custom hook.

#### React connector

`useReactive` hook listens to updates from the `_reactive_`, put the value to
the ref, and `forceUpdate` the state (because `useState` applies memoisation if
the same value was written, which is not the case for `Fluid`).

```typescript
import { useEffect, useReducer, useRef } from "react";
import { Fluid, Reactive } from "reactive-fluid";

export function useReactive<V>(_reactive_: Reactive<V>): V {
  const [, forceUpdate] = useReducer(x => !x, false)
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

Based on that hook, we can use `Fluid` as a nice state manager. Here is an examples

#### Shopping Cart

[Try on codesandbox](https://codesandbox.io/p/sandbox/q3r8cm)

App with dozens of reactions. Shopping cart with discounts: add some items, see
how the price is increases, how discount rates are applied based on the total
price, add or remove discount rates. And check out how nice the state is used:
no props drilling, no cumbersome structures or complicated solutions.

An entrire state is in `model.ts`, and it is connected to components with
`useReactive` hook.
