export type Function1 = (p: any) => any;
export type AnyFunction = (...args: Array<unknown>) => unknown;

export type Parameter1<F extends Function1> = Parameters<F>[0]


