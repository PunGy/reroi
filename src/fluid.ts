/**
 * Reactive system libary
 */

import { priorities, PriorityPool } from "./priority"
import { _rder, _rval, nullCache } from "./symbols"
import { _Reactive, _ReactiveDerivation, _ReactiveListener, _ReactiveValue, NotificationType, Priority, Reactive, ReactiveDerivation, ReactiveValue } from "./type"


export function isVal<V>(_value_: Reactive<V>): _value_ is _ReactiveValue<V>
export function isVal(smth: unknown): false
export function isVal<V>(_value_: Reactive<V> | any): _value_ is _ReactiveValue<V> {
  return typeof _value_ === "object" && _value_ !== null && "__tag" in _value_ && _value_.__tag === _rval
}
export function isDerive<V>(_value_: Reactive<V>): _value_ is _ReactiveDerivation<V>
export function isDerive(smth: unknown): false
export function isDerive<V>(_value_: Reactive<V> | any): _value_ is _ReactiveDerivation<V> {
  return typeof _value_ === "object" && _value_ !== null && "__tag" in _value_ && _value_.__tag === _rder
}

export const notifyDeps = (_r_: _Reactive, type: NotificationType) => {
  const stack: Array<_ReactiveListener> = []

  function fill(dependencies: PriorityPool) {
    dependencies.forEach(r => {
      stack.push(...[...r].reverse())
    })
  }
  fill(_r_.dependencies)

  while (stack.length > 0) {
    const reactive = stack.pop()!
    reactive._onMessage(_r_, type)
    if (reactive.dependencies && !reactive.dependencies.isEmpty) {
      fill(reactive.dependencies)
    }
  }
}

// Utilities // Operations

/**
 * Read reactive value.
 * Does not creates a subscription or any kind of side-effects.
 * If it's a ReactiveValue - just returns associated value
 * If it's a ReactiveDerivation - computes the value, if it wasn't cached
 */
export const read = <V>(_reactive_: Reactive<V>): V => {
  if (isVal(_reactive_)) {
    return _reactive_.value
  }
  if (isDerive(_reactive_)) {
    if (isDestroyed(_reactive_)) {
      throw new Error("Fluid: cannot read destroyed derivation!")
    }
    return _reactive_._cache === nullCache
      ? _reactive_.value()
      : _reactive_._cache
  }

  throw new Error("Fluid: you can read only reactive entities!")
}

export const peek = <R extends ReactiveDerivation<unknown>>(_derive_: R, dependencies: NonNullable<R["__meta_dependencies"]>): R["__value"] => {
  // @ts-expect-error TODO: fix polymorphic dependency type
  return (_derive_ as _ReactiveDerivation).fn(dependencies)
}

export const mutateReactiveVal = <A>(_value_: ReactiveValue<A>, newValue: A | ((v: A) => A), props?: { literateFn?: boolean }) => {
  (_value_ as _ReactiveValue<A>).value = props?.literateFn
    ? newValue as A
    : typeof newValue === "function"
      ? (newValue as (a: A) => A)(read(_value_))
      : newValue
}

/**
 * Set a new value for ReactiveValue.
 * Does not used any kind of memoization or comparations
 * - always writes a new value and notifies dependencies about change
 */
export function write<A>(
  _value_: ReactiveValue<A>,
  newValue: A,
  props: { literateFn: true },
): ReactiveValue<A>;
export function write<A>(
  _value_: ReactiveValue<A>,
  newValue: A | ((aVal: A) => A),
  props?: { literateFn?: boolean },
): ReactiveValue<A>;
export function write<A>(
  _value_: ReactiveValue<A>,
  newValue: A | ((aVal: A) => A),
  props?: { literateFn?: boolean },
): ReactiveValue<A> {
  if (!isVal(_value_)) {
    throw new Error("Fluid: You can write only to ReactiveValue created with Fluid.val!!!")
  }

  mutateReactiveVal(_value_, newValue, props)
  notifyDeps((_value_ as _ReactiveValue<A>), NotificationType.UPDATE)

  return _value_
}

