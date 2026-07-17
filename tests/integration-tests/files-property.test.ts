import { describe, it, expect } from 'vitest'
import { monocrate } from '../../src/index.js'
import { folderify } from '../testing/folderify.js'
import { unfolderify } from '../testing/unfolderify.js'
import { runMonocrate } from '../testing/monocrate-teskit.js'

const name = 'root-package'

describe('files property support', () => {
  it('uses files property to determine what to copy', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        files: ['dist', 'bin'],
      },
      'packages/app/dist/index.js': `console.log('Hello from dist');
`,
      'packages/app/bin/cli.js': `#!/usr/bin/env node
console.log('Hello from bin');
`,
      'packages/app/src/index.ts': `// Source file should not be copied
`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/app',
      publish: false,
      bump: '2.8.512',
    })

    const output = unfolderify(outputDir)

    // Files from `files` property should be copied
    expect(output).toHaveProperty('dist/index.js')
    expect(output).toHaveProperty('bin/cli.js')

    // Source files not in `files` should not be copied
    expect(output).not.toHaveProperty('src/index.ts')
  })

  it('copies files at package root when specified in files', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        files: ['dist', 'types.d.ts'],
      },
      'packages/app/dist/index.js': `export const foo = 'foo';
`,
      'packages/app/types.d.ts': `export declare const foo: string;
`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/app',
      publish: false,
      bump: '2.8.512',
    })

    const output = unfolderify(outputDir)

    expect(output).toHaveProperty('dist/index.js')
    expect(output).toHaveProperty('types.d.ts')
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

    const { stdout, output } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '3.9.27' })

    expect(output).toMatchObject({
      'dist/index.js': `import { greet } from '../deps/__test__lib/dist/index.js'; console.log(greet());`,
      'package.json': {
        main: 'dist/index.js',
        name: '@test/app',
        type: 'module',
        version: '3.9.27',
      },
      'deps/__test__lib/dist/index.js': `export function greet() { return 'Hello!'; }`,
      'deps/__test__lib/extra/utils.js': `export const helper = 'helper';`,
      'deps/__test__lib/package.json': {
        files: ['dist', 'extra'],
        main: 'dist/index.js',
        name: '@test/lib',
        type: 'module',
        version: '1.0.0',
      },
    })
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

    const { stdout, output } = await runMonocrate(monorepoRoot, 'packages/app')

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

    const { stdout, output } = await runMonocrate(monorepoRoot, 'packages/app', { entryPoint: 'lib/index.js' })

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

    const { stdout, output } = await runMonocrate(monorepoRoot, 'packages/app')

    // Should still work with just dist
    expect(output).toHaveProperty('dist/index.js')
    expect(output).not.toHaveProperty('docs')
    expect(output).not.toHaveProperty('optional')
    expect(stdout.trim()).toBe('Hello')
  })

  it('preserves files property in output package.json', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        files: ['dist', 'bin'],
      },
      'packages/app/dist/index.js': `export const x = 1;
`,
      'packages/app/bin/cli.js': `#!/usr/bin/env node
`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/app',
      publish: false,
      bump: '2.8.512',
    })

    const output = unfolderify(outputDir)
    const pkgJson = output['package.json'] as Record<string, unknown>

    expect(pkgJson.files).toEqual(['dist', 'bin'])
  })

  it('adds deps to files array when subject has both files field and in-repo dependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        files: ['dist'],
        dependencies: { '@test/lib': 'workspace:*' },
      },
      'packages/app/dist/index.js': `import { greet } from '@test/lib'; console.log(greet());`,
      'packages/lib/package.json': {
        name: '@test/lib',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
      },
      'packages/lib/dist/index.js': `export function greet() { return 'Hello!'; }`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/app',
      publish: false,
      bump: '1.0.0',
    })

    const output = unfolderify(outputDir)
    expect(output['package.json']).toEqual({
      files: [
        'dist',
        // deps must be in files array, otherwise npm pack will exclude it
        'deps',
      ],
      main: 'dist/index.js',
      name: '@test/app',
      type: 'module',
      version: '1.0.0',
    })
  })
})
