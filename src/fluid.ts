/* eslint-disable @typescript-eslint/no-empty-object-type */
/**
 * Reactive system libary
 */

import { NonEmptyArray } from "./lib/type"
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
    return _reactive_._cache === nullCache
      ? _reactive_.value()
      : _reactive_._cache
  }

  throw new Error("Fluid: you can read only reactive entities!")
}

export const peek = <R extends ReactiveDerivation<unknown>>(_derive_: R, dependencies: NonNullable<R["__meta_dependencies"]>): R["__value"] => {
  return (_derive_ as unknown as _ReactiveDerivation<R["__value"], NonNullable<R["__meta_dependencies"]>>)
    .fn(...dependencies)
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

interface DeriveProps {
  priority?: Priority
}

export function derive<V, V2>(
  _value_: Reactive<V>,
  fn: (value: V) => V2,
  props?: DeriveProps,
): ReactiveDerivation<V2, [V]>
// @ts-expect-error TS does not support high-kinded types
export function derive<Vs extends Array<any>, V2>(
  _values_: { [K in keyof Vs]: Reactive<Vs[K]> },
  fn: (...values: Vs) => V2,
  props?: DeriveProps,
): ReactiveDerivation<V2, Vs>;
export function derive<V, V2>(
  _v_: Reactive<V> | NonEmptyArray<Reactive<any>>,
  fn: ((value: V) => V2) | ((...values: any[]) => V2),
  props?: DeriveProps,
): ReactiveDerivation<V2> {
  const sources = Array.isArray(_v_)
    ? new Set(_v_) as Set<_Reactive<V>>
    : new Set([_v_]) as Set<_Reactive<V>>

  /**
   * Creates update function for getting
   * a new state of derive
   */
  const mkApplier = () => {
    if (sources.size === 1) {
      const _r_ = sources.values().next().value!
      return () => fn(read(_r_))
    }
    const _list_ = Array.from(sources.values())
    type FN = ((...values: any[]) => V2)

    return () => (
      (fn as FN)(..._list_.map(_reactive_ => read(_reactive_)))
    )
  }
  let applyFn = mkApplier()

  const derived: _ReactiveDerivation<V2> = {
    __tag: _rder,
    _destroy() {
      sources.forEach(source => {
        source.dependencies.get(this.priority)!.delete(this)
      })
      sources.clear()
      notifyDeps(this, NotificationType.SOURCE_DESTROYED)
    },
    _cache: nullCache,
    _onMessage(source: _Reactive, type: NotificationType) {
      switch (type) {
      case NotificationType.UPDATE:
        derived._cache = nullCache
        break
      case NotificationType.SOURCE_DESTROYED:
        if (sources.has(source as _Reactive<V>)) {
          sources.delete(source as _Reactive<V>)
          if (sources.size === 0) {
            derived._destroy()
          } else {
            applyFn = mkApplier()
          }
        }
        break
      }
    },
    // @ts-expect-error TODO: fix encapsulation
    fn,
    priority: props?.priority ?? priorities.base,
    dependencies: new PriorityPool(),
    value() {
      const result = applyFn()

      this._cache = result
      return result
    },
  }

  sources.forEach(source => {
    const pool = source.dependencies.getOrMake(derived.priority)
    pool.add(derived)
  })

  return derived
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
  props?: ListenProps
): Unsub
// @ts-expect-error TS does not support high-kinded types
export function listen<Vs extends NonEmptyArray<any>>(
  _reactive_: { [K in keyof Vs]: Reactive<Vs[K]> },
  fn: (...values: Vs) => void,
  props?: ListenProps,
): Unsub
export function listen<V>(
  _reactive_: Array<Reactive<V>>,
  fn: (...values: Array<Reactive<V>>) => void,
  props?: ListenProps,
): Unsub
export function listen<V>(
  _v_: Reactive<V> | NonEmptyArray<Reactive<any>>,
  fn: ((value: V) => void) | ((...values: any[]) => void),
  props?: ListenProps,
): Unsub {
  const sources = Array.isArray(_v_)
    ? new Set(_v_) as Set<_Reactive<V>>
    : new Set([_v_]) as Set<_Reactive<V>>

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
      const pool = source.dependencies.getOrMake(priority)
      pool.delete(listener)
    })
    sources.clear()
  }

  const mkApplier = () => {
    if (sources.size === 1) {
      const _r_ = sources.values().next().value!
      const singleParamEffect = props?.once
        ? (prop: any) => {
          fn(prop)
          unsub()
        }
        : fn

      return () => singleParamEffect(read(_r_))
    }
    const _list_ = Array.from(sources.values())

    const fn_: ((...values: any[]) => void) = fn
    const multiParamEffect = props?.once
      ? (...values: any[]) => {
        fn_(...values)
        unsub()
      }
      : fn_

    return () => {
      return multiParamEffect(..._list_.map(_reactive_ => read(_reactive_)))
    }
  }
  let react = mkApplier()

  function sourceDestroyed(source: _Reactive) {
    sources.delete(source as _Reactive<V>)
    if (sources.size > 0) {
      react = mkApplier()
    }
  }

  sources.forEach(source => {
    const pool = source.dependencies.getOrMake(props?.priority ?? priorities.base)
    pool.add(listener)
  })

  if (props?.immidiate) {
    react()
  }

  return unsub
}

