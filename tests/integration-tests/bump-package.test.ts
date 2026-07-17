import { describe, it, expect } from 'vitest'
import { monocrate } from '../../src/index.js'
import { folderify } from '../testing/folderify.js'
import { unfolderify } from '../testing/unfolderify.js'

const name = 'root-package'

describe('--bump package option', () => {
  it('uses version from package.json when --bump package is specified', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '3.5.7',
        type: 'module',
        main: 'dist/index.js',
      },
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/app',
      publish: false,
      bump: 'package',
    })

    const output = unfolderify(outputDir)
    expect(output).toMatchObject({ 'package.json': { version: '3.5.7' } })
  })

  it('throws when package.json has no version field', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        type: 'module',
        main: 'dist/index.js',
      },
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        publish: false,
        bump: 'package',
      })
    ).rejects.toThrow('No version found in package.json for "@test/app"')
  })

  it('throws friendly error for prerelease versions', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0-beta.1',
        type: 'module',
        main: 'dist/index.js',
      },
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        publish: false,
        bump: 'package',
      })
    ).rejects.toThrow(
      'Prerelease versions are not supported with --bump package. Found "1.0.0-beta.1" in package.json for "@test/app". Please use a version in X.Y.Z format.'
    )
  })

  it('throws for invalid semver in package.json', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: 'not-a-version',
        type: 'module',
        main: 'dist/index.js',
      },
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        publish: false,
        bump: 'package',
      })
    ).rejects.toThrow(
      'Invalid version "not-a-version" in package.json for "@test/app". Expected a valid semver in X.Y.Z format.'
    )
  })

  it('uses maximum version across multiple packages with --bump package', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app1/package.json': {
        name: '@test/app1',
        version: '1.2.3',
        type: 'module',
        main: 'dist/index.js',
      },
      'packages/app1/dist/index.js': `export const app1 = 'app1';`,
      'packages/app2/package.json': {
        name: '@test/app2',
        version: '5.6.7',
        type: 'module',
        main: 'dist/index.js',
      },
      'packages/app2/dist/index.js': `export const app2 = 'app2';`,
    })

    const { resolvedVersion } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: ['packages/app1', 'packages/app2'],
      publish: false,
      bump: 'package',
      max: true,
    })

    expect(resolvedVersion).toBe('5.6.7')
  }, 30000)
})
