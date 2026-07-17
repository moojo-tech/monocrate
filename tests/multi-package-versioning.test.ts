import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { monocrate } from '../src/index.js'
import { pj } from './testing/monocrate-teskit.js'
import { folderify } from './testing/folderify.js'
import { VerdaccioTestkit } from './testing/verdaccio-testkit.js'

describe('multi-package versioning', () => {
  const verdaccio = new VerdaccioTestkit()

  beforeAll(async () => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('npm_config_')) {
        delete process.env[key] // eslint-disable-line @typescript-eslint/no-dynamic-delete
      }
    }
    await verdaccio.start()
  }, 60000)

  afterAll(async () => {
    await verdaccio.shutdown()
  }, 10000)

  it('publishes multiple packages at the same version derived from max(currentVersions)', async () => {
    verdaccio.publishPackage('mpv-alpha', '1.0.0', `export const name = 'alpha'`)
    verdaccio.publishPackage('mpv-beta', '2.0.0', `export const name = 'beta'`)
    verdaccio.publishPackage('mpv-gamma', '3.0.0', `export const name = 'gamma'`)
    verdaccio.publishPackage('mpv-delta', '2.5.0', `export const name = 'delta'`)

    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/alpha/package.json': pj('mpv-alpha', '0.0.0'),
      'packages/alpha/index.js': `export const value = 'alpha-new'`,
      'packages/beta/package.json': pj('mpv-beta', '0.0.0'),
      'packages/beta/index.js': `export const value = 'beta-new'`,
      'packages/gamma/package.json': pj('mpv-gamma', '0.0.0'),
      'packages/gamma/index.js': `export const value = 'gamma-new'`,
      'packages/delta/package.json': pj('mpv-delta', '0.0.0'),
      'packages/delta/index.js': `export const value = 'delta-new'`,
    })

    const result = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: ['packages/alpha', 'packages/beta', 'packages/gamma', 'packages/delta'],
      monorepoRoot,
      bump: 'patch',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
      max: true,
    })

    expect(result.resolvedVersion).toBe('3.0.1')
    expect(verdaccio.runView('mpv-alpha')).toMatchObject({ version: '3.0.1' })
    expect(verdaccio.runView('mpv-beta')).toMatchObject({ version: '3.0.1' })
    expect(verdaccio.runView('mpv-gamma')).toMatchObject({ version: '3.0.1' })
    expect(verdaccio.runView('mpv-delta')).toMatchObject({ version: '3.0.1' })
    expect(result.summaries.map((s) => s.packageName)).toEqual(['mpv-alpha', 'mpv-beta', 'mpv-gamma', 'mpv-delta'])
    // With max=true, all summaries should have the same version
    expect(result.summaries.map((s) => s.version)).toEqual(['3.0.1', '3.0.1', '3.0.1', '3.0.1'])

    expect(verdaccio.runConumser('mpv-alpha@3.0.1', `import { value } from 'mpv-alpha'; console.log(value)`)).toBe(
      'alpha-new'
    )
    expect(verdaccio.runConumser('mpv-beta@3.0.1', `import { value } from 'mpv-beta'; console.log(value)`)).toBe(
      'beta-new'
    )
    expect(verdaccio.runConumser('mpv-gamma@3.0.1', `import { value } from 'mpv-gamma'; console.log(value)`)).toBe(
      'gamma-new'
    )
    expect(verdaccio.runConumser('mpv-delta@3.0.1', `import { value } from 'mpv-delta'; console.log(value)`)).toBe(
      'delta-new'
    )
  }, 120000)

  it('republishing a package bundles updated in-repo dependency code without publishing the dependency', async () => {
    const root = folderify({
      'package.json': { name: 'my-repo', workspaces: ['packages/*'] },
      'packages/app/package.json': pj('mpv-app', '0.0.0', { dependencies: { 'mpv-lib': 'workspace:*' } }),
      'packages/app/dist/index.js': `import { getMessage } from 'mpv-lib'; export const run = () => 'app:' + getMessage();`,
      'packages/lib/package.json': pj('mpv-lib', '0.0.0'),
      'packages/lib/dist/index.js': `export const getMessage = () => 'original';`,
    })

    // Step 1: Publish both app and lib
    await monocrate({
      cwd: root,
      pathToSubjectPackages: ['packages/app', 'packages/lib'],
      monorepoRoot: root,
      bump: '1.0.0',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    expect(verdaccio.runView('mpv-app')).toMatchObject({ version: '1.0.0' })
    expect(verdaccio.runView('mpv-lib')).toMatchObject({ version: '1.0.0' })
    expect(verdaccio.runConumser('mpv-app@1.0.0', `import { run } from 'mpv-app'; console.log(run())`)).toBe(
      'app:original'
    )

    // Step 2: Update lib's code
    fs.writeFileSync(path.join(root, 'packages/lib/dist/index.js'), `export const getMessage = () => 'updated'`)

    // Step 3: Publish only app (which depends on lib)
    await monocrate({
      cwd: root,
      pathToSubjectPackages: 'packages/app',
      monorepoRoot: root,
      bump: '2.0.0',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    // Step 4: Consuming app@2.0.0 should run the updated lib code
    expect(verdaccio.runConumser('mpv-app@2.0.0', `import { run } from 'mpv-app'; console.log(run())`)).toBe(
      'app:updated'
    )

    // Step 5: lib's version in registry should still be 1.0.0 (not republished)
    expect(verdaccio.runView('mpv-lib')).toMatchObject({ version: '1.0.0', versions: ['1.0.0'] })
  }, 120000)

  it('publishes multiple packages at individual versions when max=false', async () => {
    verdaccio.publishPackage('ipv-alpha', '1.0.0', `export const name = 'alpha'`)
    verdaccio.publishPackage('ipv-beta', '2.0.0', `export const name = 'beta'`)
    verdaccio.publishPackage('ipv-gamma', '3.0.0', `export const name = 'gamma'`)
    verdaccio.publishPackage('ipv-delta', '2.5.0', `export const name = 'delta'`)

    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/alpha/package.json': pj('ipv-alpha', '0.0.0'),
      'packages/alpha/index.js': `export const value = 'alpha-new'`,
      'packages/beta/package.json': pj('ipv-beta', '0.0.0'),
      'packages/beta/index.js': `export const value = 'beta-new'`,
      'packages/gamma/package.json': pj('ipv-gamma', '0.0.0'),
      'packages/gamma/index.js': `export const value = 'gamma-new'`,
      'packages/delta/package.json': pj('ipv-delta', '0.0.0'),
      'packages/delta/index.js': `export const value = 'delta-new'`,
    })

    const result = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: ['packages/alpha', 'packages/beta', 'packages/gamma', 'packages/delta'],
      monorepoRoot,
      bump: 'patch',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
      max: false,
    })

    // resolvedVersion is undefined when max=false - individual versions are in summaries
    expect(result.resolvedVersion).toBeUndefined()

    // Each summary should have its individual version
    expect(result.summaries).toEqual([
      expect.objectContaining({ packageName: 'ipv-alpha', version: '1.0.1' }),
      expect.objectContaining({ packageName: 'ipv-beta', version: '2.0.1' }),
      expect.objectContaining({ packageName: 'ipv-gamma', version: '3.0.1' }),
      expect.objectContaining({ packageName: 'ipv-delta', version: '2.5.1' }),
    ])

    // Verify each package is published at its individual version
    expect(verdaccio.runView('ipv-alpha')).toMatchObject({ version: '1.0.1' })
    expect(verdaccio.runView('ipv-beta')).toMatchObject({ version: '2.0.1' })
    expect(verdaccio.runView('ipv-gamma')).toMatchObject({ version: '3.0.1' })
    expect(verdaccio.runView('ipv-delta')).toMatchObject({ version: '2.5.1' })

    // Verify the packages work correctly at their individual versions
    expect(verdaccio.runConumser('ipv-alpha@1.0.1', `import { value } from 'ipv-alpha'; console.log(value)`)).toBe(
      'alpha-new'
    )
    expect(verdaccio.runConumser('ipv-beta@2.0.1', `import { value } from 'ipv-beta'; console.log(value)`)).toBe(
      'beta-new'
    )
    expect(verdaccio.runConumser('ipv-gamma@3.0.1', `import { value } from 'ipv-gamma'; console.log(value)`)).toBe(
      'gamma-new'
    )
    expect(verdaccio.runConumser('ipv-delta@2.5.1', `import { value } from 'ipv-delta'; console.log(value)`)).toBe(
      'delta-new'
    )
  }, 120000)

  it('selective publishing of dependency chain produces expected version history', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/a/package.json': pj('mpv-a', '0.0.0', { dependencies: { 'mpv-b': 'workspace:*' } }),
      'packages/a/index.js': `import { b } from 'mpv-b'; export const a = () => 'a:' + b();`,
      'packages/b/package.json': pj('mpv-b', '0.0.0', { dependencies: { 'mpv-c': 'workspace:*' } }),
      'packages/b/index.js': `import { c } from 'mpv-c'; export const b = () => 'b:' + c();`,
      'packages/c/package.json': pj('mpv-c', '0.0.0'),
      'packages/c/index.js': `export const c = () => 'c1';`,
    })
    const cPath = path.join(monorepoRoot, 'packages/c/index.js')

    // Publish A, B, C at 1.0.0
    await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: ['packages/a', 'packages/b', 'packages/c'],
      monorepoRoot,
      bump: '1.0.0',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
      max: true,
    })

    // Update C, publish A and C (major → 2.0.0)
    fs.writeFileSync(cPath, `export const c = () => 'c2';`)
    await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: ['packages/a', 'packages/c'],
      monorepoRoot,
      bump: 'major',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
      max: true,
    })

    // Update C, publish A and B (major → 3.0.0)
    fs.writeFileSync(cPath, `export const c = () => 'c3';`)
    await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: ['packages/a', 'packages/b'],
      monorepoRoot,
      bump: 'major',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
      max: true,
    })

    // Update C, publish B and C (major → 4.0.0)
    fs.writeFileSync(cPath, `export const c = () => 'c4';`)
    await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: ['packages/b', 'packages/c'],
      monorepoRoot,
      bump: 'major',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
      max: true,
    })

    expect(verdaccio.runView('mpv-a')).toMatchObject({ versions: ['1.0.0', '2.0.0', '3.0.0'] })
    expect(verdaccio.runView('mpv-b')).toMatchObject({ versions: ['1.0.0', '3.0.0', '4.0.0'] })
    expect(verdaccio.runView('mpv-c')).toMatchObject({ versions: ['1.0.0', '2.0.0', '4.0.0'] })
  }, 180000)
})
