import { afterAll, describe, it, expect } from 'vitest'
import { folderify } from '../testing/folderify.js'
import { MonocrateTeskit } from '../testing/monocrate-teskit.js'

const name = 'root-package'

function findEmbeddedDepsDir(output: Record<string, unknown>): string {
  const depEntry = Object.keys(output).find((at) => at.startsWith('deps-'))
  if (!depEntry) {
    throw new Error('Expected at least one embedded dependency entry under deps-<uuid>')
  }
  const firstSegment = depEntry.split('/').at(0)
  if (!firstSegment) {
    throw new Error(`Expected a valid embedded dependency entry, got: ${depEntry}`)
  }
  return firstSegment
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readOutputObject(output: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = output[key]
  if (!isRecord(value)) {
    throw new Error(`Expected "${key}" to be an object in test output`)
  }
  return value
}

describe('files property support', () => {
  const teskit = new MonocrateTeskit()
  afterAll(() => {
    teskit.shutdown()
  })
  it('uses files property for in-repo dependencies too', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: { '@test/lib': 'workspace:*' },
      },
      'packages/app/dist/index.js': `import { greet } from '@test/lib'; console.log(greet());`,
      'packages/lib/package.json': {
        name: '@test/lib',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        files: ['dist', 'extra'],
      },
      'packages/lib/dist/index.js': `export function greet() { return 'Hello!'; }`,
      'packages/lib/extra/utils.js': `export const helper = 'helper';`,
      'packages/lib/src/index.ts': `// Source should not be copied`,
    })

    const { stdout, output } = await teskit.run(monorepoRoot, 'packages/app', { bump: '3.9.27' })
    const depsDir = findEmbeddedDepsDir(output)

    expect(output).toMatchObject({
      'dist/index.js': `import { greet } from '@test/lib'; console.log(greet());`,
      'package.json': {
        main: 'dist/index.js',
        name: '@test/app',
        type: 'module',
        version: '3.9.27',
        dependencies: {
          '@test/lib': `file:./${depsDir}/@test/lib`,
        },
      },
      [`${depsDir}/@test/lib/dist/index.js`]: `export function greet() { return 'Hello!'; }`,
      [`${depsDir}/@test/lib/extra/utils.js`]: `export const helper = 'helper';`,
      [`${depsDir}/@test/lib/package.json`]: {
        files: ['dist', 'extra'],
        main: 'dist/index.js',
        name: '@test/lib',
        type: 'module',
        version: '1.0.0',
      },
    })
    const pkgJson = readOutputObject(output, 'package.json')
    expect(pkgJson).not.toHaveProperty('bundledDependencies')
    expect(stdout.trim()).toBe('Hello!')
  })

  it('falls back to dist dir when files property is not specified', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        // No files property
      },
      'packages/app/dist/index.js': `console.log('Hello');
`,
      'packages/app/dist/utils.js': `export const x = 1;
`,
    })

    const { stdout, output } = await teskit.run(monorepoRoot, 'packages/app')

    expect(output).toHaveProperty('dist/index.js')
    expect(output).toHaveProperty('dist/utils.js')
    expect(stdout.trim()).toBe('Hello')
  })

  it('handles non-standard output directory specified in main', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'lib/index.js',
        files: ['lib'],
      },
      'packages/app/lib/index.js': `console.log('Hello from lib');
`,
    })

    const { stdout, output } = await teskit.run(monorepoRoot, 'packages/app', { entryPoint: 'lib/index.js' })

    expect(output).toHaveProperty('lib/index.js')
    expect(stdout.trim()).toBe('Hello from lib')
  })

  it('skips non-existent entries in files array gracefully', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        files: ['dist', 'docs', 'optional'],
      },
      'packages/app/dist/index.js': `console.log('Hello');
`,
      // docs and optional directories don't exist
    })

    const { stdout, output } = await teskit.run(monorepoRoot, 'packages/app')

    // Should still work with just dist
    expect(output).toHaveProperty('dist/index.js')
    expect(output).not.toHaveProperty('docs')
    expect(output).not.toHaveProperty('optional')
    expect(stdout.trim()).toBe('Hello')
  })

  it('copies the packed payload produced by npm scripts', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        files: ['dist'],
        scripts: {
          prepack: 'bash -c "mkdir -p dist && echo \\"console.log(\'packed\');\\" > dist/index.js"',
          postpack: 'bash -c "echo \\"console.log(\'reverted\');\\" > dist/index.js"',
        },
      },
      'packages/app/dist/index.js': `console.log('original');
`,
    })

    const { stdout, output } = await teskit.run(monorepoRoot, 'packages/app')

    expect(output['dist/index.js']).toBe(`console.log('packed');
`)
    expect(stdout.trim()).toBe('packed')
  })
})
