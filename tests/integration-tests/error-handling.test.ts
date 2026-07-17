import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, expect } from 'vitest'
import { monocrate } from '../../src/index.js'
import { folderify } from '../testing/folderify.js'
import { unfolderify } from '../testing/unfolderify.js'
import { pj, runMonocrate } from '../testing/monocrate-teskit.js'

const name = 'root-package'

describe('error handling', () => {
  it('handles package with no dist directory (npm pack includes only package.json)', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app'),
      // No dist directory created - npm pack will still succeed with just package.json
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/app',
      monorepoRoot,
      publish: false,
      bump: '2.8.512',
    })

    const output = unfolderify(outputDir)
    // npm pack always includes package.json
    expect(output).toHaveProperty('package.json')
    // dist won't exist since it wasn't created
    expect(output).not.toHaveProperty('dist/index.js')
  })

  it('throws when package.json is invalid JSON syntax', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': 'invalid json {{{',
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        monorepoRoot,
        publish: false,
        bump: '2.8.512',
      })
    ).rejects.toThrow('Unexpected token')
  })

  it('throws when package.json fails schema validation', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      // Missing required 'name' field
      'packages/app/package.json': { version: '1.0.0', main: 'dist/index.js' },
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        monorepoRoot,
        publish: false,
        bump: '2.8.512',
      })
    ).rejects.toThrow('Invalid package.json')
  })

  it('throws when source package directory has no package.json', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      // No packages/app/package.json
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        publish: false,
        bump: '2.8.512',
      })
    ).rejects.toThrow(`Unrecognized package source dir: "${monorepoRoot}/packages/app"`)
  })
  it('throws when a package is located outside the monorepo root', async () => {
    // Create an external package outside the monorepo
    const externalPackage = folderify({
      'package.json': { name: '@test/external', version: '1.0.0', main: 'dist/index.js' },
      'dist/index.js': `export const external = 'external';`,
    })

    // Create monorepo with a symlink to the external package
    const monorepoRoot = folderify({
      'package.json': { workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app'),
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    // Create symlink to external package inside the monorepo
    fs.symlinkSync(externalPackage, path.join(monorepoRoot, 'packages/external'))

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: path.join(monorepoRoot, 'packages/app'),
        monorepoRoot,
        publish: false,
        bump: '2.4.6',
      })
    ).rejects.toThrow(/Package "@test\/external" is located at .* which is outside the monorepo root/)
  })

  it('throws when code imports an in-repo package not listed in dependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      // app imports @test/lib but does NOT list it in dependencies
      'packages/app/package.json': pj('@test/app'),
      'packages/app/dist/index.js': `import { greet } from '@test/lib';
export const message = greet();
`,
      // lib exists in the monorepo
      'packages/lib/package.json': pj('@test/lib'),
      'packages/lib/dist/index.js': `export function greet() { return 'Hello!' }`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        monorepoRoot,
        publish: false,
        bump: '2.8.512',
      })
    ).rejects.toThrow(
      'Import of in-repo package "@test/lib" found in packages/app/dist/index.js, ' +
        'but "@test/lib" is not listed in package.json dependencies'
    )
  })

  it('throws when code imports an in-repo package not listed in dependencies (via re-export)', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      // app re-exports from @test/lib but does NOT list it in dependencies
      'packages/app/package.json': pj('@test/app'),
      'packages/app/dist/index.js': `export { greet } from '@test/lib';
`,
      'packages/lib/package.json': pj('@test/lib'),
      'packages/lib/dist/index.js': `export function greet() { return 'Hello!' }`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        monorepoRoot,
        publish: false,
        bump: '2.8.512',
      })
    ).rejects.toThrow('Import of in-repo package "@test/lib" found in packages/app/dist/index.js')
  })

  it('throws when code imports an in-repo package not listed in dependencies (via dynamic import)', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      // app dynamically imports @test/lib but does NOT list it in dependencies
      'packages/app/package.json': pj('@test/app'),
      'packages/app/dist/index.js': `const lib = await import('@test/lib');
export const message = lib.greet();
`,
      'packages/lib/package.json': pj('@test/lib'),
      'packages/lib/dist/index.js': `export function greet() { return 'Hello!' }`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        monorepoRoot,
        publish: false,
        bump: '2.8.512',
      })
    ).rejects.toThrow('Import of in-repo package "@test/lib" found in packages/app/dist/index.js')
  })

  it('throws when workspaces field in package.json is malformed', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: 'not-an-array-or-object' },
      'packages/app/package.json': pj('@test/app'),
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        monorepoRoot,
        publish: false,
        bump: '2.8.512',
      })
    ).rejects.toThrow(
      `Invalid workspaces field in package.json: expected an array of strings (e.g., ["packages/*"]) or an object with a "packages" array (e.g., { packages: ["packages/*"] })`
    )
  })

  it('throws when pnpm-workspace.yaml is malformed', async () => {
    const monorepoRoot = folderify({
      'package.json': { name: 'pnpm-root' },
      'pnpm-workspace.yaml': `packages: "not-an-array"`,
      'packages/app/package.json': pj('@test/app'),
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        monorepoRoot,
        publish: false,
        bump: '2.8.512',
      })
    ).rejects.toThrow(
      `Invalid pnpm-workspace.yaml: expected a "packages" field with an array of strings (e.g., packages: ["packages/*"])`
    )
  })

  it('works with workspace object format (packages field)', async () => {
    const monorepoRoot = folderify({
      'package.json': { workspaces: { packages: ['packages/*'] } },
      'packages/app/package.json': pj('@test/app', { dependencies: { '@test/lib': 'workspace:*' } }),
      'packages/app/dist/index.js': `import { greet } from '@test/lib'; console.log(greet());`,
      'packages/lib/package.json': pj('@test/lib'),
      'packages/lib/dist/index.js': `export function greet() { return 'Hello!' }`,
    })
    const { stdout, output } = await runMonocrate(monorepoRoot, 'packages/app')

    expect(output['package.json']).toEqual({
      name: '@test/app',
      version: '2.8.512',
      type: 'module',
      main: 'dist/index.js',
    })

    expect(stdout.trim()).toBe('Hello!')
  })

  it('throws when workspace: dependency points to non-existent package', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app', { dependencies: { '@test/missing-lib': 'workspace:*' } }),
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        monorepoRoot,
        publish: false,
        bump: '1.0.0',
      })
    ).rejects.toThrow('Workspace dependency "@test/missing-lib" (workspace:*) in package "@test/app" was not found')
  })

  it('throws when workspace: dependency in transitive dep points to non-existent package', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app', { dependencies: { '@test/lib': 'workspace:*' } }),
      'packages/app/dist/index.js': `import { foo } from '@test/lib'; export const bar = foo;`,
      'packages/lib/package.json': pj('@test/lib', { dependencies: { '@test/missing': 'workspace:*' } }),
      'packages/lib/dist/index.js': `export const foo = 'foo';`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/app',
        monorepoRoot,
        publish: false,
        bump: '1.0.0',
      })
    ).rejects.toThrow('Workspace dependency "@test/missing" (workspace:*) in package "@test/lib" was not found')
  })
})
