import { describe, it, expect } from 'vitest'
import { monocrate } from '../../src/index.js'
import { folderify } from '../testing/folderify.js'
import { pj, runMonocrate } from '../testing/monocrate-teskit.js'

const name = 'root-package'

describe('file format support', () => {
  describe('.mjs file handling', () => {
    it('rewrites imports in .mjs files', async () => {
      const monorepoRoot = folderify({
        'package.json': { name, workspaces: ['packages/*'] },
        'packages/app/package.json': pj('@test/app', {
          dependencies: { '@test/lib': '*' },
          type: 'module',
          main: 'dist/index.mjs',
        }),
        'packages/app/dist/index.mjs': `import { greet } from '@test/lib';
console.log(greet('World'));
`,
        'packages/lib/package.json': pj('@test/lib', {
          type: 'module',
          main: 'dist/index.mjs',
        }),
        'packages/lib/dist/index.mjs': `export function greet(name) {
  return 'Hello, ' + name + '!';
}
`,
      })

      const { stdout } = await runMonocrate(monorepoRoot, 'packages/app', {
        bump: '1.0.0',
        entryPoint: 'dist/index.mjs',
      })

      expect(stdout.trim()).toBe('Hello, World!')
    })

    it('rewrites imports in .d.mts files', async () => {
      const monorepoRoot = folderify({
        'package.json': { name, workspaces: ['packages/*'] },
        'packages/app/package.json': pj('@test/app', {
          dependencies: { '@test/lib': '*' },
          type: 'module',
          main: 'dist/index.mjs',
          types: 'dist/index.d.mts',
        }),
        'packages/app/dist/index.mjs': `import { greet } from '@test/lib';
export const result = greet('World');
console.log(result);
`,
        'packages/app/dist/index.d.mts': `import { greet } from '@test/lib';
export declare const result: ReturnType<typeof greet>;
`,
        'packages/lib/package.json': pj('@test/lib', {
          type: 'module',
          main: 'dist/index.mjs',
          types: 'dist/index.d.mts',
        }),
        'packages/lib/dist/index.mjs': `export function greet(name) {
  return 'Hello, ' + name + '!';
}
`,
        'packages/lib/dist/index.d.mts': `export declare function greet(name: string): string;
`,
      })

      const { stdout, output } = await runMonocrate(monorepoRoot, 'packages/app', {
        bump: '1.0.0',
        entryPoint: 'dist/index.mjs',
      })

      // Declaration files (.d.mts) don't execute, so we must verify their imports
      // were rewritten by checking file contents directly
      const indexDmts = output['dist/index.d.mts'] as string
      expect(indexDmts).toContain('../deps/__test__lib/dist/index.mjs')
      expect(indexDmts).not.toContain("'@test/lib'")

      // Verify the package actually runs correctly
      expect(stdout.trim()).toBe('Hello, World!')
    })
  })

  describe('main field pointing to .mjs', () => {
    it('correctly imports a dep whose main file is .mjs', async () => {
      const monorepoRoot = folderify({
        'package.json': { name, workspaces: ['packages/*'] },
        'packages/app/package.json': pj('@test/app', {
          dependencies: { '@test/lib': '*' },
          type: 'module',
          main: 'dist/index.js',
        }),
        'packages/app/dist/index.js': `import { greet } from '@test/lib';
console.log(greet('World'));
`,
        'packages/lib/package.json': {
          name: '@test/lib',
          version: '1.0.0',
          type: 'module',
          main: 'dist/index.mjs',
        },
        'packages/lib/dist/index.mjs': `export function greet(name) {
  return 'Hello from mjs, ' + name + '!';
}
`,
      })

      const { stdout } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '1.0.0' })

      expect(stdout.trim()).toBe('Hello from mjs, World!')
    })
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

      const { stdout } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '1.0.0' })

      expect(stdout.trim()).toBe('Helper from .mjs!')
    })
  })

  describe('CommonJS rejection', () => {
    it('rejects .cjs files', async () => {
      const monorepoRoot = folderify({
        'package.json': { name, workspaces: ['packages/*'] },
        'packages/app/package.json': pj('@test/app', {
          type: 'module',
          main: 'dist/index.cjs',
        }),
        'packages/app/dist/index.cjs': `console.log('hello');
`,
      })

      await expect(
        monocrate({
          cwd: monorepoRoot,
          pathToSubjectPackages: 'packages/app',
          publish: false,
          bump: '1.0.0',
        })
      ).rejects.toThrow('Cannot process a .cjs file: packages/app/dist/index.cjs')
    })

    it('rejects .js files in packages without type: module', async () => {
      const monorepoRoot = folderify({
        'package.json': { name, workspaces: ['packages/*'] },
        'packages/app/package.json': {
          name: '@test/app',
          version: '1.0.0',
          main: 'dist/index.js',
          // No "type": "module" - defaults to CommonJS
        },
        'packages/app/dist/index.js': `console.log('hello');
`,
      })

      await expect(
        monocrate({
          cwd: monorepoRoot,
          pathToSubjectPackages: 'packages/app',
          publish: false,
          bump: '1.0.0',
        })
      ).rejects.toThrow('Cannot process a .js file in a CommonJS package: packages/app/dist/index.js')
    })

    it('rejects .js files in packages with type: commonjs', async () => {
      const monorepoRoot = folderify({
        'package.json': { name, workspaces: ['packages/*'] },
        'packages/app/package.json': {
          name: '@test/app',
          version: '1.0.0',
          type: 'commonjs',
          main: 'dist/index.js',
        },
        'packages/app/dist/index.js': `console.log('hello');
`,
      })

      await expect(
        monocrate({
          cwd: monorepoRoot,
          pathToSubjectPackages: 'packages/app',
          publish: false,
          bump: '1.0.0',
        })
      ).rejects.toThrow('Cannot process a .js file in a CommonJS package: packages/app/dist/index.js')
    })

    it('rejects in-repo dependencies with .cjs files', async () => {
      const monorepoRoot = folderify({
        'package.json': { name, workspaces: ['packages/*'] },
        'packages/app/package.json': pj('@test/app', {
          dependencies: { '@test/lib': '*' },
          type: 'module',
          main: 'dist/index.mjs',
        }),
        'packages/app/dist/index.mjs': `import { greet } from '@test/lib';
console.log(greet());
`,
        'packages/lib/package.json': {
          name: '@test/lib',
          version: '1.0.0',
          type: 'commonjs',
          main: 'dist/index.cjs',
        },
        'packages/lib/dist/index.cjs': `module.exports = { greet: () => 'hello' };
`,
      })

      await expect(
        monocrate({
          cwd: monorepoRoot,
          pathToSubjectPackages: 'packages/app',
          publish: false,
          bump: '1.0.0',
        })
      ).rejects.toThrow('Cannot process a .cjs file: packages/lib/dist/index.cjs')
    })

    it('accepts .js files in packages with type: module', async () => {
      const monorepoRoot = folderify({
        'package.json': { name, workspaces: ['packages/*'] },
        'packages/app/package.json': pj('@test/app', {
          dependencies: { '@test/lib': '*' },
          type: 'module',
          main: 'dist/index.js',
        }),
        'packages/app/dist/index.js': `import { greet } from '@test/lib';
console.log(greet('World'));
`,
        'packages/lib/package.json': pj('@test/lib', {
          type: 'module',
          main: 'dist/index.js',
        }),
        'packages/lib/dist/index.js': `export function greet(name) {
  return 'Hello, ' + name + '!';
}
`,
      })

      const { stdout } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '1.0.0' })

      expect(stdout.trim()).toBe('Hello, World!')
    })
  })
})
