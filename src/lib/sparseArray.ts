interface Node<V> {
  value: V,
  index: number;
  next: Node<V> | undefined;
  previous: Node<V> | undefined;
}

export class SparseArray<V> {
  private nodeMap: Record<number, Node<V>> = {}
  private tail: Node<V> | undefined
  private head: Node<V> | undefined

  get first() {
    return this.tail?.value
  }
  get last() {
    return this.head?.value
  }
  get firstIndex() {
    return this.tail?.index ?? 0
  }
  get lastIndex() {
    return this.head?.index ?? 0
  }

  forEach(fn: (arg: V, index: number) => void) {
    let node = this.tail
    while (node) {
      fn(node.value, node.index)
      node = node.next
    }
  }
  forEachBackward(fn: (arg: V, index: number) => void) {
    let node = this.head
    while (node) {
      fn(node.value, node.index)
      node = node.previous
    }
  }
  reduce<B>(fn: (acc: B, arg: V, index: number) => B, initial: B) {
    let node = this.tail
    while (node) {
      initial = fn(initial, node.value, node.index)
      node = node.next
    }
    return initial
  }
  toArray(): Array<V> {
    return this.reduce((arr, val) => {
      arr.push(val)
      return arr
    }, [] as Array<V>)
  }

  delete(index: number) {
    const node = this.nodeMap[index]
    if (node) {
      if (node.previous) {
        node.previous.next = node.next
      } else {
        this.tail = node.next
      }
      if (node.next) {
        node.next.previous = node.previous
      } else {
        this.head = node
      }
      delete this.nodeMap[index]
    }
  }
  get(index: number) {
    return this.nodeMap[index]?.value
  }
  push(value: V, index7?: number): V {
    if (this.head === undefined) {
      const index = index7 ?? 0
      const node = {
        value,
        previous: undefined,
        next: undefined,
        index,
      }
      this.nodeMap[index] = node
      this.head = this.tail = node
      return node.value
    }

    const index = index7 ?? (this.head ? this.head.index + 1 : 0)

    let pushAfter: Node<V> | undefined = this.head
    while (pushAfter && pushAfter.index >= index) {
      if (pushAfter.index === index) {
        const atPlace = pushAfter
        pushAfter = atPlace.previous
        this.delete(atPlace.index)
        break
      }

      pushAfter = pushAfter.previous
    }

    const node = {
      value,
      previous: pushAfter,
      next: pushAfter?.next,
      index,
    }

    if (pushAfter === undefined) {
      if (this.tail) {
        node.next = this.tail
      }
      this.tail = node
    } else if (pushAfter.next === undefined) {
      this.head = node
    }
    if (node.previous) node.previous.next = node
    if (node.next) node.next.previous = node


    this.nodeMap[index] = node

    return node.value
  }
}
