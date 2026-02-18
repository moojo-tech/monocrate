import { execSync } from 'child_process'
import { unfolderify } from './unfolderify.js'
import { monocrate } from '../../src/monocrate.js'
import type { MonocrateOptions, MonocrateResult } from '../../src/monocrate.js'
import path from 'node:path'
import { PackageJson } from '../../src/package-json.js'
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
    const result = await monocrate({
      ...options,
      depsDirSuffix: options.depsDirSuffix ?? '',
    })
    const summary = result.summaries.at(0)
    if (!summary) {
      throw new Error('Expected at least one package summary')
    }
    return { ...result, outputDir: this.extractTarball(summary.tarballPath) }
  }

  private extractTarball(tarballPath: string): string {
    const tempDir = this.tempDirDispenser.create()
    tar.extract({ file: tarballPath, cwd: tempDir, sync: true })
    const outputDir = path.join(tempDir, 'package')
    materializeFileProtocolDependencies(outputDir)
    return outputDir
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
      depsDirSuffix: '',
    })
    const summary = result.summaries.at(0)
    if (!summary) {
      throw new Error('Expected at least one package summary')
    }
    const outputDir = this.extractTarball(summary.tarballPath)

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
    const output = unfolderify(outputDir)
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readOutputObject(output: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = output[key]
  if (!isRecord(value)) {
    throw new Error(`Expected "${key}" to be an object in test output`)
  }
  return value
}

export function readOutputString(output: Record<string, unknown>, key: string): string {
  const value = output[key]
  if (typeof value !== 'string') {
    throw new Error(`Expected "${key}" to be a string in test output`)
  }
  return value
}

function materializeFileProtocolDependencies(packageRoot: string): void {
  const packageJsonPath = path.join(packageRoot, 'package.json')
  const raw: unknown = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
  const parsed = PackageJson.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`Invalid package.json at ${packageJsonPath}: ${parsed.error.message}`)
  }

  const dependencies = parsed.data.dependencies ?? {}
  for (const [dependencyName, specifier] of Object.entries(dependencies)) {
    if (!specifier?.startsWith('file:')) {
      continue
    }

    const relativePath = specifier.replace(/^file:/, '')
    const sourceDir = path.resolve(packageRoot, relativePath)
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Embedded dependency path does not exist: ${relativePath}`)
    }
    const destinationDir = path.join(packageRoot, 'node_modules', ...dependencyName.split('/'))
    fs.mkdirSync(path.dirname(destinationDir), { recursive: true })
    fs.cpSync(sourceDir, destinationDir, { recursive: true })
  }
}
