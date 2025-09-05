import { transform } from '@swc/core'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, parse } from 'node:path'

import { loadTsConfigPaths } from '#/utils/tsconfig-loader'

import { outDir } from '#/common/constants'

const paths = await loadTsConfigPaths()

export async function compile(
  filename: string,
  sourceRoot: string
): Promise<void> {
  const string = await readFile(filename, 'utf-8')
  const { code, map } = await transform(string, {
    jsc: {
      baseUrl: join(process.cwd(), '.'),
      parser: {
        syntax: 'typescript',
        decorators: true
      },

      target: 'es2022',
      keepClassNames: true,
      transform: {
        treatConstEnumAsEnum: true,
        decoratorMetadata: true,
        legacyDecorator: true
      },

      experimental: {
        keepImportAssertions: true
      },

      paths
    },

    module: {
      type: 'es6',
      strict: true,
      resolveFully: true
    },

    sourceMaps: true
  })

  const { dir, name } = parse(
    filename
      .replace(join(process.cwd(), '/'), '')
      .replace(join(sourceRoot, '/'), '')
  )

  await mkdir(join(outDir, dir), { recursive: true })

  await writeFile(
    join(outDir, dir, `${name}.js`),
    `${code}\n//# sourceMappingURL=${join(outDir, dir, `${name}.js.map`)}`
  )

  if (map) {
    await writeFile(join(outDir, dir, `${name}.js.map`), map)
  }
}
