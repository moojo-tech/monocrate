import * as path from 'node:path'
import { describe, expect, test, beforeAll, afterAll } from 'vitest'
import { monopush } from '../src/monopush.js'
import { folderify } from './testing/folderify.js'
import { pj } from './testing/monocrate-teskit.js'
import { VerdaccioTestkit } from './testing/verdaccio-testkit.js'

describe('publishName feature', () => {
  test('throws error when publishName conflicts with existing package name', async () => {
    const repoDir = folderify({
      'package.json': { name: 'root', workspaces: ['packages/*'] },
      'packages/package-a/package.json': pj('package-a', '1.0.0'),
      'packages/package-a/dist/index.js': 'export const a = "a";\n',
      'packages/package-b/package.json': pj('package-b', '1.0.0', {
        monocrate: { publishName: 'package-a' },
      }),
      'packages/package-b/dist/index.js': 'export const b = "b";\n',
    })

    await expect(
      monopush({
        cwd: repoDir,
        pathToSubjectPackages: path.join(repoDir, 'packages/package-b'),
        monorepoRoot: repoDir,
        publish: false,
      })
    ).rejects.toThrow('Publish name collision: both "package-a" and "package-b" would both be published as "package-a"')
  })

  test('throws error when two packages have the same publishName', async () => {
    const repoDir = folderify({
      'package.json': { name: 'root', workspaces: ['packages/*'] },
      'packages/package-a/package.json': pj('package-a', '1.0.0', {
        monocrate: { publishName: '@published/shared-name' },
      }),
      'packages/package-a/dist/index.js': 'export const a = "a";\n',
      'packages/package-b/package.json': pj('package-b', '1.0.0', {
        monocrate: { publishName: '@published/shared-name' },
      }),
      'packages/package-b/dist/index.js': 'export const b = "b";\n',
    })

    await expect(
      monopush({
        cwd: repoDir,
        pathToSubjectPackages: path.join(repoDir, 'packages/package-a'),
        monorepoRoot: repoDir,
        publish: false,
      })
    ).rejects.toThrow(
      'Publish name collision: both "package-a" and "package-b" would both be published as "@published/shared-name"'
    )
  })
})

describe('publishName integration with npm registry', () => {
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

  test('publishes package with custom name to npm registry', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/mylib/package.json': pj('@workspace/mylib', '1.0.0', {
        monocrate: { publishName: '@published/mylib' },
      }),
      'packages/mylib/dist/index.js': `export function getPublished() { return 'Published under custom name!'; }`,
    })

    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/mylib'),
      monorepoRoot,
      bump: '99.99.99',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    // Verify the package was published under the publish name (not the internal name)
    const viewResult = verdaccio.runView('@published/mylib')
    expect(viewResult).toMatchObject({
      name: '@published/mylib',
      version: '99.99.99',
    })

    // Verify the monocrate config field was stripped from the published package.json
    expect(viewResult).not.toHaveProperty('monocrate')

    // Verify the internal name was NOT published
    expect(() => verdaccio.runView('@workspace/mylib')).toThrow('404')

    // Verify the package can be installed and has correct functionality
    expect(
      verdaccio.runConsumer(
        '@published/mylib@99.99.99',
        `import { getPublished } from '@published/mylib'; console.log(getPublished())`
      )
    ).toBe('Published under custom name!')
  }, 60000)

  test('publishes multiple packages with different custom names to npm registry', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/lib-a/package.json': pj('@internal/lib-a', '1.0.0', {
        monocrate: { publishName: '@public/lib-a' },
        main: 'dist/index.js',
      }),
      'packages/lib-a/dist/index.js': `export const getName = () => 'lib-a'`,
      'packages/lib-b/package.json': pj('@internal/lib-b', '1.0.0', {
        monocrate: { publishName: '@public/lib-b' },
        main: 'dist/index.js',
      }),
      'packages/lib-b/dist/index.js': `export const getName = () => 'lib-b'`,
    })

    // Publish first package
    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/lib-a'),
      monorepoRoot,
      bump: '1.0.0',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    // Publish second package
    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/lib-b'),
      monorepoRoot,
      bump: '2.0.0',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    // Verify both packages were published under their respective custom names
    expect(verdaccio.runView('@public/lib-a')).toMatchObject({
      name: '@public/lib-a',
      version: '1.0.0',
    })

    expect(verdaccio.runView('@public/lib-b')).toMatchObject({
      name: '@public/lib-b',
      version: '2.0.0',
    })

    // Verify both can be installed and used
    expect(
      verdaccio.runConsumer('@public/lib-a@1.0.0', `import { getName } from '@public/lib-a'; console.log(getName())`)
    ).toBe('lib-a')

    expect(
      verdaccio.runConsumer('@public/lib-b@2.0.0', `import { getName } from '@public/lib-b'; console.log(getName())`)
    ).toBe('lib-b')
  }, 120000)

  test('publishes package with custom name and in-repo dependency', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/shared/package.json': pj('@internal/shared', '1.0.0', {
        monocrate: { publishName: '@public/shared' },
      }),
      'packages/shared/dist/index.js': `export const getMessage = () => 'Shared message'`,
      'packages/app/package.json': pj('@internal/app', '1.0.0', {
        monocrate: { publishName: '@public/app' },
        dependencies: { '@internal/shared': 'workspace:*' },
      }),
      'packages/app/dist/index.js': `import { getMessage } from '@internal/shared'; export const getAppMessage = () => 'App: ' + getMessage()`,
    })

    // Publish both packages together
    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: [path.join(monorepoRoot, 'packages/shared'), path.join(monorepoRoot, 'packages/app')],
      monorepoRoot,
      bump: '1.0.0',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    // Verify both packages were published under their custom names
    expect(verdaccio.runView('@public/shared')).toMatchObject({
      name: '@public/shared',
      version: '1.0.0',
    })

    expect(verdaccio.runView('@public/app')).toMatchObject({
      name: '@public/app',
      version: '1.0.0',
    })

    // Verify the app package correctly resolves its dependencies
    expect(
      verdaccio.runConsumer(
        '@public/app@1.0.0',
        `import { getAppMessage } from '@public/app'; console.log(getAppMessage())`
      )
    ).toBe('App: Shared message')
  }, 120000)
})
