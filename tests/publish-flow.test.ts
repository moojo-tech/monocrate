import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AbsolutePath } from '../src/paths.js'
import { createFinalTarball, publishTarball } from '../src/publish.js'

describe('publish tarball flow', () => {
  it('packs output directory and returns the generated tarball path', async () => {
    const outputDir = AbsolutePath(await fs.mkdtemp(path.join(os.tmpdir(), 'monocrate-output-')))
    const tarballRoot = AbsolutePath(await fs.mkdtemp(path.join(os.tmpdir(), 'monocrate-tarballs-')))

    const npmClient = {
      async pack(_dir: AbsolutePath, packDestination: AbsolutePath): Promise<void> {
        const tarball = path.join(packDestination, 'example-1.0.0.tgz')
        await fs.writeFile(tarball, '')
      },
      publishTarball(_tarballPath: AbsolutePath, _cwd: AbsolutePath, _tag?: string): Promise<void> {
        return Promise.resolve()
      },
    }

    try {
      const tarballPath = await createFinalTarball(npmClient, outputDir, tarballRoot)
      expect(tarballPath.endsWith('.tgz')).toBe(true)
      expect(path.dirname(path.dirname(tarballPath))).toBe(tarballRoot)
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true })
      await fs.rm(tarballRoot, { recursive: true, force: true })
    }
  })

  it('throws when packing does not produce exactly one tarball', async () => {
    const outputDir = AbsolutePath(await fs.mkdtemp(path.join(os.tmpdir(), 'monocrate-output-')))
    const tarballRoot = AbsolutePath(await fs.mkdtemp(path.join(os.tmpdir(), 'monocrate-tarballs-')))

    const npmClient = {
      pack(_dir: AbsolutePath, _packDestination: AbsolutePath): Promise<void> {
        return Promise.resolve()
      },
      publishTarball(_tarballPath: AbsolutePath, _cwd: AbsolutePath, _tag?: string): Promise<void> {
        return Promise.resolve()
      },
    }

    try {
      await expect(createFinalTarball(npmClient, outputDir, tarballRoot)).rejects.toThrow(
        'Expected exactly one .tgz file'
      )
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true })
      await fs.rm(tarballRoot, { recursive: true, force: true })
    }
  })

  it('publishes a tarball with the provided cwd and tag', async () => {
    const calls: { tarballPath: string; cwd: string; tag: string | undefined }[] = []
    const npmClient = {
      pack(_dir: AbsolutePath, _packDestination: AbsolutePath): Promise<void> {
        return Promise.resolve()
      },
      publishTarball(tarballPath: AbsolutePath, cwd: AbsolutePath, tag?: string): Promise<void> {
        calls.push({ tarballPath, cwd, tag })
        return Promise.resolve()
      },
    }

    await publishTarball(npmClient, AbsolutePath('/tmp/x.tgz'), AbsolutePath('/tmp/cwd'), 'pending')

    expect(calls).toEqual([{ tarballPath: '/tmp/x.tgz', cwd: '/tmp/cwd', tag: 'pending' }])
  })
})
