import { afterAll, describe, it, expect } from 'vitest'
import { monocrate } from '../../src/index.js'
import { folderify } from '../testing/folderify.js'
import { MonocrateTeskit, pj } from '../testing/monocrate-teskit.js'

const name = 'root-package'

describe('circular dependency detection', () => {
  const teskit = new MonocrateTeskit()
  afterAll(() => {
    teskit.shutdown()
  })
  it('detects direct cycle (A → B → A)', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/a/package.json': pj('@test/a', { dependencies: { '@test/b': 'workspace:*' } }),
      'packages/a/dist/index.js': `import { b } from '@test/b'; export const a = b;`,
      'packages/b/package.json': pj('@test/b', { dependencies: { '@test/a': 'workspace:*' } }),
      'packages/b/dist/index.js': `import { a } from '@test/a'; export const b = a;`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/a',
        publish: false,
        bump: '1.0.0',
      })
    ).rejects.toThrow(
      'Circular dependency detected:\n' +
        '  @test/a → @test/b → @test/a\n\n' +
        'Monocrate cannot assemble packages with circular dependencies.'
    )
  })

  it('detects indirect cycle (A → B → C → A)', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/a/package.json': pj('@test/a', { dependencies: { '@test/b': 'workspace:*' } }),
      'packages/a/dist/index.js': `import { b } from '@test/b'; export const a = b;`,
      'packages/b/package.json': pj('@test/b', { dependencies: { '@test/c': 'workspace:*' } }),
      'packages/b/dist/index.js': `import { c } from '@test/c'; export const b = c;`,
      'packages/c/package.json': pj('@test/c', { dependencies: { '@test/a': 'workspace:*' } }),
      'packages/c/dist/index.js': `import { a } from '@test/a'; export const c = a;`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/a',
        publish: false,
        bump: '1.0.0',
      })
    ).rejects.toThrow(
      'Circular dependency detected:\n' +
        '  @test/a → @test/b → @test/c → @test/a\n\n' +
        'Monocrate cannot assemble packages with circular dependencies.'
    )
  })

  it('detects self-dependency (A → A)', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/a/package.json': pj('@test/a', { dependencies: { '@test/a': 'workspace:*' } }),
      'packages/a/dist/index.js': `export const a = 'a';`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/a',
        publish: false,
        bump: '1.0.0',
      })
    ).rejects.toThrow(
      'Circular dependency detected:\n' +
        '  @test/a → @test/a\n\n' +
        'Monocrate cannot assemble packages with circular dependencies.'
    )
  })

  it('allows cycle in devDependencies only', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      // a has devDependency on b, b has dependency on a
      // No cycle in runtime deps when starting from a
      'packages/a/package.json': pj('@test/a', { devDependencies: { '@test/b': 'workspace:*' } }),
      'packages/a/dist/index.js': `export const a = 'a';`,
      'packages/b/package.json': pj('@test/b', { dependencies: { '@test/a': 'workspace:*' } }),
      'packages/b/dist/index.js': `import { a } from '@test/a'; export const b = a;`,
    })

    // Should succeed because devDependencies are not checked for cycles
    const { output } = await teskit.run(monorepoRoot, 'packages/a')
    expect(output['package.json']).toHaveProperty('name', '@test/a')
  })

  it('allows diamond dependency (not a cycle)', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      // a → b → d
      // a → c → d
      'packages/a/package.json': pj('@test/a', {
        dependencies: { '@test/b': 'workspace:*', '@test/c': 'workspace:*' },
      }),
      'packages/a/dist/index.js': `import { b } from '@test/b'; import { c } from '@test/c'; export const a = b + c;`,
      'packages/b/package.json': pj('@test/b', { dependencies: { '@test/d': 'workspace:*' } }),
      'packages/b/dist/index.js': `import { d } from '@test/d'; export const b = d;`,
      'packages/c/package.json': pj('@test/c', { dependencies: { '@test/d': 'workspace:*' } }),
      'packages/c/dist/index.js': `import { d } from '@test/d'; export const c = d;`,
      'packages/d/package.json': pj('@test/d'),
      'packages/d/dist/index.js': `export const d = 'd';`,
    })

    // Diamond is not a cycle - should succeed
    const { output } = await teskit.run(monorepoRoot, 'packages/a')
    expect(output['package.json']).toHaveProperty('name', '@test/a')
  })

  it('reports only the cycle, not the full path (A → B → C → D → C)', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      // Traversal: a → b → c → d → c (cycle is c → d → c, not including a and b)
      'packages/a/package.json': pj('@test/a', { dependencies: { '@test/b': 'workspace:*' } }),
      'packages/a/dist/index.js': `import { b } from '@test/b'; export const a = b;`,
      'packages/b/package.json': pj('@test/b', { dependencies: { '@test/c': 'workspace:*' } }),
      'packages/b/dist/index.js': `import { c } from '@test/c'; export const b = c;`,
      'packages/c/package.json': pj('@test/c', { dependencies: { '@test/d': 'workspace:*' } }),
      'packages/c/dist/index.js': `import { d } from '@test/d'; export const c = d;`,
      'packages/d/package.json': pj('@test/d', { dependencies: { '@test/c': 'workspace:*' } }),
      'packages/d/dist/index.js': `import { c } from '@test/c'; export const d = c;`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/a',
        publish: false,
        bump: '1.0.0',
      })
    ).rejects.toThrow(
      'Circular dependency detected:\n' +
        '  @test/c → @test/d → @test/c\n\n' +
        'Monocrate cannot assemble packages with circular dependencies.'
    )
  })
})
