import { describe, it, expect } from 'vitest'
import { folderify } from '../testing/folderify.js'
import { runMonocrate, pj } from '../testing/monocrate-teskit.js'

const name = 'root-package'

describe('deps directory collision handling', () => {
  it('uses standard "deps" directory when no collision exists', async () => {
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

    // Should use standard "deps" directory
    expect(output['deps/__test__lib/dist/index.js']).toBeDefined()
    expect(output['deps/__test__lib/package.json']).toBeDefined()

    // Verify imports are rewritten to standard deps path
    expect(output['dist/index.js']).toContain('./deps/__test__lib/')
  })

  it('uses unique deps directory name when subject package has existing "deps" directory', async () => {
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

    // Find the new deps directory (should be deps-<random>)
    const depsKeys = Object.keys(output).filter((k) => /^deps-[a-zA-Z0-9]+\//.exec(k))
    expect(depsKeys.length).toBeGreaterThan(0)

    // Verify the in-repo dependency was placed in the unique deps directory
    const libIndexKey = depsKeys.find((k) => k.includes('__test__lib/dist/index.js'))
    expect(libIndexKey).toBeDefined()

    // Verify imports are rewritten to the unique deps path
    const importContent = output['dist/index.js'] as string
    expect(importContent).toMatch(/\.\/deps-[a-zA-Z0-9]+\/__test__lib\//)
  })

  it('adds unique deps directory to files array in package.json when collision exists', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        // Include both dist and deps in files to trigger collision
        files: ['dist', 'deps'],
        dependencies: { '@test/lib': 'workspace:*' },
      },
      'packages/app/dist/index.js': `import { greet } from '@test/lib';`,
      // Subject package has its own deps directory (included via files array)
      'packages/app/deps/existing.js': `// existing file`,
      'packages/lib/package.json': pj('@test/lib'),
      'packages/lib/dist/index.js': `export function greet() {}`,
    })

    const { output } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '1.0.0' })

    const packageJson = output['package.json'] as { files: string[] }
    expect(packageJson.files).toContain('dist')

    // Should have a deps-<random> entry (and original "deps" still present)
    const uniqueDepsEntry = packageJson.files.find((f) => /^deps-[a-zA-Z0-9]+$/.exec(f))
    expect(uniqueDepsEntry).toBeDefined()

    // The original "deps" should still be in the files array since that's the subject's own directory
    expect(packageJson.files).toContain('deps')
  })
})
