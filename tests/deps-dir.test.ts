import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { computeDepsDir } from '../src/deps-dir.js'
import type { AbsolutePath } from '../src/paths.js'

describe('computeDepsDir', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deps-dir-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns "deps" when no collision exists', () => {
    const files = ['dist/index.js', 'dist/utils.js', 'package.json', 'README.md']

    const result = computeDepsDir(files, tempDir as AbsolutePath)

    expect(result).toBe('deps')
  })

  it('returns unique name when "deps" directory exists in subject package', () => {
    const files = ['dist/index.js', 'deps/internal/helper.js', 'package.json']

    const result = computeDepsDir(files, tempDir as AbsolutePath)

    // mkdtempSync appends 6 random characters
    expect(result).toMatch(/^deps-.+$/)
    expect(result).not.toBe('deps')
    // Verify the directory was actually created
    expect(fs.existsSync(path.join(tempDir, result))).toBe(true)
  })

  it('generates different unique names on each call when collision exists', () => {
    const files = ['deps/something.js']

    const result1 = computeDepsDir(files, tempDir as AbsolutePath)
    const result2 = computeDepsDir(files, tempDir as AbsolutePath)

    expect(result1).not.toBe(result2)
    expect(result1).toMatch(/^deps-.+$/)
    expect(result2).toMatch(/^deps-.+$/)
  })

  it('handles empty file list', () => {
    const result = computeDepsDir([], tempDir as AbsolutePath)

    expect(result).toBe('deps')
  })

  it('correctly identifies top-level "deps" directory from nested paths', () => {
    const files = ['deps/foo/bar/baz.js', 'src/index.js']

    const result = computeDepsDir(files, tempDir as AbsolutePath)

    expect(result).toMatch(/^deps-.+$/)
  })

  it('does not collide with files that contain "deps" in nested paths', () => {
    const files = ['src/deps/helper.js', 'lib/internal-deps/util.js']

    const result = computeDepsDir(files, tempDir as AbsolutePath)

    // These shouldn't trigger collision since "deps" is not at the top level
    expect(result).toBe('deps')
  })

  it('correctly identifies when top-level file is named "deps"', () => {
    // Edge case: a file named "deps" at top level (though unusual)
    const files = ['deps', 'package.json']

    const result = computeDepsDir(files, tempDir as AbsolutePath)

    expect(result).toMatch(/^deps-.+$/)
  })
})
