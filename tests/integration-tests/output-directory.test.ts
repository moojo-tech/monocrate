import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, describe, it, expect } from 'vitest'
import { monopush } from '../../src/index.js'
import { folderify } from '../testing/folderify.js'
import { unfolderify } from '../testing/unfolderify.js'
import { MonopushTeskit, pj } from '../testing/monopush-teskit.js'

const name = 'root-package'

describe('optional output directory', () => {
  const teskit = new MonopushTeskit()
  afterAll(() => {
    teskit.shutdown()
  })
  it('creates a temp directory when packDestination is not provided', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app'),
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    const result = await teskit.pack({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/app'),
      monorepoRoot,
      publish: false,
      bump: '2.8.512',
    })

    // Verify a temp directory was created
    expect(result.outputDir).toContain('monopush-')
    expect(fs.existsSync(result.outputDir)).toBe(true)

    // Verify the assembly was created there
    expect(unfolderify(result.outputDir)['package.json']).toEqual({
      name: '@test/app',
      version: '2.8.512',
      type: 'module',
      main: 'dist/index.js',
    })
  })

  it('uses provided packDestination when specified', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app'),
      'packages/app/dist/index.js': `export const foo = 'foo';
`,
    })

    const specifiedPackDestination = teskit.createTempDir()
    await monopush({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/app'),
      packDestination: specifiedPackDestination,
      monorepoRoot,
      publish: false,
      bump: '2.8.512',
    })

    const dir = unfolderify(specifiedPackDestination)
    expect(Object.keys(dir)).toEqual(['test-app-2.8.512.tgz'])
  })

  it('resolves a relative packDestination against cwd', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app-foo/package.json': pj('@acme/app-foo'),
      'packages/app-foo/dist/index.js': `export const foo = 'foo';`,
    })

    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), '111'))

    const { summaries } = await monopush({
      cwd,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/app-foo'),
      packDestination: 'THIS_IS_THE_DIR',
      monorepoRoot,
      publish: false,
      bump: '2.8.512',
    })
    expect(fs.readdirSync(path.join(cwd, 'THIS_IS_THE_DIR'))).toEqual(['acme-app-foo-2.8.512.tgz'])
    expect(summaries).toMatchObject([{ tarballPath: path.join(cwd, 'THIS_IS_THE_DIR', 'acme-app-foo-2.8.512.tgz') }])
  })
})
