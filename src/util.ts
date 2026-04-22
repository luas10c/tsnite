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

function style(codes: number[], value: string): string {
  return `\u001B[${codes.join(';')}m${value}\u001B[0m`
}

export function yellow(value: string): string {
  return color(33, value)
}

export function purple(value: string): string {
  return color(95, value)
}

export function red(value: string): string {
  return color(31, value)
}

export function blue(value: string): string {
  return color(34, value)
}

export function white(value: string): string {
  return color(97, value)
}

export function pink(value: string): string {
  return color(95, value)
}

export function cyan(value: string): string {
  return color(96, value)
}

export function green(value: string): string {
  return color(32, value)
}

export function gray(value: string): string {
  return color(90, value)
}

export function bold(value: string): string {
  return style([1], value)
}

export function accent(value: string): string {
  return style([1, 36], value)
}
