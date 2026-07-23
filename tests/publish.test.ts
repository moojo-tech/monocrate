import * as path from 'node:path'
import * as fs from 'node:fs'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { MonopushOptions } from '../src/index.js'
import { monopush } from '../src/index.js'
import { pj, createTempDir } from './testing/monopush-teskit.js'
import { folderify } from './testing/folderify.js'
import { VerdaccioTestkit } from './testing/verdaccio-testkit.js'

describe('npm login check', () => {
  it('fails early with actionable message when not logged in to npm, but skips check when publish is false', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/mylib/package.json': { name: '@test/mylib', version: '1.0.0', type: 'module', main: 'dist/index.js' },
      'packages/mylib/dist/index.js': `export function hello() { return 'Hello!'; }`,
    })

    // Create an npmrc that points to a fake registry without authentication
    const configDir = createTempDir('npm-no-auth-')
    const npmrcPath = path.join(configDir, '.npmrc')
    fs.writeFileSync(npmrcPath, 'registry=http://localhost:12345\n')

    // Should throw when publish is true
    await expect(
      monopush({
        cwd: monorepoRoot,
        pathToSubjectPackages: path.join(monorepoRoot, 'packages/mylib'),
        monorepoRoot,
        bump: '1.0.0',
        publish: true,
        npmrcPath,
      })
    ).rejects.toThrow('Not logged in to npm')

    // Should not throw when publish is false
    const result = await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/mylib'),
      monorepoRoot,
      bump: '1.0.0',
      publish: false,
      npmrcPath,
      max: true,
    })
    expect(result.resolvedVersion).toBe('1.0.0')
  }, 30000)
})

