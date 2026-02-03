import { describe, it, expect } from 'vitest'
import { folderify } from '../testing/folderify.js'
import { runMonocrate, pj } from '../testing/monocrate-teskit.js'

const name = 'root-package'

describe('deps directory', () => {
  it('creates uniquely named deps directory for in-repo dependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app', {
        dependencies: { '@test/lib': 'workspace:*' },
      }),
      'packages/app/dist/index.js': `import { greet } from '@test/lib'; console.log(greet());`,
      'packages/lib/package.json': pj('@test/lib'),
      'packages/lib/dist/index.js': `export function greet() { return 'hello'; }`,
    })

    const { output } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '1.0.0' })

    // Find the deps directory (should be deps-<random>)
    const depsKeys = Object.keys(output).filter((k) => /^deps-[a-zA-Z0-9]+\//.exec(k))
    expect(depsKeys.length).toBeGreaterThan(0)

    // Verify the in-repo dependency was placed in the deps directory
    const libIndexKey = depsKeys.find((k) => k.includes('__test__lib/dist/index.js'))
    expect(libIndexKey).toBeDefined()

    // Verify imports are rewritten to the deps path
    const importContent = output['dist/index.js'] as string
    expect(importContent).toMatch(/\.\/deps-[a-zA-Z0-9]+\/__test__lib\//)
  })

  it('preserves subject package deps directory when it exists', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app', {
        dependencies: { '@test/lib': 'workspace:*' },
      }),
      'packages/app/dist/index.js': `import { greet } from '@test/lib'; console.log(greet());`,
      // Subject package has its own deps directory
      'packages/app/deps/internal/helper.js': `export const VERSION = '1.0';`,
      'packages/lib/package.json': pj('@test/lib'),
      'packages/lib/dist/index.js': `export function greet() { return 'hello'; }`,
    })

    const { output } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '1.0.0' })

    // The original deps directory should be preserved
    expect(output['deps/internal/helper.js']).toContain("VERSION = '1.0'")

    // In-repo dependencies go to uniquely named deps directory
    const depsKeys = Object.keys(output).filter((k) => /^deps-[a-zA-Z0-9]+\//.exec(k))
    expect(depsKeys.length).toBeGreaterThan(0)
  })

  it('adds deps directory to files array in package.json', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        files: ['dist'],
        dependencies: { '@test/lib': 'workspace:*' },
      },
      'packages/app/dist/index.js': `import { greet } from '@test/lib';`,
      'packages/lib/package.json': pj('@test/lib'),
      'packages/lib/dist/index.js': `export function greet() {}`,
    })

    const { output } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '1.0.0' })

    const packageJson = output['package.json'] as { files: string[] }
    expect(packageJson.files).toContain('dist')

    // Should have a deps-<random> entry
    const depsEntry = packageJson.files.find((f) => /^deps-[a-zA-Z0-9]+$/.exec(f))
    expect(depsEntry).toBeDefined()
  })
})
