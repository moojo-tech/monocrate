import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { monocrateCli } from '../src/monocrate-cli.js'
import { monocrate } from '../src/monocrate.js'

vi.mock('../src/monocrate.js', () => ({
  monocrate: vi.fn(() =>
    Promise.resolve({
      outputDir: '/tmp/out',
      resolvedVersion: '9.9.9',
      summaries: [],
    })
  ),
}))

function setArgv(args: string[]): void {
  process.argv = ['node', 'monocrate', ...args]
}

async function waitForCliToFinish(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('monocrate CLI commands', () => {
  const originalArgv = [...process.argv]
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.argv = [...originalArgv]
  })

  afterEach(() => {
    logSpy.mockClear()
    errorSpy.mockClear()
  })

  it('maps "pack" command to publish=false and forwards pack destination', async () => {
    setArgv(['pack', 'packages/lib', '--pack-destination', '/tmp/pack-out', '--bump', 'patch'])

    monocrateCli()
    await waitForCliToFinish()

    expect(monocrate).toHaveBeenCalledTimes(1)
    const call0 = vi.mocked(monocrate).mock.calls.at(0)
    if (!call0) {
      throw new Error('Expected monocrate to be called once')
    }
    expect(call0[0]).toMatchObject({
      pathToSubjectPackages: ['packages/lib'],
      outputRoot: '/tmp/pack-out',
      bump: 'patch',
      publish: false,
    })
  })

  it('maps "publish" command to publish=true', async () => {
    setArgv(['publish', 'packages/lib', '--bump', 'minor'])

    monocrateCli()
    await waitForCliToFinish()

    expect(monocrate).toHaveBeenCalledTimes(1)
    const call0 = vi.mocked(monocrate).mock.calls.at(0)
    if (!call0) {
      throw new Error('Expected monocrate to be called once')
    }
    expect(call0[0]).toMatchObject({
      pathToSubjectPackages: ['packages/lib'],
      bump: 'minor',
      publish: true,
    })
  })
})
