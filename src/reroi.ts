/**
 * Reactive system libary
 */

import { priorities, PriorityPool, validatePriority } from "./priority"
import { _rder, _rval, nullCache } from "./symbols"
import { _Reactive, _ReactiveDerivation, _ReactiveListener, _ReactiveValue, NotificationType, Priority, Reactive, ReactiveDerivation, ReactiveValue } from "./type"


export function isVal<V>(_value_: Reactive<V>): _value_ is _ReactiveValue<V>
export function isVal(_value_: unknown): _value_ is _ReactiveValue<unknown>
export function isVal<V>(_value_: Reactive<V> | any): _value_ is _ReactiveValue<V> {
  return typeof _value_ === "object" && _value_ !== null && "__tag" in _value_ && _value_.__tag === _rval
}
export function isDerive<V>(_value_: Reactive<V>): _value_ is _ReactiveDerivation<V>
export function isDerive(_value_: unknown): _value_ is _ReactiveDerivation<unknown>
export function isDerive<V>(_value_: Reactive<V> | any): _value_ is _ReactiveDerivation<V> {
  return typeof _value_ === "object" && _value_ !== null && "__tag" in _value_ && _value_.__tag === _rder
}

const notifyPool = (dependencies: PriorityPool, source: _Reactive, type: NotificationType) => {
  const stack: Array<_ReactiveListener> = []

  function fill(dependencies: PriorityPool) {
    dependencies.forEach(r => {
      stack.push(...[...r].reverse())
    })
  }
  fill(dependencies)

  while (stack.length > 0) {
    const reactive = stack.pop()!
    reactive._onMessage(source, type)
    if (reactive.dependencies && !reactive.dependencies.isEmpty) {
      fill(reactive.dependencies)
    }
  }
}

export const notifyDeps = (_r_: _Reactive, type: NotificationType) => {
  notifyPool(_r_.dependencies, _r_, type)
}

export const notifyAll = (_reactives_: ReadonlyArray<_Reactive>, type: NotificationType) => {
  if (_reactives_.length === 0) return

  let dependencies = new PriorityPool()
  for (const _reactive_ of _reactives_) {
    dependencies = PriorityPool.merge(dependencies, _reactive_.dependencies)
  }

  notifyPool(dependencies, _reactives_[0]!, type)
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
    if (_reactive_._cache !== nullCache) {
      return _reactive_._cache
    }
    if (_reactive_._destroyed) {
      throw new Error("reroi: cannot read a destroyed derivation that has no cached value")
    }
    return _reactive_.value()
  }

  throw new Error("reroi: you can read only reactive entities!")
}

export const peek = <R extends ReactiveDerivation<unknown>>(_derive_: R, dependencies: NonNullable<R["__meta_dependencies"]>): R["__value"] => {
  if (!isDerive(_derive_)) {
    throw new Error("reroi: peek expects a ReactiveDerivation")
  }
  // @ts-expect-error Internal dependency tuples are intentionally erased here.
  return (_derive_ as _ReactiveDerivation)._peek(dependencies)
}

