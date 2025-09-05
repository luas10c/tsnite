function hexToRgb(hex: string) {
  hex = hex.replace(/^#/, '')

  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }

  const num = parseInt(hex, 16)
  return [num >> 16, (num >> 8) & 255, num & 255]
}

function rgbToAnsi([r, g, b]: number[]) {
  return `\x1b[38;2;${r};${g};${b}m`
}

export function gradient(colors: string[]) {
  return function (text: string) {
    if (colors.length < 2) {
      throw new Error('gradient needs at least 2 colors')
    }

    const segments = colors.length - 1
    const length = text.length
    let result = ''

    for (let i = 0; i < length; i++) {
      const pos = (i / (length - 1)) * segments
      const segIndex = Math.min(Math.floor(pos), segments - 1)
      const t = pos - segIndex

      const start = hexToRgb(colors[segIndex])
      const end = hexToRgb(colors[segIndex + 1])

      const r = Math.round(start[0] + (end[0] - start[0]) * t)
      const g = Math.round(start[1] + (end[1] - start[1]) * t)
      const b = Math.round(start[2] + (end[2] - start[2]) * t)

      result += rgbToAnsi([r, g, b]) + text[i]
    }

    return result + '\x1b[0m'
  }
}
