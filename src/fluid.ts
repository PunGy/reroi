/* eslint-disable @typescript-eslint/no-empty-object-type */
/**
 * Reactive system libary
 */

import { flow, pipe } from "./lib/composition"
import { SparseArray } from "./lib/sparseArray"

//////////////
// Utilities
/////////////

type NonEmptyArray<V> = { [0]: V } & Array<V>

// Utilities // Priorities

const _rval = Symbol("rval")
const _rder = Symbol("rder")
const _readable = Symbol("readable")
const _writable = Symbol("writable")

enum NotificationType {
  UPDATE,
  SOURCE_DESTROYED,
}
type Message = (from: _Reactive, type: NotificationType) => void;

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

type Pool = Map<unknown, Message>
export class PriorityPool extends SparseArray<Pool> {
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

  forEachBackward(fn: (arg: Map<unknown, Message>, index: number) => void): void {
    if (this.highest) {
      fn(this.highest, +Infinity)
    }
    super.forEachBackward(fn)
    if (this.lowest) {
      fn(this.lowest, -Infinity)
    }
  }

  /**
   * Merges two priority pools together
   *
   * The merge is not "plain", it also filters out repetitive sources,
   * so the resulting pool is only consists of unique messages
   *
   * Dependencies, in case if they are to the same target,
   * will be succeeded in the following way: the highest priority would take a lead
   */
  static merge(p1: PriorityPool, p2: PriorityPool) {
    const result = new PriorityPool()
    const seen = new Set()

    // put entire p1 to result
    p1.forEachBackward((pool, priority) => {
      result.push(pool, priority)
      pool.forEach((_, source) => {
        seen.add(source)
      })
    })

    // merge with p2, filter out already seen connections
    p2.forEachBackward((pool, priority) => {
      const merged: Pool = new Map()
      pool.forEach((message, source) => {
        if (seen.has(source)) {
          return
        }
        merged.set(source, message)
        seen.add(source)
      })
      if (merged.size > 0) {
        const existingPool = result.get(priority)
        if (existingPool) {
          merged.forEach((message, source) => {
            existingPool.set(source, message)
          })
        } else {
          result.push(merged, priority)
        }
      }
    })

    return result
  }
}

// Utilities // Reactivity types

// Public


export interface ReactiveValue<V> {
  /** @deprecated Exists only for types */
  __value: V;
  __readable: typeof _readable;
  __writable: typeof _writable;
}

export interface ReactiveDerivation<V, D extends Array<unknown> = Array<unknown>> {
  /** @deprecated Exists only for types */
  __value: V;
  /** @deprecated Exists only for types */
  __readable: typeof _readable;
  /** @deprecated Exists only for types */
  __meta_dependencies?: D,
}

export type Reactive<V = unknown> = ReactiveValue<V> | ReactiveDerivation<V>

const _successTransaction = Symbol("successTransaction")
const _errorTransaction = Symbol("errorTransaction")
export type TransactionSuccess<R> = {
  __tag: typeof _successTransaction;
  value: R;
}
export type TransactionError<E> = {
  __tag: typeof _errorTransaction;
  error: E;
}
export type TransactionState<R, E> = TransactionSuccess<R> | TransactionError<E>

export interface ReactiveTransaction<
  R = unknown, // Might be succeeded with
  E = unknown, // Might be error with
  C = {}, // Accululated context
  ID extends string = string // id
> {
  run(): TransactionState<R, E>;
  id?: ID,
  context: C,
}

// Private

interface Dependable {
  dependencies: PriorityPool;
}

interface _ReactiveValue<V> extends ReactiveValue<V>, Dependable {
  __tag: typeof _rval,
  value: V;
}

interface _ReactiveDerivation<V, D extends Array<unknown> = Array<unknown>> extends ReactiveDerivation<V, D>, Dependable {
  __tag: typeof _rder,
  _destroy(): void;
  _cache: (typeof nullCache) | V;
  priority: Priority;
  value(): V;
  fn: (...values: D) => V,
}

type _Reactive<V = unknown> = _ReactiveValue<V> | _ReactiveDerivation<V>

interface _ReactiveTransaction<R, E, C = {}, ID extends string = string> extends ReactiveTransaction<R, E, C, ID>, Dependable {
  // Run, but does not notifies dependencies, nor writing a value
  silentRun(ctx: C): TransactionState<R, E>;
  // write a value, if no writer - it is a composable transaction
  write?(value: R): void;
}

