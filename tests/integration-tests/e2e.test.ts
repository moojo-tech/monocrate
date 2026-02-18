import { afterAll, describe, it, expect } from 'vitest'
import { monocrate } from '../../src/index.js'
import { folderify } from '../testing/folderify.js'
import { MonocrateTeskit, pj } from '../testing/monocrate-teskit.js'
import fs from 'node:fs'
import path from 'node:path'
import { x } from 'tinyexec'

const name = 'root-package'
const packageWithImportedDeclarationsName = '@myorg/a'

function installPackedPackageInConsumerProject(
  consumerProjectRoot: string,
  packageName: string,
  packedPackageDir: string
): void {
  const installedPackageDir = path.join(consumerProjectRoot, 'node_modules', ...packageName.split('/'))
  fs.mkdirSync(path.dirname(installedPackageDir), { recursive: true })
  fs.cpSync(packedPackageDir, installedPackageDir, { recursive: true })
  // Also install file: deps so TypeScript can resolve their types
  const pkgJson = JSON.parse(fs.readFileSync(path.join(packedPackageDir, 'package.json'), 'utf-8')) as {
    dependencies?: Record<string, string>
  }
  for (const [depName, depVersion] of Object.entries(pkgJson.dependencies ?? {})) {
    if (depVersion.startsWith('file:')) {
      const depPath = path.resolve(packedPackageDir, depVersion.slice('file:'.length))
      const depInstalledPath = path.join(consumerProjectRoot, 'node_modules', ...depName.split('/'))
      fs.mkdirSync(path.dirname(depInstalledPath), { recursive: true })
      fs.cpSync(depPath, depInstalledPath, { recursive: true })
    }
  }
}

