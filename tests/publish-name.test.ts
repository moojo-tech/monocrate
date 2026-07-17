import * as path from 'node:path'
import { describe, expect, test, beforeAll, afterAll } from 'vitest'
import { monocrate } from '../src/monocrate.js'
import { folderify } from './testing/folderify.js'
import { pj } from './testing/monocrate-teskit.js'
import { unfolderify } from './testing/unfolderify.js'
import { VerdaccioTestkit } from './testing/verdaccio-testkit.js'

describe('publishName feature', () => {
  test('uses publishName when specified in monocrate config', async () => {
    const repoDir = folderify({
      'package.json': { name: 'root', workspaces: ['packages/*'] },
      'packages/my-package/package.json': pj('@workspace/my-package', '1.0.0', {
        monocrate: { publishName: '@published/my-package' },
      }),
      'packages/my-package/dist/index.js': 'export const foo = "bar";\n',
    })

    const { outputDir } = await monocrate({
      cwd: repoDir,
      pathToSubjectPackages: path.join(repoDir, 'packages/my-package'),
      monorepoRoot: repoDir,
      publish: false,
    })

    const output = unfolderify(outputDir)

    expect(output['package.json']).toMatchObject({
      name: '@published/my-package',
    })
    expect(output['package.json']).not.toHaveProperty('monocrate')
  }, 30000)

  test('uses original name when publishName is not specified', async () => {
    const repoDir = folderify({
      'package.json': { name: 'root', workspaces: ['packages/*'] },
      'packages/my-package/package.json': pj('@workspace/my-package', '1.0.0'),
      'packages/my-package/dist/index.js': 'export const foo = "bar";\n',
    })

    const { outputDir } = await monocrate({
      cwd: repoDir,
      pathToSubjectPackages: path.join(repoDir, 'packages/my-package'),
      monorepoRoot: repoDir,
      publish: false,
    })

    const output = unfolderify(outputDir)

    expect(output['package.json']).toMatchObject({
      name: '@workspace/my-package',
    })
  }, 30000)

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
      monocrate({
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
      monocrate({
        cwd: repoDir,
        pathToSubjectPackages: path.join(repoDir, 'packages/package-a'),
        monorepoRoot: repoDir,
        publish: false,
      })
    ).rejects.toThrow(
      'Publish name collision: both "package-a" and "package-b" would both be published as "@published/shared-name"'
    )
  })

  test('works with multiple packages having different publishNames', async () => {
    const repoDir = folderify({
      'package.json': { name: 'root', workspaces: ['packages/*'] },
      'packages/package-a/package.json': pj('@workspace/package-a', '1.0.0', {
        monocrate: { publishName: '@published/package-a' },
      }),
      'packages/package-a/dist/index.js': 'export const a = "a";\n',
      'packages/package-b/package.json': pj('@workspace/package-b', '1.0.0', {
        monocrate: { publishName: '@published/package-b' },
      }),
      'packages/package-b/dist/index.js': 'export const b = "b";\n',
    })

    const { outputDir: outputDir1 } = await monocrate({
      cwd: repoDir,
      pathToSubjectPackages: path.join(repoDir, 'packages/package-a'),
      monorepoRoot: repoDir,
      publish: false,
    })

    const { outputDir: outputDir2 } = await monocrate({
      cwd: repoDir,
      pathToSubjectPackages: path.join(repoDir, 'packages/package-b'),
      monorepoRoot: repoDir,
      publish: false,
    })

    const output1 = unfolderify(outputDir1)
    const output2 = unfolderify(outputDir2)

    expect(output1['package.json']).toMatchObject({
      name: '@published/package-a',
    })
    expect(output2['package.json']).toMatchObject({
      name: '@published/package-b',
    })
  }, 30000)

  test('monocrate field is stripped from output package.json', async () => {
    const repoDir = folderify({
      'package.json': { name: 'root', workspaces: ['packages/*'] },
      'packages/my-package/package.json': pj('@workspace/my-package', '1.0.0', {
        description: 'Test package',
        monocrate: { publishName: '@published/my-package' },
      }),
      'packages/my-package/dist/index.js': 'export const foo = "bar";\n',
    })

    const { outputDir } = await monocrate({
      cwd: repoDir,
      pathToSubjectPackages: path.join(repoDir, 'packages/my-package'),
      monorepoRoot: repoDir,
      publish: false,
    })

    const output = unfolderify(outputDir)

    expect(output['package.json']).toMatchObject({
      description: 'Test package',
    })
    expect(output['package.json']).not.toHaveProperty('monocrate')
  }, 30000)
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

    await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/mylib'),
      monorepoRoot,
      bump: '99.99.99',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    // Verify the package was published under the publish name (not the internal name)
    expect(verdaccio.runView('@published/mylib')).toMatchObject({
      name: '@published/mylib',
      version: '99.99.99',
    })

    // Verify the internal name was NOT published
    expect(() => verdaccio.runView('@workspace/mylib')).toThrow('404')

    // Verify the package can be installed and has correct functionality
    expect(
      verdaccio.runConumser(
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
    await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/lib-a'),
      monorepoRoot,
      bump: '1.0.0',
      publish: true,
      npmrcPath: verdaccio.npmrcPath(),
    })

    // Publish second package
    await monocrate({
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
      verdaccio.runConumser('@public/lib-a@1.0.0', `import { getName } from '@public/lib-a'; console.log(getName())`)
    ).toBe('lib-a')

    expect(
      verdaccio.runConumser('@public/lib-b@2.0.0', `import { getName } from '@public/lib-b'; console.log(getName())`)
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
    await monocrate({
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
      verdaccio.runConumser(
        '@public/app@1.0.0',
        `import { getAppMessage } from '@public/app'; console.log(getAppMessage())`
      )
    ).toBe('App: Shared message')
  }, 120000)
})
