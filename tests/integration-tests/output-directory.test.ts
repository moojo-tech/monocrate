import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterAll, describe, it, expect } from 'vitest'
import { monocrate } from '../../src/index.js'
import { folderify } from '../testing/folderify.js'
import { unfolderify } from '../testing/unfolderify.js'
import { createTempDir, MonocreateTeskit, pj } from '../testing/monocrate-teskit.js'

const name = 'root-package'

describe('optional output directory', () => {
  const teskit = new MonocreateTeskit()
  afterAll(() => {
    teskit.shutdown()
  })
  it('creates a temp directory when outputDir is not provided', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app'),
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    const result = await teskit.monocrateFoo({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/app'),
      monorepoRoot,
      publish: false,
      bump: '2.8.512',
    })

    // Verify a temp directory was created
    expect(result.outputDir).toContain('monocrate-')
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

    const specifiedPackDestination = createTempDir('monocrate-explicit-output-')
    await monocrate({
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
})