function extractDepsDir(output: Record<string, unknown>): string {
  const key = Object.keys(output).find((k) => /^deps-[^/]+\//.test(k))
  if (!key) {
    throw new Error('No deps-* directory found in output')
  }
  const [depsDir] = key.split('/')
  if (!depsDir) {
    throw new Error(`Unexpected deps key format: ${key}`)
  }
  return depsDir
}

function depsPath(output: Record<string, unknown>, subPath: string): string {
  return `${extractDepsDir(output)}/${subPath}`
}

interface TypecheckResult {
  exitCode: number
  stdout: string
  stderr: string
}

async function runTypecheck(projectRoot: string): Promise<TypecheckResult> {
  const typeScriptCliPath = path.resolve(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc')
  if (!fs.existsSync(typeScriptCliPath)) {
    throw new Error(`TypeScript CLI not found at ${typeScriptCliPath}`)
  }

  const result = await x(process.execPath, [typeScriptCliPath, '--project', 'tsconfig.json', '--noEmit'], {
    nodeOptions: {
      cwd: projectRoot,
      stdio: 'pipe',
    },
    throwOnError: false,
  })

  if (result.exitCode === undefined) {
    throw new Error('TypeScript process terminated without an exit code')
  }

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

function getTypecheckOutput(result: TypecheckResult): string {
  return [result.stderr, result.stdout].filter((part) => part.length > 0).join('\n')
}

function createConsumerProject(source: string): string {
  return folderify({
    'package.json': { name: 'consumer', private: true, type: 'module' },
    'tsconfig.json': {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        skipLibCheck: true,
      },
      include: ['src/index.ts'],
    },
    'src/index.ts': source,
  })
}

async function packPackageWithImportedDeclarations(teskit: MonocrateTeskit): Promise<string> {
  const monorepoRoot = folderify({
    'package.json': { name, workspaces: ['packages/*'] },
    'packages/a/package.json': pj(packageWithImportedDeclarationsName, undefined, {
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

  const { outputDir } = await teskit.pack({
    cwd: monorepoRoot,
    pathToSubjectPackages: 'packages/a',
    publish: false,
    bump: '2.8.512',
  })

  return outputDir
}

describe('monocrate e2e', () => {
  const teskit = new MonocrateTeskit()
  afterAll(() => {
    teskit.shutdown()
  })
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

    const { stdout, output } = await teskit.run(monorepoRoot, 'packages/app', { bump: '4.256.16384' })

    const depsDir = extractDepsDir(output)
    expect(output['package.json']).toEqual({
      name: '@test/app',
      version: '4.256.16384',
      type: 'module',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      dependencies: {
        '@test/lib': `file:./${depsDir}/@test/lib`,
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
    const alpha = await teskit.run(monorepoRoot, 'packages/app-alpha', { bump: '4.16.64' })

    const alphaDepsDir = extractDepsDir(alpha.output)
    expect(alpha.output['package.json']).toEqual({
      name: '@test/app-alpha',
      version: '4.16.64',
      type: 'module',
      main: 'dist/index.js',
      dependencies: {
        '@test/lib-alpha': `file:./${alphaDepsDir}/@test/lib-alpha`,
        chalk: '^5.0.0',
        lodash: '^4.17.21',
      },
    })
    expect(alpha.stdout.trim()).toBe('Alpha: ALPHA')

    // Assemble only app-beta
    const beta = await teskit.run(monorepoRoot, 'packages/app-beta', { bump: '5.25.125' })

    const betaDepsDir = extractDepsDir(beta.output)
    expect(beta.output['package.json']).toEqual({
      name: '@test/app-beta',
      version: '5.25.125',
      type: 'module',
      main: 'dist/index.js',
      dependencies: {
        '@test/lib-beta': `file:./${betaDepsDir}/@test/lib-beta`,
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

    const { stdout, output } = await teskit.run(monorepoRoot, 'packages/app', { bump: '4.16.64' })

    const depsDir = extractDepsDir(output)
    expect(output['package.json']).toEqual({
      name: '@test/app',
      version: '4.16.64',
      type: 'module',
      main: 'dist/index.js',
      dependencies: {
        '@test/level1': `file:./${depsDir}/@test/level1`,
        '@test/level2': `file:./${depsDir}/@test/level2`,
        '@test/level3': `file:./${depsDir}/@test/level3`,
        '@test/level4': `file:./${depsDir}/@test/level4`,
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

    const { stdout, output } = await teskit.run(monorepoRoot, 'packages/app', { bump: '9.81.729' })

    const depsDir = extractDepsDir(output)
    expect(output['package.json']).toEqual({
      name: '@test/pnpm-app',
      version: '9.81.729',
      type: 'module',
      main: 'dist/index.js',
      dependencies: {
        '@test/pnpm-lib': `file:./${depsDir}/@test/pnpm-lib`,
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

    const { stdout, output } = await teskit.run(monorepoRoot, 'packages/app', { bump: '3.9.27' })

    const depsDir = extractDepsDir(output)
    expect(output['package.json']).toEqual({
      name: '@test/app',
      version: '3.9.27',
      type: 'module',
      main: 'dist/index.js',
      dependencies: {
        '@test/lib': `file:./${depsDir}/@test/lib`,
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

    const { output } = await teskit.run(monorepoRoot, 'packages/app', { bump: '1.0.0' })

    // lib (production dependency) should be included
    expect(output).toHaveProperty(depsPath(output, '@test/lib/package.json'))

    // build-tool (devDependency) should NOT be included in packaged output
    expect(output).not.toHaveProperty(depsPath(output, '@test/build-tool/package.json'))
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

    const { stderr } = await teskit.run(monorepoRoot, 'packages/app')

    // Verify the stack trace contains the error message and the line number in the output
    // The throw statement is on line 2 of the lib dist file
    expect(stderr).toContain('intentional error')
    // The error occurs in the deps directory where the in-repo dep is placed
    expect(stderr).toContain('index.js:2')
  })

  describe('source maps', () => {
    it('maps stack traces through source maps in an in-repo dependency', async () => {
      const sourceMap = JSON.stringify({
        version: 3,
        file: 'index.js',
        sourceRoot: '',
        sources: ['../../src/index.ts'],
        names: [],
        // Line 1: AAAA (gen line 1 col 0 → source 0, line 0, col 0)
        // Line 2: AAeA (gen line 2 col 0 → source 0, line delta +15 = line 15 (1-indexed: 16), col 0)
        mappings: 'AAAA;AAeA',
      })

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
        'packages/app/dist/index.js': `import { throwError } from '@test/lib';\nthrowError();\n`,
        'packages/lib/package.json': {
          name: '@test/lib',
          version: '1.0.0',
          type: 'module',
          main: 'dist/index.js',
        },
        'packages/lib/dist/index.js': `export function throwError() {\n  throw new Error('source-mapped error');\n}\n//# sourceMappingURL=index.js.map\n`,
        'packages/lib/dist/index.js.map': sourceMap,
      })

      const { stderr } = await teskit.run(monorepoRoot, 'packages/app')

      expect(stderr).toContain('source-mapped error')
      expect(stderr).toContain('index.ts:16')
    })

    it('maps stack traces through source maps in the subject package', async () => {
      const sourceMap = JSON.stringify({
        version: 3,
        file: 'index.js',
        sourceRoot: '',
        sources: ['../../src/index.ts'],
        names: [],
        // Line 1: AAOA (gen line 1 col 0 → source 0, line 7 (1-indexed: 8), col 0)
        mappings: 'AAOA',
      })

      const monorepoRoot = folderify({
        'package.json': { name, workspaces: ['packages/*'] },
        'packages/app/package.json': {
          name: '@test/app',
          version: '1.0.0',
          type: 'module',
          main: 'dist/index.js',
        },
        'packages/app/dist/index.js': `throw new Error('subject source-mapped error');\n//# sourceMappingURL=index.js.map\n`,
        'packages/app/dist/index.js.map': sourceMap,
      })

      const { stderr } = await teskit.run(monorepoRoot, 'packages/app')

      expect(stderr).toContain('subject source-mapped error')
      expect(stderr).toContain('index.ts:8')
    })

    it('maps stack traces through source maps in a transitive dependency', async () => {
      const libBSourceMap = JSON.stringify({
        version: 3,
        file: 'index.js',
        sourceRoot: '',
        sources: ['../../src/index.ts'],
        names: [],
        // Line 1: AAAA (gen line 1 col 0 → source 0, line 0, col 0)
        // Line 2: AAWA (gen line 2 col 0 → source 0, line delta +11 = line 11 (1-indexed: 12), col 0)
        mappings: 'AAAA;AAWA',
      })

      const monorepoRoot = folderify({
        'package.json': { name, workspaces: ['packages/*'] },
        'packages/app/package.json': {
          name: '@test/app',
          version: '1.0.0',
          type: 'module',
          main: 'dist/index.js',
          dependencies: {
            '@test/lib-a': 'workspace:*',
          },
        },
        'packages/app/dist/index.js': `import { callThrow } from '@test/lib-a';\ncallThrow();\n`,
        'packages/lib-a/package.json': {
          name: '@test/lib-a',
          version: '1.0.0',
          type: 'module',
          main: 'dist/index.js',
          dependencies: {
            '@test/lib-b': 'workspace:*',
          },
        },
        'packages/lib-a/dist/index.js': `import { throwError } from '@test/lib-b';\nexport function callThrow() { throwError(); }\n`,
        'packages/lib-b/package.json': {
          name: '@test/lib-b',
          version: '1.0.0',
          type: 'module',
          main: 'dist/index.js',
        },
        'packages/lib-b/dist/index.js': `export function throwError() {\n  throw new Error('transitive source-mapped error');\n}\n//# sourceMappingURL=index.js.map\n`,
        'packages/lib-b/dist/index.js.map': libBSourceMap,
      })

      const { stderr } = await teskit.run(monorepoRoot, 'packages/app')

      expect(stderr).toContain('transitive source-mapped error')
      expect(stderr).toContain('index.ts:12')
    })
  })

  it('type-checks consumer code that relies on declarations imported from bundled in-repo dependencies', async () => {
    const outputDir = await packPackageWithImportedDeclarations(teskit)
    const consumerProjectRoot = createConsumerProject(`import { bar } from '@myorg/a';
const upperCaseBar: string = bar.toUpperCase();
void upperCaseBar;
`)

    installPackedPackageInConsumerProject(consumerProjectRoot, packageWithImportedDeclarationsName, outputDir)

    const result = await runTypecheck(consumerProjectRoot)
    expect(result.exitCode).toBe(0)
  })

  it('fails type-checking when consumer code violates declaration types imported from bundled in-repo dependencies', async () => {
    const outputDir = await packPackageWithImportedDeclarations(teskit)
    const consumerProjectRoot = createConsumerProject(`import { bar } from '@myorg/a';
const asNumber: number = bar;
void asNumber;
`)

    installPackedPackageInConsumerProject(consumerProjectRoot, packageWithImportedDeclarationsName, outputDir)

    const result = await runTypecheck(consumerProjectRoot)
    expect(result.exitCode).not.toBe(0)
    const errorMessage = getTypecheckOutput(result)
    expect(errorMessage).toContain('src/index.ts(2,7): error TS2322:')
    expect(errorMessage).toContain(`Type 'string' is not assignable to type 'number'.`)
  })

  it('re-exports from in-repo dependency resolve at runtime', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/a/package.json': pj('@myorg/a', { dependencies: { '@myorg/b': '*' } }),
      'packages/a/dist/reexports.js': `export { foo } from '@myorg/b';
export * from '@myorg/b';
`,
      'packages/a/dist/index.js': `import { foo, bar } from './reexports.js';
console.log(foo + '-' + bar);
`,
      'packages/b/package.json': pj('@myorg/b'),
      'packages/b/dist/index.js': `export const foo = 'foo';
export const bar = 'bar';
`,
    })

    const { stdout } = await teskit.run(monorepoRoot, 'packages/a')

    expect(stdout.trim()).toBe('foo-bar')
  })

  it('resolves in-repo dependency imports from nested files', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/a/package.json': pj('@myorg/a', { dependencies: { '@myorg/b': '*' } }),
      'packages/a/dist/index.js': `import { helper } from './utils/helper.js';
console.log(helper);
`,
      'packages/a/dist/utils/helper.js': `import { foo } from '@myorg/b';
export const helper = foo + '-helper';
`,
      'packages/b/package.json': pj('@myorg/b'),
      'packages/b/dist/index.js': `export const foo = 'foo';
`,
    })

    const { stdout } = await teskit.run(monorepoRoot, 'packages/a')

    expect(stdout.trim()).toBe('foo-helper')
  })

  it('handles packages in different monorepo directories', async () => {
    const monorepoRoot = folderify({
      'package.json': { name: 'my-monorepo', workspaces: ['packages/*', 'libs/*'] },
      'packages/a/package.json': pj('@myorg/a', { dependencies: { '@myorg/b': '*', '@myorg/utils': '*' } }),
      'packages/a/dist/index.js': `import { foo } from '@myorg/b';
import { util } from '@myorg/utils';
console.log(foo + '-' + util);
`,
      'packages/b/package.json': pj('@myorg/b'),
      'packages/b/dist/index.js': `export const foo = 'foo';
`,
      'libs/utils/package.json': pj('@myorg/utils'),
      'libs/utils/dist/index.js': `export const util = 'util';
`,
    })

    const { stdout } = await teskit.run(monorepoRoot, 'packages/a')

    expect(stdout.trim()).toBe('foo-util')
  })

  it('handles source package importing itself by name', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/a/package.json': pj('@myorg/a', {
        exports: {
          '.': './dist/index.js',
          './utils/*': './dist/utils/*',
        },
      }),
      'packages/a/dist/index.js': `import { helper } from '@myorg/a/utils/helper.js';
console.log(helper);
`,
      'packages/a/dist/utils/helper.js': `export const helper = 'self-import-works';
`,
    })

    const { stdout } = await teskit.run(monorepoRoot, 'packages/a')

    expect(stdout.trim()).toBe('self-import-works')
  })

  it('resolves subpath imports of in-repo dependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/a/package.json': pj('@myorg/a', { dependencies: { '@myorg/b': '*' } }),
      'packages/a/dist/index.js': `import { helper } from '@myorg/b/utils/helper.js';
console.log(helper);
`,
      'packages/b/package.json': pj('@myorg/b', {
        exports: {
          '.': './dist/index.js',
          './utils/*': './dist/utils/*',
        },
      }),
      'packages/b/dist/index.js': `export const foo = 'foo';
`,
      'packages/b/dist/utils/helper.js': `export const helper = 'subpath-works';
`,
    })

    const { stdout } = await teskit.run(monorepoRoot, 'packages/a')

    expect(stdout.trim()).toBe('subpath-works')
  })

  it('resolves dynamic imports of in-repo dependencies', async () => {
    const monorepoRoot = folderify({
      'package.json': { name, workspaces: ['packages/*'] },
      'packages/a/package.json': pj('@myorg/a', { dependencies: { '@myorg/b': '*' } }),
      'packages/a/dist/index.js': `const b = await import('@myorg/b');
console.log(b.foo);
`,
      'packages/b/package.json': pj('@myorg/b'),
      'packages/b/dist/index.js': `export const foo = 'dynamic-import-works';
`,
    })

    const { stdout } = await teskit.run(monorepoRoot, 'packages/a')

    expect(stdout.trim()).toBe('dynamic-import-works')
  })

  it('allows computed dynamic imports', async () => {
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
    ).resolves.toMatchObject({
      summaries: [{ packageName: '@myorg/a', version: '2.8.512' }],
    })
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

    const { stdout, output } = await teskit.run(monorepoRoot, 'packages/app')

    // Verify embedded dependency files keep imports as package names
    const libAIndex = output[depsPath(output, '@myorg/lib-a/dist/index.js')] as string
    expect(libAIndex).toContain("from '@myorg/lib-b'")

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

    const { stdout, output } = await teskit.run(monorepoRoot, 'packages/app', { bump: '2.0.0' })

    const depsDir = extractDepsDir(output)
    expect(output['package.json']).toEqual({
      name: '@test/app',
      version: '2.0.0',
      type: 'module',
      main: 'dist/index.js',
      dependencies: {
        '@test/lib': `file:./${depsDir}/@test/lib`,
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

    const { stdout, output } = await teskit.run(monorepoRoot, 'packages/app', { bump: '3.0.0' })

    const depsDir = extractDepsDir(output)
    expect(output['package.json']).toEqual({
      name: '@test/app',
      version: '3.0.0',
      type: 'module',
      main: 'dist/index.js',
      dependencies: {
        '@test/lib': `file:./${depsDir}/@test/lib`,
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

    const { stdout, output } = await teskit.run(monorepoRoot, 'packages/app', { bump: '5.0.0' })

    const depsDir = extractDepsDir(output)
    expect(output['package.json']).toEqual({
      name: '@test/app',
      version: '5.0.0',
      type: 'module',
      main: 'dist/index.js',
      dependencies: {
        '@test/lib-a': `file:./${depsDir}/@test/lib-a`,
        '@test/lib-b': `file:./${depsDir}/@test/lib-b`,
        '@test/lib-c': `file:./${depsDir}/@test/lib-c`,
        express: '^4.0.0',
        lodash: '^4.0.0',
        zod: '^3.0.0',
      },
    })

    // All three in-repo deps should be embedded under the deps directory
    expect(output).toHaveProperty(depsPath(output, '@test/lib-a/dist/index.js'))
    expect(output).toHaveProperty(depsPath(output, '@test/lib-b/dist/index.js'))
    expect(output).toHaveProperty(depsPath(output, '@test/lib-c/dist/index.js'))

    expect(stdout.trim()).toBe('A-B-C')
  })
})
