import { x } from 'tinyexec'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { AbsolutePath } from './paths.js'

export interface NpmOptionsBase {
  env?: Partial<Record<string, string>>
  userconfig?: string
}

interface StdioPipe {
  stdio: 'pipe'
}

interface StdioInherit {
  stdio?: 'inherit'
}

interface PolicyThrow {
  nonZeroExitCodePolicy?: 'throw'
}

interface PolicyReturn {
  nonZeroExitCodePolicy: 'return'
}

interface OutputResult {
  stdout: string
  stderr: string
}

interface PolicyThrowResult {
  ok: true
}
type PolicyReturnResult =
  | {
      ok: false
      error: Error
    }
  | { ok: true }

export async function runNpm(
  subcommand: string,
  args: string[],
  cwd: AbsolutePath,
  options: PolicyReturn & StdioInherit & NpmOptionsBase
): Promise<PolicyReturnResult>
export async function runNpm(
  subcommand: string,
  args: string[],
  cwd: AbsolutePath,
  options: PolicyReturn & StdioPipe & NpmOptionsBase
): Promise<PolicyReturnResult & OutputResult>
export async function runNpm(
  subcommand: string,
  args: string[],
  cwd: AbsolutePath,
  options?: PolicyThrow & StdioInherit & NpmOptionsBase
): Promise<PolicyThrowResult>
export async function runNpm(
  subcommand: string,
  args: string[],
  cwd: AbsolutePath,
  options: PolicyThrow & StdioPipe & NpmOptionsBase
): Promise<PolicyThrowResult & OutputResult>
export async function runNpm(
  subcommand: string,
  args: string[],
  cwd: AbsolutePath,
  options?: (PolicyReturn | PolicyThrow) & (StdioInherit | StdioPipe) & NpmOptionsBase
): Promise<
  PolicyReturnResult | (PolicyReturnResult & OutputResult) | PolicyThrowResult | (PolicyThrowResult & OutputResult)
> {
  const errorPolicy = options?.nonZeroExitCodePolicy ?? 'throw'
  const stdio = options?.stdio ?? 'inherit'
  const npmCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monocrate-npm-cache-'))
  const env = {
    ...process.env,
    npm_config_cache: npmCacheDir,
    ...options?.env,
  }

  const uc = options?.userconfig ? ['--userconfig', options.userconfig] : []
  const fullArgs = [subcommand, ...args, ...uc]
  const synopsis = `${cwd}$ npm ${fullArgs.map((a) => JSON.stringify(a)).join(' ')}`
  const proc = x('npm', fullArgs, {
    nodeOptions: { env, cwd, stdio },
    throwOnError: false,
  })
  const result = await proc

  if (result.exitCode === undefined) {
    throw new Error(`npm ${subcommand} terminated abnormally` + (proc.killed ? ' (killed)' : ''))
  }

  if (result.exitCode !== 0) {
    let message = `An NPM command exited with code ${String(result.exitCode)} - ${synopsis}`
    if (stdio === 'pipe') {
      message += `\n${result.stdout}`
    }
    const error = new Error(message)
    if (errorPolicy === 'throw') {
      throw error
    }
    if (stdio === 'pipe') {
      return { ok: false, stdout: result.stdout, stderr: result.stderr, error }
    }
    return { ok: false, error }
  }

  if (stdio === 'pipe') {
    return { ok: true, stdout: result.stdout, stderr: result.stderr }
  }
  return { ok: true }
}
