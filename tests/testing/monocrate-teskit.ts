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
    return path.join(tempDir, 'package')
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

    // Capture the directory structure before linking (unfolderify doesn't traverse symlinked dirs)
    const output = unfolderify(outputDir)

    // Create node_modules symlinks for file: deps so node can resolve them at runtime
    this.linkFileDeps(outputDir)

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

  private linkFileDeps(outputDir: string): void {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(outputDir, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
    }
    for (const [name, version] of Object.entries(pkgJson.dependencies ?? {})) {
      if (version.startsWith('file:')) {
        const target = path.resolve(outputDir, version.slice('file:'.length))
        const parts = name.split('/')
        const linkPath = path.join(outputDir, 'node_modules', ...parts)
        fs.mkdirSync(path.dirname(linkPath), { recursive: true })
        fs.symlinkSync(target, linkPath)
      }
    }
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
