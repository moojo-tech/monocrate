import { afterAll, describe, it, expect } from 'vitest'
import { folderify } from '../testing/folderify.js'
import { unfolderify } from '../testing/unfolderify.js'
import { MonocrateTeskit } from '../testing/monocrate-teskit.js'

const name = 'root-package'

describe('package.json transformation', () => {
  const teskit = new MonocrateTeskit()
  afterAll(() => {
    teskit.shutdown()
  })
  it('preserves peerDependencies and optionalDependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: { lodash: '^4.17.21' },
        peerDependencies: { react: '>=17.0.0' },
        optionalDependencies: { fsevents: '^2.3.0' },
      },
      'packages/app/dist/index.js': `export const foo = 'foo';`,
    })

    const { outputDir } = await teskit.pack({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/app',
      publish: false,
      bump: '2.8.512',
    })

    const output = unfolderify(outputDir)
    const pkgJson = output['package.json'] as Record<string, unknown>

    expect(pkgJson.peerDependencies).toEqual({ react: '>=17.0.0' })
    expect(pkgJson.optionalDependencies).toEqual({ fsevents: '^2.3.0' })
    expect(pkgJson.dependencies).toEqual({ lodash: '^4.17.21' })
  })
})
