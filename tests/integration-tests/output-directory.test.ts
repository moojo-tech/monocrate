import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, expect } from 'vitest'
import { monocrate } from '../../src/index.js'
import { folderify } from '../testing/folderify.js'
import { unfolderify } from '../testing/unfolderify.js'
import { createTempDir, pj } from '../testing/monocrate-teskit.js'

const name = 'root-package'

describe('optional output directory', () => {
  it('creates a temp directory when packDestination is not provided', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app'),
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    const result = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/app'),
      monorepoRoot,
      publish: false,
      bump: '2.8.512',
    })

    // Verify a temp directory was created
    expect(result.packDestination).toContain('monocrate-')
    expect(fs.existsSync(result.packDestination)).toBe(true)

    // Verify the assembly was created there
    expect(unfolderify(result.packDestination)['package.json']).toEqual({
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
    const { packDestination } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, 'packages/app'),
      packDestination: specifiedPackDestination,
      monorepoRoot,
      publish: false,
      bump: '2.8.512',
    })

    expect(packDestination.startsWith(specifiedPackDestination)).toBe(true)
    expect(packDestination).toBe(path.join(specifiedPackDestination, 'packages/app'))
  })
})
