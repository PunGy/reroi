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
In further text the meaning of *reactive entity* would refer to `Reactive<A>`.
Otherwise some clarification would be applied, rather it `derive` or a `value`.

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

It's misleadingly similar to `Fluid.derive`, but that is fundamentally a different thing.
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
Nothing much special.

### Fluid.derive

Creates a derived from some other reactive value or even derivation.

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

