/**
 * JSON5 parse — zero dependencies, ESM + TypeScript
 *
 * Suporta toda a spec JSON5:
 *  - Chaves sem aspas (identificadores ES5/Unicode)
 *  - Strings single ou double quoted com escapes e line continuation
 *  - Comentários // e /* ... * /
 *  - Trailing commas em objetos e arrays
 *  - Números: hex, Infinity, NaN, +/- leading/trailing decimal
 *  - Reviver opcional (mesmo comportamento do JSON.parse nativo)
 */

// ─── Tipos públicos ────────────────────────────────────────────────────────────

/** Qualquer valor que o JSON5 pode representar. */
export type Json5Value =
  | string
  | number
  | boolean
  | null
  | Json5Array
  | Json5Object

export type Json5Array = Json5Value[]

export interface Json5Object {
  [key: string]: Json5Value
}

/**
 * Função reviver — mesma assinatura do `JSON.parse` nativo.
 * Recebe a chave (string) e o valor já processado.
 * Retornar `undefined` remove a propriedade do resultado.
 */
export type Reviver = (
  this: Json5Object | Json5Array,
  key: string,
  value: Json5Value
) => Json5Value

// ─── Tipos internos ────────────────────────────────────────────────────────────

/** Contexto de parse — estado mutável centralizado. */
interface ParseContext {
  src: string
  pos: number
  line: number
  col: number
}

/** Par chave/valor de um objeto JSON5. */
type ObjectEntry = [key: string, value: Json5Value]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function err(ctx: ParseContext, msg: string): never {
  throw new SyntaxError(`JSON5: ${msg} at ${ctx.line}:${ctx.col}`)
}

function current(ctx: ParseContext): string {
  return ctx.src[ctx.pos] ?? ''
}

function peek(ctx: ParseContext, offset: number = 1): string {
  return ctx.src[ctx.pos + offset] ?? ''
}

function advance(ctx: ParseContext): string {
  const ch = ctx.src[ctx.pos++] ?? ''
  if (ch === '\n') {
    ctx.line++
    ctx.col = 1
  } else {
    ctx.col++
  }
  return ch
}

function startsWith(ctx: ParseContext, s: string): boolean {
  return ctx.src.startsWith(s, ctx.pos)
}

function consume(ctx: ParseContext, s: string): void {
  ctx.pos += s.length
  ctx.col += s.length
}

// ─── Whitespace + Comments ────────────────────────────────────────────────────

const WHITESPACE = new Set([
  ' ',
  '\t',
  '\r',
  '\n',
  '\u00A0',
  '\u2028',
  '\u2029',
  '\uFEFF'
])

function skipWhitespaceAndComments(ctx: ParseContext): void {
  while (ctx.pos < ctx.src.length) {
    const ch = current(ctx)

    if (WHITESPACE.has(ch)) {
      advance(ctx)
      continue
    }

    // Comentário de linha: //
    if (ch === '/' && peek(ctx, 1) === '/') {
      advance(ctx)
      advance(ctx)
      while (
        ctx.pos < ctx.src.length &&
        current(ctx) !== '\n' &&
        current(ctx) !== '\r' &&
        current(ctx) !== '\u2028' &&
        current(ctx) !== '\u2029'
      )
        advance(ctx)
      continue
    }

    // Comentário de bloco: /* ... */
    if (ch === '/' && peek(ctx, 1) === '*') {
      advance(ctx)
      advance(ctx)
      while (ctx.pos < ctx.src.length) {
        if (current(ctx) === '*' && peek(ctx, 1) === '/') {
          advance(ctx)
          advance(ctx)
          break
        }
        advance(ctx)
      }
      continue
    }

    break
  }
}

// ─── String ───────────────────────────────────────────────────────────────────

