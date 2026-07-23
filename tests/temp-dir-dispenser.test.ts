import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { TempDirDispenser } from '../src/temp-dir-dispenser.js'
import { AbsolutePath } from '../src/paths.js'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('TempDirDispenser', () => {
  describe('create', () => {
    it('creates a directory that exists on disk', () => {
      const dispenser = new TempDirDispenser('my-temp-dir')

      const dir = dispenser.create()

      expect(fs.existsSync(dir)).toBe(true)
      expect(fs.statSync(dir).isDirectory()).toBe(true)

      dispenser.cleanup()
    })

    it('creates subdirectories under a single root in os.tmpdir() with the given prefix', () => {
      const dispenser = new TempDirDispenser('my-temp-dir')

      const dir1 = dispenser.create()
      const dir2 = dispenser.create()

      const root = path.dirname(dir1)
      expect(root).toContain(path.join(os.tmpdir(), 'my-temp-dir'))
      expect(path.dirname(dir2)).toBe(root)

      dispenser.cleanup()
    })

    it('names each subdirectory with a UUID', () => {
      const dispenser = new TempDirDispenser('my-temp-dir')

      const dir = dispenser.create()

      expect(path.basename(dir)).toMatch(UUID_REGEX)

      dispenser.cleanup()
    })

    it('creates distinct subdirectories on each call', () => {
      const dispenser = new TempDirDispenser('my-temp-dir')

      const dir1 = dispenser.create()
      const dir2 = dispenser.create()

      expect(dir1).not.toBe(dir2)

      dispenser.cleanup()
    })

    it('only calls mkdtempSync once for the root directory', () => {
      const dispenser = new TempDirDispenser('my-temp-dir')

      const dir1 = dispenser.create()
      const dir2 = dispenser.create()
      const dir3 = dispenser.create()

      const root1 = path.dirname(dir1)
      const root2 = path.dirname(dir2)
      const root3 = path.dirname(dir3)
      expect(root1).toBe(root2)
      expect(root2).toBe(root3)

      dispenser.cleanup()
    })

    it('is cleaned up by cleanup()', () => {
      const dispenser = new TempDirDispenser('my-temp-dir')
      const dir = dispenser.create()

      dispenser.cleanup()

      expect(fs.existsSync(dir)).toBe(false)
    })
  })

  describe('cleanup', () => {
    it('removes a single directory', () => {
      const dispenser = new TempDirDispenser('my-temp-dir')
      const dir = dispenser.create()

      dispenser.cleanup()

      expect(fs.existsSync(dir)).toBe(false)
    })

    it('removes all created directories', () => {
      const dispenser = new TempDirDispenser('my-temp-dir')
      const dir1 = dispenser.create()
      const dir2 = dispenser.create()
      const dir3 = dispenser.create()

      dispenser.cleanup()

      expect(fs.existsSync(dir1)).toBe(false)
      expect(fs.existsSync(dir2)).toBe(false)
      expect(fs.existsSync(dir3)).toBe(false)
    })

    it('removes directories including all nested contents', () => {
      const dispenser = new TempDirDispenser('my-temp-dir')
      const dir = dispenser.create()
      const deepDir = path.join(dir, 'a', 'b', 'c')
      fs.mkdirSync(deepDir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'top.txt'), 'top-level')
      fs.writeFileSync(path.join(deepDir, 'deep.txt'), 'deeply nested')
      fs.writeFileSync(path.join(dir, 'a', 'sibling.txt'), 'sibling')

      expect(fs.existsSync(path.join(deepDir, 'deep.txt'))).toBe(true)

      dispenser.cleanup()

      expect(fs.existsSync(dir)).toBe(false)
    })

    it('tolerates the root directory having been deleted externally', () => {
      const dispenser = new TempDirDispenser('my-temp-dir')
      const dir = dispenser.create()

      fs.rmSync(path.dirname(dir), { recursive: true, force: true })

      expect(() => {
        dispenser.cleanup()
      }).not.toThrow()
    })

    it('is a no-op when no directories have been created', () => {
      const dispenser = new TempDirDispenser('my-temp-dir')

      expect(() => {
        dispenser.cleanup()
      }).not.toThrow()
    })

    it('is a no-op when called a second time', () => {
      const dispenser = new TempDirDispenser('my-temp-dir')
      const dir = dispenser.create()

      dispenser.cleanup()
      expect(fs.existsSync(dir)).toBe(false)

      expect(() => {
        dispenser.cleanup()
      }).not.toThrow()
    })

    it('does not remove directories that were not created by the dispenser', () => {
      const dispenser = new TempDirDispenser('my-temp-dir')
      const created = dispenser.create()
      const unrelated = AbsolutePath(fs.mkdtempSync(path.join(os.tmpdir(), 'my-temp-dirunrelated-')))

      dispenser.cleanup()

      expect(fs.existsSync(created)).toBe(false)
      expect(fs.existsSync(unrelated)).toBe(true)

      fs.rmSync(unrelated, { recursive: true, force: true })
    })

    it('cleans up directories created after a previous cleanup', () => {
      const dispenser = new TempDirDispenser('my-temp-dir')
      const first = dispenser.create()
      dispenser.cleanup()

      const second = dispenser.create()
      dispenser.cleanup()

      expect(fs.existsSync(first)).toBe(false)
      expect(fs.existsSync(second)).toBe(false)
    })

    it('removes the root directory itself', () => {
      const dispenser = new TempDirDispenser('my-temp-dir')
      const dir = dispenser.create()
      const root = path.dirname(dir)

      dispenser.cleanup()

      expect(fs.existsSync(root)).toBe(false)
    })
  })
})
