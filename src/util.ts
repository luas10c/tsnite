export function debounce<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  waitMs: number
): (...args: TArgs) => void {
  let timer: ReturnType<typeof setTimeout> | undefined

  return function (...args: TArgs) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => callback(...args), waitMs)
  }
}

function color(code: number, value: string): string {
  return `\u001B[${code}m${value}\u001B[0m`
}

export function yellow(value: string): string {
  return color(33, value)
}