// Utilities // Helpers

function isVal<V>(_value_: Reactive<V>): _value_ is _ReactiveValue<V>
function isVal(smth: unknown): false
function isVal<V>(_value_: Reactive<V> | any): _value_ is _ReactiveValue<V> {
  return typeof _value_ === "object" && _value_ !== null && "__tag" in _value_ && _value_.__tag === _rval
}
function isDerive<V>(_value_: Reactive<V>): _value_ is _ReactiveDerivation<V>
function isDerive(smth: unknown): false
function isDerive<V>(_value_: Reactive<V> | any): _value_ is _ReactiveDerivation<V> {
  return typeof _value_ === "object" && _value_ !== null && "__tag" in _value_ && _value_.__tag === _rder
}

const notifyDeps = (_r_: _Reactive, type: NotificationType) => {
  _r_.dependencies.forEachBackward((pool) => {
    pool.forEach(message => {
      message(_r_, type)
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
    return _reactive_._cache === nullCache
      ? _reactive_.value()
      : _reactive_._cache
  }

  throw new Error("Fluid: you can read only reactive entities!")
}

const peek = <R extends ReactiveDerivation<unknown>>(_derive_: R, dependencies: NonNullable<R["__meta_dependencies"]>): R["__value"] => {
  return (_derive_ as unknown as _ReactiveDerivation<R["__value"], NonNullable<R["__meta_dependencies"]>>)
    .fn(...dependencies)
}

const mutateReactiveVal = <A>(_value_: ReactiveValue<A>, newValue: A | ((v: A) => A), props?: { literateFn?: boolean }) => {
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
function write<A>(
  _value_: ReactiveValue<A>,
  newValue: A,
  props: { literateFn: true },
): ReactiveValue<A>;
function write<A>(
  _value_: ReactiveValue<A>,
  newValue: A | ((aVal: A) => A),
  props?: { literateFn?: boolean },
): ReactiveValue<A>;
function write<A>(
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

/////////////////
// Transactions

const success = <R>(value: R): TransactionSuccess<R> => ({
  __tag: _successTransaction,
  value,
})
const error = <E>(error: E): TransactionError<E> => ({
  __tag: _errorTransaction,
  error,
})
function isSuccess<R, E>(transaction: TransactionState<R, E>): transaction is TransactionSuccess<R> {
  return transaction.__tag === _successTransaction
}
function isError<R, E>(transaction: TransactionState<R, E>): transaction is TransactionError<E> {
  return transaction.__tag === _errorTransaction
}


const mapTS = <R, R2, E>(fn: (a: R) => R2) => (transaction: TransactionState<R, E>): TransactionState<R2, E> => {
  return isSuccess(transaction) ? success(fn(transaction.value)) : transaction
}
const mapTE = <R, E, E2>(fn: (a: E) => E2) => (transaction: TransactionState<R, E>): TransactionState<R, E2> => {
  return isError(transaction) ? error(fn(transaction.error)) : transaction
}

const foldT = <R, E, B>(onSuccess: (r: R) => B, onError: (e: E) => B) => (transaction: TransactionState<R, E>): B => {
  return isSuccess(transaction)
    ? onSuccess(transaction.value)
    : onError(transaction.error)
}

const runTransaction = <A, E, C>(
  _v_: ReactiveValue<A>,
  newValue: A | ((aVal: A, context: C) => TransactionState<A, E>), context: C) => {
  return typeof newValue === "function"
    ? (newValue as (a: A, context: C) => TransactionState<A, E>)(read(_v_), context)
    : success(newValue)
}

function writeT<R, E, C = {}, ID extends string = string>(
  _value_: ReactiveValue<R>,
  newValue: (aVal: R, context: C) => TransactionState<R, E>,
  id?: ID
): ReactiveTransaction<R, E, C, ID>;
function writeT<A, _, C = {}, ID extends string = string>(
  _value_: ReactiveValue<A>,
  newValue: A,
  id?: ID
): ReactiveTransaction<A, never, C, ID>;
function writeT<A, E, C = {}, ID extends string = string>(
  _value_: ReactiveValue<A>,
  newValue: A | ((aVal: A, context: C) => TransactionState<A, E>),
  id?: ID,
): ReactiveTransaction<A, E, C, ID> {
  if (!isVal(_value_)) {
    throw new Error("Fluid: You can write only to ReactiveValue created with Fluid.val!!!")
  }
  const _v_ = _value_ as _ReactiveValue<A>

  const tr: _ReactiveTransaction<A, E, C, ID> = {
    run() {
      return pipe(
        runTransaction(_v_, newValue, this.context),
        mapTS(v => {
          this.write!(v)
          notifyDeps(_v_, NotificationType.UPDATE)
          return v
        }),
      )
    },
    silentRun(ctx: C) {
      this.context = ctx
      return runTransaction(_v_, newValue, this.context)
    },
    write(value: A) {
      _v_.value = value
    },
    context: {} as C,
    dependencies: _v_.dependencies,
    id,
  }

  return tr as ReactiveTransaction<A, E, C, ID>
}

type ResolvedField<T extends TransactionState<unknown, unknown>> = T extends TransactionSuccess<unknown> ? T["value"] : never
type RejectedField<T extends TransactionState<unknown, unknown>> = T extends TransactionError<unknown> ? T["error"] : never
type ExtractResolved<T extends ReactiveTransaction> = ResolvedField<ReturnType<T["run"]>>
type ExtractRejected<T extends ReactiveTransaction> = RejectedField<ReturnType<T["run"]>>

type RemoveUnknown<T> = T extends unknown ? unknown extends T ? never : T : T;

/**
There was an attempt to not use function overloading and with following type constructor
It works correctly, but unfortunatelly I can't combine it with type infering :(

type ComposeContext<TRs extends Array<ReactiveTransaction>, Acc extends Array<ReactiveTransaction> = []> =
  Acc extends [...infer _, infer Processed]
    ? Processed extends ReactiveTransaction
      ? TRs extends [infer Processing, ...infer Rest]
        ? Processing extends ReactiveTransaction
          ? ComposeContext< Rest
                          , [ ...Acc
                            , ReactiveTransaction< ExtractResolved<Processing>
                                                 , ExtractFailed<Processing>
                                                 , Processed["id"] extends undefined ? {} : Processed["context"] & { [K in NonNullable<Processed["id"]>]: ExtractResolved<Processed> }
                                                 , NonNullable<Processing["id"]>>]>
          : never
        : Acc
      : never
    : Acc

type t = ComposeContext<
  [
    ReactiveTransaction<2, -1, unknown, "b">,
    ReactiveTransaction<3, -1, unknown, "c">,
    ReactiveTransaction<4, -1, unknown, "d">,
  ],
  [ReactiveTransaction<1, -1, {}, "a">]
>
*/


/**
 * Composing transaction into one transaction
 */
function composeT<T1R, T1F, T1ID extends string>(tr1: ReactiveTransaction<T1R, T1F, {}, T1ID>): ReactiveTransaction<T1R, T1F>;
function composeT< T1R, T1F, T1ID extends string
                   , T2R, T2F, T2ID extends string>( tr1: ReactiveTransaction<T1R, T1F, {}, T1ID>
                                                    , tr2: ReactiveTransaction<T2R, T2F, { [K in T1ID]: T1R }, T2ID>): ReactiveTransaction<T2R, T1F | T2F>;
function composeT< T1R, T1F, T1ID extends string
                    , T2R, T2F, T2ID extends string
                    , T3R, T3F, T3ID extends string>( tr1: ReactiveTransaction<T1R, T1F, {}, T1ID>
                                                    , tr2: ReactiveTransaction<T2R, T2F, { [K in T1ID]: T1R }, T2ID>
                                                    , tr3: ReactiveTransaction<T3R, T3F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R }, T3ID>): ReactiveTransaction<T3R, T1F | T2F | T3F>;
function composeT< T1R, T1F, T1ID extends string
                    , T2R, T2F, T2ID extends string
                    , T3R, T3F, T3ID extends string
                    , T4R, T4F, T4ID extends string>( tr1: ReactiveTransaction<T1R, T1F, {}, T1ID>
                                                    , tr2: ReactiveTransaction<T2R, T2F, { [K in T1ID]: T1R }, T2ID>
                                                    , tr3: ReactiveTransaction<T3R, T3F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R }, T3ID>
                                                    , tr4: ReactiveTransaction<T4R, T4F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R }, T4ID>): ReactiveTransaction<T4R, T1F | T2F | T3F | T4F>;

function composeT< T1R, T1F, T1ID extends string
                    , T2R, T2F, T2ID extends string
                    , T3R, T3F, T3ID extends string
                    , T4R, T4F, T4ID extends string
                    , T5R, T5F, T5ID extends string>( tr1: ReactiveTransaction<T1R, T1F, {}, T1ID>
                                                    , tr2: ReactiveTransaction<T2R, T2F, { [K in T1ID]: T1R }, T2ID>
                                                    , tr3: ReactiveTransaction<T3R, T3F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R }, T3ID>
                                                    , tr4: ReactiveTransaction<T4R, T4F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R }, T4ID>
                                                    , tr5: ReactiveTransaction<T5R, T5F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R }, T5ID>): ReactiveTransaction<T5R, T1F | T2F | T3F | T4F | T5F>;

