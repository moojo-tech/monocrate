export interface MonocrateOptions {
  /**
   * Paths to the directories of the various package to assemble. If a string, it is transformed to a single element array.
   * Can be absolute or relative. Relative paths are resolved from the cwd option.
   */
  pathToSubjectPackages: string[] | string
  /**
   * Path to the monorepo root directory.
   * Can be absolute or relative. Relative paths are resolved from the cwd option.
   * If not specified, auto-detected by searching for a root package.json with workspaces.
   */
  monorepoRoot?: string
  /**
   * Version specifier for the assembly.
   * Accepts either an explicit semver version (e.g., "1.2.3") or an increment keyword ("patch", "minor", "major").
   * The resolved version is either this value (if it is an explicit semver value) or is obtained by finding the
   * current version of all the packages to publish, finding the highest version of these, and then applying
   * the increment depicted by this value.
   *
   * Defaults to "minor".
   */
  bump?: string
  /**
   * Whether to publish the assemblies to npm after packing.
   * When false, the assembly is prepared with the resolved version but not published
   * (useful for inspection or manual publishing).
   */
  publish: boolean
  /**
   * Base directory for resolving relative paths. Must be a valid, existing directory.
   */
  cwd: string

  /**
   * Path to an .npmrc file to use in npm commands as "userconfig". Settings from this file are merged with any
   * package-specific .npmrc file, with the package-specific file's settings winning on conflicts (see
   * https://docs.npmjs.com/cli/v11/configuring-npm/npmrc#files).
   */
  npmrcPath?: string

  /**
   * Path to a directory where source files should be mirrored.
   *
   * Primary use case: copying exact source code from a private monorepo to a public mirror
   * repository for published, open-sourced, packages.
   *
   * Mirrors all assembled packages (the main package and its in-repo dependencies).
   * Only committed files (from HEAD) are copied, preserving their path structure relative
   * to the monorepo root. Fails if any package has untracked files.
   * Each package's target directory is wiped before copying.
   *
   * Can be absolute or relative. Relative paths are resolved from the cwd option.
   */
  mirrorTo?: string

  /**
   * Whether to use the maximum version across all packages.
   *
   * When true: All packages are published at the same version, computed as the
   * maximum of all individual resolved versions.
   *
   * When false (default): Each package is published at its own individually resolved version based
   * on its current published version. Useful when packages have divergent version histories
   * and you want to preserve meaningful versioning per package.
   */
  max?: boolean

  /**
   * Directory where the tarball of each assembled package is placed, named `<name>-<version>.tgz`
   * (scoped names have their `@` dropped and `/` replaced with `-`).
   * Only applies when publish is false. If not specified, defaults to the cwd option.
   */
  packDestination?: string
  /**
   * How to treat dynamic `import()` calls whose argument is not a string literal. Such imports cannot be rewritten,
   * so if they resolve to an in-repo dependency they will break at runtime in the published package. "reject" fails
   * the packaging process. "allow" leaves them as-is, Use "allow" if you are sure the imported string value is resolved
   * to an externally published package.
   *
   * String-literal dynamic imports are always rewritten, regardless of this value.
   *
   * Defaults to "reject".
   */
  dynamicImportsPolicy?: 'allow' | 'reject'
}