/**
  * Destroy the derivation.
  * It is not destroyed literally,
  * but it would be unsubscribed from all entities it listen to.
  */
export const destroy = (_derive_: ReactiveDerivation<unknown>) => {
  (_derive_ as _ReactiveDerivation<unknown>)._destroy()
}

export const isDestroyed = (_derive_: ReactiveDerivation<unknown>): boolean => {
  return (_derive_ as _ReactiveDerivation<unknown>)._destroyed
}

///////////////////////
// Reactive Structures
///////////////////////


// Reactive // val

export const val = <V>(value: V): ReactiveValue<V> => ({
  __tag: _rval,
  value,
  dependencies: new PriorityPool(),
}) as _ReactiveValue<V>


// Reactive // derive

function validateSources(_sources_: Array<Reactive>) {
  for (const _source_ of _sources_) {
    if (isDerive(_source_) && isDestroyed(_source_)) {
      throw new Error("Fluid: cannot subscribe to destroyed source!")
    }
  }
}

interface DeriveProps {
  priority?: Priority
}

export function derive<V, V2>(
  _reactive_: Reactive<V>,
  fn: (value: V) => V2,
  props?: DeriveProps,
): ReactiveDerivation<V2, [V]> {
  validateSources([_reactive_])
  const priority = props?.priority ?? priorities.base

  const derived: _ReactiveDerivation<V2> = {
    __tag: _rder,
    _destroy() {
      const pool = (_reactive_ as _Reactive).dependencies.get(this.priority)
      if (pool) {
        pool.delete(this)
      }
      notifyDeps(this, NotificationType.SOURCE_DESTROYED)
      this.dependencies.clear()
      this._destroyed = true
    },
    _cache: nullCache,
    _onMessage(_: _Reactive, type: NotificationType) {
      switch (type) {
      case NotificationType.UPDATE:
        derived._cache = nullCache
        break
      case NotificationType.SOURCE_DESTROYED:
        this._destroy()
        break
      }
    },
    // @ts-expect-error TODO: fix encapsulation
    fn,
    priority,
    dependencies: new PriorityPool(),
    value() {
      const result = calcValue()

      this._cache = result
      return result
    },
    _destroyed: false,
  }

  const calcValue = () => {
    return fn(read(_reactive_))
  }

  const pool = (_reactive_ as _Reactive).dependencies.getOrMake(derived.priority)
  pool.add(derived)

  return derived as ReactiveDerivation<V2, [V]>
}

export function deriveAll<Vs extends Array<any>, V2>(
  _sources_: { [K in keyof Vs]: Reactive<Vs[K]> },
  fn: (values: Vs) => V2,
  props?: DeriveProps,
): ReactiveDerivation<V2, Vs> {
  validateSources(_sources_ as Reactive[])
  const priority = props?.priority ?? priorities.base
  const sources = [..._sources_] as { [K in keyof Vs]: _Reactive<Vs[K]> | null }

  const count = sources.length
  const uniqCount = new Set(sources).size
  let destroyedCount = 0
  const values = Array(count)
  const calcValue = () => {
    for (let i = 0; i < count; i++) {
      const source = sources[i]
      if (source) {
        values[i] = read(source)
      }
    }
    return fn(values as unknown as Vs)
  }

  function sourceDestroyed(source: _Reactive) {
    let i = 0
    while (_sources_[i] !== source) { i++ }

    values[i] = read(source)
    sources[i] = null
    destroyedCount++
    if (destroyedCount === uniqCount) {
      derived._destroy() // every dependency was destroyed
    }
  }

  const derived: _ReactiveDerivation<V2> = {
    __tag: _rder,
    _destroy() {
      sources.forEach(source => {
        const pool = source?.dependencies.get(priority)
        if (pool) {
          pool.delete(this)
        }
      })
      notifyDeps(this, NotificationType.SOURCE_DESTROYED)
      this.dependencies.clear()
      this._destroyed = true
    },
    _cache: nullCache,
    _onMessage(source: _Reactive, type: NotificationType) {
      switch (type) {
      case NotificationType.UPDATE:
        derived._cache = nullCache
        break
      case NotificationType.SOURCE_DESTROYED:
        sourceDestroyed(source)
        break
      }
    },
    // @ts-expect-error TODO: fix encapsulation
    fn,
    priority,
    dependencies: new PriorityPool(),
    value() {
      const result = calcValue()

      this._cache = result
      return result
    },
    _destroyed: false,
  }

  // Push ourself into sources dependencies
  sources.forEach(source => {
    const pool = source!.dependencies.getOrMake(props?.priority ?? priorities.base)
    pool.add(derived)
  })

  return derived as ReactiveDerivation<V2, Vs>
}

