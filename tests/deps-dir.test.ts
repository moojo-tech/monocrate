import { describe, it, expect } from 'vitest'
import { computeDepsDir } from '../src/deps-dir.js'

describe('computeDepsDir', () => {
  it('returns "deps" when no collision exists', () => {
    const files = ['dist/index.js', 'dist/utils.js', 'package.json', 'README.md']

    const result = computeDepsDir(files)

    expect(result).toBe('deps')
  })

  it('returns unique name when "deps" directory exists in subject package', () => {
    const files = ['dist/index.js', 'deps/internal/helper.js', 'package.json']

    const result = computeDepsDir(files)

    expect(result).toMatch(/^deps-[a-f0-9]{8}$/)
    expect(result).not.toBe('deps')
  })

  it('generates different unique names on each call when collision exists', () => {
    const files = ['deps/something.js']

    const result1 = computeDepsDir(files)
    const result2 = computeDepsDir(files)

    expect(result1).not.toBe(result2)
    expect(result1).toMatch(/^deps-[a-f0-9]{8}$/)
    expect(result2).toMatch(/^deps-[a-f0-9]{8}$/)
  })

  it('handles empty file list', () => {
    const result = computeDepsDir([])

    expect(result).toBe('deps')
  })

  it('correctly identifies top-level "deps" directory from nested paths', () => {
    const files = ['deps/foo/bar/baz.js', 'src/index.js']

    const result = computeDepsDir(files)

    expect(result).toMatch(/^deps-[a-f0-9]{8}$/)
  })

  it('does not collide with files that contain "deps" in nested paths', () => {
    const files = ['src/deps/helper.js', 'lib/internal-deps/util.js']

    const result = computeDepsDir(files)

    // These shouldn't trigger collision since "deps" is not at the top level
    expect(result).toBe('deps')
  })

  it('correctly identifies when top-level file is named "deps"', () => {
    // Edge case: a file named "deps" at top level (though unusual)
    const files = ['deps', 'package.json']

    const result = computeDepsDir(files)

    expect(result).toMatch(/^deps-[a-f0-9]{8}$/)
  })
})
