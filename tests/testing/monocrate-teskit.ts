import { execSync } from 'child_process'
import { unfolderify } from './unfolderify.js'
import { monocrate } from '../../src/monocrate.js'
import type { MonocrateOptions, MonocrateResult } from '../../src/monocrate.js'
import path from 'node:path'
import type { PackageJson } from '../../src/package-json.js'
import os from 'node:os'
import fs from 'node:fs'
import * as tar from 'tar'
import { TempDirDispenser } from '../../src/temp-dir-dispenser.js'

export class MonocrateTeskit {
  private readonly tempDirDispenser = new TempDirDispenser()

  shutdown() {
    this.tempDirDispenser.cleanup()
  }

  async pack(options: MonocrateOptions): Promise<MonocrateResult & { outputDir: string }> {
    const result = await monocrate(options)
    const summary = result.summaries.at(0)
    if (!summary) {
      throw new Error('Expected at least one package summary')
    }
    return { ...result, outputDir: this.extractTarball(summary.tarballPath) }
  }

  private extractTarball(tarballPath: string): string {
    const tempDir = this.tempDirDispenser.create()
    tar.extract({ file: tarballPath, cwd: tempDir, sync: true })
    const packageDir = path.join(tempDir, 'package')
    MonocrateTeskit.createNodeModulesForFileDeps(packageDir)
    return packageDir
  }

  private static createNodeModulesForFileDeps(packageDir: string, visited = new Set<string>()): void {
    const resolved = path.resolve(packageDir)
    if (visited.has(resolved)) return
    visited.add(resolved)

    const packageJsonPath = path.join(packageDir, 'package.json')
    if (!fs.existsSync(packageJsonPath)) return

    const pkgJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as PackageJson
    const deps = pkgJson.dependencies ?? {}

    for (const [depName, version] of Object.entries(deps)) {
      if (!version?.startsWith('file:')) continue

      const relativePath = version.slice('file:'.length)
      const absoluteDepPath = path.resolve(packageDir, relativePath)
      const nodeModulesPath = path.join(packageDir, 'node_modules', ...depName.split('/'))

      fs.mkdirSync(path.dirname(nodeModulesPath), { recursive: true })
      if (!fs.existsSync(nodeModulesPath)) {
        fs.symlinkSync(absoluteDepPath, nodeModulesPath)
      }

      MonocrateTeskit.createNodeModulesForFileDeps(absoluteDepPath, visited)
    }
  }

  async run(
    monorepoRoot: string,
    sourcePackage: string,
    { entryPoint = 'dist/index.js', bump = '2.8.512' }: { entryPoint?: string; bump?: string } = {}
  ) {
    const result = await monocrate({
      cwd: monorepoRoot,
      pathToSubjectPackages: path.join(monorepoRoot, sourcePackage),
      monorepoRoot,
      bump,
      publish: false,
    })
    const summary = result.summaries.at(0)
    if (!summary) {
      throw new Error('Expected at least one package summary')
    }
    const outputDir = this.extractTarball(summary.tarballPath)
    const output = unfolderify(outputDir)

    let stdout = ''
    let stderr = ''
    try {
      stdout = execSync(`node --enable-source-maps ${path.join(outputDir, entryPoint)}`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      })
    } catch (error) {
      stderr = (error as { stderr?: string }).stderr ?? stderr
    }
    return { stdout, stderr, output }
  }
}

export function createTempDir(prefix = 'monocrate-testing-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

export function initGitRepo(cwd: string): void {
  // Disable commit signing for test repos (gpgsign=false) to avoid failures
  // when the environment has signing configured but the signing service is unavailable
  execSync(
    'git init && git config user.email "test@test.com" && git config user.name "Test" && git config commit.gpgsign false && git add . && git commit -m "test"',
    { cwd, stdio: 'pipe' }
  )
}

/**
 * Creates a package.json object with sensible defaults for npm pack compatibility.
 * Required fields (name, version) are always included.
 */
export function pj(name: string, version?: string, more?: Partial<PackageJson>): PackageJson
export function pj(name: string, more?: Partial<PackageJson>): PackageJson
export function pj(
  ...[name, a1, a2]: [string] | [string, string?, Partial<PackageJson>?] | [string, Partial<PackageJson>?]
): PackageJson {
  const version = typeof a1 === 'string' ? { version: a1 } : {}
  const more = typeof a1 === 'object' ? a1 : typeof a2 === 'object' ? a2 : {}
  return {
    version: '0.9.9',
    main: 'dist/index.js',
    type: 'module',
    ...more,
    name,
    ...version,
  }
}

/**
 * Finds the `deps-<uuid>` directory name from the output recipe.
 * Throws if no deps directory is found (use only when in-repo deps are expected).
 */
export function getDepsDir(output: Record<string, unknown>): string {
  for (const key of Object.keys(output)) {
    const match = /^(deps-[0-9a-f-]+)\//.exec(key)
    if (match?.[1]) return match[1]
  }
  throw new Error('No deps directory found in output')
}