export const mutateReactiveVal = <A>(_value_: ReactiveValue<A>, newValue: A | ((v: A) => A), props?: { literalFn?: boolean }) => {
  (_value_ as _ReactiveValue<A>).value = props?.literalFn
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
  props: { literalFn: true },
): ReactiveValue<A>;
export function write<A>(
  _value_: ReactiveValue<A>,
  newValue: A | ((aVal: A) => A),
  props?: { literalFn?: boolean },
): ReactiveValue<A>;
export function write<A>(
  _value_: ReactiveValue<A>,
  newValue: A | ((aVal: A) => A),
  props?: { literalFn?: boolean },
): ReactiveValue<A> {
  if (!isVal(_value_)) {
    throw new Error("reroi: You can write only to ReactiveValue created with reroi.val!!!")
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
  if (!isDerive(_derive_)) {
    throw new Error("reroi: destroy expects a ReactiveDerivation")
  }
  (_derive_ as _ReactiveDerivation<unknown>)._destroy()
}

export const isDestroyed = (_derive_: ReactiveDerivation<unknown>): boolean => {
  if (!isDerive(_derive_)) {
    throw new Error("reroi: isDestroyed expects a ReactiveDerivation")
  }
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

function validateSources(_sources_: ReadonlyArray<Reactive>) {
  for (const _source_ of _sources_) {
    if (!isVal(_source_) && !isDerive(_source_)) {
      throw new Error("reroi: dependencies must be reactive entities")
    }
    if (isDerive(_source_) && isDestroyed(_source_)) {
      throw new Error("reroi: cannot subscribe to destroyed source!")
    }
  }
}

interface DeriveProps {
  priority?: Priority
}

const getPriority = (props?: DeriveProps) => validatePriority(props?.priority ?? priorities.base)

export function derive<V, V2>(
  _reactive_: Reactive<V>,
  fn: (value: V) => V2,
  props?: DeriveProps,
): ReactiveDerivation<V2, [V]> {
  validateSources([_reactive_])
  const priority = getPriority(props)
  let source: _Reactive<V> | null = _reactive_ as _Reactive<V>

  const derived: _ReactiveDerivation<V2> = {
    __tag: _rder,
    _destroy() {
      if (this._destroyed) return

      const currentSource = source
      source = null
      currentSource?.dependencies.unsubscribe(this.priority, this)
      this._destroyed = true
      notifyDeps(this, NotificationType.SOURCE_DESTROYED)
      this.dependencies.clear()
    },
    _cache: nullCache,
    _onMessage(_: _Reactive, type: NotificationType) {
      if (this._destroyed) return

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
    _peek(values) {
      return fn(values[0] as V)
    },
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
    if (!source) {
      throw new Error("reroi: cannot calculate a destroyed derivation")
    }
    return fn(read(source))
  }

  source.dependencies.subscribe(derived.priority, derived)

  return derived as ReactiveDerivation<V2, [V]>
}

export function deriveAll<Vs extends Array<any>, V2>(
  _sources_: { [K in keyof Vs]: Reactive<Vs[K]> },
  fn: (values: Vs) => V2,
  props?: DeriveProps,
): ReactiveDerivation<V2, Vs> {
  validateSources(_sources_ as Reactive[])
  const priority = getPriority(props)
  const sources = [..._sources_] as { [K in keyof Vs]: _Reactive<Vs[K]> | null }

  const count = sources.length
  const liveSources = new Set<_Reactive>(sources as Array<_Reactive>)
  let values = Array(count)
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
    if (!isDerive(source) || source._cache === nullCache) {
      derived._destroy()
      return
    }

    for (let i = 0; i < count; i++) {
      if (sources[i] === source) {
        values[i] = source._cache
        sources[i] = null
      }
    }

    liveSources.delete(source)
    if (liveSources.size === 0) {
      derived._destroy()
    }
  }

  const derived: _ReactiveDerivation<V2> = {
    __tag: _rder,
    _destroy() {
      if (this._destroyed) return

      sources.forEach(source => {
        source?.dependencies.unsubscribe(priority, this)
      })
      sources.fill(null)
      liveSources.clear()
      values = []
      this._destroyed = true
      notifyDeps(this, NotificationType.SOURCE_DESTROYED)
      this.dependencies.clear()
    },
    _cache: nullCache,
    _onMessage(source: _Reactive, type: NotificationType) {
      if (this._destroyed) return

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
    _peek(values) {
      return fn(values as unknown as Vs)
    },
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
    source!.dependencies.subscribe(priority, derived)
  })

  return derived as ReactiveDerivation<V2, Vs>
}

// Reactive // listener

type Unsub = () => void;

interface ListenProps extends DeriveProps {
  immediate?: boolean;
  once?: boolean;
}

export function listen<V>(
  _reactive_: Reactive<V>,
  fn: (value: V) => void,
  props?: ListenProps,
): Unsub {
  validateSources([_reactive_])
  const priority = getPriority(props)
  let source: _Reactive<V> | null = _reactive_ as _Reactive<V>
  let effect: ((value: V) => void) | null = fn
  let active = false

  const listener: _ReactiveListener = {
    _onMessage(_, type) {
      if (!active) return

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
    if (!source) return

    active = false
    const currentSource = source
    source = null
    currentSource.dependencies.unsubscribe(priority, listener)
    effect = null
  }

  const react = () => {
    if (!source || !effect) return

    const value = read(source)
    const currentEffect = effect
    if (props?.once) {
      unsub()
    }
    return currentEffect(value)
  }

  if (props?.immediate) {
    react()
  }

  if (!source || (props?.immediate && props.once) || (isDerive(source) && source._destroyed)) {
    unsub()
    return unsub
  }

  active = true
  source.dependencies.subscribe(priority, listener)

  return unsub
}

export function listenAll<Vs extends Array<any>>(
  _sources_: { [K in keyof Vs]: Reactive<Vs[K]> },
  fn: (values: Vs) => void,
  props?: ListenProps,
): Unsub {
  validateSources(_sources_ as Reactive[])
  const sources = [..._sources_] as { [K in keyof Vs]: _Reactive<Vs[K]> | null }
  const priority = getPriority(props)
  const liveSources = new Set<_Reactive>(sources as Array<_Reactive>)
  let effect: ((values: Vs) => void) | null = fn
  let active = false

  const listener: _ReactiveListener = {
    _onMessage(source, type) {
      if (!active) return

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
    if (!effect && liveSources.size === 0) return

    active = false
    sources.forEach(source => {
      source?.dependencies.unsubscribe(priority, listener)
    })
    sources.fill(null)
    liveSources.clear()
    effect = null
    values = []
  }

  const count = _sources_.length
  let values = Array(count)
  const react = () => {
    if (!effect) return

    for (let i = 0; i < count; i++) {
      const source = sources[i]
      if (source) {
        values[i] = read(source)
      }
    }
    const currentEffect = effect
    const currentValues = values as unknown as Vs
    if (props?.once) {
      unsub()
    }
    return currentEffect(currentValues)
  }

  function sourceDestroyed(source: _Reactive) {
    if (!isDerive(source) || source._cache === nullCache) {
      unsub()
      return
    }

    for (let i = 0; i < count; i++) {
      if (sources[i] === source) {
        values[i] = source._cache
        sources[i] = null
      }
    }

    liveSources.delete(source)
    if (liveSources.size === 0) {
      unsub()
    }
  }

  if (props?.immediate) {
    react()
  }

  if (!effect || (props?.immediate && props.once) || sources.some(source => isDerive(source) && source._destroyed)) {
    unsub()
    return unsub
  }

  active = true
  sources.forEach(source => {
    source!.dependencies.subscribe(priority, listener)
  })

  return unsub
}
