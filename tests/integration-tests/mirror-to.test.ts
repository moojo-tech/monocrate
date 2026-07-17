import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, expect } from 'vitest'
import { monocrate } from '../../src/index.js'
import { folderify } from '../testing/folderify.js'
import { unfolderify } from '../testing/unfolderify.js'
import { createTempDir, initGitRepo, pj } from '../testing/monocrate-teskit.js'

const name = 'root-package'

describe('--mirror-to option', () => {
  it('mirrors source files to the specified directory preserving path structure', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app'),
      'packages/app/src/index.ts': `export const foo = 'foo';`,
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    // Initialize git repo so git ls-files works
    initGitRepo(monorepoRoot)

    const mirrorDir = createTempDir('mirror-')

    await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/app',
      publish: false,
      bump: '1.0.0',
      mirrorTo: mirrorDir,
    })

    const mirrored = unfolderify(mirrorDir)

    // Should mirror files preserving path structure
    expect(mirrored).toEqual({
      'packages/app/package.json': { name: '@test/app', version: '0.9.9', type: 'module', main: 'dist/index.js' },
      'packages/app/src/index.ts': `export const foo = 'foo';`,
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })
  })

  it('mirrors all packages in the closure including dependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app', {
        dependencies: { '@test/lib': 'workspace:*' },
      }),
      'packages/app/src/index.ts': `import { greet } from '@test/lib';`,
      'packages/app/dist/index.js': `import { greet } from '@test/lib';`,
      'packages/lib/package.json': pj('@test/lib'),
      'packages/lib/src/index.ts': `export function greet() { return 'Hello!'; }`,
      'packages/lib/dist/index.js': `export function greet() { return 'Hello!'; }`,
    })

    initGitRepo(monorepoRoot)

    const mirrorDir = createTempDir('mirror-')

    await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/app',
      publish: false,
      bump: '1.0.0',
      mirrorTo: mirrorDir,
    })

    const mirrored = unfolderify(mirrorDir)

    // Should mirror both app and its dependency lib
    expect(mirrored).toHaveProperty('packages/app/package.json')
    expect(mirrored).toHaveProperty('packages/app/src/index.ts')
    expect(mirrored).toHaveProperty('packages/lib/package.json')
    expect(mirrored).toHaveProperty('packages/lib/src/index.ts')
  })

  it('excludes gitignored files from mirroring', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      '.gitignore': 'node_modules\n*.log\n',
      'packages/app/package.json': pj('@test/app'),
      'packages/app/src/index.ts': `export const foo = 'foo';`,
      'packages/app/dist/index.js': `export const foo = 'foo';`,
      'packages/app/debug.log': 'some debug logs',
    })

    initGitRepo(monorepoRoot)

    const mirrorDir = createTempDir('mirror-')

    await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/app',
      publish: false,
      bump: '1.0.0',
      mirrorTo: mirrorDir,
    })

    const mirrored = unfolderify(mirrorDir)

    // Should include non-ignored files
    expect(mirrored).toHaveProperty('packages/app/package.json')
    expect(mirrored).toHaveProperty('packages/app/src/index.ts')

    // Should exclude gitignored files
    expect(mirrored).not.toHaveProperty('packages/app/debug.log')
  })

  it('wipes target directory before copying', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app'),
      'packages/app/src/index.ts': `export const foo = 'foo';`,
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    initGitRepo(monorepoRoot)

    const mirrorDir = createTempDir('mirror-')

    // Create a pre-existing file in the mirror directory
    fs.mkdirSync(path.join(mirrorDir, 'packages/app'), { recursive: true })
    fs.writeFileSync(path.join(mirrorDir, 'packages/app/old-file.txt'), 'old content')

    await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/app',
      publish: false,
      bump: '1.0.0',
      mirrorTo: mirrorDir,
    })

    const mirrored = unfolderify(mirrorDir)

    // New files should be present
    expect(mirrored).toHaveProperty('packages/app/package.json')
    expect(mirrored).toHaveProperty('packages/app/src/index.ts')

    // Old file should be gone (directory was wiped)
    expect(mirrored).not.toHaveProperty('packages/app/old-file.txt')
  })

  it('mirrors packages from multiple subject packages', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app1/package.json': pj('@test/app1', {
        dependencies: { '@test/shared': 'workspace:*' },
      }),
      'packages/app1/src/index.ts': `app1 source`,
      'packages/app1/dist/index.js': `app1 dist`,
      'packages/app2/package.json': pj('@test/app2', {
        dependencies: { '@test/shared': 'workspace:*' },
      }),
      'packages/app2/src/index.ts': `app2 source`,
      'packages/app2/dist/index.js': `app2 dist`,
      'packages/shared/package.json': pj('@test/shared'),
      'packages/shared/src/index.ts': `shared source`,
      'packages/shared/dist/index.js': `shared dist`,
    })

    initGitRepo(monorepoRoot)

    const mirrorDir = createTempDir('mirror-')

    await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: ['packages/app1', 'packages/app2'],
      publish: false,
      bump: '1.0.0',
      mirrorTo: mirrorDir,
    })

    const mirrored = unfolderify(mirrorDir)

    // All three packages should be mirrored
    expect(mirrored).toHaveProperty('packages/app1/package.json')
    expect(mirrored).toHaveProperty('packages/app1/src/index.ts')
    expect(mirrored).toHaveProperty('packages/app2/package.json')
    expect(mirrored).toHaveProperty('packages/app2/src/index.ts')
    expect(mirrored).toHaveProperty('packages/shared/package.json')
    expect(mirrored).toHaveProperty('packages/shared/src/index.ts')
  }, 30000)

  it('errors if there are untracked files', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app'),
      'packages/app/src/index.ts': `export const foo = 'foo';`,
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    // Initialize git and commit files
    initGitRepo(monorepoRoot)

    // Create an untracked file
    fs.writeFileSync(path.join(monorepoRoot, 'packages/app/leftover-temp.ts'), 'some temp content')

    const mirrorDir = createTempDir('mirror-')

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        publish: false,
        bump: '1.0.0',
        mirrorTo: mirrorDir,
      })
    ).rejects.toThrow(/Cannot mirror: found 1 untracked file\(s\).*leftover-temp\.ts/)
  })

  it('mirrors devDependencies in addition to production dependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app', {
        devDependencies: { '@test/build-tool': 'workspace:*' },
      }),
      'packages/app/dist/index.js': `export const foo = 'foo';`,
      'packages/build-tool/package.json': pj('@test/build-tool'),
      'packages/build-tool/dist/index.js': `export function build() { return 'building'; }`,
    })

    initGitRepo(monorepoRoot)

    const mirrorDir = createTempDir('mirror-')

    await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/app',
      publish: false,
      bump: '1.0.0',
      mirrorTo: mirrorDir,
    })

    const mirrored = unfolderify(mirrorDir)

    expect(mirrored).toEqual({
      'packages/app/package.json': {
        name: '@test/app',
        version: '0.9.9',
        type: 'module',
        main: 'dist/index.js',
        devDependencies: { '@test/build-tool': 'workspace:*' },
      },
      'packages/app/dist/index.js': `export const foo = 'foo';`,
      'packages/build-tool/package.json': {
        name: '@test/build-tool',
        version: '0.9.9',
        type: 'module',
        main: 'dist/index.js',
      },
      'packages/build-tool/dist/index.js': `export function build() { return 'building'; }`,
    })
  })

  it('mirrors transitive dependencies across prod and dev boundaries', async () => {
    // Test that:
    // - prod deps of devdeps are included (app --devDep--> build-tool --dep--> shared)
    // - devdeps of prod deps are included (app --dep--> lib --devDep--> test-util)
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app', {
        dependencies: { '@test/lib': 'workspace:*' },
        devDependencies: { '@test/build-tool': 'workspace:*' },
      }),
      'packages/app/dist/index.js': `export const app = 'app';`,
      'packages/lib/package.json': pj('@test/lib', {
        devDependencies: { '@test/test-util': 'workspace:*' },
      }),
      'packages/lib/dist/index.js': `export const lib = 'lib';`,
      'packages/build-tool/package.json': pj('@test/build-tool', {
        dependencies: { '@test/shared': 'workspace:*' },
      }),
      'packages/build-tool/dist/index.js': `export const build = 'build';`,
      'packages/shared/package.json': pj('@test/shared'),
      'packages/shared/dist/index.js': `export const shared = 'shared';`,
      'packages/test-util/package.json': pj('@test/test-util'),
      'packages/test-util/dist/index.js': `export const testUtil = 'test';`,
    })

    initGitRepo(monorepoRoot)

    const mirrorDir = createTempDir('mirror-')

    await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/app',
      publish: false,
      bump: '1.0.0',
      mirrorTo: mirrorDir,
    })

    const mirrored = unfolderify(mirrorDir)

    // All 5 packages should be mirrored
    expect(
      Object.keys(mirrored)
        .filter((k) => k.endsWith('package.json'))
        .sort()
    ).toEqual([
      'packages/app/package.json',
      'packages/build-tool/package.json',
      'packages/lib/package.json',
      'packages/shared/package.json',
      'packages/test-util/package.json',
    ])
  })
})
