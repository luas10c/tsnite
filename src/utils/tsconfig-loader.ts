import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import json5 from 'json5'

export async function loadTsConfigPaths(): Promise<Record<string, string[]>> {
  try {
    const data = await readFile(join(process.cwd(), 'tsconfig.json'), 'utf-8')
    const {
      compilerOptions: { paths }
    } = json5.parse(data)

    return paths
  } catch {
    return {}
  }
}
