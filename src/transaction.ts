/* eslint-disable @typescript-eslint/no-empty-object-type */

import { _errorTransaction, _successTransaction } from "./symbols"
import { _Reactive, _ReactiveTransaction, _ReactiveValue, NotificationType, ReactiveTransaction, ReactiveValue, TransactionError, TransactionState, TransactionSuccess } from "./type"
import { isVal, notifyDeps, read } from "./reroi"
import { flow, pipe } from "./lib/composition"
import { PriorityPool } from "./priority"

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

const foldT = <R, E, B>(onError: (e: E) => B, onSuccess: (r: R) => B) => (transaction: TransactionState<R, E>): B => {
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
    throw new Error("reroi: You can write only to ReactiveValue created with val!!!")
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
    throw new Error("reroi.transaction: empty transaction list!")
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
          throw new Error("reroi: inconsistent state of transaction")
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

export const transaction = {
  write: writeT,
  compose: composeT,

  isSuccess,
  isError,
  mapS: mapTS,
  mapE: mapTE,
  fold: foldT,

  success,
  error,
}
