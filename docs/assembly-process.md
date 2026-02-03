# The Assembly Process

Here's a conceptual breakdown of the steps that happen at a typical `monocrate` run:

0. **Setup**: Creates a dedicated output directory
1. **Version Resolution**: Computes the new version (see [Version Resolution](../README.md#version-resolution))
2. **Dependency Discovery**: Traverses the dependency graph to find all in-repo packages the package depends on, transitively
3. **File Embedding**: Copies the publishable files (per `npm pack`) of each in-repo dependency into the output directory
4. **Entry Point Resolution**: Examines each package's entry points (respecting `exports` and `main` fields) to compute
the exact file locations that import statements will resolve to
5. **Import Rewriting**: Scans the `.js` and `.d.ts` files, converting imports of workspace packages to relative path
imports (`@acme/internal-utils` becomes `../deps/__acme__internal-utils/dist/index.js`)
6. **Package.json Rewrite**: Sets the resolved version, removes in-repo deps, and adds any third-party deps they brought in
