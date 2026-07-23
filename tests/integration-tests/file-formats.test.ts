import { afterAll, describe, it, expect } from 'vitest'
import { folderify } from '../testing/folderify.js'
import { MonodropTestkit, pj } from '../testing/monodrop-teskit.js'

const name = 'root-package'

describe('file format support', () => {
  const teskit = new MonodropTestkit()
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

  describe('declaration files', () => {
    it('rewrites imports in .d.mts files', async () => {
      const monorepoRoot = folderify({
        'package.json': { name, workspaces: ['packages/*'] },
        'packages/app-foo/package.json': pj('@acme/app-foo', { dependencies: { '@acme/lib-foo': '*' } }),
        'packages/app-foo/dist/index.js': `import { greet } from '@acme/lib-foo'; console.log(greet());`,
        'packages/app-foo/dist/index.d.mts': `import { greet } from '@acme/lib-foo';\nexport declare function main(): string;\n`,
        'packages/lib-foo/package.json': pj('@acme/lib-foo'),
        'packages/lib-foo/dist/index.js': `export function greet() { return 'Hello!' }`,
      })

      const { output } = await teskit.run(monorepoRoot, 'packages/app-foo')

      // Declaration files never execute, so the rewrite must be verified by inspecting file content
      const indexDmts = output['dist/index.d.mts'] as string
      expect(indexDmts).toContain(`'../deps/__acme__lib-foo/dist/index.js'`)
      expect(indexDmts).not.toContain(`'@acme/lib-foo'`)
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
          'Monodrop only supports ES modules. Set "type": "module" in package.json or use .mjs extension.',
        ].join('\n')
      )
    })
  })
})
