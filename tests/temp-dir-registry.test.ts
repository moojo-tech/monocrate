import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { TempDirRegistry } from '../src/temp-dir-registry.js'
import { AbsolutePath } from '../src/paths.js'
import { folderify } from './testing/folderify.js'
import { unfolderify } from './testing/unfolderify.js'

function createPopulatedDir() {
  return AbsolutePath(
    folderify({
      'a.txt': 'hello',
      'sub/b.txt': 'world',
    })
  )
}

describe('TempDirRegistry', () => {
  describe('record', () => {
    it('returns the directory that was recorded', () => {
      const registry = new TempDirRegistry()
      const dir = createPopulatedDir()

      expect(registry.record(dir)).toBe(dir)

      registry.cleanup()
    })

    it('can record multiple directories', () => {
      const registry = new TempDirRegistry()
      const dir1 = createPopulatedDir()
      const dir2 = createPopulatedDir()

      registry.record(dir1)
      registry.record(dir2)

      expect(fs.existsSync(dir1)).toBe(true)
      expect(fs.existsSync(dir2)).toBe(true)

      registry.cleanup()
    })
  })

  describe('cleanup', () => {
    it('removes a single recorded directory', () => {
      const registry = new TempDirRegistry()
      const dir = createPopulatedDir()
      registry.record(dir)

      registry.cleanup()

      expect(fs.existsSync(dir)).toBe(false)
    })

    it('removes all recorded directories', () => {
      const registry = new TempDirRegistry()
      const dir1 = createPopulatedDir()
      const dir2 = createPopulatedDir()
      const dir3 = createPopulatedDir()
      registry.record(dir1)
      registry.record(dir2)
      registry.record(dir3)

      registry.cleanup()

      expect(fs.existsSync(dir1)).toBe(false)
      expect(fs.existsSync(dir2)).toBe(false)
      expect(fs.existsSync(dir3)).toBe(false)
    })

    it('removes directories including all nested contents', () => {
      const registry = new TempDirRegistry()
      const dir = AbsolutePath(
        folderify({
          'top.txt': 'top-level',
          'a/b/c/deep.txt': 'deeply nested',
          'a/sibling.txt': 'sibling',
        })
      )
      registry.record(dir)

      expect(unfolderify(dir)).toMatchObject({
        'top.txt': 'top-level',
        'a/b/c/deep.txt': 'deeply nested',
        'a/sibling.txt': 'sibling',
      })

      registry.cleanup()

      expect(fs.existsSync(dir)).toBe(false)
    })

    it('skips directories that no longer exist', () => {
      const registry = new TempDirRegistry()
      const dir = createPopulatedDir()
      registry.record(dir)

      fs.rmSync(dir, { recursive: true, force: true })

      expect(() => { registry.cleanup(); }).not.toThrow()
    })

    it('still removes remaining directories when some have already been deleted', () => {
      const registry = new TempDirRegistry()
      const alreadyGone = createPopulatedDir()
      const stillHere = createPopulatedDir()
      registry.record(alreadyGone)
      registry.record(stillHere)

      fs.rmSync(alreadyGone, { recursive: true, force: true })

      registry.cleanup()

      expect(fs.existsSync(stillHere)).toBe(false)
    })

    it('is a no-op when no directories have been recorded', () => {
      const registry = new TempDirRegistry()

      expect(() => { registry.cleanup(); }).not.toThrow()
    })

    it('is a no-op when called a second time', () => {
      const registry = new TempDirRegistry()
      const dir = createPopulatedDir()
      registry.record(dir)

      registry.cleanup()
      expect(fs.existsSync(dir)).toBe(false)

      expect(() => { registry.cleanup(); }).not.toThrow()
    })

    it('does not remove directories that were not recorded', () => {
      const registry = new TempDirRegistry()
      const recorded = createPopulatedDir()
      const unrecorded = createPopulatedDir()
      registry.record(recorded)

      registry.cleanup()

      expect(fs.existsSync(recorded)).toBe(false)
      expect(fs.existsSync(unrecorded)).toBe(true)

      fs.rmSync(unrecorded, { recursive: true, force: true })
    })

    it('handles recording the same directory twice', () => {
      const registry = new TempDirRegistry()
      const dir = createPopulatedDir()
      registry.record(dir)
      registry.record(dir)

      registry.cleanup()

      expect(fs.existsSync(dir)).toBe(false)
    })

    it('cleans up directories recorded after a previous cleanup', () => {
      const registry = new TempDirRegistry()
      const first = createPopulatedDir()
      registry.record(first)
      registry.cleanup()

      const second = createPopulatedDir()
      registry.record(second)
      registry.cleanup()

      expect(fs.existsSync(first)).toBe(false)
      expect(fs.existsSync(second)).toBe(false)
    })
  })
})
