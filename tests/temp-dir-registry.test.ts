import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { TempDirRegistry } from '../src/temp-dir-registry.js'
import { AbsolutePath } from '../src/paths.js'

describe('TempDirRegistry', () => {
  describe('create', () => {
    it('creates a directory that exists on disk', () => {
      const registry = new TempDirRegistry()

      const dir = registry.create('monocrate-test-')

      expect(fs.existsSync(dir)).toBe(true)
      expect(fs.statSync(dir).isDirectory()).toBe(true)

      registry.cleanup()
    })

    it('creates a directory under os.tmpdir() with the given prefix', () => {
      const registry = new TempDirRegistry()

      const dir = registry.create('monocrate-test-')

      expect(dir).toContain(path.join(os.tmpdir(), 'monocrate-test-'))

      registry.cleanup()
    })

    it('is cleaned up by cleanup()', () => {
      const registry = new TempDirRegistry()
      const dir = registry.create('monocrate-test-')

      registry.cleanup()

      expect(fs.existsSync(dir)).toBe(false)
    })
  })

  describe('cleanup', () => {
    it('removes a single directory', () => {
      const registry = new TempDirRegistry()
      const dir = registry.create('monocrate-test-')

      registry.cleanup()

      expect(fs.existsSync(dir)).toBe(false)
    })

    it('removes all created directories', () => {
      const registry = new TempDirRegistry()
      const dir1 = registry.create('monocrate-test-')
      const dir2 = registry.create('monocrate-test-')
      const dir3 = registry.create('monocrate-test-')

      registry.cleanup()

      expect(fs.existsSync(dir1)).toBe(false)
      expect(fs.existsSync(dir2)).toBe(false)
      expect(fs.existsSync(dir3)).toBe(false)
    })

    it('removes directories including all nested contents', () => {
      const registry = new TempDirRegistry()
      const dir = registry.create('monocrate-test-')
      const deepDir = path.join(dir, 'a', 'b', 'c')
      fs.mkdirSync(deepDir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'top.txt'), 'top-level')
      fs.writeFileSync(path.join(deepDir, 'deep.txt'), 'deeply nested')
      fs.writeFileSync(path.join(dir, 'a', 'sibling.txt'), 'sibling')

      expect(fs.existsSync(path.join(deepDir, 'deep.txt'))).toBe(true)

      registry.cleanup()

      expect(fs.existsSync(dir)).toBe(false)
    })

    it('skips directories that no longer exist', () => {
      const registry = new TempDirRegistry()
      const dir = registry.create('monocrate-test-')

      fs.rmSync(dir, { recursive: true, force: true })

      expect(() => {
        registry.cleanup()
      }).not.toThrow()
    })

    it('still removes remaining directories when some have already been deleted', () => {
      const registry = new TempDirRegistry()
      const alreadyGone = registry.create('monocrate-test-')
      const stillHere = registry.create('monocrate-test-')

      fs.rmSync(alreadyGone, { recursive: true, force: true })

      registry.cleanup()

      expect(fs.existsSync(stillHere)).toBe(false)
    })

    it('is a no-op when no directories have been created', () => {
      const registry = new TempDirRegistry()

      expect(() => {
        registry.cleanup()
      }).not.toThrow()
    })

    it('is a no-op when called a second time', () => {
      const registry = new TempDirRegistry()
      const dir = registry.create('monocrate-test-')

      registry.cleanup()
      expect(fs.existsSync(dir)).toBe(false)

      expect(() => {
        registry.cleanup()
      }).not.toThrow()
    })

    it('does not remove directories that were not created by the registry', () => {
      const registry = new TempDirRegistry()
      const created = registry.create('monocrate-test-')
      const unrelated = AbsolutePath(fs.mkdtempSync(path.join(os.tmpdir(), 'monocrate-test-unrelated-')))

      registry.cleanup()

      expect(fs.existsSync(created)).toBe(false)
      expect(fs.existsSync(unrelated)).toBe(true)

      fs.rmSync(unrelated, { recursive: true, force: true })
    })

    it('cleans up directories created after a previous cleanup', () => {
      const registry = new TempDirRegistry()
      const first = registry.create('monocrate-test-')
      registry.cleanup()

      const second = registry.create('monocrate-test-')
      registry.cleanup()

      expect(fs.existsSync(first)).toBe(false)
      expect(fs.existsSync(second)).toBe(false)
    })
  })
})
