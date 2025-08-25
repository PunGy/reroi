import { describe, test, it, expect, vi } from "vitest"
import { Fluid, Reactive, ReactiveValue } from "./fluid"

describe("Fluid", () => {
  describe("val", () => {
    it("creates a reactive value which can be readed", () => {
      const _a_ = Fluid.val(10)
      expect(Fluid.read(_a_)).toBe(10)
    })

    it("able to modify the value", () => {
      const _a_ = Fluid.val(10)
      Fluid.write(_a_, 20)
      expect(Fluid.read(_a_)).toBe(20)
    })
  })

  describe("derive", () => {
    it("creates deriviation based on the reactive val", () => {
      const _name_ = Fluid.val("Max")
      const _greet_ = Fluid.derive(_name_, name => "Hello, " + name)

      expect(Fluid.read(_greet_)).toBe("Hello, Max")
    })

    it("modifies the value of deriviation on external dependency change", () => {
      const _name_ = Fluid.val("Max")
      const _greet_ = Fluid.derive(_name_, name => "Hello, " + name)

      Fluid.write(_name_, "George")
      expect(Fluid.read(_greet_)).toBe("Hello, George")

      Fluid.write(_name_, "Cat")
      expect(Fluid.read(_greet_)).toBe("Hello, Cat")
    })

    it("caches result if dependency hasn't changed", () => {
      const _name_ = Fluid.val("Max")
      const calculation = vi.fn().mockImplementation((name: string) => "Hello, " + name)
      const _greet_ = Fluid.derive(_name_, calculation)
      Fluid.read(_greet_)
      Fluid.read(_greet_)
      Fluid.read(_greet_)

      expect(calculation).toHaveBeenCalledOnce()

      Fluid.write(_name_, "Cat")

      expect(Fluid.read(_greet_)).toBe("Hello, Cat")
      Fluid.read(_greet_)

      expect(calculation).toHaveBeenCalledTimes(2)
    })

    it("can have more than one dependency", () => {
      const _name_ = Fluid.val("Max")
      const _surname_ = Fluid.val("Yakovlev")
      const _fullName_ = Fluid.derive([_name_, _surname_], (name, surname) => `${name} ${surname}`)

      expect(Fluid.read(_fullName_)).toBe("Max Yakovlev")

      Fluid.write(_name_, "George")
      expect(Fluid.read(_fullName_)).toBe("George Yakovlev")

      Fluid.write(_surname_, "Wachowsky")
      expect(Fluid.read(_fullName_)).toBe("George Wachowsky")
    })

    it("can have dozen of dependencies", () => {
      const _a_ = Fluid.val("a")
      const _b_ = Fluid.val("b")
      const _c_ = Fluid.val("c")
      const _d_ = Fluid.val("d")
      const _e_ = Fluid.val("e")

      const _sum_ = Fluid.derive([_a_, _b_, _c_, _d_, _e_], (a, b, c, d, e) => (
        a + b + c + d + e
      ))

      expect(Fluid.read(_sum_)).toBe("abcde")

      Fluid.write(_d_, "D")
      expect(Fluid.read(_sum_)).toBe("abcDe")
    })
  })

  describe("listen", () => {
    it("listen change of reactive value", () => {
      const _x_ = Fluid.val(10)
      const fn = vi.fn()

      Fluid.listen(_x_, fn)

      Fluid.write(_x_, 20)
      expect(fn).toHaveBeenCalledWith(20)
    })

    it("listen to multiple reactive values", () => {
      const _x_ = Fluid.val(10)
      const _y_ = Fluid.val(20)
      const fn = vi.fn()

      Fluid.listen([_x_, _y_], (x, y) => fn(x + y))

      Fluid.write(_x_, 20)
      expect(fn).toHaveBeenCalledWith(40)
    })

    it("listen change of reactive deriviation", () => {
      const _x_ = Fluid.val(10)
      const _y_ = Fluid.derive(_x_, x => x * 2)
      const fn = vi.fn()

      Fluid.listen(_y_, fn)

      Fluid.write(_x_, 20)
      expect(fn).toHaveBeenCalledWith(40)
    })

    it("stops emmiting effects once the return function is fired", () => {
      const _x_ = Fluid.val(10)
      const fn = vi.fn()

      const stop = Fluid.listen(_x_, fn)

      Fluid.write(_x_, 20)
      expect(fn).toBeCalledWith(20)
      Fluid.write(_x_, 40)
      expect(fn).toBeCalledWith(40)

      fn.mockClear()
      stop()

      Fluid.write(_x_, 40)
      expect(fn).not.toHaveBeenCalled()
    })

    it.only("destroys listener after first run if once prop passed", () => {
      const _x_ = Fluid.val(10)
      const fn = vi.fn()
      // test single dependency

      Fluid.listen(_x_, fn, { once: true })

      Fluid.write(_x_, 20)
      Fluid.write(_x_, 30)
      Fluid.write(_x_, 40)

      expect(fn).toHaveBeenCalledOnce()

      fn.mockClear()

      // test multiple dependencies

      const _y_ = Fluid.val(10)

      Fluid.listen([_x_, _y_], (x, y) => fn(x, y), { once: true })

      Fluid.write(_y_, 20)
      Fluid.write(_x_, 30)
      Fluid.write(_y_, 40)

      expect(fn).toHaveBeenCalledOnce()
    })
  })

  describe("destroy", () => {
    it("destroyes derivation and stops clears subscription", () => {
      const _x_ = Fluid.val(10)
      const _x2_ = Fluid.derive(_x_, x => x * 2)
      const _y_ = Fluid.val(20)

      const _coordinates_ = Fluid.derive([_x2_, _y_], (x, y) => `[x: ${x}, y: ${y}]`)

      expect(Fluid.read(_coordinates_)).toBe("[x: 20, y: 20]")

      Fluid.destroy(_x2_)

      Fluid.write(_x_, 50)

      // wasn't changed, because _coordinates_ no more listen _x2_
      expect(Fluid.read(_coordinates_)).toBe("[x: 20, y: 20]")
    })

    it("clears listeners of destroyed", () => {
      const _x_ = Fluid.val(10)
      const _x2_ = Fluid.derive(_x_, x => x * 2)

      const fn = vi.fn()
      Fluid.listen(_x2_, fn)

      // automatically clears all listeners of _x2_
      Fluid.destroy(_x2_)
      Fluid.write(_x_, 20)

      expect(fn).not.toHaveBeenCalled()
    })

    it("cascadely destroyes derivations and listeners of destroyed", () => {
      const fn = vi.fn()

      const _x_ = Fluid.val(10)
      const _x2_ = Fluid.derive(_x_, x => x * 2)
      const _x3_ = Fluid.derive(_x2_, x => x * 10)
      Fluid.listen(_x3_, fn)

      Fluid.write(_x_, 50)
      expect(fn).toHaveBeenCalledWith(1000)

      fn.mockClear()
      // should destroy _x3_ and listener as well
      Fluid.destroy(_x2_)

      Fluid.write(_x_, 5)
      expect(fn).not.toHaveBeenCalled()
    })
  })

  describe("write", () => {
    it("can take a function as a new value creator", () => {
      const _x_ = Fluid.val(10)
      Fluid.write(_x_, x => x * 2)

      expect(Fluid.read(_x_)).toBe(20)
    })
    it("does not treat a function as a new value creator if literalFn passed", () => {
      const _lazyX_ = Fluid.val(() => 10)
      const x20 = () => 20
      Fluid.write(_lazyX_, x20, { literateFn: true })

      expect(Fluid.read(_lazyX_)).toBe(x20)
    })
  })

  describe("transactions", () => {
    describe("write", () => {
      it("update the value and dependencies only after explicit run", () => {
        const _x_ = Fluid.val(10)

        const fn = vi.fn()
        Fluid.listen(_x_, fn)

        const tr = Fluid.transaction.write(_x_, 20)

        expect(fn).not.toHaveBeenCalled()
        expect(Fluid.read(_x_)).toBe(10)

        const res = tr.run()

        expect(fn).toHaveBeenCalled()
        expect(Fluid.read(_x_)).toBe(20)
        expect(Fluid.transaction.isSuccess(res) && res.value === 20).toBeTruthy()
      })

      it("does not write the value if transaction was error", () => {
        const _x_ = Fluid.val(10)

        const fn = vi.fn()
        Fluid.listen(_x_, fn)

        const tr = Fluid.transaction.write(_x_, () => {
          return Fluid.transaction.error(0)
        })

        const res = tr.run()

        expect(fn).not.toHaveBeenCalled()
        expect(Fluid.read(_x_)).toBe(10)
        expect(Fluid.transaction.isError(res) && res.error === 0).toBeTruthy()
      })
    })

    describe("compose", () => {
      it("combines transactions to a single one, and returns last transaction value", () => {
        const _a_ = Fluid.val("a")
        const _b_ = Fluid.val("b")
        const _c_ = Fluid.val("c")

        const fn = vi.fn()

        const _combine_ = Fluid.derive(
          [_a_, _b_, _c_],
          (a, b, c) => a + b + c,
        )

        Fluid.listen(_combine_, fn)

        const tr = Fluid.transaction.compose(
          Fluid.transaction.write(_a_, "A"),
          Fluid.transaction.write(_b_, "B"),
          Fluid.transaction.write(_c_, "C"),
        )

        expect(fn).not.toHaveBeenCalled()
        expect(Fluid.read(_a_)).toBe("a")

        const res = tr.run()

        expect(fn).toHaveBeenCalledOnce()
        expect(fn).toHaveBeenCalledWith("ABC")
        expect(Fluid.transaction.isSuccess(res) && res.value === "C").toBeTruthy()
      })

      it("compose composition", () => {
        const _a_ = Fluid.val("a")
        const _b_ = Fluid.val("b")
        const _c_ = Fluid.val("c")

        const _d_ = Fluid.val("d")
        const _e_ = Fluid.val("e")
        const _f_ = Fluid.val("f")

        const fn = vi.fn()

        const _combine_ = Fluid.derive(
          [_a_, _b_, _c_, _d_, _e_, _f_],
          (a, b, c, d, e, f) => a + b + c + d + e + f,
        )

        Fluid.listen(_combine_, (res) => {
          fn(res)
        })

        const tr1 = Fluid.transaction.compose(
          Fluid.transaction.write(_a_, "A"),
          Fluid.transaction.write(_b_, "B"),
          Fluid.transaction.write(_c_, "C"),
        )

        const add = (x: string) => Fluid.transaction.success(x + "1")
        const tr2 = Fluid.transaction.compose(
          Fluid.transaction.write(_d_, add),
          Fluid.transaction.write(_e_, add),
          Fluid.transaction.write(_f_, add),
        )

        const tr = Fluid.transaction.compose(
          tr1,
          tr2,
        )

        const res = tr.run()

        expect(fn).toHaveBeenCalledOnce()
        expect(fn).toHaveBeenCalledWith("ABCd1e1f1")
        expect(Fluid.transaction.isSuccess(res)).toBeTruthy()
      })

      it("does not modifies anything until transaction not fullfilled", () => {
        const _a_ = Fluid.val("a")
        const _b_ = Fluid.val("b")
        const _c_ = Fluid.val("c")

        const fn = vi.fn()

        const tr = Fluid.transaction.compose(
          Fluid.transaction.write(_a_, "A"),
          Fluid.transaction.write(_b_, () => {
            fn(Fluid.read(_a_))
            return Fluid.transaction.success("B")
          }),
          Fluid.transaction.write(_c_, () => {
            fn(Fluid.read(_b_))
            return Fluid.transaction.success("C")
          }),
        )

        tr.run()

        expect(fn).toHaveBeenNthCalledWith(1, "a")
        expect(fn).toHaveBeenNthCalledWith(2, "b")
      })

      it("values of previous success transactions can be accessed via context", () => {
        const _a_ = Fluid.val("a")
        const _b_ = Fluid.val("b")
        const _c_ = Fluid.val("c")

        const fn = vi.fn()
        Fluid.listen(_c_, fn)

        const tr = Fluid.transaction.compose(
          Fluid.transaction.write(_a_, "A", "a"),
          Fluid.transaction.write(_b_, (_, { a }) => Fluid.transaction.success(a + "B"), "b"),
          Fluid.transaction.write(_c_, (_, { b }) => Fluid.transaction.success(b + "C"), "c"),
        )

        tr.run()

        expect(fn).toHaveBeenCalledWith("ABC")
      })

      it("does not modifies value or notifies dependencies on error transaction, and returns an error", () => {
        const _a_ = Fluid.val("a")
        const _b_ = Fluid.val("b")
        const _c_ = Fluid.val("c")

        const fn = vi.fn()
        Fluid.listen(_a_, fn)
        Fluid.listen(_b_, fn)
        Fluid.listen(_c_, fn)

        const tr = Fluid.transaction.compose(
          Fluid.transaction.write(_a_, "A", "a"),
          Fluid.transaction.write(_b_, () => Fluid.transaction.error("error"), "b"),
          Fluid.transaction.write(_c_, () => Fluid.transaction.success("C"), "c"),
        )

        const res = tr.run()

        expect(Fluid.read(_a_)).toBe("a")
        expect(Fluid.read(_b_)).toBe("b")
        expect(Fluid.read(_c_)).toBe("c")
        expect(fn).not.toHaveBeenCalled()
        expect(Fluid.transaction.isError(res) && res.error === "error").toBeTruthy()
      })

      it("compose composition and does not write if something was error", () => {
        const _a_ = Fluid.val("a")
        const _b_ = Fluid.val("b")
        const _c_ = Fluid.val("c")
        const _d_ = Fluid.val("d")

        const fn = vi.fn()

        const _combine_ = Fluid.derive(
          [_a_, _b_, _c_, _d_],
          (a, b, c, d) => a + b + c + d,
        )

        Fluid.listen(_combine_, (res) => {
          fn(res)
        })

        const tr1 = Fluid.transaction.compose(
          Fluid.transaction.write(_a_, "A"),
          Fluid.transaction.write(_b_, "B"),
        )

        const tr2 = Fluid.transaction.compose(
          Fluid.transaction.write(_c_, () => Fluid.transaction.error("alarm")),
          Fluid.transaction.write(_d_, "D"),
        )

        const tr = Fluid.transaction.compose(
          tr1,
          tr2,
        )

        const res = tr.run()

        expect(fn).not.toHaveBeenCalledOnce()
        expect(Fluid.read(_a_)).toBe("a")
        expect(Fluid.transaction.isError(res)).toBeTruthy()
      })
    })
  })

  describe("peek", () => {
    it("shows a value of derive based on provided dependencies", () => {
      const _a_ = Fluid.val("a")
      const _b_ = Fluid.val("b")
      const _aa_ = Fluid.derive(_a_, (a) => a + a)

      Fluid.transaction.compose(
        Fluid.transaction.write(_a_, "A", "a"),
        Fluid.transaction.write(_b_, (_, ctx) => {
          const bigAA = Fluid.peek(_aa_, [ctx.a])

          return Fluid.transaction.success(bigAA + "B")
        }),
      ).run()

      expect(Fluid.read(_b_)).toBe("AAB")
    })

  })


  describe("Priority of reaction", () => {
    it("should resolve basic glitch example", () => {
      const _seconds_ = Fluid.val(1)
      const _timer_ = Fluid.derive(_seconds_, t => t + 1)

      // cache it first
      Fluid.read(_timer_)

      const fn = vi.fn()
      const un = Fluid.listen(
        _seconds_,
        () => fn(Fluid.read(_timer_) > Fluid.read(_seconds_)),
        { priority: Fluid.priorities.after(_timer_) },
      )

      Fluid.write(_seconds_, 2)

      expect(fn).toHaveBeenCalledWith(true)
      un()
      fn.mockClear()

      // Now try to make it glitch

      Fluid.listen(
        _seconds_,
        () => fn(Fluid.read(_timer_) > Fluid.read(_seconds_)),
        { priority: Fluid.priorities.before(_timer_) },
      )

      Fluid.write(_seconds_, 3)

      expect(fn).toHaveBeenCalledWith(false)
    })

    it("read _b_ only after change of _a_", () => {
      const _a_ = Fluid.val("a")
      const _b_ = Fluid.val("b")
      const fn = vi.fn()

      const _b_Priority = Fluid.priorities.highest
      const _c_ = Fluid.derive(_a_, () => {
        return Fluid.read(_b_)
        // Hapens second
      }, { priority: Fluid.priorities.after(_b_Priority) })

      Fluid.listen(_c_, fn, { immidiate: true })

      Fluid.listen(_a_, a => {
        Fluid.write(_b_, b => a + b)
        // Hapens first
      }, { priority: _b_Priority })

      expect(fn).toBeCalledWith("b")

      fn.mockClear()

      Fluid.write(_b_, "B") // Should ignore sole changes of _b_

      expect(fn).not.toHaveBeenCalled()
      expect(Fluid.read(_c_)).toBe("b")

      Fluid.write(_a_, "A")

      expect(fn).toBeCalledWith("AB")
      expect(Fluid.read(_c_)).toBe("AB")
    })

    it("properly sorts large number of priorities", () => {
      const _msg_ = Fluid.val("")
      const fn = vi.fn()

      Fluid.listen(
        _msg_,
        (msg) => fn("3: " + msg),
        { priority: 3 },
      )
      Fluid.listen(
        _msg_,
        (msg) => fn("2: " + msg),
        { priority: 2 },
      )
      Fluid.listen(
        _msg_,
        (msg) => fn("4: " + msg),
        { priority: 4 },
      )
      Fluid.listen(
        _msg_,
        (msg) => fn("1: " + msg),
        { priority: 1 },
      )

      Fluid.write(_msg_, "Hi?")

      expect(fn).toHaveBeenNthCalledWith(1, "4: Hi?")
      expect(fn).toHaveBeenNthCalledWith(2, "3: Hi?")
      expect(fn).toHaveBeenNthCalledWith(3, "2: Hi?")
      expect(fn).toHaveBeenNthCalledWith(4, "1: Hi?")
    })
  })

  //////////////
  // Specific case tests

  test("bunch", () => {
    const _x_ = Fluid.val("x")
    const _y_ = Fluid.val("y")

    const _a_ = Fluid.derive([_x_, _y_], (x, y) => "a(" + x + y + ")")
    const _b_ = Fluid.derive([_x_, _y_], (x, y) => "b(" + x + y + ")")

    let answer
    Fluid.listen(
      Fluid.derive([_a_, _b_], (a, b) => [a, b]),
      ([a, b]) => answer = a + ", " + b,
      { immidiate: true },
    )

    expect(answer).toBe("a(xy), b(xy)")
    expect(Fluid.read(_a_)).toBe("a(xy)")

    Fluid.write(_x_, "[x]")

    expect(answer).toBe("a([x]y), b([x]y)")
    expect(Fluid.read(_a_)).toBe("a([x]y)")
  })

  test("diamond problem", () => {
    const _a_ = Fluid.val("a")

    const _b_ = Fluid.derive(
      _a_,
      a => a + "b",
      { priority: Fluid.priorities.base },
    )
    const _c_ = Fluid.derive(
      _a_,
      a => a + "c",
      { priority: Fluid.priorities.after(_b_) },
    )

    const _d_ = Fluid.derive(
      _a_,
      () => Fluid.read(_b_) + Fluid.read(_c_),
      { priority: Fluid.priorities.after(_c_) },
    )

    const fn = vi.fn()
    Fluid.listen(_d_, fn)

    Fluid.write(_a_, "A")

    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith("AbAc")
  })

  test("Transactions with peek", () => {
    const _discount_ = Fluid.val(0.10)
    const _lastEditTimestamp_ = Fluid.val(0)
    const _totalPrice_ = Fluid.val(7000)
    const _finalPrice_ = Fluid.derive([_totalPrice_, _discount_], (price, discount) => {
      return price * discount
    })

    const setDiscount = (newDiscount: number) => {
      return Fluid.transaction.compose(
        Fluid.transaction.write(_discount_, () => {
          const newFinalPrice = Fluid.peek(_finalPrice_, [Fluid.read(_totalPrice_), newDiscount])
          const finalPriceDiff = Fluid.read(_finalPrice_) - newFinalPrice

          if (finalPriceDiff > 1000) {
            return Fluid.transaction.error("Discount is too high for such a cost")
          }

          return Fluid.transaction.success(newDiscount)
        }),
        Fluid.transaction.write(_lastEditTimestamp_, Date.now()),
      )
    }

    setDiscount(0.5) // Discount is too high for such a cost
    Fluid.read(_discount_) // 0.10
    Fluid.read(_lastEditTimestamp_) // 0
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

    const mother = Fluid.val("m")
    const father = Fluid.val("d")

    const sonAge = Fluid.val(10)
    const youngSon = Fluid.derive([mother, father], (momSaid, dadSaid) => {
      return `mommy: ${momSaid}, daddy: ${dadSaid}`
    })
    const matureSon = Fluid.val("") // independent

    const _son_ = Fluid.derive(sonAge, age => {
      return age > 18 ? matureSon : youngSon
    })

    const echo = vi.fn()

    type Son = string // doesn't matter
    let _listenTo: Reactive<Son>
    let _listener: (() => void)
    function listener(son: Son) {
      echo(son)
    }
    Fluid.listen(_son_, growingSon => {
      if (_listenTo === undefined) {
        _listenTo = growingSon
        _listener = Fluid.listen(growingSon, listener)
      } else if (growingSon !== _listenTo) {
        // another son type
        _listener()
        _listener = Fluid.listen(growingSon, listener)
      }
    }, { immidiate: true })

    Fluid.write(mother, "do homework")
    expect(echo).toHaveBeenCalledWith("mommy: do homework, daddy: d")
    echo.mockClear()

    Fluid.write(sonAge, 15)
    expect(echo).not.toHaveBeenCalled()

    Fluid.write(sonAge, 19)
    Fluid.write(Fluid.read(_son_) as ReactiveValue<Son>, "go to university")
    expect(echo).toHaveBeenCalledWith("go to university")
  })
})

