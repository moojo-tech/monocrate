import { describe, it, expect } from 'vitest'
import { pj, runMonocrate } from '../testing/monocrate-teskit.js'
import { folderify } from '../testing/folderify.js'

const name = 'root-package'

describe('.npmrc file handling', () => {
  it('includes .npmrc file when present in package directory', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app'),
      'packages/app/dist/index.js': `console.log('Hello');`,
      'packages/app/.npmrc': 'registry=https://custom.registry.com',
    })

    expect(await runMonocrate(monorepoRoot, 'packages/app')).toMatchObject({
      output: { '.npmrc': 'registry=https://custom.registry.com' },
    })
  })

  it('does not fail when .npmrc is not present', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('app'),
      'packages/app/dist/index.js': `export function whatever() {}`,
    })
    expect((await runMonocrate(monorepoRoot, 'packages/app')).output).not.toHaveProperty('.npmrc')
  })

  it('includes .npmrc from in-repo dependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('app', undefined, { dependencies: { lib: 'workspace:*' } }),
      'packages/app/dist/index.js': `import { greet } from '@test/lib'; console.log(greet());`,
      'packages/lib/package.json': pj('lib'),
      'packages/lib/dist/index.js': `export function greet() { return 'Hello!'; }`,
      'packages/lib/.npmrc': 'registry=https://lib.registry.com',
    })

    expect(await runMonocrate(monorepoRoot, 'packages/app')).toMatchObject({
      output: {
        'deps/lib/.npmrc': 'registry=https://lib.registry.com',
      },
    })
  })
})
