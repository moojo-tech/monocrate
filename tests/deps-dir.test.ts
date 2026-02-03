import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDepsDir } from '../src/deps-dir.js'
import type { AbsolutePath } from '../src/paths.js'

describe('createDepsDir', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deps-dir-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates a uniquely named deps directory', () => {
    const result = createDepsDir(tempDir as AbsolutePath)

    expect(result).toMatch(/^deps-.+$/)
    expect(fs.existsSync(path.join(tempDir, result))).toBe(true)
  })

  it('generates different names on each call', () => {
    const result1 = createDepsDir(tempDir as AbsolutePath)
    const result2 = createDepsDir(tempDir as AbsolutePath)

    expect(result1).not.toBe(result2)
    expect(result1).toMatch(/^deps-.+$/)
    expect(result2).toMatch(/^deps-.+$/)
  })
})