function composeT< T1R, T1F, T1ID extends string
                    , T2R, T2F, T2ID extends string
                    , T3R, T3F, T3ID extends string
                    , T4R, T4F, T4ID extends string
                    , T5R, T5F, T5ID extends string
                    , T6R, T6F, T6ID extends string>( tr1: ReactiveTransaction<T1R, T1F, {}, T1ID>
                                                    , tr2: ReactiveTransaction<T2R, T2F, { [K in T1ID]: T1R }, T2ID>
                                                    , tr3: ReactiveTransaction<T3R, T3F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R }, T3ID>
                                                    , tr4: ReactiveTransaction<T4R, T4F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R }, T4ID>
                                                    , tr5: ReactiveTransaction<T5R, T5F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R }, T5ID>
                                                    , tr6: ReactiveTransaction<T6R, T6F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R } & { [K in T5ID]: T5R }, T6ID>): ReactiveTransaction<T6R, T1F | T2F | T3F | T4F | T5F | T6F>;

function composeT< T1R, T1F, T1ID extends string
                    , T2R, T2F, T2ID extends string
                    , T3R, T3F, T3ID extends string
                    , T4R, T4F, T4ID extends string
                    , T5R, T5F, T5ID extends string
                    , T6R, T6F, T6ID extends string
                    , T7R, T7F, T7ID extends string>( tr1: ReactiveTransaction<T1R, T1F, {}, T1ID>
                                                    , tr2: ReactiveTransaction<T2R, T2F, { [K in T1ID]: T1R }, T2ID>
                                                    , tr3: ReactiveTransaction<T3R, T3F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R }, T3ID>
                                                    , tr4: ReactiveTransaction<T4R, T4F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R }, T4ID>
                                                    , tr5: ReactiveTransaction<T5R, T5F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R }, T5ID>
                                                    , tr6: ReactiveTransaction<T6R, T6F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R } & { [K in T5ID]: T5R }, T6ID>
                                                    , tr7: ReactiveTransaction<T7R, T7F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R } & { [K in T5ID]: T5R } & { [K in T6ID]: T6R }, T7ID>): ReactiveTransaction<T7R, T1F | T2F | T3F | T4F | T5F | T6F | T7F>;

