# Fluid

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

How does the `Fluid` implements it? As natural to general-purpose language like JavaScript as it can be.

It does treats reactive values as Algebraic Data Types, means there is a type `Reactive<A>`, 
which splits to `ReactiveValue<A> | ReactiveDerivation<A>`.

So, in order to replicate the reactive system from an example, we need to write this code:

```typescript
import { Fluid } from 'fluid'

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

Any reactive entity is an algebraic data type. It means that it can't be used as a plain value, but rather it's a \_container\_ of *something*.

Same as you treat a `Promise`. You can't read the value under the promise directly, you need to unwrap it first.
For example, you can unwrap it with `await`, like so:

```typescript
const reactive_a: Reactive<number> = Fluid.val(10)
const promise_a: Promise<number> = Promise.resolve(10)

console.log(await promise_a) // 10
console.log(Fluid.read(reactive_a)) // 10
```

Due to some nuances how promises work it is absolutely the same, but the concept is indeed the same.

You can even write you own `then`, which is normally called `map`.

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

It is misleadingly similar to `Fluid.derive`, but it is fundamentally different.
`map` here creates a new `Fluid.val` using value of the existing one. Without ANY subscriptions applied.

That is the key feature of `Fluid` -
it doesn't compel you to modify your way of thinking about the values in your system,
as usually happens with systems like `Mobx`, where a reactive value from the programmer's point
of view is a "plain" value, which contantly causes side-effect subscriptions.
Nor is it the same to opinionated libraries like `RxJS`, which is force you to adapt to
it's own functional-reactive approach, which might not be so easly applied to every architecture.

In `Fluid` nothing happend **implicitely**.

- When you read with the `Fluid.read`, it is never creates a subscription.
- When you want to subscribe to changes, you need to pass a reactive entities as a dependency to `Fluid.derive` or `Fluid.listen`.

### Fluid.val

Creates a reactive value. You can read it with `Fluid.read`, or write to it using `Fluid.write`.

