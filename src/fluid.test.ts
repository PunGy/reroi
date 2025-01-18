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