function composeT< T1R, T1F, T1ID extends string
                    , T2R, T2F, T2ID extends string
                    , T3R, T3F, T3ID extends string
                    , T4R, T4F, T4ID extends string
                    , T5R, T5F, T5ID extends string
                    , T6R, T6F, T6ID extends string
                    , T7R, T7F, T7ID extends string
                    , T8R, T8F, T8ID extends string>( tr1: ReactiveTransaction<T1R, T1F, {}, T1ID>
                                                    , tr2: ReactiveTransaction<T2R, T2F, { [K in T1ID]: T1R }, T2ID>
                                                    , tr3: ReactiveTransaction<T3R, T3F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R }, T3ID>
                                                    , tr4: ReactiveTransaction<T4R, T4F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R }, T4ID>
                                                    , tr5: ReactiveTransaction<T5R, T5F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R }, T5ID>
                                                    , tr6: ReactiveTransaction<T6R, T6F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R } & { [K in T5ID]: T5R }, T6ID>
                                                    , tr7: ReactiveTransaction<T7R, T7F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R } & { [K in T5ID]: T5R } & { [K in T6ID]: T6R }, T7ID>
                                                    , tr8: ReactiveTransaction<T8R, T8F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R } & { [K in T5ID]: T5R } & { [K in T6ID]: T6R } & { [K in T7ID]: T7R }, T8ID>): ReactiveTransaction<T8R, T1F | T2F | T3F | T4F | T5F | T6F | T7F | T8F>;

