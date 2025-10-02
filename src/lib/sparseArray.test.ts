import { describe, expect, it } from "vitest"
import { SparseArray } from "./sparseArray"

describe("SparseArray", () => {
  it("can be filled", () => {
    const arr = new SparseArray<string>()
    arr.push("a")
    arr.push("b")
    arr.push("c")

    expect(arr.get(0)).toBe("a")
    expect(arr.get(1)).toBe("b")
    expect(arr.get(2)).toBe("c")
  })

  it("can be sparsely filled", () => {
    const arr = new SparseArray<string>()
    arr.push("a")
    arr.push("b", 5)
    arr.push("c")

    expect(arr.get(0)).toBe("a")
    expect(arr.get(5)).toBe("b")
    expect(arr.get(6)).toBe("c")
  })

  it("can overwrite", () => {
    const arr = new SparseArray<string>()
    arr.push("a", 1)
    arr.push("b", 1)
    arr.push("c", 1)

    expect(arr.get(1)).toBe("c")
  })

  it("can be empty", () => {
    const arr = new SparseArray()

    expect(arr.isEmpty).toBe(true)
  })

  it("can put value in between", () => {
    const arr = new SparseArray<string>()
    arr.push("a")
    arr.push("c", 5)
    arr.push("b", 2)

    expect(arr.toArray()).toEqual(["a", "b", "c"])
  })

  it("insert before first", () => {
    const arr = new SparseArray<string>()
    arr.push("b", 1)
    arr.push("c")
    arr.push("a", 0)

    expect(arr.toArray()).toEqual(["a", "b", "c"])
  })

  it("replace with new", () => {
    const arr = new SparseArray<string>()
    arr.push("a")
    arr.push("b")
    arr.push("c")

    arr.push("A", 0)

    expect(arr.toArray()).toEqual(["A", "b", "c"])
  })

  it("properly goes forward", () => {
    const arr = new SparseArray<number>()

    arr.push(1)
    arr.push(2)
    arr.push(3, 10)
    arr.push(4)

    const seen: Array<number> = []
    arr.forEach(x => seen.push(x))

    expect(seen).toEqual([1, 2, 3, 4])
  })
  it("properly goes backward", () => {
    const arr = new SparseArray<number>()

    arr.push(1)
    arr.push(2)
    arr.push(3, 10)
    arr.push(4)

    const seen: Array<number> = []
    arr.forEachBackward(x => seen.push(x))

    expect(seen).toEqual([4, 3, 2, 1])
  })
})
