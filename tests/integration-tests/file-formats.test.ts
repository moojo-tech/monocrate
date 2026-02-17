import { afterAll, describe, it, expect } from 'vitest'
import { folderify } from '../testing/folderify.js'
import { MonocrateTeskit, pj } from '../testing/monocrate-teskit.js'

const name = 'root-package'

function findEmbeddedDepsDir(output: Record<string, unknown>): string {
  const depEntry = Object.keys(output).find((at) => at.startsWith('deps-'))
  if (!depEntry) {
    throw new Error('Expected at least one embedded dependency entry under deps-<uuid>')
  }
  const firstSegment = depEntry.split('/').at(0)
  if (!firstSegment) {
    throw new Error(`Expected a valid embedded dependency entry, got: ${depEntry}`)
  }
  return firstSegment
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readOutputObject(output: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = output[key]
  if (!isRecord(value)) {
    throw new Error(`Expected "${key}" to be an object in test output`)
  }
  return value
}

describe('file format support', () => {
  const teskit = new MonocrateTeskit()
  afterAll(() => {
    teskit.shutdown()
  })
  describe('conditional exports', () => {
    it('handles subpath exports resolving to .mjs files', async () => {
      const monorepoRoot = folderify({
        'package.json': { name, workspaces: ['packages/*'] },
        'packages/app/package.json': pj('@test/app', {
          dependencies: { '@test/lib': '*' },
          type: 'module',
          main: 'dist/index.js',
        }),
        'packages/app/dist/index.js': `import { helper } from '@test/lib/utils';
console.log(helper());
`,
        'packages/lib/package.json': {
          name: '@test/lib',
          version: '1.0.0',
          type: 'module',
          exports: {
            '.': './dist/index.js',
            './utils': './dist/utils/helper.mjs',
          },
        },
        'packages/lib/dist/index.js': `export const main = 'main';
`,
        'packages/lib/dist/utils/helper.mjs': `export function helper() {
  return 'Helper from .mjs!';
}
`,
      })

      const { stdout, output } = await teskit.run(monorepoRoot, 'packages/app', { bump: '1.0.0' })

      expect(stdout.trim()).toBe('Helper from .mjs!')

      const depsDir = findEmbeddedDepsDir(output)
      const libPkgJson = readOutputObject(output, `${depsDir}/@test/lib/package.json`)
      expect(libPkgJson.exports).toEqual({
        '.': './dist/index.js',
        './utils': './dist/utils/helper.mjs',
      })
    })
  })

  describe('CommonJS support', () => {
    it('supports in-repo dependencies with .cjs files', async () => {
      const monorepoRoot = folderify({
        'package.json': { name, workspaces: ['packages/*'] },
        'packages/app/package.json': {
          name: '@test/app',
          version: '1.0.0',
          dependencies: { '@test/lib': '*' },
          main: 'dist/index.js',
        },
        'packages/app/dist/index.js': `const { greet } = require('@test/lib');
console.log(greet());`,
        'packages/lib/package.json': {
          name: '@test/lib',
          version: '1.0.0',
          type: 'commonjs',
          main: 'dist/index.cjs',
        },
        'packages/lib/dist/index.cjs': `module.exports = { greet: () => 'hello' };
`,
      })

      const { stdout, output } = await teskit.run(monorepoRoot, 'packages/app', { bump: '1.0.0' })
      const depsDir = findEmbeddedDepsDir(output)
      expect(output).toHaveProperty(`${depsDir}/@test/lib/dist/index.cjs`)
      expect(stdout.trim()).toBe('hello')
    })
  })
})
