/**
 * Reactive system libary
 */

import { SparseArray } from "./lib/sparseArray"

//////////////
// Utilities
/////////////

type NonEmptyArray<V> = { [0]: V } & Array<V>

// Utilities // Priorities

const _rVal = Symbol("r_val")
const _rDerive = Symbol("r_derive")

type Message = () => void;

const plowest = Symbol("lowest")
const phighest = Symbol("highest")
// Lower number - lower priority
type Priority = number | symbol

interface Priorities {
  lowest: typeof plowest,
  highest: typeof phighest
  base: 0,

  before(p0: ReactiveDerivation<unknown> | Priority): Priority;
  after(p0: ReactiveDerivation<unknown> | Priority): Priority;
}
const priorities: Priorities = {
  lowest: plowest,
  highest: phighest,
  base: 0,
  /**
   * Before means the calculation of P1 happens *BEFORE* the calculation of P0.
   * It means, the result priority(P1) would be *HIGHER* than base priority(P0).
   *
   * @param p0 - the base priority
   * @returns P1
   */
  before(p0: ReactiveDerivation<unknown> | Priority) {
    if (p0 === this.highest) {
      console.warn("Fluid: Cannot use highest priority for Fluid.priorities.before! You can find 'before' only for numeric or lowest")
      return p0
    }
    if (p0 === this.lowest) {
      return -Number.MAX_SAFE_INTEGER
    }
    if (typeof p0 === "number") return p0 + 1

    const { priority, dependencies } = (p0 as _ReactiveDerivation<unknown>)
    if (priority === this.highest) {
      console.warn("Fluid: Cannot use derives with highest priority for Fluid.priorities.before! You can find 'before' only for numeric or lowest")
      return priority
    }
    return priority === this.lowest ? dependencies.firstIndex : (priority as number) + 1
  },

  /**
   * After means the calculation of P1 happens *AFTER* the calculation of P0.
   * It means, the result priority(P1) would be *LESS* than base priority(P0).
   *
   * @param p0 - the base priority
   * @returns P1
   */
  after(p0: ReactiveDerivation<unknown> | Priority) {
    if (p0 === this.lowest) {
      console.warn("Fluid: Cannot use lowest priority for Fluid.priorities.after! You can find 'after' only for numeric or highest")
      return p0
    }
    if (p0 === this.highest) {
      return +Number.MAX_SAFE_INTEGER
    }
    if (typeof p0 === "number") return p0 - 1

    const { priority, dependencies } = (p0 as _ReactiveDerivation<unknown>)
    if (priority === this.lowest) {
      console.warn("Fluid: Cannot use derives with lowest priority for Fluid.priorities.after! You can find 'after' only for numeric or highest")
      return priority
    }
    return priority === this.highest ? dependencies.lastIndex : (priority as number) - 1
  },
}

class PriorityPool extends SparseArray<Map<unknown, Message>> {
  push(value: Map<unknown, Message>, index7?: Priority): Map<unknown, Message> {
    if (index7 === priorities.lowest) {
      return this.lowest = value
    } else if (index7 === priorities.highest) {
      return this.highest = value
    }
    return super.push(value, index7 as number)
  }
  get(index: Priority): Map<unknown, Message> | undefined {
    if (index === priorities.lowest) {
      return this.lowest
    } else if (index === priorities.highest) {
      return this.highest
    }
    return super.get(index as number)
  }
  getOrMake(index: Priority): Map<unknown, Message> {
    let pool = this.get(index)
    if (pool === undefined) {
      pool = new Map()
      if (index === priorities.lowest) {
        this.lowest = pool
      } else if (index === priorities.highest) {
        this.highest = pool
      } else {
        this.push(pool, index)
      }
    }
    return pool
  }
  lowest: Map<unknown, Message> | undefined
  highest: Map<unknown, Message> | undefined

  forEach(fn: (arg: Map<unknown, Message>, index: number) => void): void {
    if (this.highest) {
      fn(this.highest, +Infinity)
    }
    super.forEachBackward(fn)
    if (this.lowest) {
      fn(this.lowest, -Infinity)
    }
  }
}

// Utilities // Reactivity types

