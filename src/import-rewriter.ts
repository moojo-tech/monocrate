import * as path from 'node:path'
import { Project, SyntaxKind } from 'ts-morph'
import type { PackageMap } from './package-location.js'
import { resolveImport } from './collect-package-locations.js'
import { AbsolutePath, RelativePath } from './paths.js'

export type InRepoPackageChecker = (packageName: string) => boolean
export type OutputPathToRepoPath = (outputPath: AbsolutePath) => string

export class ImportRewriter {
  constructor(
    private packageMap: PackageMap,
    private isInRepoPackage: InRepoPackageChecker,
    private toRepoPath: OutputPathToRepoPath
  ) {}

  async rewriteAll(files: AbsolutePath[]): Promise<void> {
    const rewritableFiles = files.filter((f) => /\.(js|mjs|d\.ts|d\.mts)$/.test(f))
    for (const file of rewritableFiles) {
      await this.rewriteFile(file)
    }
  }

  private async rewriteFile(pathToImporter: AbsolutePath): Promise<void> {
    const project = new Project({ useInMemoryFileSystem: false })
    const sourceFile = project.addSourceFileAtPath(pathToImporter)

    let modified = false

    // Rewrite static import declarations:
    //   import { foo } from '@myorg/utils'  ->  import { foo } from './deps/__myorg__utils/dist/index.js'
    for (const decl of sourceFile.getImportDeclarations()) {
      const specifier = decl.getModuleSpecifierValue()
      const newSpecifier = this.computeNewSpecifier(pathToImporter, specifier)
      if (newSpecifier) {
        decl.setModuleSpecifier(newSpecifier)
        modified = true
      }
    }

    // Rewrite re-export declarations:
    //   export { bar } from '@myorg/utils'  ->  export { bar } from './deps/__myorg__utils/dist/index.js'
    for (const decl of sourceFile.getExportDeclarations()) {
      const specifier = decl.getModuleSpecifierValue()
      if (specifier) {
        const newSpecifier = this.computeNewSpecifier(pathToImporter, specifier)
        if (newSpecifier) {
          decl.setModuleSpecifier(newSpecifier)
          modified = true
        }
      }
    }

    // Rewrite dynamic import() calls:
    //   const mod = await import('@myorg/utils')  ->  const mod = await import('./deps/__myorg__utils/dist/index.js')
    for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = callExpr.getExpression()
      if (expr.getKind() === SyntaxKind.ImportKeyword) {
        const args = callExpr.getArguments()
        const firstArg = args[0]
        if (firstArg?.getKind() === SyntaxKind.StringLiteral) {
          const specifier = firstArg.getText().slice(1, -1)
          const newSpecifier = this.computeNewSpecifier(pathToImporter, specifier)
          if (newSpecifier) {
            firstArg.replaceWithText(`'${newSpecifier}'`)
            modified = true
          }
        } else if (firstArg) {
          const line = String(firstArg.getStartLineNumber())
          const computedExpr = firstArg.getText()
          throw new Error(
            `Computed import not supported: import(${computedExpr}) at ${pathToImporter}:${line}. ` +
              `Dynamic imports must use string literals so monocrate can analyze and rewrite them.`
          )
        }
      }
    }

    if (modified) {
      await sourceFile.save()
    }
  }

  private computeNewSpecifier(pathToImporter: AbsolutePath, importSpecifier: string) {
    const { packageName, subPath } = this.extractPackageName(importSpecifier)
    const importeeLocation = this.packageMap.get(packageName)
    if (!importeeLocation) {
      if (this.isInRepoPackage(packageName)) {
        const repoPath = this.toRepoPath(pathToImporter)
        throw new Error(
          `Import of in-repo package "${packageName}" found in ${repoPath}, ` +
            `but "${packageName}" is not listed in package.json dependencies`
        )
      }
      return undefined
    }

    const pathAtImportee = resolveImport(importeeLocation.packageJson, subPath)
    return this.computeRelativePath(
      pathToImporter,
      AbsolutePath.join(importeeLocation.toDir, RelativePath(pathAtImportee))
    )
  }

  private extractPackageName(specifier: string) {
    const parts = specifier.split('/')
    const cutoff = specifier.startsWith('@') ? 2 : 1
    return { packageName: parts.slice(0, cutoff).join('/'), subPath: parts.slice(cutoff).join('/') }
  }

  private computeRelativePath(importerPath: AbsolutePath, absoluteImporteePath: AbsolutePath): string {
    let relative = path.relative(path.dirname(importerPath), absoluteImporteePath)
    if (!relative.startsWith('.')) {
      relative = './' + relative
    }
    return relative
  }
}
