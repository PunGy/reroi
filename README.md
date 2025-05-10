# Reactive Fluid

[![npm](https://img.shields.io/npm/v/reactive-fluid.svg)](https://www.npmjs.com/package/reactive-fluid)

Zero-dependency library for creating reactive systems with maximum control.

## Content

- [Theory behind](#theory-behind)
- [Implementation](#implementation)
  - [Reactive type](#reactive-type)
    - [High-order reactive entities](#high-order-reactive-entities)
  - [Order of evaluation](#order-of-evaluation)
    - [Control of order](#control-of-order)
    - [How is that can be usefull?](#how-is-that-can-be-usefull)
    - [Vital things to keep in mind](#vital-things-to-keep-in-mind)
      - [Lazy evaluation of derive](#lazy-evaluation-of-derive)
      - [Priorities as layers](#priorities-as-layers)
      - [Priority is not global](#priority-is-not-global)
    - [Conclusion](#conclusion)
- [Transactions](#transactions)
  - [Transactional write](#transactional-write)
  - [Composing transactions](#composing-transactions)
    - [No changes applied until entire transaction is completed](#no-changes-applied-until-entire-transaction-is-completed)
    - [No changes applied if any transaction is rejected](#no-changes-applied-if-any-transaction-is-rejected)
    - [Transaction context and Fluid.peek](#transaction-context-and-fluidpeek)
- [Documentation](#documentation)
  - [Fluid.val](#fluidval)
  - [Fluid.derive](#fluidderive)
  - [Fluid.listen](#fluidlisten)
  - [Fluid.read](#fluidread)
  - [Fluid.peek](#fluidpeek)
  - [Fluid.write](#fluidwrite)
  - [Fluid.destroy](#fluiddestroy)
  - [Fluid.priorities](#fluidpriorities)
  - [Fluid.transaction](#fluidtransaction)
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

However, every reactive system also has some corresponding characteristics, in
order to define how it behaves. Here is the list of them, along with how they
are implemented in `Fluid`:

- Execution flow: **Synchronous**
- Change propagation: **Push-Based**
- Update process: **Dataflow**
- Dependency graph: **Explicitly defined by the programmer(data flow differentiation)**
- Cycle dependencies: **Not handled automatically**
- Transactions: **Fully supported**
- Evaluation:
  - [derivations](#fluidderive): **Lazy**
  - [listeners](#fluidlisten): **Proactive**
- Determinism: **Deterministic in practise. But might be non-deterministic due to caching and laziness**.

## Implementation

How does the `Fluid` implements it? Why do Fluid exists in a first place?

A large problem of architectures based on reactivity, and of event-driven
architectures in general: complexity of debugging and reasoning about the
system. While reading the code of the system, you should build the graph
of events in your head. When this reaction would happen? In which order?
Who it depends from? What is the co-dependencies? Is it depends from
something it actually should not? etc.

With resolving this problem in mind the Fluid was made. It tries to be as
explicit and clean as it can be. Nothing should be happend magically.
Nothing should be out of your control. When you read the code of the system,
the behaviour written in the code should be obvious for the reader.

The key features of `Fluid`:

- Reactive entities are [Type Constructors](#reactive-type).
- No side-effect subscription - you subscribed to the things that explicitly
enlisted as a dependency.
- [Control of execution order](#order-of-evaluation) - you can manipulate when
your reaction would be recalculated.
- Full-featured [Transactions](#transactions) - combine together computations, reject if
something went wrong.
- [High-order reactive entities](#high-order-reactive-entities).

Let's dive in! Here is the implementation of the reactive system of an example in `Fluid`:

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
`ReactiveDerivation<string>`. This types can be generalized as: `type
Reactive<A> = ReactiveValue<A> | ReactiveDerivation<A>`.

`ReactiveValue` or `val` is an independent container with some value under it.
In order to read it, you pass it to `Fluid.read`(can consume `ReactiveDerivation` as well),
in order to modify it, you set the new value with `Fluid.write(_val_, newVal)`.

The `ReactiveDerivation`, created with `Fluid.derive`, is a way to make a new computed value
which derives from an existing `Reactive` entity.

`Fluid.listen` is the way to proactively react on changes of any `Reactive` entity.

> typically the variable names for reactive entities are wrapped with `_` around it.
So, they are kinda *float* on the *water* :))

> In further text the meaning of *reactive entity* would refer to `Reactive<A>`.
Otherwise some clarification would be applied, rather it `derive` or a `value`.

Let's dig into each concept applied to the `Fluid`:

### Reactive type

Any reactive entity is a type constructor. It means that it can't be used
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

#### High-order reactive entities

Due being just a type constructor, it is possible to have a `reactive entity` as
a **value of** another `reactive entity`! It can open to you a huge variaties of
possibilities, and one of them: [dynamic dependencies](https://en.wikipedia.org/wiki/Reactive_programming#Static_or_dynamic)!

Dynamic means that you can change the list of you dependencies **during
execution of the programm**. Here is how:

Imagine a case: you have a `_son_` reactive object. While it is below the
`_age_` of `18`, he listens to parents: `_mommy_` and `_daddy_`. But once he
reaches the `18` - he can speak for it's own, as a `_matureSon_`.

```typescript
const _mommy_ = Fluid.val("Eat a breakfast")
const _daddy_ = Fluid.val("Go to school")

const _age_ = Fluid.val(10)

const _matureSon_ = Fluid.val("...")
const _youngSon_ = Fluid.derive([_mommy_, _daddy_], (mommy, daddy) => `Mommy said: "${mommy}", Daddy said: "${daddy}"`)

const _son_ = Fluid.derive(
    _age_,
    age => age >= 18
            ? _matureSon_
            : _youngSon_
)

// You should doubly unwrap the value in order to read it
Fluid.read(Fluid.read(_son_)) // Mommy said: "Eat a breakfast", Daddy said: "Go to school"

Fluid.write(_age_, 20)

Fluid.read(Fluid.read(_son_)) // ...
Fluid.write(Fluid.read(_son_), "I am a musician")
Fluid.read(Fluid.read(_son_)) // I am a musician
```

Well, it is kinda inefficient example, but that's in favor of simplicity. In a
real world system, be carefull with garbage utilisation and proper dependency
unsubscribing with [Fluid.destroy](#fluiddestroy).

### Order of evaluation

Order of evaluation of reactions is a huge topic in reactive systems.

The classic example looks like this:

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

Would `_isAhead_` always be `true`? Logically speaking it should, but that is
depends on the order of execution. If it call first the recalculation of
`isAhead`, the `ahead` might be still not recalculated, and, suddently, the
result would be `false`.

In `Fluid`, the order of evaluation is simple, and you have absolute control of
it. By default, the order is specified by the moment of declaration. The later
it declared, the later it would be evaluated.
Second is that every dependency creates a link, and once it updated, that would
always spread a message to the peers. It means you should avoid cycles:

```typescript
const _isAhead_ = Fluid.derive(_seconds_, ...) // Ok
const _isAhead_ = Fluid.derive(_ahead_, ...) // Ok

const _isAhead_ = Fluid.derive([_seconds_, _ahead_], ...) // Bad, _ahead_ is already subscribed to _seconds_
```

#### Control of order

You can control the order of evaluation by passing `priority` prop to `derive`
and `listen`:

```typescript
const _isAhead_ = Fluid.derive(
    _seconds_,
    seconds => seconds < Fluid.read(_ahead_),
    { priority: Fluid.priorities.after(_ahead_) }
)
```

> In the [Fluid.priorities] you can find a full set of tools to manipulate the
priority of operation.

What happens here? It declares that `_isAhead_` would be re-calculated **later** than `_ahead_`.

#### How is that can be usefull?

Imagine the situation: you have a parent value, let
call it `_a_`. Then you have two derives from it. Call them `_b_` and `_c_`.
And then, you want to create a third derive, which derives both from `_b_` and `_c_`.
Let try to write it down:

```typescript
const _a_ = Fluid.val("a")

const _b_ = Fluid.derive(
  _a_,
  a => a + "b",
)
const _c_ = Fluid.derive(
  _a_,
  a => a + "c",
)

const _d_ = Fluid.derive(
  [_b_, _c_],
  (b, c) => b + c,
)
```

You see the problem? If the tree of dependencies is not auto-balanced, once you update the
`_a_`, it would spread the message to `_b_` and `_c_`, and they both would send
unique message to the `_d_`. State managers like `mobx` automatically finds such cycles
and reorganizing the tree. How the evaluation would be happend is only known by the library,
and you should try to apply similar algorithms in your head in order to know how your system behaves.

`Fluid`, on the other hand, does not resolve this problem. But instead it gives
you tools to resolve the problem by yourself! It does push you to think more
about the system, which can slow you down, but on the other hand - you can
easly reason about the system, and be sure it works well (if you did everything
correct and not overcomplicated, of course).

Let's improve the code! All the following examples are working absolutelly the same,
how to do it is a matter of taste and what you find the most readable and clean:

```typescript
// After the last
const _b_ = Fluid.derive(
  _a_, ...,
)
const _c_ = Fluid.derive(
  _a_, ...,
)

const _d_ = Fluid.derive(
  _a_,
  () => Fluid.read(_b_) + Fluid.read(_c_),
  { priority: Fluid.priorities.after(_c_) }
)

// After the base
const _d_ = Fluid.derive(
  _a_, ...,
  { priority: Fluid.priorities.after(Fluid.priorities.base) }
)

// Numerical
const _b_ = Fluid.derive(
  _a_, ..., { priority: 0 }
)
const _c_ = Fluid.derive(
  _a_, ..., { priority: 0 }
)

const _d_ = Fluid.derive(
  _a_, ..., { priority: 1 }
)

// Highest
const _d_ = Fluid.derive(
  _a_, ...,
  { priority: Fluid.priorities.highest }
)

// Explicit chain of priorities
const _b_ = Fluid.derive(
  _a_, ...,
)
const _c_ = Fluid.derive(
  _a_, ..., { priority: Fluid.priorities.after(_b_) }
)

const _d_ = Fluid.derive(
  _a_, ..., { priority: Fluid.priorities.after(_c_) }
)
```

#### Vital things to keep in mind

The manual priority setting is very powerfull feature, which,
on the other hand, can make your system a mess. Be reasonable
while you applying custom priorities, and follow the common sense
and be aware of following pitfals:

##### Lazy evaluation of derive

Derives are not re-evaluated immidiatelly after receiving a message, but instead clearing the cache
and spreading the message further, to it's own dependencies which **may or may not** try to read a new value.
Because of that, sometimes value of `derive` might not be determined:

```typescript
const _seconds_ = Fluid.val(1)
const _ahead_ = Fluid.derive(_seconds_, s => s + 1)

// Manually making a glitch
const _isAhead_ = Fluid.derive(
    _seconds_,
    seconds => seconds < Fluid.read(_ahead_),
    { priority: Fluid.priorities.before(_ahead_) }
)
Fluid.read(_isAhead_) // 1: true

Fluid.write(2)

Fluid.read(_isAhead_) // 2: true
```

If it can be undestandable the reason why the `1: true` is true, the reason why
the `2: true` is true is not very clear. If we set `_isAhead_` would be
evaluated before the `_ahead_`, isn't it should be `false`? It should, but the reason
why it's not is that at the moment it got the message to update, no one is read it! And then, the message
is passed to the `_ahead_`, and at the moment of reading `_isAhead_` - the value of `_ahead_` is, well, ahead.

To "resolve" the problem, the `_isAhead_` should have a proactive dependency:

```typescript
Fluid.listen(_isAhead_, console.log)

Fluid.write(2) // console.log(false)
```

In order to avoid it - be reasonable when you declaring priorities, and try not to
make such situations of inconsistent behaviour. Your derives should always return the same value
on the same values of the dependencies. If it's - you did something wrong.

##### Priorities as layers

Programatically the priority of the reaction is set as a layer
of dependencies. All dependencies of reactive entities are stored
as an `array` of `arrays`:

```typescript
/** NOTE:
 * It's not the exact structure,
 * in the code the first array is a custom SparseArray
 * and the second is a Map<Reactive, Message>
 */

// the lower index - the lower priority
SparseArray<
    // List of entities should notified about an update
    Array<ReactiveDerivation | Listener> 
>
```

So, if we remember our example with `a b c d`, the dependencies of `_a_`
would looks like so:

```
HIGHER
 0: [_b_, _c_]
-1: [_d_]
LOWER
```

Every time you add new dependency, it chooses the layer based on
priority, and then it set to the end of dependencies on that layer, if
there are any.

##### Priority is not global

As we discussed above, the priority is declared as a layer. And so,
it exists only for a dependency.

#### Conclusion

Normally, you don't need to tweak the priority (well, because usually you
deriving from something that is already derived, and in that case it just would
happen after). But, if you come to conclusion that it would be
helpfull to you - go and try it!

## Transactions

Very common problem in any system with the state is transaction: coupling
together mutations in a bunch, and write them at the same time. Also, important
feature of transactions is to be able to reject them, in case if any mutation
caused an error, so the system would not be hanging in inconsistent state.

In `Fluid`, transactions are very powerfull, and provide you full feature set
for manipulating them. In many other JS libraries, such as `mobx`, transactions
are just delayed notify about mutations, you can't reject them, and value of
`computed` is still changed.

`Fluid` on the other hand allow you to: delay the execution `write` at the desired moment,
combine sequance of delayed `writes`, read the result of the execution.

### Transactional write

Let first look at `Fluid.transaction.write`:

```typescript
const _name_ = Fluid.val("George")

const transaction = Fluid.transaction.write(_name_, "Mike")

Fluid.read(_name_) // Still George

const res = transaction.run()
Fluid.read(_name_) // Now its "Mike"

// You can check is transaction was resolved or not
if (Fluid.transaction.isResolved(res)) {
    console.log(res.value) // "Mike"
}
```

`transaction.run()` returns the result of the execution. If you just call `transaction.write`
with a plain value, it would treat it as always resolved transaction. But you can add some logic to it:

```typescript
// should be between 0 and 255
const _colorChannel_ = Fluid.val(0)

const setColorChannel = (val: number) => {
    return Fluid.transaction.write(
        () => {
            return val < 0 || val > 255
                ? Fluid.transaction.rejected(`Value should be between 0 and 255! Got: ${val}`)
                : Fluid.transaction.resolved(val)
        }
    )
}

setColorChannel(100).run()
Fluid.read(_colorChannel_) // 100

const res = setColorChannel(300).run()
Fluid.read(_colorChannel_) // 100

if (Fluid.transaction.isRejected(res)) {
    console.log(res.error) // Value should be between 0 and 255! Got: 300
}
```

Cool right!? Here `Fluid` even more rely on functional programming. Generally, transaction
is just another `ADT`. In Haskell it would be called `IO (Either E R)`. It means it is
an effectfull computation, which can be resolved or rejected.

### Composing transactions

And, since the transaction is a value, we can `compose` it! And at that moment
we gain our full power of transactions. Here is a simple example:

```typescript
const _name_ = Fluid.val("George")
const _surname_ = Fluid.val("Kowalski")

Fluid.listen([_name_, _surname_], (name, surname) => {
    console.log(`Hello, ${name} ${surname}!`)
})


/**
passing just a value to `write` is actually a shortcut to

Fluid.transaction.write(_name_, () => Fluid.transaction.resolved("Smith"))
*/
const tr = Fluid.transaction.compose(
               Fluid.transaction.write(_name_, "Grzegosz"),
               Fluid.transaction.write(_surname_, "Smith"),
           )

tr.run()
// Only once:
   // Hello, Grzegosz Smith!
```

Here, we compose our mutations of `_name_` and `_surname_`, and they common
dependencies would be notified only once, after the `run` call.

#### No changes applied until entire transaction is completed

It means that even if one chain of `write` is completed, the value would not be written to the result:

```typescript
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

#### No changes applied if any of transactions rejected

```typescript
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

It's nice since this allow us to reject the whole transaction in case if one of
chain was rejected, but it raises two questions:

1. What if I need to know what is a new value of previously resolved actions?
2. What if I need to get a new state of `derivation`?

Here is the answers:

#### Transaction context and Fluid.peek

During execution of actions, you have an access to the `ctx` parameter, which is
the second parameter of the handler you passing to `Fluid.transaction.write`.
But, you need to somehow address and understand what value belong to which action.
For that, you need to assign an `id` to the your action.

The answer on the second question is `Fluid.peek`: a function which allows you to
"peek" how the value of the derivation **would** be looks like, based on the values
of dependencies provided as an array. Basically, a way to call the inner function
you passed to the `Fluid.derive`.

Yeah, an API become a little more complicated, but that's the price for being a
real transaction.

```typescript
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
        Fluid.transaction.write(_name_, surname, "surname"),
        Fluid.transaction.write(_messagePool_, (pool, ctx) => {
            // Yeah, here you already have same values from closure,
            // but pretend we can't rely on them here
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

## Documentaion

### Fluid.val

Creates a reactive value. You can read it with `Fluid.read`, or write to it using `Fluid.write`.
Nothing much special.

```typescript
function val<A>(
    value: A,
): ReactiveValue<A>
```

### Fluid.derive

Creates a derivation from some other reactive value or even another derivation.

The signature (very simplified, not actual types) is:

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
): () => void; // unsub
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

### Fluid.peek

Read derive with dependencies provided as a list in second parameter.
Completely pure and does not affect a `derivation` in any way.

```typescript
function peek<R extends ReactiveDerivation>(_derive_: R, dependencies: R['dependencies']): R['value'];
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

### Fluid.priorities

But, it still better to use contants from the `Fluid.priorities`:

```typescript
type Priority = number | Symbol
Fluid.priorities = {
    base: 0,
    // Would happen after all
    // (expect those who would be declared later with this priority)
    lowest: Symbol('lowest'),
    // Would happen before all
    // (expect those who would already been declared with this priority)
    highest: Symbol('highest'),

    /**
     * After means the calculation of P1 happens *AFTER* the calculation of P0.
     * It means, the result priority(P1) would be *LESS* than base priority(P0).
     */
    after: (p1: Priority | ReactiveDerivation) => Priority,
    /**
     * Before means the calculation of P1 happens *BEFORE* the calculation of P0.
     * It means, the result priority(P1) would be *HIGHER* than base priority(P0).
     */
    before: (p1: Priority | ReactiveDerivation) => Priority,
}
```

### Fluid.transaction

TODO

## Examples

List of good and complete examples of `Fluid` usage

### React

In order to connect `Fluid` with react, we need to write a custom hook: `useReactive`
(maybe I will make it a separate package).

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
