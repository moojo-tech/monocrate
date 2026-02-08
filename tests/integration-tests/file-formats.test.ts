import { describe, it, expect } from 'vitest'
import { folderify } from '../testing/folderify.js'
import { pj, runMonocrate } from '../testing/monocrate-teskit.js'

const name = 'root-package'

describe('file format support', () => {
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

      const { stdout } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '1.0.0' })

      expect(stdout.trim()).toBe('Helper from .mjs!')
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

      const { stdout, output } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '1.0.0' })
      expect(output).toHaveProperty('node_modules/@test/lib/dist/index.cjs')
      expect(stdout.trim()).toBe('hello')
    })
  })
})