function parseString(ctx: ParseContext): string {
  const quote = advance(ctx) // ' ou "
  let result = ''

  while (ctx.pos < ctx.src.length) {
    const ch = current(ctx)

    if (ch === quote) {
      advance(ctx)
      return result
    }

    if (ch === '\\') {
      advance(ctx)
      const esc = advance(ctx)
      switch (esc) {
        case '"':
          result += '"'
          break
        case "'":
          result += "'"
          break
        case '\\':
          result += '\\'
          break
        case '/':
          result += '/'
          break
        case 'b':
          result += '\b'
          break
        case 'f':
          result += '\f'
          break
        case 'n':
          result += '\n'
          break
        case 'r':
          result += '\r'
          break
        case 't':
          result += '\t'
          break
        case 'v':
          result += '\v'
          break
        case '0':
          if (/[0-9]/.test(current(ctx)))
            err(ctx, 'Octal escapes are not allowed')
          result += '\0'
          break
        case 'x': {
          const hex = ctx.src.slice(ctx.pos, ctx.pos + 2)
          if (!/^[0-9a-fA-F]{2}$/.test(hex))
            err(ctx, 'Invalid hex escape sequence')
          result += String.fromCharCode(parseInt(hex, 16))
          ctx.pos += 2
          ctx.col += 2
          break
        }
        case 'u': {
          if (current(ctx) === '{') {
            // \u{XXXXXX}
            advance(ctx)
            let hexStr = ''
            while (ctx.pos < ctx.src.length && current(ctx) !== '}')
              hexStr += advance(ctx)
            if (current(ctx) !== '}') err(ctx, 'Unterminated unicode escape')
            advance(ctx)
            const cp = parseInt(hexStr, 16)
            if (isNaN(cp) || cp > 0x10ffff)
              err(ctx, `Invalid unicode code point: ${hexStr}`)
            result += String.fromCodePoint(cp)
          } else {
            // \uXXXX
            const hex = ctx.src.slice(ctx.pos, ctx.pos + 4)
            if (!/^[0-9a-fA-F]{4}$/.test(hex))
              err(ctx, 'Invalid unicode escape sequence')
            result += String.fromCharCode(parseInt(hex, 16))
            ctx.pos += 4
            ctx.col += 4
          }
          break
        }
        // Line continuation
        case '\n':
        case '\u2028':
        case '\u2029':
          break
        case '\r':
          if (current(ctx) === '\n') advance(ctx)
          break
        default:
          result += esc
      }
      continue
    }

    if (ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029') {
      err(ctx, 'Unterminated string literal')
    }

    result += advance(ctx)
  }

  err(ctx, 'Unterminated string literal')
}

// ─── Identifier (chave sem aspas) ─────────────────────────────────────────────

const IDENT_START = /[\p{L}\p{Nl}$_]/u
const IDENT_PART = /[\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}$_\u200C\u200D]/u

function isIdentStart(ch: string): boolean {
  return IDENT_START.test(ch)
}

function isIdentPart(ch: string): boolean {
  return IDENT_PART.test(ch)
}

function parseIdentifier(ctx: ParseContext): string {
  const first = current(ctx)
  if (!isIdentStart(first))
    err(ctx, `Unexpected character: ${JSON.stringify(first)}`)
  let name = advance(ctx)
  while (ctx.pos < ctx.src.length && isIdentPart(current(ctx))) {
    name += advance(ctx)
  }
  return name
}

// ─── Number ───────────────────────────────────────────────────────────────────

function parseNumber(ctx: ParseContext): number {
  let numStr = ''

  // Sinal opcional
  if (current(ctx) === '+' || current(ctx) === '-') {
    numStr += advance(ctx)
  }

  // Infinity
  if (startsWith(ctx, 'Infinity')) {
    consume(ctx, 'Infinity')
    return numStr === '-' ? -Infinity : Infinity
  }

  // NaN
  if (startsWith(ctx, 'NaN')) {
    consume(ctx, 'NaN')
    return NaN
  }

  // Hexadecimal: 0x / 0X
  if (current(ctx) === '0' && (peek(ctx, 1) === 'x' || peek(ctx, 1) === 'X')) {
    const sign = numStr // pode ser '-' ou ''
    numStr += advance(ctx) // '0'
    numStr += advance(ctx) // 'x'
    if (!/[0-9a-fA-F]/.test(current(ctx)))
      err(ctx, 'Invalid hexadecimal number')
    while (ctx.pos < ctx.src.length && /[0-9a-fA-F_]/.test(current(ctx))) {
      const ch = advance(ctx)
      if (ch !== '_') numStr += ch
    }
    const abs = parseInt(numStr, 16) // parseInt ignora o prefixo 0x corretamente
    return sign === '-' ? -abs : abs
  }

  // Parte inteira
  while (ctx.pos < ctx.src.length && /[0-9_]/.test(current(ctx))) {
    const ch = advance(ctx)
    if (ch !== '_') numStr += ch
  }

  // Parte decimal
  if (ctx.pos < ctx.src.length && current(ctx) === '.') {
    numStr += advance(ctx)
    while (ctx.pos < ctx.src.length && /[0-9_]/.test(current(ctx))) {
      const ch = advance(ctx)
      if (ch !== '_') numStr += ch
    }
  }

  // Expoente
  if (
    ctx.pos < ctx.src.length &&
    (current(ctx) === 'e' || current(ctx) === 'E')
  ) {
    numStr += advance(ctx)
    if (current(ctx) === '+' || current(ctx) === '-') numStr += advance(ctx)
    while (ctx.pos < ctx.src.length && /[0-9_]/.test(current(ctx))) {
      const ch = advance(ctx)
      if (ch !== '_') numStr += ch
    }
  }

  const n = Number(numStr)
  if (isNaN(n)) err(ctx, `Invalid number: ${numStr}`)
  return n
}

// ─── Value ────────────────────────────────────────────────────────────────────

