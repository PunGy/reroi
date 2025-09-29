/* eslint-disable @typescript-eslint/no-empty-object-type */

import type { PriorityPool } from "./priority"
import { nullCache, _errorTransaction, _rder, _readable, _rval, _successTransaction, _writable, phighest, plowest } from "./symbols"

export enum NotificationType {
  UPDATE,
  SOURCE_DESTROYED,
}

export interface Dependable {
  dependencies: PriorityPool;
}

// Lower number - lower priority
export type Priority = number

export interface Priorities {
  lowest: typeof plowest,
  highest: typeof phighest
  base: 0,

  before(p0: ReactiveDerivation<unknown> | Priority): Priority;
  after(p0: ReactiveDerivation<unknown> | Priority): Priority;
}


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

// Internal

export interface _ReactiveValue<V> extends ReactiveValue<V>, Dependable {
  __tag: typeof _rval,
  value: V;
}

export interface _ReactiveDerivation<V = unknown, D extends Array<unknown> = Array<unknown>> extends ReactiveDerivation<V, D>, Dependable {
  __tag: typeof _rder,
  _destroy(): void;
  _cache: (typeof nullCache) | V;
  _invalidate(): void;
  _onMessage(source: _Reactive, type: NotificationType): void;
  priority: Priority;
  value(): V;
  fn: (...values: D) => V,
}

export type _Reactive<V = unknown> = _ReactiveValue<V> | _ReactiveDerivation<V>

export type _ReactiveListener = {
  dependencies?: _ReactiveDerivation["dependencies"],
  _onMessage: _ReactiveDerivation["_onMessage"],
}
export type Pool = Set<_ReactiveListener>

///// Transactions

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

export interface _ReactiveTransaction<R, E, C = {}, ID extends string = string> extends ReactiveTransaction<R, E, C, ID>, Dependable {
  // Run, but does not notifies dependencies, nor writing a value
  silentRun(ctx: C): TransactionState<R, E>;
  // write a value, if no writer - it is a composable transaction
  write?(value: R): void;
}
