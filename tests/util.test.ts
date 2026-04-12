import { afterEach, describe, expect, jest, test } from '@jest/globals'

import { debounce, yellow } from '#/util'

describe('util', function () {
  afterEach(function () {
    jest.useRealTimers()
  })

  test('debounce calls only the latest invocation', function () {
    jest.useFakeTimers()

    const callback = jest.fn<(value: string) => void>()
    const debounced = debounce(callback, 50)

    debounced('first')
    debounced('second')

    jest.advanceTimersByTime(49)
    expect(callback).not.toHaveBeenCalled()

    jest.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('second')
  })

  test('yellow wraps the message with ANSI color codes', function () {
    expect(yellow('warn')).toBe(`[33mwarn[0m`)
  })
})