function parseValue(ctx: ParseContext): Json5Value {
  skipWhitespaceAndComments(ctx)

  if (ctx.pos >= ctx.src.length) err(ctx, 'Unexpected end of input')

  const ch = current(ctx)

  if (ch === '"' || ch === "'") return parseString(ctx)
  if (ch === '{') return parseObject(ctx)
  if (ch === '[') return parseArray(ctx)

  if (startsWith(ctx, 'true')) {
    consume(ctx, 'true')
    return true
  }
  if (startsWith(ctx, 'false')) {
    consume(ctx, 'false')
    return false
  }
  if (startsWith(ctx, 'null')) {
    consume(ctx, 'null')
    return null
  }

  if (
    ch === '+' ||
    ch === '-' ||
    ch === '.' ||
    (ch >= '0' && ch <= '9') ||
    startsWith(ctx, 'Infinity') ||
    startsWith(ctx, 'NaN')
  )
    return parseNumber(ctx)

  err(ctx, `Unexpected token: ${JSON.stringify(ch)}`)
}

// ─── Object ───────────────────────────────────────────────────────────────────

function parseObject(ctx: ParseContext): Json5Object {
  advance(ctx) // {
  const obj: Json5Object = {}

  skipWhitespaceAndComments(ctx)
  if (current(ctx) === '}') {
    advance(ctx)
    return obj
  }

  while (ctx.pos < ctx.src.length) {
    skipWhitespaceAndComments(ctx)
    if (ctx.pos >= ctx.src.length) err(ctx, 'Unterminated object')

    // Trailing comma
    if (current(ctx) === '}') {
      advance(ctx)
      return obj
    }

    // Chave: string ou identifier
    const ch = current(ctx)
    const key: string =
      ch === '"' || ch === "'" ? parseString(ctx) : parseIdentifier(ctx)

    skipWhitespaceAndComments(ctx)
    if (current(ctx) !== ':')
      err(ctx, `Expected ':' after key ${JSON.stringify(key)}`)
    advance(ctx) // :

    const entry: ObjectEntry = [key, parseValue(ctx)]
    obj[entry[0]] = entry[1]

    skipWhitespaceAndComments(ctx)

    if (current(ctx) === ',') {
      advance(ctx)
      continue
    }
    if (current(ctx) === '}') {
      advance(ctx)
      return obj
    }

    err(ctx, 'Expected "," or "}" in object')
  }

  err(ctx, 'Unterminated object')
}

// ─── Array ────────────────────────────────────────────────────────────────────

function parseArray(ctx: ParseContext): Json5Array {
  advance(ctx) // [
  const arr: Json5Array = []

  skipWhitespaceAndComments(ctx)
  if (current(ctx) === ']') {
    advance(ctx)
    return arr
  }

  while (ctx.pos < ctx.src.length) {
    skipWhitespaceAndComments(ctx)
    if (ctx.pos >= ctx.src.length) err(ctx, 'Unterminated array')

    // Trailing comma
    if (current(ctx) === ']') {
      advance(ctx)
      return arr
    }

    arr.push(parseValue(ctx))

    skipWhitespaceAndComments(ctx)

    if (current(ctx) === ',') {
      advance(ctx)
      continue
    }
    if (current(ctx) === ']') {
      advance(ctx)
      return arr
    }

    err(ctx, 'Expected "," or "]" in array')
  }

  err(ctx, 'Unterminated array')
}

// ─── Reviver ──────────────────────────────────────────────────────────────────

type ReviverHolder = { [key: string]: Json5Value }

function applyReviver(
  reviver: Reviver,
  holder: ReviverHolder,
  key: string
): Json5Value {
  const val = holder[key]

  if (val !== null && typeof val === 'object') {
    const obj = val as ReviverHolder
    for (const k of Object.keys(obj)) {
      const newVal = applyReviver(reviver, obj, k)
      if (newVal === undefined) delete obj[k]
      else obj[k] = newVal
    }
  }

  return reviver.call(holder as Json5Object, key, val)
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Faz o parse de uma string JSON5 e retorna o valor JavaScript correspondente.
 *
 * @param source  - String JSON5 a ser parseada.
 * @param reviver - Função opcional chamada para cada par chave/valor (igual ao `JSON.parse`).
 * @returns O valor JavaScript resultante tipado como `T`.
 *
 * @throws {SyntaxError} Se a string não for JSON5 válido.
 *
 * @example
 * ```ts
 * // Sem generic — retorna Json5Value
 * const raw = parse(`{ host: 'localhost' }`)
 *
 * // Com generic — cast para o tipo desejado
 * interface TsConfig {
 *   compilerOptions: {
 *     paths: Record<string, string[]>
 *     baseUrl: string
 *   }
 * }
 * const { compilerOptions: { paths, baseUrl } } = parse<TsConfig>(data)
 * ```
 */
export function parse<T extends Json5Value = Json5Value>(
  source: string,
  reviver?: Reviver
): T {
  const ctx: ParseContext = {
    src: String(source),
    pos: 0,
    line: 1,
    col: 1
  }

  const result = parseValue(ctx)

  skipWhitespaceAndComments(ctx)

  if (ctx.pos < ctx.src.length) {
    err(ctx, `Unexpected token after value: ${JSON.stringify(current(ctx))}`)
  }

  if (typeof reviver === 'function') {
    return applyReviver(reviver, { '': result }, '') as T
  }

  return result as T
}
