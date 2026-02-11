import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AbsolutePath } from '../src/paths.js'
import { publish } from '../src/publish.js'
import { TempDirRegistry } from '../src/temp-dir-registry.js'

describe('publish tarball flow', () => {
  it('packs output directory and publishes the generated tarball with tag', async () => {
    const tempDirs = new TempDirRegistry()
    const outputDir = AbsolutePath(await fs.mkdtemp(path.join(os.tmpdir(), 'monocrate-output-')))
    const calls: { tarballPath: string; cwd: string; tag: string | undefined }[] = []

    const npmClient = {
      async pack(_dir: AbsolutePath, packDestination: AbsolutePath): Promise<void> {
        const tarball = path.join(packDestination, 'example-1.0.0.tgz')
        await fs.writeFile(tarball, '')
      },
      publishTarball(tarballPath: AbsolutePath, cwd: AbsolutePath, tag?: string): Promise<void> {
        calls.push({ tarballPath, cwd, tag })
        return Promise.resolve()
      },
    }

    try {
      await publish(npmClient, outputDir, 'pending', tempDirs)
    } finally {
      tempDirs.cleanup()
      await fs.rm(outputDir, { recursive: true, force: true })
    }

    const call = calls.at(0)
    if (!call) {
      throw new Error('Expected publishTarball to be called once')
    }

    expect(calls).toHaveLength(1)
    expect(call.cwd).toBe(outputDir)
    expect(call.tag).toBe('pending')
    expect(call.tarballPath.endsWith('.tgz')).toBe(true)
  })

  it('throws when packing does not produce exactly one tarball', async () => {
    const tempDirs = new TempDirRegistry()
    const outputDir = AbsolutePath(await fs.mkdtemp(path.join(os.tmpdir(), 'monocrate-output-')))

    const npmClient = {
      pack(_dir: AbsolutePath, _packDestination: AbsolutePath): Promise<void> {
        return Promise.resolve()
      },
      publishTarball(_tarballPath: AbsolutePath, _cwd: AbsolutePath, _tag?: string): Promise<void> {
        return Promise.resolve()
      },
    }

    try {
      await expect(publish(npmClient, outputDir, 'pending', tempDirs)).rejects.toThrow('Expected exactly one .tgz file')
    } finally {
      tempDirs.cleanup()
      await fs.rm(outputDir, { recursive: true, force: true })
    }
  })
})
