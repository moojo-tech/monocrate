import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import type { AbsolutePath } from './paths.js'
import type { NpmOptionsBase } from './run-npm.js'
import { runNpm } from './run-npm.js'
import type { TempDirDispenser } from './temp-dir-dispenser.js'

const NpmErrorResponse = z.object({
  error: z.object({
    code: z.string().optional(),
    summary: z.string().optional(),
    detail: z.string().optional(),
  }),
})

export class NpmClient {
  constructor(
    private readonly dispenser: TempDirDispenser,
    private readonly npmOptions?: NpmOptionsBase
  ) {}

  /**
   * Checks if the user is logged in to npm.
   * @param cwd - The working directory for the npm command
   * @returns The username if logged in
   * @throws Error with actionable message if not logged in
   */
  async whoami(cwd: AbsolutePath): Promise<string> {
    const { ok, stdout } = await runNpm('whoami', [], cwd, {
      ...this.npmOptions,
      stdio: 'pipe',
      nonZeroExitCodePolicy: 'return',
    })

    if (!ok) {
      const registry = this.npmOptions?.userconfig ? ` (using config: ${this.npmOptions.userconfig})` : ''
      throw new Error(`Not logged in to npm${registry}. Run 'npm login' to authenticate before publishing.`)
    }

    return stdout.trim()
  }

  async publish(dir: AbsolutePath, tag?: string, passThroughArgs?: string[]): Promise<void> {
    const args = [...(tag ? ['--tag', tag] : []), ...(passThroughArgs ?? [])]
    await runNpm('publish', args, dir, { ...this.npmOptions, stdio: 'inherit' })
  }

  async distTagAdd(packageNameAtVersion: string, tag: string, cwd: AbsolutePath): Promise<void> {
    await runNpm('dist-tag', ['add', packageNameAtVersion, tag], cwd, { ...this.npmOptions, stdio: 'inherit' })
  }

  /**
   * @param packageName
   * @param cwd
   * @returns the version of `packageName` or undefined (if not found)
   */
  async viewVersion(packageName: string, cwd: AbsolutePath): Promise<string | undefined> {
    const { ok, stdout } = await runNpm('view', ['-s', '--json', packageName, 'version'], cwd, {
      ...this.npmOptions,
      stdio: 'pipe',
      nonZeroExitCodePolicy: 'return',
    })

    if (!ok) {
      const parsed = NpmErrorResponse.safeParse(JSON.parse(stdout))
      if (!parsed.success) {
        throw new Error(`Error response of 'npm view' could not be parsed: ${stdout}`)
      }

      const code = parsed.data.error.code ?? 'UNKNOWN'
      if (code !== 'E404') {
        const detail = parsed.data.error.detail ?? parsed.data.error.summary ?? '<No Further Details>'
        throw new Error(`npm view failed (${code}): ${detail}`)
      }
      return undefined
    }

    const parsed = z.string().safeParse(JSON.parse(stdout))
    if (!parsed.success) {
      throw new Error(`Response of 'npm view' could not be parsed: ${stdout}`)
    }
    return parsed.data
  }

  async pack(dir: AbsolutePath, tarballPath: string, options?: { dryRun?: boolean; ignoreScripts?: boolean }) {
    const d = this.dispenser.create()
    const cliOptions = [
      '--json',
      '--pack-destination',
      d,
      options?.dryRun ? '--dry-run' : '',
      options?.ignoreScripts ? '--ignore-scripts' : '',
    ].filter(Boolean)
    const { stdout, ok } = await runNpm('pack', cliOptions, dir, {
      ...this.npmOptions,
      stdio: 'pipe',
      nonZeroExitCodePolicy: 'return',
    })

    if (!ok) {
      const parsed = NpmErrorResponse.safeParse(JSON.parse(stdout))
      if (!parsed.success) {
        throw new Error(`Error response of 'npm pack' could not be parsed: ${stdout}`)
      }

      const code = parsed.data.error.code ?? 'UNKNOWN'
      const detail = parsed.data.error.detail ?? parsed.data.error.summary ?? '<No Further Details>'
      throw new Error(`The 'npm view' command failed (code: ${code}): ${detail}`)
    }

    const parsed = z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          version: z.string(),
          size: z.number(),
          unpackedSize: z.number(),
          shasum: z.string(),
          integrity: z.string(),
          filename: z.string(),
          files: z.array(
            z.object({
              path: z.string(),
            })
          ),
        })
      )
      .safeParse(JSON.parse(stdout))
    if (!parsed.success) {
      throw new Error(`Response of 'npm pack' could not be parsed: ${parsed.error.message}`)
    }

    const ret = parsed.data.at(0)
    if (!ret || parsed.data.length !== 1) {
      throw new Error(`npm pack of directory ${d} returned ${String(parsed.data.length)} items (expected 1)`)
    }

    if (!options?.dryRun) {
      fs.cpSync(path.join(d, ret.filename), tarballPath)
    }
    ret.filename = tarballPath
    return ret
  }
}
