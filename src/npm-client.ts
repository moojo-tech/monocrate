import * as fsPromises from 'node:fs/promises'
import { z } from 'zod'
import { AbsolutePath, RelativePath } from './paths.js'
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

  async pack(dir: AbsolutePath, packDestination: AbsolutePath): Promise<AbsolutePath> {
    await runNpm('pack', ['--pack-destination', packDestination], dir, {
      ...this.npmOptions,
      stdio: 'inherit',
      nonZeroExitCodePolicy: 'throw',
    })

    const entries = await fsPromises.readdir(packDestination, { withFileTypes: true })
    const tarballs = entries.flatMap((entry) => (entry.isFile() && entry.name.endsWith('.tgz') ? [entry.name] : []))
    if (tarballs.length !== 1) {
      const found = tarballs.length === 0 ? '<none>' : tarballs.join(', ')
      throw new Error(
        `Expected exactly one .tgz file after npm pack in ${packDestination}, found ${String(tarballs.length)}: ${found}`
      )
    }

    const onlyTarball = tarballs.at(0)
    if (!onlyTarball) {
      throw new Error(`Inconsistency: expected one tarball in ${packDestination}`)
    }

    return AbsolutePath.join(packDestination, RelativePath(onlyTarball))
  }
}
