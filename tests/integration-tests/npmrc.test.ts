import { afterAll, describe, it, expect } from 'vitest'
import { MonocrateTeskit, pj } from '../testing/monocrate-teskit.js'
import { folderify } from '../testing/folderify.js'

const name = 'root-package'

describe('.npmrc file handling', () => {
  const teskit = new MonocrateTeskit()
  afterAll(() => {
    teskit.shutdown()
  })
  it('does not include .npmrc in the published tarball even when present in package directory', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app'),
      'packages/app/dist/index.js': `console.log('Hello');`,
      'packages/app/.npmrc': 'registry=https://custom.registry.com',
    })

    expect((await teskit.run(monorepoRoot, 'packages/app')).output).not.toHaveProperty('.npmrc')
  })

  it('does not fail when .npmrc is not present', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('app'),
      'packages/app/dist/index.js': `export function whatever() {}`,
    })
    expect((await teskit.run(monorepoRoot, 'packages/app')).output).not.toHaveProperty('.npmrc')
  })

  it('does not include .npmrc from in-repo dependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('app', undefined, { dependencies: { lib: 'workspace:*' } }),
      'packages/app/dist/index.js': `import { greet } from 'lib'; console.log(greet());`,
      'packages/lib/package.json': pj('lib'),
      'packages/lib/dist/index.js': `export function greet() { return 'Hello!'; }`,
      'packages/lib/.npmrc': 'registry=https://lib.registry.com',
    })

    expect((await teskit.run(monorepoRoot, 'packages/app')).output).not.toHaveProperty('deps/lib/.npmrc')
  })
})
