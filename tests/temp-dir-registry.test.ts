import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { TempDirRegistry } from '../src/temp-dir-registry.js'
import { AbsolutePath } from '../src/paths.js'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('TempDirRegistry', () => {
  describe('create', () => {
    it('creates a directory that exists on disk', () => {
      const registry = new TempDirRegistry('monocrate-test-')

      const dir = registry.create()

      expect(fs.existsSync(dir)).toBe(true)
      expect(fs.statSync(dir).isDirectory()).toBe(true)

      registry.cleanup()
    })

    it('creates subdirectories under a single root in os.tmpdir() with the given prefix', () => {
      const registry = new TempDirRegistry('monocrate-test-')

      const dir1 = registry.create()
      const dir2 = registry.create()

      const root = path.dirname(dir1)
      expect(root).toContain(path.join(os.tmpdir(), 'monocrate-test-'))
      expect(path.dirname(dir2)).toBe(root)

      registry.cleanup()
    })

    it('names each subdirectory with a UUID', () => {
      const registry = new TempDirRegistry('monocrate-test-')

      const dir = registry.create()

      expect(path.basename(dir)).toMatch(UUID_REGEX)

      registry.cleanup()
    })

    it('creates distinct subdirectories on each call', () => {
      const registry = new TempDirRegistry('monocrate-test-')

      const dir1 = registry.create()
      const dir2 = registry.create()

      expect(dir1).not.toBe(dir2)

      registry.cleanup()
    })

    it('only calls mkdtempSync once for the root directory', () => {
      const registry = new TempDirRegistry('monocrate-test-')

      const dir1 = registry.create()
      const dir2 = registry.create()
      const dir3 = registry.create()

      const root1 = path.dirname(dir1)
      const root2 = path.dirname(dir2)
      const root3 = path.dirname(dir3)
      expect(root1).toBe(root2)
      expect(root2).toBe(root3)

      registry.cleanup()
    })

    it('is cleaned up by cleanup()', () => {
      const registry = new TempDirRegistry('monocrate-test-')
      const dir = registry.create()

      registry.cleanup()

      expect(fs.existsSync(dir)).toBe(false)
    })
  })

  describe('cleanup', () => {
    it('removes a single directory', () => {
      const registry = new TempDirRegistry('monocrate-test-')
      const dir = registry.create()

      registry.cleanup()

      expect(fs.existsSync(dir)).toBe(false)
    })

    it('removes all created directories', () => {
      const registry = new TempDirRegistry('monocrate-test-')
      const dir1 = registry.create()
      const dir2 = registry.create()
      const dir3 = registry.create()

      registry.cleanup()

      expect(fs.existsSync(dir1)).toBe(false)
      expect(fs.existsSync(dir2)).toBe(false)
      expect(fs.existsSync(dir3)).toBe(false)
    })

    it('removes directories including all nested contents', () => {
      const registry = new TempDirRegistry('monocrate-test-')
      const dir = registry.create()
      const deepDir = path.join(dir, 'a', 'b', 'c')
      fs.mkdirSync(deepDir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'top.txt'), 'top-level')
      fs.writeFileSync(path.join(deepDir, 'deep.txt'), 'deeply nested')
      fs.writeFileSync(path.join(dir, 'a', 'sibling.txt'), 'sibling')

      expect(fs.existsSync(path.join(deepDir, 'deep.txt'))).toBe(true)

      registry.cleanup()

      expect(fs.existsSync(dir)).toBe(false)
    })

    it('tolerates the root directory having been deleted externally', () => {
      const registry = new TempDirRegistry('monocrate-test-')
      const dir = registry.create()

      fs.rmSync(path.dirname(dir), { recursive: true, force: true })

      expect(() => {
        registry.cleanup()
      }).not.toThrow()
    })

    it('is a no-op when no directories have been created', () => {
      const registry = new TempDirRegistry('monocrate-test-')

      expect(() => {
        registry.cleanup()
      }).not.toThrow()
    })

    it('is a no-op when called a second time', () => {
      const registry = new TempDirRegistry('monocrate-test-')
      const dir = registry.create()

      registry.cleanup()
      expect(fs.existsSync(dir)).toBe(false)

      expect(() => {
        registry.cleanup()
      }).not.toThrow()
    })

    it('does not remove directories that were not created by the registry', () => {
      const registry = new TempDirRegistry('monocrate-test-')
      const created = registry.create()
      const unrelated = AbsolutePath(fs.mkdtempSync(path.join(os.tmpdir(), 'monocrate-test-unrelated-')))

      registry.cleanup()

      expect(fs.existsSync(created)).toBe(false)
      expect(fs.existsSync(unrelated)).toBe(true)

      fs.rmSync(unrelated, { recursive: true, force: true })
    })

    it('cleans up directories created after a previous cleanup', () => {
      const registry = new TempDirRegistry('monocrate-test-')
      const first = registry.create()
      registry.cleanup()

      const second = registry.create()
      registry.cleanup()

      expect(fs.existsSync(first)).toBe(false)
      expect(fs.existsSync(second)).toBe(false)
    })

    it('removes the root directory itself', () => {
      const registry = new TempDirRegistry('monocrate-test-')
      const dir = registry.create()
      const root = path.dirname(dir)

      registry.cleanup()

      expect(fs.existsSync(root)).toBe(false)
    })
  })
})
