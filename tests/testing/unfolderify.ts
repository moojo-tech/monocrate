import type { FolderifyRecipe } from './folderify-recipe.js'
import path from 'node:path'
import fs from 'node:fs'

export function unfolderify(dir: string): FolderifyRecipe {
  const result: FolderifyRecipe = {}

  function walk(currentDir: string, prefix: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isSymbolicLink()) {
        // Skip symlinks (e.g., node_modules symlinks created for file: deps)
      } else if (entry.isDirectory()) {
        walk(fullPath, relativePath)
      } else {
        const content = fs.readFileSync(fullPath, 'utf-8')
        if (entry.name.endsWith('.json')) {
          result[relativePath] = JSON.parse(content)
        } else {
          result[relativePath] = content
        }
      }
    }
  }

  walk(dir, '')
  return result
}