// Reactive // listener

type Unsub = () => void;

interface ListenProps extends DeriveProps {
  immidiate?: boolean;
  once?: boolean;
}

export function listen<V>(
  _reactive_: Reactive<V>,
  fn: (value: V) => void,
  props?: ListenProps,
): Unsub {
  validateSources([_reactive_])
  const priority = props?.priority ?? priorities.base

  const listener: _ReactiveListener = {
    _onMessage(_, type) {
      switch (type) {
      case NotificationType.UPDATE:
        react()
        break
      case NotificationType.SOURCE_DESTROYED:
        unsub()
        break
      }
    },
  }

  function unsub() {
    const pool = (_reactive_ as _Reactive).dependencies.get(priority)
    if (pool) {
      pool.delete(listener)
    }
  }

  const effect: typeof fn = props?.once
    ? (values) => {
      fn(values)
      unsub()
    }
    : fn
  const react = () => {
    return effect(read(_reactive_))
  }

  const pool = (_reactive_ as _Reactive).dependencies.getOrMake(props?.priority ?? priorities.base)
  pool.add(listener)

  if (props?.immidiate) {
    react()
  }

  return unsub
}

export function listenAll<Vs extends Array<any>>(
  _sources_: { [K in keyof Vs]: Reactive<Vs[K]> },
  fn: (values: Vs) => void,
  props?: ListenProps,
): Unsub {
  validateSources(_sources_ as Reactive[])
  const sources = [..._sources_] as { [K in keyof Vs]: _Reactive<Vs[K]> | null }
  const priority = props?.priority ?? priorities.base

  const listener: _ReactiveListener = {
    _onMessage(source, type) {
      switch (type) {
      case NotificationType.UPDATE:
        react()
        break
      case NotificationType.SOURCE_DESTROYED:
        sourceDestroyed(source)
        break
      }
    },
  }

  function unsub() {
    sources.forEach(source => {
      const pool = source?.dependencies.get(priority)
      if (pool) {
        pool.delete(listener)
      }
    })
  }

  const effect: typeof fn = props?.once
    ? (values) => {
      fn(values)
      unsub()
    }
    : fn
  const count = _sources_.length
  const uniqCount = new Set(_sources_).size
  let destroyedCount = 0
  const values = Array(count)
  const react = () => {
    for (let i = 0; i < count; i++) {
      const source = sources[i]
      if (source) {
        values[i] = read(source)
      }
    }
    return effect(values as unknown as Vs)
  }

  function sourceDestroyed(source: _Reactive) {
    let i = 0
    while (_sources_[i] !== source) { i++ }

    values[i] = read(source)
    sources[i] = null
    destroyedCount++
    if (destroyedCount === uniqCount) {
      unsub() // every dependency was destroyed
    }
  }

  sources.forEach(source => {
    const pool = source!.dependencies.getOrMake(props?.priority ?? priorities.base)
    pool.add(listener)
  })

  if (props?.immidiate) {
    react()
  }

  return unsub
}

