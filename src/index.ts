import { derive, deriveAll, destroy, isDestroyed, listen, listenAll, peek, read, val, write } from "./fluid"
import { priorities } from "./priority"
import { transaction } from "./transaction"

export type { Reactive, ReactiveValue, ReactiveDerivation } from "./type"

export const Fluid = {
  val,
  derive,
  deriveAll,
  destroy,
  isDestroyed,
  read,
  peek,
  write,
  listen,
  listenAll,

  transaction,

  priorities,
}