function composeT< T1R, T1F, T1ID extends string
                    , T2R, T2F, T2ID extends string
                    , T3R, T3F, T3ID extends string
                    , T4R, T4F, T4ID extends string
                    , T5R, T5F, T5ID extends string
                    , T6R, T6F, T6ID extends string
                    , T7R, T7F, T7ID extends string
                    , T8R, T8F, T8ID extends string
                    , T9R, T9F, T9ID extends string>( tr1: ReactiveTransaction<T1R, T1F, {}, T1ID>
                                                    , tr2: ReactiveTransaction<T2R, T2F, { [K in T1ID]: T1R }, T2ID>
                                                    , tr3: ReactiveTransaction<T3R, T3F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R }, T3ID>
                                                    , tr4: ReactiveTransaction<T4R, T4F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R }, T4ID>
                                                    , tr5: ReactiveTransaction<T5R, T5F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R }, T5ID>
                                                    , tr6: ReactiveTransaction<T6R, T6F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R } & { [K in T5ID]: T5R }, T6ID>
                                                    , tr7: ReactiveTransaction<T7R, T7F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R } & { [K in T5ID]: T5R } & { [K in T6ID]: T6R }, T7ID>
                                                    , tr8: ReactiveTransaction<T8R, T8F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R } & { [K in T5ID]: T5R } & { [K in T6ID]: T6R } & { [K in T7ID]: T7R }, T8ID>
                                                    , tr9: ReactiveTransaction<T9R, T9F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R } & { [K in T5ID]: T5R } & { [K in T6ID]: T6R } & { [K in T7ID]: T7R } & { [K in T8ID]: T8R }, T9ID>): ReactiveTransaction<T9R, T1F | T2F | T3F | T4F | T5F | T6F | T7F | T8F | T9F>;

function composeT< T1R, T1F, T1ID extends string
                    , T2R, T2F, T2ID extends string
                    , T3R, T3F, T3ID extends string
                    , T4R, T4F, T4ID extends string
                    , T5R, T5F, T5ID extends string
                    , T6R, T6F, T6ID extends string
                    , T7R, T7F, T7ID extends string
                    , T8R, T8F, T8ID extends string
                    , T9R, T9F, T9ID extends string
                    , T10R, T10F, T10ID extends string>( tr1: ReactiveTransaction<T1R, T1F, {}, T1ID>
                                                       , tr2: ReactiveTransaction<T2R, T2F, { [K in T1ID]: T1R }, T2ID>
                                                       , tr3: ReactiveTransaction<T3R, T3F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R }, T3ID>
                                                       , tr4: ReactiveTransaction<T4R, T4F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R }, T4ID>
                                                       , tr5: ReactiveTransaction<T5R, T5F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R }, T5ID>
                                                       , tr6: ReactiveTransaction<T6R, T6F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R } & { [K in T5ID]: T5R }, T6ID>
                                                       , tr7: ReactiveTransaction<T7R, T7F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R } & { [K in T5ID]: T5R } & { [K in T6ID]: T6R }, T7ID>
                                                       , tr8: ReactiveTransaction<T8R, T8F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R } & { [K in T5ID]: T5R } & { [K in T6ID]: T6R } & { [K in T7ID]: T7R }, T8ID>
                                                       , tr9: ReactiveTransaction<T9R, T9F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R } & { [K in T5ID]: T5R } & { [K in T6ID]: T6R } & { [K in T7ID]: T7R } & { [K in T8ID]: T8R }, T9ID>
                                                       , tr10: ReactiveTransaction<T10R, T10F, { [K in T1ID]: T1R } & { [K in T2ID]: T2R } & { [K in T3ID]: T3R } & { [K in T4ID]: T4R } & { [K in T5ID]: T5R } & { [K in T6ID]: T6R } & { [K in T7ID]: T7R } & { [K in T8ID]: T8R } & { [K in T9ID]: T9R }, T10ID>): ReactiveTransaction<T10R, T1F | T2F | T3F | T4F | T5F | T6F | T7F | T8F | T9F | T10F>;
function composeT<
  TRs extends Array<ReactiveTransaction>,
