import { describe, it, expect } from 'vitest'
import { monocrate } from '../../src/index.js'
import { folderify } from '../testing/folderify.js'
import { unfolderify } from '../testing/unfolderify.js'
import { pj, runMonocrate } from '../testing/monocrate-teskit.js'

const name = 'root-package'

describe('monocrate e2e', () => {
  it('assembles a simple package with an in-repo dependency', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        dependencies: {
          '@test/lib': 'workspace:*',
          chalk: '^5.0.0',
        },
      },
      'packages/app/dist/index.js': `import { greet } from '@test/lib'; console.log(greet('World'));`,
      'packages/app/dist/index.d.ts': `import { greet } from '@test/lib';`,
      'packages/lib/package.json': {
        name: '@test/lib',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        dependencies: {
          lodash: '^4.17.21',
        },
      },
      'packages/lib/dist/index.js': `export function greet(name) { return 'Hello, ' + name + '!'; }`,
      'packages/lib/dist/index.d.ts': `export declare function greet(name: string): string;`,
    })

    const { stdout, output } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '4.256.16384' })

    expect(output['package.json']).toEqual({
      name: '@test/app',
      version: '4.256.16384',
      type: 'module',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      dependencies: {
        chalk: '^5.0.0',
        lodash: '^4.17.21',
      },
    })
    // Verify end-to-end:
    expect(stdout.trim()).toBe('Hello, World!')
  })

  it('assembles only the requested package when monorepo has multiple packages', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      // First app with its own lib and external dep
      'packages/app-alpha/package.json': {
        name: '@test/app-alpha',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          '@test/lib-alpha': 'workspace:*',
          chalk: '^5.0.0',
        },
      },
      'packages/app-alpha/dist/index.js': `import { getAlpha } from '@test/lib-alpha'; console.log('Alpha: ' + getAlpha());`,
      'packages/lib-alpha/package.json': {
        name: '@test/lib-alpha',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          lodash: '^4.17.21',
        },
      },
      'packages/lib-alpha/dist/index.js': `export function getAlpha() { return 'ALPHA' }`,
      // Second app with its own lib and different external dep
      'packages/app-beta/package.json': {
        name: '@test/app-beta',
        version: '2.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          '@test/lib-beta': 'workspace:*',
          zod: '^3.0.0',
        },
      },
      'packages/app-beta/dist/index.js': `import { getBeta } from '@test/lib-beta'; console.log('Beta: ' + getBeta());`,
      'packages/lib-beta/package.json': {
        name: '@test/lib-beta',
        version: '2.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          uuid: '^9.0.0',
        },
      },
      'packages/lib-beta/dist/index.js': `export function getBeta() { return 'BETA'; }`,
    })

    // Assemble only app-alpha
    const alpha = await runMonocrate(monorepoRoot, 'packages/app-alpha', { bump: '4.16.64' })

    expect(alpha.output['package.json']).toEqual({
      name: '@test/app-alpha',
      version: '4.16.64',
      type: 'module',
      main: 'dist/index.js',
      dependencies: {
        chalk: '^5.0.0',
        lodash: '^4.17.21',
      },
    })
    expect(alpha.stdout.trim()).toBe('Alpha: ALPHA')

    // Assemble only app-beta
    const beta = await runMonocrate(monorepoRoot, 'packages/app-beta', { bump: '5.25.125' })

    expect(beta.output['package.json']).toEqual({
      name: '@test/app-beta',
      version: '5.25.125',
      type: 'module',
      main: 'dist/index.js',
      dependencies: {
        zod: '^3.0.0',
        uuid: '^9.0.0',
      },
    })
    expect(beta.stdout.trim()).toBe('Beta: BETA')
  }, 30000)

  it('assembles deep chain of in-repo dependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          '@test/level1': 'workspace:*',
          express: '^4.18.0',
        },
      },
      'packages/app/dist/index.js': `import { fromLevel1 } from '@test/level1';
console.log(fromLevel1());
`,
      'packages/level1/package.json': {
        name: '@test/level1',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          '@test/level2': 'workspace:*',
          lodash: '^4.17.21',
        },
      },
      'packages/level1/dist/index.js': `import { fromLevel2 } from '@test/level2';
export function fromLevel1() {
  return 'L1->' + fromLevel2();
}
`,
      'packages/level2/package.json': {
        name: '@test/level2',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          '@test/level3': 'workspace:*',
          chalk: '^5.0.0',
        },
      },
      'packages/level2/dist/index.js': `import { fromLevel3 } from '@test/level3';
export function fromLevel2() {
  return 'L2->' + fromLevel3();
}
`,
      'packages/level3/package.json': {
        name: '@test/level3',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          '@test/level4': 'workspace:*',
          zod: '^3.0.0',
        },
      },
      'packages/level3/dist/index.js': `import { fromLevel4 } from '@test/level4';
export function fromLevel3() {
  return 'L3->' + fromLevel4();
}
`,
      'packages/level4/package.json': {
        name: '@test/level4',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          uuid: '^9.0.0',
        },
      },
      'packages/level4/dist/index.js': `export function fromLevel4() {
  return 'L4';
}
`,
    })

    const { stdout, output } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '4.16.64' })

    expect(output['package.json']).toEqual({
      name: '@test/app',
      version: '4.16.64',
      type: 'module',
      main: 'dist/index.js',
      dependencies: {
        express: '^4.18.0',
        lodash: '^4.17.21',
        chalk: '^5.0.0',
        zod: '^3.0.0',
        uuid: '^9.0.0',
      },
    })

    expect(stdout.trim()).toBe('L1->L2->L3->L4')
  }, 30000)

  it('works with pnpm workspaces', async () => {
    const monorepoRoot = folderify({
      'package.json': { name: 'pnpm-monorepo' },
      'pnpm-workspace.yaml': `packages:
  - 'packages/*'
`,
      'packages/app/package.json': {
        name: '@test/pnpm-app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          '@test/pnpm-lib': 'workspace:*',
          chalk: '^5.0.0',
        },
      },
      'packages/app/dist/index.js': `import { pnpmGreet } from '@test/pnpm-lib';
console.log(pnpmGreet());
`,
      'packages/lib/package.json': {
        name: '@test/pnpm-lib',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          lodash: '^4.17.21',
        },
      },
      'packages/lib/dist/index.js': `export function pnpmGreet() {
  return 'pnpm works!';
}
`,
    })

    const { stdout, output } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '9.81.729' })

    expect(output['package.json']).toEqual({
      name: '@test/pnpm-app',
      version: '9.81.729',
      type: 'module',
      main: 'dist/index.js',
      dependencies: {
        chalk: '^5.0.0',
        lodash: '^4.17.21',
      },
    })

    expect(stdout.trim()).toBe('pnpm works!')
  })

  it('excludes devDependencies from the output', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          '@test/lib': 'workspace:*',
          chalk: '^5.0.0',
        },
        devDependencies: {
          vitest: '^1.0.0',
          typescript: '^5.0.0',
        },
      },
      'packages/app/dist/index.js': `import { greet } from '@test/lib';
console.log(greet('World'));
`,
      'packages/lib/package.json': {
        name: '@test/lib',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          lodash: '^4.17.21',
        },
        devDependencies: {
          '@types/lodash': '^4.14.0',
        },
      },
      'packages/lib/dist/index.js': `export function greet(name) {
  return 'Hello, ' + name + '!';
}
`,
    })

    const { stdout, output } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '3.9.27' })

    expect(output['package.json']).toEqual({
      name: '@test/app',
      version: '3.9.27',
      type: 'module',
      main: 'dist/index.js',
      dependencies: {
        chalk: '^5.0.0',
        lodash: '^4.17.21',
      },
    })

    expect(stdout.trim()).toBe('Hello, World!')
  })

  it('excludes in-repo devDependencies from the packaged output', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@test/app', {
        dependencies: { '@test/lib': 'workspace:*' },
        devDependencies: { '@test/build-tool': 'workspace:*' },
      }),
      'packages/app/dist/index.js': `export const app = 'app';`,
      'packages/lib/package.json': pj('@test/lib'),
      'packages/lib/dist/index.js': `export const lib = 'lib';`,
      'packages/build-tool/package.json': pj('@test/build-tool'),
      'packages/build-tool/dist/index.js': `export const build = 'build';`,
    })

    const { output } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '1.0.0' })

    // lib (production dependency) should be included
    expect(output).toHaveProperty('deps/__test__lib/package.json')

    // build-tool (devDependency) should NOT be included in packaged output
    expect(output).not.toHaveProperty('deps/__test__build-tool/package.json')
  })

  it('preserves line numbers in stack traces', async () => {
    // Line 1: export function throwError() {
    // Line 2:   throw new Error('intentional error');
    // Line 3: }
    const libSource = `export function throwError() {
  throw new Error('intentional error');
}
`
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          '@test/lib': 'workspace:*',
        },
      },
      'packages/app/dist/index.js': `import { throwError } from '@test/lib';
throwError();
`,
      'packages/lib/package.json': {
        name: '@test/lib',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
      },
      'packages/lib/dist/index.js': libSource,
    })

    const { stderr } = await runMonocrate(monorepoRoot, 'packages/app')

    // Verify the stack trace contains the error message and the line number in the output
    // The throw statement is on line 2 of the lib dist file
    expect(stderr).toContain('intentional error')
    // The error occurs in the deps directory where the in-repo dep is placed
    expect(stderr).toContain('index.js:2')
  })

  it('rewrites imports in both .js and .d.ts files', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/a/package.json': pj('@myorg/a', undefined, {
        dependencies: { '@myorg/b': '*', lodash: '^4.0.0' },
        types: 'dist/index.d.ts',
      }),
      'packages/a/dist/index.js': `import { foo } from '@myorg/b';
export const bar = foo;
`,
      'packages/a/dist/index.d.ts': `import { foo } from '@myorg/b';
export declare const bar: typeof foo;
`,
      'packages/b/package.json': pj('@myorg/b', undefined, {
        dependencies: { lodash: '^4.0.0' },
        types: 'dist/index.d.ts',
      }),
      'packages/b/dist/index.js': `export const foo = 'foo';
`,
      'packages/b/dist/index.d.ts': `export declare const foo: string;
`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/a',
      publish: false,
      bump: '2.8.512',
    })

    const output = unfolderify(outputDir)

    console.error(JSON.stringify(output, null, 2))
    // Verify .js file has rewritten import
    expect(output['dist/index.js']).toContain('../deps/__myorg__b/dist/index.js')
    expect(output['dist/index.js']).not.toContain("'@myorg/b'")

    // Verify .d.ts file has rewritten import
    expect(output['dist/index.d.ts']).toContain('../deps/__myorg__b/dist/index.js')
    expect(output['dist/index.d.ts']).not.toContain("'@myorg/b'")
  })

  it('rewrites export declarations', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/a/package.json': pj('@myorg/a', { dependencies: { '@myorg/b': '*' } }),
      'packages/a/dist/index.js': `export { foo } from '@myorg/b';
export * from '@myorg/b';
`,
      'packages/b/package.json': pj('@myorg/b'),
      'packages/b/dist/index.js': `export const foo = 'foo';
export const bar = 'bar';
`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/a',
      publish: false,
      bump: '2.8.512',
    })

    const output = unfolderify(outputDir)

    // Verify export declarations have rewritten module specifiers
    const indexJs = output['dist/index.js'] as string
    expect(indexJs).toContain('../deps/__myorg__b/dist/index.js')
    expect(indexJs).not.toContain("'@myorg/b'")
  })

  it('leaves third-party imports unchanged', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/a/package.json': pj('@myorg/a', { dependencies: { '@myorg/b': '*', lodash: '^4.0.0' } }),
      'packages/a/dist/index.js': `import { foo } from '@myorg/b';
import _ from 'lodash';
import * as path from 'node:path';
export const bar = foo;
`,
      'packages/b/package.json': pj('@myorg/b'),
      'packages/b/dist/index.js': `export const foo = 'foo';
`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/a',
      publish: false,
      bump: '2.8.512',
    })

    const output = unfolderify(outputDir)
    const indexJs = output['dist/index.js'] as string

    // Third-party imports should be unchanged
    expect(indexJs).toContain("from 'lodash'")
    expect(indexJs).toContain("from 'node:path'")
  })

  it('rewrites imports in nested files at different depths', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/a/package.json': pj('@myorg/a', { dependencies: { '@myorg/b': '*' } }),
      'packages/a/dist/index.js': `import { foo } from '@myorg/b';
export { helper } from './utils/helper.js';
export const bar = foo;
`,
      'packages/a/dist/utils/helper.js': `import { foo } from '@myorg/b';
export const helper = foo + '-helper';
`,
      'packages/b/package.json': pj('@myorg/b'),
      'packages/b/dist/index.js': `export const foo = 'foo';
`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/a',
      publish: false,
      bump: '2.8.512',
    })

    const output = unfolderify(outputDir)

    // Root level file should have '../deps/...'
    expect(output['dist/index.js']).toContain('../deps/__myorg__b/dist/index.js')

    // Nested file should have '../../deps/...'
    expect(output['dist/utils/helper.js']).toContain('../../deps/__myorg__b/dist/index.js')
  })

  it('handles packages in different monorepo directories', async () => {
    const monorepoRoot = folderify({
      'package.json': { name: 'my-monorepo', workspaces: ['packages/*', 'libs/*'] },
      'packages/a/package.json': pj('@myorg/a', { dependencies: { '@myorg/b': '*', '@myorg/utils': '*' } }),
      'packages/a/dist/index.js': `import { foo } from '@myorg/b';
import { util } from '@myorg/utils';
export const bar = foo + util;
`,
      'packages/b/package.json': pj('@myorg/b'),
      'packages/b/dist/index.js': `export const foo = 'foo';
`,
      'libs/utils/package.json': pj('@myorg/utils'),
      'libs/utils/dist/index.js': `export const util = 'util';
`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/a',
      publish: false,
      bump: '2.8.512',
    })

    const output = unfolderify(outputDir)
    const indexJs = output['dist/index.js'] as string

    // Both imports should be rewritten with correct paths
    expect(indexJs).toContain('../deps/__myorg__b/dist/index.js')
    expect(indexJs).toContain('../deps/__myorg__utils/dist/index.js')

    // Verify the deps directory structure uses mangled package names
    expect(output).toHaveProperty('deps/__myorg__b/dist/index.js')
    expect(output).toHaveProperty('deps/__myorg__utils/dist/index.js')
  }, 15000)

  it('verifies output directory structure matches spec', async () => {
    const monorepoRoot = folderify({
      'package.json': { name: 'my-monorepo', workspaces: ['packages/*', 'libs/*'] },
      'packages/a/package.json': pj('@myorg/a', undefined, {
        dependencies: { '@myorg/b': '*' },
        types: 'dist/index.d.ts',
      }),
      'packages/a/dist/index.js': `import { foo } from '@myorg/b';
export const bar = foo;
`,
      'packages/a/dist/index.d.ts': `import { foo } from '@myorg/b';
export declare const bar: typeof foo;
`,
      'packages/a/dist/utils/helper.js': `export const x = 1;
`,
      'packages/a/dist/utils/helper.d.ts': `export declare const x: number;
`,
      'packages/b/package.json': pj('@myorg/b', undefined, { types: 'dist/index.d.ts' }),
      'packages/b/dist/index.js': `export const foo = 'foo';
`,
      'packages/b/dist/index.d.ts': `export declare const foo: string;
`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/a',
      publish: false,
      bump: '2.8.512',
    })

    const output = unfolderify(outputDir)

    // Verify root structure
    expect(output).toHaveProperty('package.json')
    expect(output).toHaveProperty('dist/index.js')
    expect(output).toHaveProperty('dist/index.d.ts')
    expect(output).toHaveProperty('dist/utils/helper.js')
    expect(output).toHaveProperty('dist/utils/helper.d.ts')

    // Verify deps structure
    expect(output).toHaveProperty('deps/__myorg__b/dist/index.js')
    expect(output).toHaveProperty('deps/__myorg__b/dist/index.d.ts')
  })

  it('handles source package importing itself by name', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/a/package.json': pj('@myorg/a'),
      'packages/a/dist/index.js': `import { helper } from '@myorg/a/utils/helper';
export const result = helper;
`,
      'packages/a/dist/utils/helper.js': `export const helper = 'helper';
`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/a',
      publish: false,
      bump: '2.8.512',
    })

    const output = unfolderify(outputDir)
    const indexJs = output['dist/index.js'] as string

    // Self-import should be rewritten to relative path
    expect(indexJs).toContain('./utils/helper')
    expect(indexJs).not.toContain("'@myorg/a/utils/helper'")
  })

  it('handles subpath imports like @myorg/b/submodule', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/a/package.json': pj('@myorg/a', { dependencies: { '@myorg/b': '*' } }),
      'packages/a/dist/index.js': `import { helper } from '@myorg/b/utils/helper';
export const result = helper;
`,
      // Package b uses exports field to map subpaths to dist directory
      'packages/b/package.json': pj('@myorg/b', {
        exports: {
          '.': './dist/index.js',
          './utils/*': './dist/utils/*',
        },
      }),
      'packages/b/dist/index.js': `export const foo = 'foo';
`,
      'packages/b/dist/utils/helper.js': `export const helper = 'helper';
`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/a',
      publish: false,
      bump: '2.8.512',
    })

    const output = unfolderify(outputDir)
    const indexJs = output['dist/index.js'] as string

    // Subpath import should be rewritten with preserved subpath
    expect(indexJs).toContain('../deps/__myorg__b/dist/utils/helper')
    expect(indexJs).not.toContain("'@myorg/b/utils/helper'")
  })

  it('handles dynamic imports', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/a/package.json': pj('@myorg/a', { dependencies: { '@myorg/b': '*' } }),
      'packages/a/dist/index.js': `const b = await import('@myorg/b');
export const foo = b.foo;
`,
      'packages/b/package.json': pj('@myorg/b'),
      'packages/b/dist/index.js': `export const foo = 'foo';
`,
    })

    const { outputDir } = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: 'packages/a',
      publish: false,
      bump: '2.8.512',
    })

    const output = unfolderify(outputDir)
    const indexJs = output['dist/index.js'] as string

    // Dynamic import should be rewritten
    expect(indexJs).toContain('../deps/__myorg__b/dist/index.js')
    expect(indexJs).not.toContain("import('@myorg/b')")
  })

  it('errors on computed dynamic imports', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/a/package.json': pj('@myorg/a', { dependencies: { '@myorg/b': '*' } }),
      'packages/a/dist/index.js': `const modulePath = '@myorg/b';
const b = await import(modulePath);
export const foo = b.foo;
`,
      'packages/b/package.json': pj('@myorg/b'),
      'packages/b/dist/index.js': `export const foo = 'foo';
`,
    })

    await expect(
      monocrate({
        cwd: monorepoRoot,
        pathToSubjectPackages: 'packages/a',
        publish: false,
        bump: '2.8.512',
      })
    ).rejects.toThrow('Computed import not supported: import(modulePath)')
  })

  it('handles cross-dependency imports between in-repo deps', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': pj('@myorg/app', { dependencies: { '@myorg/lib-a': '*' } }),
      'packages/app/dist/index.js': `import { a } from '@myorg/lib-a';
console.log(a);
`,
      'packages/lib-a/package.json': pj('@myorg/lib-a', { dependencies: { '@myorg/lib-b': '*' } }),
      'packages/lib-a/dist/index.js': `import { b } from '@myorg/lib-b';
export const a = 'a-' + b;
`,
      'packages/lib-b/package.json': pj('@myorg/lib-b'),
      'packages/lib-b/dist/index.js': `export const b = 'b';
`,
    })

    const { stdout, output } = await runMonocrate(monorepoRoot, 'packages/app')

    // Verify the deps files also have their imports rewritten
    const libAIndex = output['deps/__myorg__lib-a/dist/index.js'] as string
    expect(libAIndex).toContain('../__myorg__lib-b/dist/index.js')
    expect(libAIndex).not.toContain("'@myorg/lib-b'")

    // Verify execution works
    expect(stdout.trim()).toBe('a-b')
  }, 15000)

  it('handles workspace:^ protocol variant', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          '@test/lib': 'workspace:^',
          chalk: '^5.0.0',
        },
      },
      'packages/app/dist/index.js': `import { greet } from '@test/lib'; console.log(greet('World'));`,
      'packages/lib/package.json': {
        name: '@test/lib',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          lodash: '^4.17.21',
        },
      },
      'packages/lib/dist/index.js': `export function greet(name) { return 'Hello, ' + name + '!'; }`,
    })

    const { stdout, output } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '2.0.0' })

    expect(output['package.json']).toEqual({
      name: '@test/app',
      version: '2.0.0',
      type: 'module',
      main: 'dist/index.js',
      dependencies: {
        chalk: '^5.0.0',
        lodash: '^4.17.21',
      },
    })

    expect(stdout.trim()).toBe('Hello, World!')
  })

  it('handles workspace:~ protocol variant', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          '@test/lib': 'workspace:~',
          chalk: '^5.0.0',
        },
      },
      'packages/app/dist/index.js': `import { greet } from '@test/lib'; console.log(greet('World'));`,
      'packages/lib/package.json': {
        name: '@test/lib',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          lodash: '^4.17.21',
        },
      },
      'packages/lib/dist/index.js': `export function greet(name) { return 'Hello, ' + name + '!'; }`,
    })

    const { stdout, output } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '3.0.0' })

    expect(output['package.json']).toEqual({
      name: '@test/app',
      version: '3.0.0',
      type: 'module',
      main: 'dist/index.js',
      dependencies: {
        chalk: '^5.0.0',
        lodash: '^4.17.21',
      },
    })

    expect(stdout.trim()).toBe('Hello, World!')
  })

  it('handles mixed workspace protocol variants in dependency chain', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/app/package.json': {
        name: '@test/app',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: {
          '@test/lib-a': 'workspace:*',
          '@test/lib-b': 'workspace:^',
          '@test/lib-c': 'workspace:~',
        },
      },
      'packages/app/dist/index.js': `import { a } from '@test/lib-a';
import { b } from '@test/lib-b';
import { c } from '@test/lib-c';
console.log(a + '-' + b + '-' + c);
`,
      'packages/lib-a/package.json': {
        name: '@test/lib-a',
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: { express: '^4.0.0' },
      },
      'packages/lib-a/dist/index.js': `export const a = 'A';`,
      'packages/lib-b/package.json': {
        name: '@test/lib-b',
        version: '2.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: { lodash: '^4.0.0' },
      },
      'packages/lib-b/dist/index.js': `export const b = 'B';`,
      'packages/lib-c/package.json': {
        name: '@test/lib-c',
        version: '3.0.0',
        type: 'module',
        main: 'dist/index.js',
        dependencies: { zod: '^3.0.0' },
      },
      'packages/lib-c/dist/index.js': `export const c = 'C';`,
    })

    const { stdout, output } = await runMonocrate(monorepoRoot, 'packages/app', { bump: '5.0.0' })

    expect(output['package.json']).toEqual({
      name: '@test/app',
      version: '5.0.0',
      type: 'module',
      main: 'dist/index.js',
      dependencies: {
        express: '^4.0.0',
        lodash: '^4.0.0',
        zod: '^3.0.0',
      },
    })

    // All three in-repo deps should be bundled in deps directory
    expect(output).toHaveProperty('deps/__test__lib-a/dist/index.js')
    expect(output).toHaveProperty('deps/__test__lib-b/dist/index.js')
    expect(output).toHaveProperty('deps/__test__lib-c/dist/index.js')

    expect(stdout.trim()).toBe('A-B-C')
  })
})