// Public

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface ReactiveValue<V> {
  __tag: typeof _rVal;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface ReactiveDerivation<V> {
  __tag: typeof _rDerive;
}

export type Reactive<V = unknown> = ReactiveValue<V> | ReactiveDerivation<V>

// Private

interface _ReactiveValue<V> extends ReactiveValue<V> {
  value: V;
  dependencies: PriorityPool;
}

interface _ReactiveDerivation<V> extends ReactiveDerivation<V> {
  _invalidate(): void;
  _destroy(): void;
  _cache: (typeof nullCache) | V;
  priority: Priority;
  dependencies: PriorityPool;
  value(): V;
}

type _Reactive<V = unknown> = _ReactiveValue<V> | _ReactiveDerivation<V>

// Utilities // Helpers

function isVal<V>(_value_: Reactive<V>): _value_ is _ReactiveValue<V>
function isVal(smth: unknown): false
function isVal<V>(_value_: Reactive<V> | any): _value_ is _ReactiveValue<V> {
  return typeof _value_ === "object" && _value_ !== null && "__tag" in _value_ && _value_.__tag === _rVal
}
function isDerive<V>(_value_: Reactive<V>): _value_ is _ReactiveDerivation<V>
function isDerive(smth: unknown): false
function isDerive<V>(_value_: Reactive<V> | any): _value_ is _ReactiveDerivation<V> {
  return typeof _value_ === "object" && _value_ !== null && "__tag" in _value_ && _value_.__tag === _rDerive
}

const notify = (dependencies: PriorityPool) => {
  dependencies.forEach((pool) => {
    pool.forEach(message => {
      message()
    })
  })
}

// Utilities // Operations

/**
 * Read reactive value.
 * Does not creates a subscription or any kind of side-effects.
 * If it's a ReactiveValue - just returns associated value
 * If it's a ReactiveDerivation - computes the value, if it wasn't cached
 */
const read = <V>(_reactive_: Reactive<V>): V => {
  if (isVal(_reactive_)) {
    return _reactive_.value
  }
  if (isDerive(_reactive_)) {
    return _reactive_.value()
  }

  throw new Error("Fluid: you can read only reactive entities!")
}

/**
 * Set a new value for ReactiveValue.
 * Does not used any kind of memoization or comparations
 * - always writes a new value and notifies dependencies about change
 */
const write = <A, B>(_value_: ReactiveValue<A>, newValue: B | ((aVal: A) => B)): ReactiveValue<B> => {
  if (_value_.__tag !== _rVal) {
    throw new Error("Fluid: You can write only to ReactiveValue created with Fluid.val!!!")
  }

  (_value_ as _ReactiveValue<B>).value = typeof newValue === "function"
    ? (newValue as ((aVal: A) => B))(read(_value_))
    : newValue
  notify((_value_ as _ReactiveValue<B>).dependencies)
  return _value_
}

/**
  * Destroy the derivation.
  * It is not destroyed literally,
  * but it would be unsubscribed from all entities it listen to.
  */
const destroy = (_derive_: ReactiveDerivation<unknown>) => {
  (_derive_ as _ReactiveDerivation<unknown>)._destroy()
}

///////////////////////
// Reactive Structures
///////////////////////


// Reactive // val

const val = <V>(value: V): ReactiveValue<V> => ({
  __tag: _rVal,
  value,
  dependencies: new PriorityPool(),
}) as _ReactiveValue<V>


// Reactive // derive

interface DeriveProps {
  priority?: Priority
}

const nullCache = Symbol("nullCache")

function derive<V, V2>(
  _value_: Reactive<V>,
  fn: (value: V) => V2,
  props?: DeriveProps,
): ReactiveDerivation<V2>
// @ts-expect-error TS does not support high-kinded types
function derive<Vs extends NonEmptyArray<any>, V2>(
  _values_: { [K in keyof Vs]: Reactive<Vs[K]> },
  fn: (...values: Vs) => V2,
  props?: DeriveProps,
): ReactiveDerivation<V2>;
function derive<V, V2>(
  _v_: Reactive<V> | NonEmptyArray<Reactive<any>>,
  fn: ((value: V) => V2) | ((...values: any[]) => V2),
  props?: DeriveProps,
): ReactiveDerivation<V2> {
  const sources = Array.isArray(_v_)
    ? _v_ as NonEmptyArray<_Reactive<V>>
    : [_v_] as NonEmptyArray<_Reactive<V>>

  const derived: _ReactiveDerivation<V2> = {
    __tag: _rDerive,
    _invalidate() {
      this._cache = nullCache
      notify(this.dependencies)
    },
    _destroy() {
      sources.forEach(source => {
        source.dependencies.get(this.priority)!.delete(this)
      })
    },
    _cache: nullCache,
    priority: props?.priority ?? priorities.base,
    dependencies: new PriorityPool(),
    value() {
      if (this._cache !== nullCache) {
        return this._cache
      }

      const result = sources.length > 1
        ? (fn as ((...values: any[]) => V2))(...sources.map(_reactive_ => read(_reactive_)))
        : fn(read(sources[0]))

      this._cache = result as V2
      return result
    },
  }

  sources.forEach(source => {
    const pool = source.dependencies.getOrMake(derived.priority)
    pool.set(derived, derived._invalidate.bind(derived))
  })

  return derived
}

// Reactive // listener

type Unsub = () => void;

interface ListenProps extends DeriveProps {
  immidiate?: boolean;
}

function listen<V>(
  _reactive_: Reactive<V>,
  fn: (value: V) => void,
  props?: ListenProps
): Unsub
// @ts-expect-error TS does not support high-kinded types
function listen<Vs extends NonEmptyArray<any>>(
  _reactive_: { [K in keyof Vs]: Reactive<Vs[K]> },
  fn: (...values: Vs) => void,
  props?: ListenProps,
): Unsub
function listen<V>(
  _reactive_: Reactive<V> | NonEmptyArray<Reactive<any>>,
  fn: ((value: V) => void) | ((...values: any[]) => void),
  props?: ListenProps,
): Unsub {
  const sources = Array.isArray(_reactive_)
    ? _reactive_ as NonEmptyArray<_Reactive<V>>
    : [_reactive_] as NonEmptyArray<_Reactive<V>>

  function unsub() {
    sources.forEach( source => {
      const pool = source.dependencies.getOrMake(props?.priority ?? priorities.base)
      pool.delete(unsub)
    })
  }
  const react = () => sources.length > 1
    ? (fn as (...values: any[]) => void)(...sources.map(source => read(source)))
    : fn(read(sources[0]))

  sources.forEach(source => {
    const pool = source.dependencies.getOrMake(props?.priority ?? priorities.base)
    pool.set(unsub, react)
  })

  if (props?.immidiate) {
    react()
  }

  return unsub
}

export const Fluid = {
  val,
  derive,
  destroy,
  read,
  write,
  listen,

  priorities,
}