describe('npm publishing with Verdaccio', () => {
  const verdaccio = new VerdaccioTestkit()

  beforeAll(async () => {
    // Remove npm_config_* environment variables that yarn sets,
    // so npm uses the .npmrc file from the output directory
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

  it('publishes a simple package and it can be installed from the registry', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/mylib/package.json': { name: '@test/mylib', version: '1.0.0', type: 'module', main: 'dist/index.js' },
      'packages/mylib/dist/index.js': `export function hello() { return 'Hello from mylib!'; }`,
    })

    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/mylib'),
      monorepoRoot,
      bump: '99.99.99',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })
    expect(verdaccio.runView('@test/mylib')).toMatchObject({ name: '@test/mylib', version: '99.99.99' })
    expect(
      verdaccio.runConsumer(`@test/mylib@99.99.99`, `import { hello } from '@test/mylib'; console.log(hello())`)
    ).toBe('Hello from mylib!')
  }, 60000)

  it('dry-run creates a tarball that can be manually published and consumed', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/dry-lib/package.json': {
        name: '@test/dry-lib',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
      },
      'packages/dry-lib/dist/index.js': `export function hello() { return 'Hello from dry-run tarball!'; }`,
    })

    const result = await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/dry-lib'),
      monorepoRoot,
      bump: '77.77.77',
      publish: false,
      npmrcPath: verdaccio.npmrcPath(),
    })

    const summary = result.summaries.at(0)
    if (!summary) {
      throw new Error('Expected one package summary')
    }

    if (!summary.tarballPath) {
      throw new Error(`tarballPath is falsy`)
    }
    expect(summary.tarballPath).toBe(path.join(monorepoRoot, 'test-dry-lib-77.77.77.tgz'))
    verdaccio.publishTarball(summary.tarballPath)

    expect(verdaccio.runView('@test/dry-lib')).toMatchObject({ name: '@test/dry-lib', version: '77.77.77' })
    expect(
      verdaccio.runConsumer(`@test/dry-lib@77.77.77`, `import { hello } from '@test/dry-lib'; console.log(hello())`)
    ).toBe('Hello from dry-run tarball!')
  }, 60000)

  it('publishing leaves no tarball behind and reports no tarballPath in the summaries', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/mylib/package.json': pj('no-leftovers-lib', '1.0.0'),
      'packages/mylib/dist/index.js': `export const foo = 'foo'`,
    })

    const result = await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/mylib'),
      monorepoRoot,
      bump: '6.6.6',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    expect(verdaccio.runView('no-leftovers-lib')).toMatchObject({ version: '6.6.6' })
    expect(result.summaries.map((s) => s.tarballPath)).toEqual([undefined])
    expect(fs.readdirSync(monorepoRoot).filter((f) => f.endsWith('.tgz'))).toEqual([])
  }, 60000)

  it('publishes a simple non-scoped package', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/mylib/package.json': { name: 'mylib', version: '1.0.0', type: 'module', main: 'dist/index.js' },
      'packages/mylib/dist/index.js': `export function hello() { return 'Hello from mylib!'; }`,
    })

    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/mylib'),
      monorepoRoot,
      bump: '99.99.99',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })
    expect(verdaccio.runView('mylib')).toMatchObject({ name: 'mylib', version: '99.99.99' })
    expect(verdaccio.runConsumer(`mylib@99.99.99`, `import { hello } from 'mylib'; console.log(hello())`)).toBe(
      'Hello from mylib!'
    )
  }, 60000)
  it('publishes a package with in-repo dependency and rewritten imports work correctly', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: { '@test/lib': 'workspace:*' },
      },
      'packages/app/dist/index.js': `import { greet } from '@test/lib'; export function sayHello(name) { return greet(name); }`,
      'packages/lib/package.json': { name: '@test/lib', version: '1.0.0', type: 'module', main: 'dist/index.js' },
      'packages/lib/dist/index.js': `export function greet(name) { return 'Hello, ' + name + '!'; }`,
    })

    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/app'),
      monorepoRoot,
      bump: '88.88.88',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })
    expect(verdaccio.runView('@test/app')).toMatchObject({ name: '@test/app', version: '88.88.88' })
    expect(
      verdaccio.runConsumer(
        '@test/app@88.88.88',
        `import { sayHello } from '@test/app'; console.log(sayHello('World'))`
      )
    ).toBe('Hello, World!')
  }, 60000)

  it('publishes a package that uses computed dynamic import of an in-repo dependency', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/dynamic-app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: { '@test/dynamic-lib': 'workspace:*' },
      },
      'packages/app/dist/index.js': `export async function run(name) {
  const scope = '@test'
  const pkg = 'dynamic-lib'
  const lib = await import(scope + '/' + pkg)
  return lib.greet(name)
}`,
      'packages/lib/package.json': {
        name: '@test/dynamic-lib',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
      },
      'packages/lib/dist/index.js': `export function greet(name) { return 'Hello, ' + name + '!'; }`,
    })

    await expect(
      monopush({
        cwd: monorepoRoot,
        pathToSubjectPackages: path.join(monorepoRoot, 'packages/app'),
        monorepoRoot,
        bump: '1.2.3',
        publish: true,
        npmrcPath: verdaccio.npmrcPath(),
        dynamicImportsPolicy: 'reject',
      })
    ).rejects.toThrow('A dynamic import was found in packages/app/dist/index.js')
  }, 60000)

  it('refuses to publish a CJS package', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/my-app-foo/package.json': {
        name: 'my-app-foo',
        version: '1.0.0',
        main: 'dist/index.js',
        dependencies: {},
      },
      'packages/my-app-foo/dist/index.js': `const { greet } = require('@test/cjs-lib'); module.exports = greet`,
    })

    await expect(
      monopush({
        cwd: monorepoRoot,
        pathToSubjectPackages: path.join(monorepoRoot, 'packages/my-app-foo'),
        monorepoRoot,
        bump: '5.6.7',
        publish: true,
        npmrcPath: verdaccio.npmrcPath(),
      })
    ).rejects.toThrow('Cannot process a .js file in a CommonJS package: packages/my-app-foo/dist/index.js')
  }, 60000)

  it('includes deps in tarball when subject has files field and in-repo dependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/files-app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        files: ['dist'],
        dependencies: { '@test/files-lib': 'workspace:*' },
      },
      'packages/app/dist/index.js': `import { greet } from '@test/files-lib'; export function sayHello(name) { return greet(name); }`,
      'packages/lib/package.json': { name: '@test/files-lib', version: '1.0.0', type: 'module', main: 'dist/index.js' },
      'packages/lib/dist/index.js': `export function greet(name) { return 'Hello, ' + name + '!'; }`,
    })

    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/app'),
      monorepoRoot,
      bump: '2.0.0',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    // deps/ must be included in the tarball for the rewritten imports to work
    expect(
      verdaccio.runConsumer(
        '@test/files-app@2.0.0',
        `import { sayHello } from '@test/files-app'; console.log(sayHello('World'))`
      )
    ).toBe('Hello, World!')
  }, 60000)

  it('publishes multiple versions of the same package', async () => {
    const pkgName = `foo`
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/foo/package.json': pj(pkgName, '1.0.0'),
      'packages/foo/dist/index.js': `export const foo = 'FOO'`,
    })

    expect(
      await monopush({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/foo',
        monorepoRoot,
        bump: '1.4.1',
        publish: true,
        npmrcPath: verdaccio.npmrcPath(),
        max: true,
      })
    ).toMatchObject({ resolvedVersion: '1.4.1' })
    expect(verdaccio.runView(pkgName)).toMatchObject({ version: '1.4.1' })

    expect(
      await monopush({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/foo',
        monorepoRoot,
        bump: '2.7.1',
        publish: true,
        npmrcPath: verdaccio.npmrcPath(),
        max: true,
      })
    ).toMatchObject({ resolvedVersion: '2.7.1' })
    expect(verdaccio.runView(pkgName)).toMatchObject({ version: '2.7.1' })

    expect(
      await monopush({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/foo',
        monorepoRoot,
        bump: '3.1.4',
        publish: true,
        npmrcPath: verdaccio.npmrcPath(),
        max: true,
      })
    ).toMatchObject({ resolvedVersion: '3.1.4' })

    // Verify all versions are available
    expect(verdaccio.runView(pkgName)).toMatchObject({ version: '3.1.4', versions: ['1.4.1', '2.7.1', '3.1.4'] })
  }, 120000)

  it('merges third-party dependencies from main package and in-repo deps', async () => {
    // Publish two libs directly to Verdaccio to serve as "third-party" deps.
    verdaccio.publishPackage(
      'naturals',
      '3.9.27',
      'export const divisorsOf = n => Array.from({ length: n }, (_, i) => i+1).filter(x => n % x === 0)'
    )
    verdaccio.publishPackage('is-even', '2.4.8', 'export default function isEven(n) { return n % 2 === 0; }')

    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/foo/package.json': pj('foo', '1.0.0', { dependencies: { boo: 'workspace:*', naturals: '^3.0.0' } }),
      'packages/foo/dist/index.js': [
        `import { classify } from 'boo'`,
        `import { divisorsOf } from 'naturals'`,
        `export function analyze(n) { return n + ' is ' + classify(n) + ". Divisors: " + divisorsOf(n).join(', ') }`,
      ].join('\n'),
      'packages/boo/package.json': pj('boo', '1.0.0', { dependencies: { 'is-even': '~2.4.0' } }),
      'packages/boo/dist/index.js': `import isEven from 'is-even'; export function classify(n) { return isEven(n) ? 'even' : 'odd'; }`,
    })

    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/foo',
      monorepoRoot,
      bump: '77.77.77',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    expect(verdaccio.runView('foo')).toMatchObject({
      name: 'foo',
      version: '77.77.77',
      dependencies: { 'is-even': '~2.4.0', naturals: '^3.0.0' },
    })

    expect(verdaccio.runConsumer('foo', `import { analyze } from 'foo'`, `console.log(analyze(24))`)).toBe(
      '24 is even. Divisors: 1, 2, 3, 4, 6, 8, 12, 24'
    )
  }, 90000)

  it('published version increments as dictated by the "bump" value', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/mypkg/package.json': pj('mypkg', '0.0.0'),
      'packages/mypkg/dist/index.js': `export const whatever = () => {}`,
    })

    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/mypkg'),
      monorepoRoot,
      bump: '2.4.0',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/mypkg'),
      monorepoRoot,
      bump: 'minor',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })
    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/mypkg'),
      monorepoRoot,
      bump: 'major',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })
    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/mypkg'),
      monorepoRoot,
      bump: '4.1.8',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })
    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/mypkg'),
      monorepoRoot,
      bump: 'patch',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })
    expect(verdaccio.runView('mypkg')).toMatchObject({
      version: '4.1.9',
      versions: ['2.4.0', '2.5.0', '3.0.0', '4.1.8', '4.1.9'],
    })
  }, 120000)

  it('verify the packaged code changes indeed changes with each published version', async () => {
    const monorepoRoot = folderify({
      'package.json': { name: 'my-repo', workspaces: ['packages/*'] },
      'packages/calculator/package.json': pj('calculator', '1.0.0'),
      'packages/calculator/dist/index.js': `//`,
    })
    const indexPath = path.join(monorepoRoot, 'packages/calculator/dist/index.js')

    const opts: MonopushOptions = {
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/calculator',
      monorepoRoot,
      bump: 'major',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    }

    // Version 1.0.0: addition
    fs.writeFileSync(indexPath, `export function compute(a, b) { return a + b; }`)
    await monopush(opts)

    // Version 2.0.0: multiplication
    fs.writeFileSync(indexPath, `export function compute(a, b) { return a * b; }`)
    await monopush(opts)

    // Version 3.0.0: power
    fs.writeFileSync(indexPath, `export function compute(a, b) { return Math.pow(a, b); }`)
    await monopush(opts)

    expect(
      verdaccio.runConsumer('calculator@1.0.0', `import { compute } from 'calculator'; console.log(compute(3, 4))`)
    ).toBe('7')
    expect(
      verdaccio.runConsumer('calculator@2.0.0', `import { compute } from 'calculator'; console.log(compute(3, 4))`)
    ).toBe('12')
    expect(
      verdaccio.runConsumer('calculator@3.0.0', `import { compute } from 'calculator'; console.log(compute(3, 4))`)
    ).toBe('81')
  }, 120000)

  it('uses two-phase publishing for multi-package: publishes with pending tag first, then moves latest tag', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/twophase-a/package.json': pj('twophase-a', '1.0.0'),
      'packages/twophase-a/dist/index.js': `export const a = 'A'`,
      'packages/twophase-b/package.json': pj('twophase-b', '1.0.0'),
      'packages/twophase-b/dist/index.js': `export const b = 'B'`,
    })

    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: ['packages/twophase-a', 'packages/twophase-b'],
      monorepoRoot,
      bump: '1.0.0',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    const viewA = verdaccio.runView('twophase-a')
    const viewB = verdaccio.runView('twophase-b')

    // Both 'pending' and 'latest' tags should point to the published version
    expect(viewA['dist-tags']).toMatchObject({ pending: '1.0.0', latest: '1.0.0' })
    expect(viewB['dist-tags']).toMatchObject({ pending: '1.0.0', latest: '1.0.0' })
  }, 60000)

  it('publishes a single package directly to latest, skipping the pending phase', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/onephase/package.json': pj('onephase', '1.0.0'),
      'packages/onephase/dist/index.js': `export const a = 'A'`,
    })

    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/onephase',
      monorepoRoot,
      bump: '1.0.0',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    // Only 'latest' should exist - no 'pending' tag is ever created
    expect(verdaccio.runView('onephase')['dist-tags']).toEqual({ latest: '1.0.0' })
  }, 60000)

  it('yarn v1 can install a package with in-repo dependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/yarn-app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: { '@test/yarn-lib': 'workspace:*' },
      },
      'packages/app/dist/index.js': `import { greet } from '@test/yarn-lib'; export function sayHello(name) { return greet(name); }`,
      'packages/lib/package.json': { name: '@test/yarn-lib', version: '1.0.0', type: 'module', main: 'dist/index.js' },
      'packages/lib/dist/index.js': `export function greet(name) { return 'Hello, ' + name + '!'; }`,
    })

    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/app'),
      monorepoRoot,
      bump: '11.11.11',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    expect(
      verdaccio.runConsumer(
        '@test/yarn-app@11.11.11',
        { manager: 'yarn@v1' },
        `import { sayHello } from '@test/yarn-app'; console.log(sayHello('World'))`
      )
    ).toBe('Hello, World!')
  }, 90000)

  it('yarn berry can install a simple published package', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/mylib/package.json': {
        name: '@test/yarn-berry-simple',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
      },
      'packages/mylib/dist/index.js': `export function hello() { return 'Hello from yarn berry!'; }`,
    })

    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/mylib'),
      monorepoRoot,
      bump: '12.12.12',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    expect(
      verdaccio.runConsumer(
        '@test/yarn-berry-simple@12.12.12',
        { manager: 'yarn@berry' },
        `import { hello } from '@test/yarn-berry-simple'; console.log(hello())`
      )
    ).toBe('Hello from yarn berry!')
  }, 90000)

  it('yarn berry can install a package with in-repo dependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/yarn-berry-app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: { '@test/yarn-berry-lib': 'workspace:*' },
      },
      'packages/app/dist/index.js': `import { greet } from '@test/yarn-berry-lib'; export function sayHello(name) { return greet(name); }`,
      'packages/lib/package.json': {
        name: '@test/yarn-berry-lib',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
      },
      'packages/lib/dist/index.js': `export function greet(name) { return 'Hello, ' + name + '!'; }`,
    })

    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/app'),
      monorepoRoot,
      bump: '14.14.14',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    expect(
      verdaccio.runConsumer(
        '@test/yarn-berry-app@14.14.14',
        { manager: 'yarn@berry' },
        `import { sayHello } from '@test/yarn-berry-app'; console.log(sayHello('World'))`
      )
    ).toBe('Hello, World!')
  }, 90000)

  it('pnpm can install a package with in-repo dependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/pnpm-app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: { '@test/pnpm-lib': 'workspace:*' },
      },
      'packages/app/dist/index.js': `import { greet } from '@test/pnpm-lib'; export function sayHello(name) { return greet(name); }`,
      'packages/lib/package.json': {
        name: '@test/pnpm-lib',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
      },
      'packages/lib/dist/index.js': `export function greet(name) { return 'Hello, ' + name + '!'; }`,
    })

    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/app'),
      monorepoRoot,
      bump: '13.13.13',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    expect(
      verdaccio.runConsumer(
        '@test/pnpm-app@13.13.13',
        { manager: 'pnpm' },
        `import { sayHello } from '@test/pnpm-app'; console.log(sayHello('World'))`
      )
    ).toBe('Hello, World!')
  }, 90000)

  it('bun can install a simple published package', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/mylib/package.json': {
        name: '@test/bun-simple',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
      },
      'packages/mylib/dist/index.js': `export function hello() { return 'Hello from bun!'; }`,
    })

    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/mylib'),
      monorepoRoot,
      bump: '15.15.15',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    expect(
      verdaccio.runConsumer(
        '@test/bun-simple@15.15.15',
        { manager: 'bun' },
        `import { hello } from '@test/bun-simple'; console.log(hello())`
      )
    ).toBe('Hello from bun!')
  }, 90000)

  it('bun can install a package with in-repo dependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/bun-app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: { '@test/bun-lib': 'workspace:*' },
      },
      'packages/app/dist/index.js': `import { greet } from '@test/bun-lib'; export function sayHello(name) { return greet(name); }`,
      'packages/lib/package.json': {
        name: '@test/bun-lib',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
      },
      'packages/lib/dist/index.js': `export function greet(name) { return 'Hello, ' + name + '!'; }`,
    })

    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/app'),
      monorepoRoot,
      bump: '16.16.16',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    expect(
      verdaccio.runConsumer(
        '@test/bun-app@16.16.16',
        { manager: 'bun' },
        `import { sayHello } from '@test/bun-app'; console.log(sayHello('World'))`
      )
    ).toBe('Hello, World!')
  }, 90000)

  it('does not move latest tag when second package fails to publish', async () => {
    // Pre-publish both packages so they have existing latest tags
    verdaccio.publishPackage('atomic-a', '1.0.0', `export const a = 'v1'`)
    verdaccio.publishPackage('atomic-b', '8.7.6', `export const b = 'pre-published'`)

    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/atomic-a/package.json': pj('atomic-a', '1.0.0'),
      'packages/atomic-a/dist/index.js': `export const a = 'A'`,
      'packages/atomic-b/package.json': pj('atomic-b', '1.0.0'),
      'packages/atomic-b/dist/index.js': `export const b = 'B'`,
    })

    // Try to publish both packages - atomic-b should fail because 8.7.6 already exists
    await expect(
      monopush({
        cwd: monorepoRoot,
        pathToSubjectPackages: ['packages/atomic-a', 'packages/atomic-b'],
        monorepoRoot,
        bump: '8.7.6',
        publish: true,
        npmrcPath: verdaccio.npmrcPath(),
      })
    ).rejects.toThrow()

    // atomic-a was published with pending tag but latest should NOT have been moved (still 1.0.0)
    const viewA = verdaccio.runView('atomic-a')
    expect(viewA['dist-tags'].pending).toBe('8.7.6')
    expect(viewA['dist-tags'].latest).toBe('1.0.0')

    // atomic-b should still have its pre-published version as latest
    const viewB = verdaccio.runView('atomic-b')
    expect(viewB['dist-tags'].latest).toBe('8.7.6')
  }, 90000)
})
