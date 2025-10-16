import { describe, test, it, expect, vi } from "vitest"
import * as R from "./index"
import type { Reactive, ReactiveValue } from "./index"

const sumList = <T extends string | number>(list: Array<T>): T => (
  // @ts-expect-error i'm okay with runtime error on incorrect use in tests
  list.reduce((acc, x) => acc + x, typeof list[0] === "string" ? "" : 0)
)

describe("reroi", () => {
  describe("val", () => {
    it("creates a reactive value which can be readed", () => {
      const _a_ = R.val(10)
      expect(R.read(_a_)).toBe(10)
    })

    it("able to modify the value", () => {
      const _a_ = R.val(10)
      R.write(_a_, 20)
      expect(R.read(_a_)).toBe(20)
    })
  })

  describe("derive", () => {
    it("creates deriviation based on the reactive val", () => {
      const _name_ = R.val("Max")
      const _greet_ = R.derive(_name_, name => "Hello, " + name)

      expect(R.read(_greet_)).toBe("Hello, Max")
    })

    it("modifies the value of deriviation on external dependency change", () => {
      const _name_ = R.val("Max")
      const _greet_ = R.derive(_name_, name => "Hello, " + name)

      R.write(_name_, "George")
      expect(R.read(_greet_)).toBe("Hello, George")

      R.write(_name_, "Cat")
      expect(R.read(_greet_)).toBe("Hello, Cat")
    })

    it("caches result if dependency hasn't changed", () => {
      const _name_ = R.val("Max")
      const calculation = vi.fn().mockImplementation((name: string) => "Hello, " + name)
      const _greet_ = R.derive(_name_, calculation)
      R.read(_greet_)
      R.read(_greet_)
      R.read(_greet_)

      expect(calculation).toHaveBeenCalledOnce()

      R.write(_name_, "Cat")

      expect(R.read(_greet_)).toBe("Hello, Cat")
      R.read(_greet_)

      expect(calculation).toHaveBeenCalledTimes(2)
    })

    it("can have more than one dependency", () => {
      const _name_ = R.val("Max")
      const _surname_ = R.val("Yakovlev")
      const _fullName_ = R.deriveAll([_name_, _surname_], ([name, surname]) => `${name} ${surname}`)

      expect(R.read(_fullName_)).toBe("Max Yakovlev")

      R.write(_name_, "George")
      expect(R.read(_fullName_)).toBe("George Yakovlev")

      R.write(_surname_, "Wachowsky")
      expect(R.read(_fullName_)).toBe("George Wachowsky")
    })

    it("can have dozen of dependencies", () => {
      const _a_ = R.val("a")
      const _b_ = R.val("b")
      const _c_ = R.val("c")
      const _d_ = R.val("d")
      const _e_ = R.val("e")

      const deps = [_a_, _b_, _c_, _d_, _e_]
      const _sum_ = R.deriveAll(deps, (sources) => (
        sumList(sources)
      ))

      expect(R.read(_sum_)).toBe("abcde")

      R.write(_d_, "D")
      expect(R.read(_sum_)).toBe("abcDe")
    })

    it("correctly handles duplicated dependencies", () => {
      const _x_ = R.val(1)

      const _sum_ = R.deriveAll([_x_, _x_, _x_], sumList)

      expect(R.read(_sum_)).toBe(3)
    })
  })

  describe("listen", () => {
    it("listen change of reactive value", () => {
      const _x_ = R.val(10)
      const fn = vi.fn()

      R.listen(_x_, fn)

      R.write(_x_, 20)
      expect(fn).toHaveBeenCalledWith(20)
    })

    it("listen to multiple reactive values", () => {
      const _x_ = R.val(10)
      const _y_ = R.val(20)
      const fn = vi.fn()

      R.listenAll([_x_, _y_], ([x, y]) => fn(x + y))

      R.write(_x_, 20)
      expect(fn).toHaveBeenCalledWith(40)
    })

    it("listen change of reactive deriviation", () => {
      const _x_ = R.val(10)
      const _y_ = R.derive(_x_, x => x * 2)
      const fn = vi.fn()

      R.listen(_y_, fn)

      R.write(_x_, 20)
      expect(fn).toHaveBeenCalledWith(40)
    })

    it("stops emmiting effects once the return function is fired", () => {
      const _x_ = R.val(10)
      const fn = vi.fn()

      const stop = R.listen(_x_, fn)

      R.write(_x_, 20)
      expect(fn).toBeCalledWith(20)
      R.write(_x_, 40)
      expect(fn).toBeCalledWith(40)

      fn.mockClear()
      stop()

      R.write(_x_, 40)
      expect(fn).not.toHaveBeenCalled()
    })

    it("destroys listener after first run if once prop passed", () => {
      const _x_ = R.val(10)
      const fn = vi.fn()
      // test single dependency

      R.listen(_x_, fn, { once: true })

      R.write(_x_, 20)
      R.write(_x_, 30)
      R.write(_x_, 40)

      expect(fn).toHaveBeenCalledOnce()

      fn.mockClear()

      // test multiple dependencies

      const _y_ = R.val(10)

      R.listenAll([_x_, _y_], ([x, y]) => fn(x, y), { once: true })

      R.write(_y_, 20)
      R.write(_x_, 30)
      R.write(_y_, 40)

      expect(fn).toHaveBeenCalledOnce()
    })
  })

  describe("destroy", () => {
    it("destroyes derivation and clears subscription", () => {
      const _x_ = R.val(10)
      const _x2_ = R.derive(_x_, x => x * 2)
      const _y_ = R.val(20)

      const _coordinates_ = R.deriveAll([_x2_, _y_], ([x, y]) => `[x: ${x}, y: ${y}]`)

      expect(R.read(_coordinates_)).toBe("[x: 20, y: 20]")

      R.destroy(_x2_)

      R.write(_x_, 50)

      // wasn't changed, because _coordinates_ no more listen _x2_
      expect(R.read(_coordinates_)).toBe("[x: 20, y: 20]")
      expect(R.isDestroyed(_x2_)).toBeTruthy()
    })

    it("clears listeners of destroyed", () => {
      const _x_ = R.val(10)
      const _x2_ = R.derive(_x_, x => x * 2)

      const fn = vi.fn()
      R.listen(_x2_, fn)

      // automatically clears all listeners of _x2_
      R.destroy(_x2_)
      R.write(_x_, 20)

      expect(fn).not.toHaveBeenCalled()
      expect(R.isDestroyed(_x2_)).toBeTruthy()
    })

    it("cascadely destroyes derivations and listeners of destroyed", () => {
      const fn = vi.fn()

      const _x_ = R.val(10)
      const _x2_ = R.derive(_x_, x => x * 2)
      const _x3_ = R.derive(_x2_, x => x * 10)
      R.listen(_x3_, fn)

      R.write(_x_, 50)
      expect(fn).toHaveBeenCalledWith(1000)

      fn.mockClear()
      // should destroy _x3_ and listener as well
      R.destroy(_x2_)

      R.write(_x_, 5)
      expect(fn).not.toHaveBeenCalled()
      expect(R.isDestroyed(_x2_)).toBeTruthy()
      expect(R.isDestroyed(_x3_)).toBeTruthy()
    })

    it("prevents read destroyed derives", () => {
      const _x_ = R.val(10)
      const _x2_ = R.derive(_x_, x => x * 2)
      const _xl_ = R.deriveAll([_x2_, _x2_, _x2_], sumList)

      R.destroy(_x2_)

      expect(() => R.read(_x2_)).toThrowError("R: cannot read destroyed derivation!")
      expect(() => R.read(_xl_)).toThrowError("R: cannot read destroyed derivation!")
    })

    it("prevents subscribe to destroyed", () => {
      const _x_ = R.val(10)
      const _x2_ = R.derive(_x_, x => x * 2)

      R.destroy(_x2_)

      expect(() => {
        R.derive(_x2_, x => x)
      }).toThrowError("R: cannot subscribe to destroyed source!")
      expect(() => {
        R.deriveAll([_x_, _x2_], x => x)
      }).toThrowError("R: cannot subscribe to destroyed source!")
      expect(() => {
        R.listen(_x2_, x => x)
      }).toThrowError("R: cannot subscribe to destroyed source!")
      expect(() => {
        R.listenAll([_x_, _x2_], x => x)
      }).toThrowError("R: cannot subscribe to destroyed source!")
    })
  })

  describe("write", () => {
    it("can take a function as a new value creator", () => {
      const _x_ = R.val(10)
      R.write(_x_, x => x * 2)

      expect(R.read(_x_)).toBe(20)
    })
    it("does not treat a function as a new value creator if literalFn passed", () => {
      const _lazyX_ = R.val(() => 10)
      const x20 = () => 20
      R.write(_lazyX_, x20, { literateFn: true })

      expect(R.read(_lazyX_)).toBe(x20)
    })
  })

  describe("transactions", () => {
    describe("write", () => {
      it("update the value and dependencies only after explicit run", () => {
        const _x_ = R.val(10)

        const fn = vi.fn()
        R.listen(_x_, fn)

        const tr = R.transaction.write(_x_, 20)

        expect(fn).not.toHaveBeenCalled()
        expect(R.read(_x_)).toBe(10)

        const res = tr.run()

        expect(fn).toHaveBeenCalled()
        expect(R.read(_x_)).toBe(20)
        expect(R.transaction.isSuccess(res) && res.value === 20).toBeTruthy()
      })

      it("does not write the value if transaction was error", () => {
        const _x_ = R.val(10)

        const fn = vi.fn()
        R.listen(_x_, fn)

        const tr = R.transaction.write(_x_, () => {
          return R.transaction.error(0)
        })

        const res = tr.run()

        expect(fn).not.toHaveBeenCalled()
        expect(R.read(_x_)).toBe(10)
        expect(R.transaction.isError(res) && res.error === 0).toBeTruthy()
      })
    })

    describe("compose", () => {
      it("combines transactions to a single one, and returns last transaction value", () => {
        const _a_ = R.val("a")
        const _b_ = R.val("b")
        const _c_ = R.val("c")

        const fn = vi.fn()

        const _combine_ = R.deriveAll(
          [_a_, _b_, _c_],
          ([a, b, c]) => a + b + c,
        )

        R.listen(_combine_, fn)

        const tr = R.transaction.compose(
          R.transaction.write(_a_, "A"),
          R.transaction.write(_b_, "B"),
          R.transaction.write(_c_, "C"),
        )

        expect(fn).not.toHaveBeenCalled()
        expect(R.read(_a_)).toBe("a")

        const res = tr.run()

        expect(fn).toHaveBeenCalledOnce()
        expect(fn).toHaveBeenCalledWith("ABC")
        expect(R.transaction.isSuccess(res) && res.value === "C").toBeTruthy()
      })

      it("compose composition", () => {
        const _a_ = R.val("a")
        const _b_ = R.val("b")
        const _c_ = R.val("c")

        const _d_ = R.val("d")
        const _e_ = R.val("e")
        const _f_ = R.val("f")

        const fn = vi.fn()

        const deps = [_a_, _b_, _c_, _d_, _e_, _f_]
        const _combine_ = R.deriveAll(
          deps,
          sumList,
        )

        R.listen(_combine_, (res) => {
          fn(res)
        })

        const tr1 = R.transaction.compose(
          R.transaction.write(_a_, "A"),
          R.transaction.write(_b_, "B"),
          R.transaction.write(_c_, "C"),
        )

        const add = (x: string) => R.transaction.success(x + "1")
        const tr2 = R.transaction.compose(
          R.transaction.write(_d_, add),
          R.transaction.write(_e_, add),
          R.transaction.write(_f_, add),
        )

        const tr = R.transaction.compose(
          tr1,
          tr2,
        )

        const res = tr.run()

        expect(fn).toHaveBeenCalledOnce()
        expect(fn).toHaveBeenCalledWith("ABCd1e1f1")
        expect(R.transaction.isSuccess(res)).toBeTruthy()
      })

      it("does not modifies anything until transaction not fullfilled", () => {
        const _a_ = R.val("a")
        const _b_ = R.val("b")
        const _c_ = R.val("c")

        const fn = vi.fn()

        const tr = R.transaction.compose(
          R.transaction.write(_a_, "A"),
          R.transaction.write(_b_, () => {
            fn(R.read(_a_))
            return R.transaction.success("B")
          }),
          R.transaction.write(_c_, () => {
            fn(R.read(_b_))
            return R.transaction.success("C")
          }),
        )

        tr.run()

        expect(fn).toHaveBeenNthCalledWith(1, "a")
        expect(fn).toHaveBeenNthCalledWith(2, "b")
      })

      it("values of previous success transactions can be accessed via context", () => {
        const _a_ = R.val("a")
        const _b_ = R.val("b")
        const _c_ = R.val("c")

        const fn = vi.fn()
        R.listen(_c_, fn)

        const tr = R.transaction.compose(
          R.transaction.write(_a_, "A", "a"),
          R.transaction.write(_b_, (_, { a }) => R.transaction.success(a + "B"), "b"),
          R.transaction.write(_c_, (_, { b }) => R.transaction.success(b + "C"), "c"),
        )

        tr.run()

        expect(fn).toHaveBeenCalledWith("ABC")
      })

      it("does not modifies value or notifies dependencies on error transaction, and returns an error", () => {
        const _a_ = R.val("a")
        const _b_ = R.val("b")
        const _c_ = R.val("c")

        const fn = vi.fn()
        R.listen(_a_, fn)
        R.listen(_b_, fn)
        R.listen(_c_, fn)

        const tr = R.transaction.compose(
          R.transaction.write(_a_, "A", "a"),
          R.transaction.write(_b_, () => R.transaction.error("error"), "b"),
          R.transaction.write(_c_, () => R.transaction.success("C"), "c"),
        )

        const res = tr.run()

        expect(R.read(_a_)).toBe("a")
        expect(R.read(_b_)).toBe("b")
        expect(R.read(_c_)).toBe("c")
        expect(fn).not.toHaveBeenCalled()
        expect(R.transaction.isError(res) && res.error === "error").toBeTruthy()
      })

      it("compose composition and does not write if something was error", () => {
        const _a_ = R.val("a")
        const _b_ = R.val("b")
        const _c_ = R.val("c")
        const _d_ = R.val("d")

        const fn = vi.fn()

        const _combine_ = R.deriveAll(
          [_a_, _b_, _c_, _d_],
          sumList,
        )

        R.listen(_combine_, (res) => {
          fn(res)
        })

        const tr1 = R.transaction.compose(
          R.transaction.write(_a_, "A"),
          R.transaction.write(_b_, "B"),
        )

        const tr2 = R.transaction.compose(
          R.transaction.write(_c_, () => R.transaction.error("alarm")),
          R.transaction.write(_d_, "D"),
        )

        const tr = R.transaction.compose(
          tr1,
          tr2,
        )

        const res = tr.run()

        expect(fn).not.toHaveBeenCalledOnce()
        expect(R.read(_a_)).toBe("a")
        expect(R.transaction.isError(res)).toBeTruthy()
      })
    })
  })

  describe("peek", () => {
    it("shows a value of derive based on provided dependencies", () => {
      const _a_ = R.val("a")
      const _b_ = R.val("b")
      const _aa_ = R.derive(_a_, (a) => a + a)

      R.transaction.compose(
        R.transaction.write(_a_, "A", "a"),
        R.transaction.write(_b_, (_, ctx) => {
          const bigAA = R.peek(_aa_, [ctx.a])

          return R.transaction.success(bigAA + "B")
        }),
      ).run()

      expect(R.read(_b_)).toBe("AAB")
    })

  })


  describe("Priority of reaction", () => {
    it("should resolve basic glitch example", () => {
      const _seconds_ = R.val(1)
      const _timer_ = R.derive(_seconds_, t => t + 1)

      // cache it first
      R.read(_timer_)

      const fn = vi.fn()
      const un = R.listen(
        _seconds_,
        () => fn(R.read(_timer_) > R.read(_seconds_)),
        { priority: R.priorities.after(_timer_) },
      )

      R.write(_seconds_, 2)

      expect(fn).toHaveBeenCalledWith(true)
      un()
      fn.mockClear()

      // Now try to make it glitch

      R.listen(
        _seconds_,
        () => fn(R.read(_timer_) > R.read(_seconds_)),
        { priority: R.priorities.before(_timer_) },
      )

      R.write(_seconds_, 3)

      expect(fn).toHaveBeenCalledWith(false)
    })

    it("read _b_ only after change of _a_", () => {
      /**
       * The essence of the test:
       * make derivation _c_, which listenes only to those changes of _b_,
       * that happened only after change of _a_
       *
       * Real world scenario:
       * listen movement of selected objects,
       * but only that happened after collaborative user change
       */
      const _a_ = R.val("a")
      const _b_ = R.val("b")
      const fn = vi.fn()

      const _b_Priority = R.priorities.highest
      const _c_ = R.derive(_a_, () => {
        return R.read(_b_)
        // Hapens second
      }, { priority: R.priorities.after(_b_Priority) })

      R.listen(_c_, fn, { immidiate: true })

      R.listen(_a_, a => {
        R.write(_b_, b => a + b)
        // Hapens first
      }, { priority: _b_Priority })

      expect(fn).toBeCalledWith("b")

      fn.mockClear()

      R.write(_b_, "B") // Should ignore sole changes of _b_

      expect(fn).not.toHaveBeenCalled()
      expect(R.read(_c_)).toBe("b")

      R.write(_a_, "A")

      expect(fn).toBeCalledWith("AB")
      expect(R.read(_c_)).toBe("AB")
    })

    it("properly sorts large number of priorities", () => {
      const _msg_ = R.val("")
      const fn = vi.fn()

      R.listen(
        _msg_,
        (msg) => fn("3: " + msg),
        { priority: 3 },
      )
      R.listen(
        _msg_,
        (msg) => fn("2: " + msg),
        { priority: 2 },
      )
      R.listen(
        _msg_,
        (msg) => fn("4: " + msg),
        { priority: 4 },
      )
      R.listen(
        _msg_,
        (msg) => fn("1: " + msg),
        { priority: 1 },
      )

      R.write(_msg_, "Hi?")

      expect(fn).toHaveBeenNthCalledWith(1, "4: Hi?")
      expect(fn).toHaveBeenNthCalledWith(2, "3: Hi?")
      expect(fn).toHaveBeenNthCalledWith(3, "2: Hi?")
      expect(fn).toHaveBeenNthCalledWith(4, "1: Hi?")
    })

    it("keeps the insertion order", () => {
      const _a_ = R.val(0)

      let seen = ""
      R.listen(_a_, () => {
        seen += "2"
      })
      R.listen(_a_, () => {
        seen += "3"
      })
      R.listen(_a_, () => {
        seen += "4"
      }, { priority: R.priorities.lowest })
      R.listen(_a_, () => {
        seen += "5"
      }, { priority: R.priorities.lowest })
      R.listen(_a_, () => {
        seen += "1"
      }, { priority: R.priorities.highest })

      R.write(_a_, 1)

      expect(seen).toBe("12345")
    })

    it("prevents from setting priority higher than highest and lower than lowest", () => {
      expect(() => R.priorities.before(R.priorities.highest)).toThrowError("R: Cannot use 'before' with priority bigger then the highest!")
      expect(() => R.priorities.after(R.priorities.lowest)).toThrowError("R: Cannot use 'after' with priority lower then the lowest!")
    })
  })

  //////////////
  // Specific case tests

  test("bunch", () => {
    const _x_ = R.val("x")
    const _y_ = R.val("y")

    const _a_ = R.deriveAll([_x_, _y_], ([x, y]) => "a(" + x + y + ")")
    const _b_ = R.deriveAll([_x_, _y_], ([x, y]) => "b(" + x + y + ")")

    let answer
    R.listen(
      R.deriveAll([_a_, _b_], sources => sources),
      ([a, b]) => answer = a + ", " + b,
      { immidiate: true },
    )

    expect(answer).toBe("a(xy), b(xy)")
    expect(R.read(_a_)).toBe("a(xy)")

    R.write(_x_, "[x]")

    expect(answer).toBe("a([x]y), b([x]y)")
    expect(R.read(_a_)).toBe("a([x]y)")
  })

  test("diamond problem", () => {
    const _a_ = R.val("a")

    const _b_ = R.derive(
      _a_,
      a => a + "b",
      { priority: R.priorities.base },
    )
    const _c_ = R.derive(
      _a_,
      a => a + "c",
      { priority: R.priorities.after(_b_) },
    )

    const _d_ = R.derive(
      _a_,
      () => R.read(_b_) + R.read(_c_),
      { priority: R.priorities.after(_c_) },
    )

    const fn = vi.fn()
    R.listen(_d_, fn)

    R.write(_a_, "A")

    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith("AbAc")
  })

  test("Transactions with peek", () => {
    const _discount_ = R.val(0.10)
    const _lastEditTimestamp_ = R.val(0)
    const _totalPrice_ = R.val(7000)
    const _finalPrice_ = R.deriveAll([_totalPrice_, _discount_], ([price, discount]) => {
      return price * discount
    })

    const setDiscount = (newDiscount: number) => {
      return R.transaction.compose(
        R.transaction.write(_discount_, () => {
          const newFinalPrice = R.peek(_finalPrice_, [R.read(_totalPrice_), newDiscount])
          const finalPriceDiff = R.read(_finalPrice_) - newFinalPrice

          if (finalPriceDiff > 1000) {
            return R.transaction.error("Discount is too high for such a cost")
          }

          return R.transaction.success(newDiscount)
        }),
        R.transaction.write(_lastEditTimestamp_, Date.now()),
      )
    }

    setDiscount(0.5) // Discount is too high for such a cost
    R.read(_discount_) // 0.10
    R.read(_lastEditTimestamp_) // 0
  })

  test("Dynamic dependencies", () => {
    /**
      * With a bit of boilerplate, a dynamic dependencies allowed
      *
      * We creating a High-Order reactive derivation from the CHANGE_FACTOR
      * and return another return another derive
      *
      * We listen to this high order derive, and then inside manage subscription to
      * tarhet derived
      */

    const mother = R.val("m")
    const father = R.val("d")

    const sonAge = R.val(10)
    const youngSon = R.deriveAll([mother, father], ([momSaid, dadSaid]) => {
      return `mommy: ${momSaid}, daddy: ${dadSaid}`
    })
    const matureSon = R.val("") // independent

    const _son_ = R.derive(sonAge, age => {
      return age > 18 ? matureSon : youngSon
    })

    const echo = vi.fn()

    type Son = string // doesn't matter
    let _listenTo: Reactive<Son>
    let _listener: (() => void)
    function listener(son: Son) {
      echo(son)
    }
    R.listen(_son_, growingSon => {
      if (_listenTo === undefined) {
        _listenTo = growingSon
        _listener = R.listen(growingSon, listener)
      } else if (growingSon !== _listenTo) {
        // another son type
        _listener()
        _listener = R.listen(growingSon, listener)
      }
    }, { immidiate: true })

    R.write(mother, "do homework")
    expect(echo).toHaveBeenCalledWith("mommy: do homework, daddy: d")
    echo.mockClear()

    R.write(sonAge, 15)
    expect(echo).not.toHaveBeenCalled()

    R.write(sonAge, 19)
    R.write(R.read(_son_) as ReactiveValue<Son>, "go to university")
    expect(echo).toHaveBeenCalledWith("go to university")
  })
})