>(...transactions: TRs): ReactiveTransaction {
  const _transactions = transactions as unknown as Array<_ReactiveTransaction<unknown, unknown, any, string>>

  let dependencies: PriorityPool | null = null
  for (const tr of _transactions) {
    if (dependencies) {
      dependencies = PriorityPool.merge(dependencies, tr.dependencies)
    } else {
      dependencies = tr.dependencies
    }
  }
  if (!dependencies) {
    throw new Error("Fluid.transaction: empty transaction list!")
  }

  const silentRun = <C extends Record<string, unknown>>(ctx: C = {} as C) => {
    let resT: TransactionState<Array<[_ReactiveTransaction<unknown, unknown, {}, string>, unknown]>, unknown> = success([])
    const context: Record<string, unknown> = ctx

    for (const tr of _transactions) {
      resT = pipe(
        tr.silentRun(context),
        mapTS(res => {
          if (isSuccess(resT)) {
            if (tr.id) {
              context[tr.id] = res
            }
            return resT.value.concat([[tr, res]])
          }
          throw new Error("Fluid: inconsistent state of transaction")
        }),
      )

      if (isError(resT)) {
        return resT
      }
    }

    return resT
  }

  function write(entries: Array<[_ReactiveTransaction<unknown, unknown>, unknown]>) {
    entries.forEach(([tr, value]) => {
      if (tr.write) {
        tr.write(value)
      } else {
        if (!Array.isArray(value)) throw new Error("Broken transaction composition")
        write(value)
      }
    })
  }

  const run = flow(
    silentRun,
    mapTS(r => {
      write(r)
      notifyDeps({ dependencies } as unknown as _Reactive, NotificationType.UPDATE)
      return r.at(-1)![1]
    }),
  )

  const tr: _ReactiveTransaction<unknown, unknown> = {
    run,
    silentRun,
    dependencies,
    context: {},
  }

  return tr
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
  __tag: _rval,
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
): ReactiveDerivation<V2, [V]>
// @ts-expect-error TS does not support high-kinded types
function derive<Vs extends Array<any>, V2>(
  _values_: { [K in keyof Vs]: Reactive<Vs[K]> },
  fn: (...values: Vs) => V2,
  props?: DeriveProps,
): ReactiveDerivation<V2, Vs>;
function derive<V, V2>(
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
    return () => (
      (fn as ((...values: any[]) => V2))(..._list_.map(_reactive_ => read(_reactive_)))
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

  function invalidate() {
    derived._cache = nullCache
    notifyDeps(derived, NotificationType.UPDATE)
  }
  function sourceDestroyed(source: _Reactive) {
    sources.delete(source as _Reactive<V>)
    if (sources.size === 0) {
      derived._destroy()
    } else {
      applyFn = mkApplier()
    }
  }

  const onMessage = (source: _Reactive, type: NotificationType) => {
    if (type === NotificationType.UPDATE) {
      invalidate()
    } else {
      sourceDestroyed(source)
    }
  }

  sources.forEach(source => {
    const pool = source.dependencies.getOrMake(derived.priority)
    pool.set(derived, onMessage)
  })

  return derived
}

// Reactive // listener

type Unsub = () => void;

interface ListenProps extends DeriveProps {
  immidiate?: boolean;
  once?: boolean;
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
  _v_: Reactive<V> | NonEmptyArray<Reactive<any>>,
  fn: ((value: V) => void) | ((...values: any[]) => void),
  props?: ListenProps,
): Unsub {
  const sources = Array.isArray(_v_)
    ? new Set(_v_) as Set<_Reactive<V>>
    : new Set([_v_]) as Set<_Reactive<V>>

  const priority = props?.priority ?? priorities.base
  function unsub() {
    sources.forEach(source => {
      const pool = source.dependencies.getOrMake(priority)
      pool.delete(unsub)
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
  const onMessage = (source: _Reactive, type: NotificationType) => {
    if (type === NotificationType.UPDATE) {
      react()
    } else {
      sourceDestroyed(source)
    }
  }

  sources.forEach(source => {
    const pool = source.dependencies.getOrMake(props?.priority ?? priorities.base)
    pool.set(unsub, onMessage)
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
  peek,
  write,
  listen,

  transaction: {
    write: writeT,
    compose: composeT,

    isSuccess,
    isError,
    mapS: mapTS,
    mapE: mapTE,
    fold: foldT,

    success,
    error,
  },

  priorities,
}

