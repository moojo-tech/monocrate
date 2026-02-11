import { z } from 'zod'
import type { AbsolutePath } from './paths.js'
import type { NpmOptionsBase } from './run-npm.js'
import { runNpm } from './run-npm.js'

const NpmErrorResponse = z.object({
  error: z.object({
    code: z.string().optional(),
    summary: z.string().optional(),
    detail: z.string().optional(),
  }),
})

export class NpmClient {
  constructor(private readonly npmOptions?: NpmOptionsBase) {}

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

  async publish(dir: AbsolutePath, tag?: string): Promise<void> {
    const args = tag ? ['--tag', tag] : []
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

  async pack(dir: AbsolutePath, options?: { dryRun?: boolean; packDestination?: AbsolutePath }) {
    const args = ['--json']
    if (options?.dryRun) {
      args.push('--dry-run')
    }
    if (options?.packDestination) {
      args.push('--pack-destination', options.packDestination)
    }

    const { stdout, stderr, ok } = await runNpm('pack', args, dir, {
      ...this.npmOptions,
      stdio: 'pipe',
      nonZeroExitCodePolicy: 'return',
    })

    if (!ok) {
      const candidate = stdout.trim() === '' ? stderr : stdout
      let decoded: unknown
      try {
        decoded = JSON.parse(candidate)
      } catch {
        const detail = candidate.trim() === '' ? '<No Further Details>' : candidate
        throw new Error(`The 'npm pack' command failed: ${detail}`)
      }

      const parsed = NpmErrorResponse.safeParse(decoded)
      if (!parsed.success) {
        throw new Error(`Error response of 'npm pack' could not be parsed: ${candidate}`)
      }

      const code = parsed.data.error.code ?? 'UNKNOWN'
      const detail = parsed.data.error.detail ?? parsed.data.error.summary ?? '<No Further Details>'
      throw new Error(`The 'npm pack' command failed (code: ${code}): ${detail}`)
    }

    let decoded: unknown
    try {
      decoded = JSON.parse(stdout)
    } catch {
      throw new Error(`Response of 'npm pack' could not be parsed as JSON: ${stdout}`)
    }

    const parsed = z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string().optional(),
          version: z.string().optional(),
          size: z.number().optional(),
          unpackedSize: z.number().optional(),
          shasum: z.string().optional(),
          integrity: z.string().optional(),
          filename: z.string(),
          files: z
            .array(
              z.object({
                path: z.string(),
              })
            )
            .optional(),
        })
      )
      .safeParse(decoded)
    if (!parsed.success) {
      throw new Error(`Response of 'npm pack' could not be parsed: ${parsed.error.message}`)
    }

    return parsed.data
  }
}
