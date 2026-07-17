import { execSync } from 'child_process'
import { unfolderify } from './unfolderify.js'
import { monocrate } from '../../src/monocrate.js'
import path from 'node:path'
import type { PackageJson } from '../../src/package-json.js'
import os from 'node:os'
import fs from 'node:fs'

export class MonocreateTeskit {
  async start() {}

  async shutdown() {}
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

export async function runMonocrate(
  monorepoRoot: string,
  sourcePackage: string,
  { entryPoint = 'dist/index.js', bump = '2.8.512' }: { entryPoint?: string; bump?: string } = {}
) {
  const { outputDir } = await monocrate({
    cwd: monorepoRoot,
    pathToSubjectPackages: path.join(monorepoRoot, sourcePackage),
    monorepoRoot,
    bump,
    publish: false,
  })

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
