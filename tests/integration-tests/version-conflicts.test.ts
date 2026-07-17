import { describe, it, expect } from 'vitest'
import { monocrate } from '../../src/index.js'
import { folderify } from '../testing/folderify.js'
import { pj, runMonocrate } from '../testing/monocrate-teskit.js'

const name = 'root-package'

describe('version conflict detection', () => {
  it('throws with detailed error message when packages require different versions', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app', {
        dependencies: { '@test/lib': 'workspace:*', lodash: '^4.17.0' },
      }),
      'packages/app/dist/index.js': `import { greet } from '@test/lib'; console.log(greet());`,
      'packages/lib/package.json': pj('@test/lib', { dependencies: { lodash: '^3.10.0' } }),
      'packages/lib/dist/index.js': `export function greet() { return 'Hello!'; }`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        publish: false,
        bump: '2.8.512',
      })
    ).rejects.toThrow(
      'Third-party dependency version conflicts detected:\n' +
        '  - lodash: ^3.10.0 (by @test/lib), ^4.17.0 (by @test/app)'
    )
  })

  it('lists all conflicting dependencies when multiple conflicts exist', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app', {
        dependencies: { '@test/lib': 'workspace:*', lodash: '^4.17.0', chalk: '^5.0.0' },
      }),
      'packages/app/dist/index.js': `import { greet } from '@test/lib'; console.log(greet());`,
      'packages/lib/package.json': pj('@test/lib', { dependencies: { lodash: '^3.10.0', chalk: '^4.0.0' } }),
      'packages/lib/dist/index.js': `export function greet() { return 'Hello!'; }`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        publish: false,
        bump: '2.8.512',
      })
    ).rejects.toThrow('  - lodash: ^3.10.0 (by @test/lib), ^4.17.0 (by @test/app)')
  })

  it('allows same dependency with identical versions across packages', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app', {
        dependencies: { '@test/lib': 'workspace:*', lodash: '^4.17.21' },
      }),
      'packages/app/dist/index.js': `import { greet } from '@test/lib'; console.log(greet());`,
      'packages/lib/package.json': pj('@test/lib', { dependencies: { lodash: '^4.17.21' } }),
      'packages/lib/dist/index.js': `export function greet() { return 'Hello!'; }`,
    })

    const { stdout } = await runMonocrate(monorepoRoot, 'packages/app')
    expect(stdout.trim()).toBe('Hello!')
  })

  it('detects conflicts in deep dependency chains', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app', {
        dependencies: { '@test/level1': 'workspace:*', zod: '^3.0.0' },
      }),
      'packages/app/dist/index.js': `import { fromLevel1 } from '@test/level1'; console.log(fromLevel1());`,
      'packages/level1/package.json': pj('@test/level1', {
        dependencies: { '@test/level2': 'workspace:*' },
      }),
      'packages/level1/dist/index.js': `import { fromLevel2 } from '@test/level2'; export function fromLevel1() { return fromLevel2(); }`,
      'packages/level2/package.json': pj('@test/level2', { dependencies: { zod: '^2.0.0' } }),
      'packages/level2/dist/index.js': `export function fromLevel2() { return 'level2'; }`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        publish: false,
        bump: '2.8.512',
      })
    ).rejects.toThrow('  - zod: ^2.0.0 (by @test/level2), ^3.0.0 (by @test/app)')
  })
})
