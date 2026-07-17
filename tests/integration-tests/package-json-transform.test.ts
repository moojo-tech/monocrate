import { describe, it, expect } from 'vitest'
import { monocrate } from '../../src/index.js'
import { folderify } from '../testing/folderify.js'
import { unfolderify } from '../testing/unfolderify.js'
import { pj } from '../testing/monocrate-teskit.js'

const name = 'root-package'

describe('package.json transformation', () => {
  it('preserves exports field in package.json', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app', undefined, {
        types: 'dist/index.d.ts',
        exports: {
          '.': {
            types: './dist/index.d.ts',
            import: './dist/index.js',
          },
        },
      }),
      'packages/app/dist/index.js': `export const foo = 'foo';
`,
      'packages/app/dist/index.d.ts': `export declare const foo: string;
`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/app',
      publish: false,
      bump: '2.8.512',
    })

    const pkgJson = unfolderify(outputDir)['package.json'] as Record<string, unknown>

    expect(pkgJson.exports).toEqual({
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
    })
  })

  it('preserves metadata fields like description and keywords', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        description: 'Test package',
        keywords: ['test', 'example'],
        author: 'Test Author',
        license: 'MIT',
      },
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/app',
      publish: false,
      bump: '2.8.512',
    })

    const output = unfolderify(outputDir)
    const pkgJson = output['package.json'] as Record<string, unknown>

    expect(pkgJson.description).toBe('Test package')
    expect(pkgJson.keywords).toEqual(['test', 'example'])
    expect(pkgJson.author).toBe('Test Author')
    expect(pkgJson.license).toBe('MIT')
  })

  it('preserves peerDependencies and optionalDependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: { lodash: '^4.17.21' },
        peerDependencies: { react: '>=17.0.0' },
        optionalDependencies: { fsevents: '^2.3.0' },
      },
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/app',
      publish: false,
      bump: '2.8.512',
    })

    const output = unfolderify(outputDir)
    const pkgJson = output['package.json'] as Record<string, unknown>

    expect(pkgJson.peerDependencies).toEqual({ react: '>=17.0.0' })
    expect(pkgJson.optionalDependencies).toEqual({ fsevents: '^2.3.0' })
    expect(pkgJson.dependencies).toEqual({ lodash: '^4.17.21' })
  })
})
