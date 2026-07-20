import { afterAll, describe, it, expect } from 'vitest'
import { folderify } from '../testing/folderify.js'
import { MonocrateTeskit, pj } from '../testing/monocrate-teskit.js'

const name = 'root-package'

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
        'packages/app/dist/index.js': `import { helper } from '@test/lib/utils'; console.log(helper());`,
        'packages/lib/package.json': {
          name: '@test/lib',
          version: '1.0.0',
          type: 'module',
          exports: {
            '.': './dist/index.js',
            './utils': './dist/utils/helper.mjs',
          },
        },
        'packages/lib/dist/index.js': `export const main = 'main';`,
        'packages/lib/dist/utils/helper.mjs': `export function helper() { return 'Helper from .mjs!'; }`,
      })

      const { stdout, output } = await teskit.run(monorepoRoot, 'packages/app', { bump: '1.0.0' })

      expect(stdout.trim()).toBe('Helper from .mjs!')

      const libPkgJson = output['deps/__test__lib/package.json'] as Record<string, unknown>
      expect(libPkgJson.exports).toEqual({
        '.': './dist/index.js',
        './utils': './dist/utils/helper.mjs',
      })
    })
  })

  describe('CommonJS support', () => {
    it('rejects in-repo dependencies with .cjs files', async () => {
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

      await expect(teskit.run(monorepoRoot, 'packages/app', { bump: '1.0.0' })).rejects.toThrow(
        [
          'Cannot process a .js file in a CommonJS package: packages/app/dist/index.js',
          'Package "@test/app" does not have "type": "module" in package.json.',
          'Monocrate only supports ES modules. Set "type": "module" in package.json or use .mjs extension.',
        ].join('\n')
      )
    })
  })
})
