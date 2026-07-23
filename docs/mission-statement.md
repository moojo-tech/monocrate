# Monopush Mission Statement

## What is the Problem?

You've built something valuable in your monorepo. Maybe it's a utility library that elegantly solves async batching, or a CLI tool that streamlines your deployment workflow. You want to open-source it, give back to the community. But there's a catch: it depends on three other internal packages. And one of those depends on two more. Now you're looking at publishing six packages when you only wanted to share one.

The naive approach fails immediately. When you run `npm publish` on a package that imports `@myorg/utils`, npm has no idea what that reference means. It's a workspace dependency that only exists inside your monorepo. The published package will be broken on install.

You have three bad options: (1) Publish all six packages separately, which means coordinating versions, managing six npm packages forever, and—worst of all—making your internal boundaries public API. That one helper function in a dependency you never meant to publish? Now it's public API, locked in until your next major version. The velocity and flexibility you gained from the monorepo evaporates because your internal implementation details became external contracts. (2) Bundle everything into a single file using esbuild or Rollup, which flattens your module structure, breaks tree-shaking, mangles source maps, and strips away the `.d.ts` declarations that TypeScript users need. (3) Manually copy files and rewrite imports yourself, which works once but breaks on the second PR when someone forgets a step.

The real killer is the import rewriting. When `packages/app/dist/index.js` contains `import { foo } from '@myorg/utils'`, that needs to become `import { foo } from './deps/packages/utils/dist/index.js'` in the published output. And it's not just JavaScript—your TypeScript declaration files have the same imports. Miss one `.d.ts` file and your package ships with broken types. Try to solve this with regex and you'll hit edge cases: re-exports, dynamic imports, subpath imports like `@myorg/utils/async`.

We ran into this trying to open-source pieces from our 110+ package monorepo. We didn't want to publish 110 packages. We didn't want to lose our module boundaries. We needed a way to extract a self-contained subtree with all imports resolved.

## Why Does This Matter?

Monorepos are increasingly where serious software development happens. They give you atomic commits across packages, shared tooling, and easier refactoring. But they create a barrier to open-source contribution. When you can't easily extract a package without publishing your entire internal dependency graph, the path of least resistance is to keep it private.

That's a loss for everyone. The TypeScript utilities you built to make your tests cleaner? A dozen other teams need that. The API client generator you wrote that handles pagination and retries elegantly? That shouldn't stay locked in your company's repo. But if publishing means signing up to maintain five new npm packages and keeping their versions synchronized forever, you're not going to do it.

The ecosystem needs more companies contributing back. Not entire monorepos—just the useful pieces. But the tooling hasn't made this easy. The gap between "we could open-source this" and "we actually did open-source this" is almost entirely friction. Monopush exists to remove that friction.

This isn't theoretical. We built this because we wanted to give back. We had packages worth sharing, but no good way to extract them. Now we do, and we're sharing both the packages and the tool that makes it possible.

## How Does Monopush Solve It?

Monopush treats publishing from a monorepo as a graph traversal problem followed by an AST transformation. You point it at the package you want to publish. It walks the dependency graph to find every internal package in the closure. It uses `npm pack` to determine which files each package would publish (respecting `.npmignore`, `files` field, etc.). It copies those files into an output directory, preserving each package's structure in a `deps/` folder.

Then comes the critical step: import rewriting. Monopush uses `ts-morph` to parse every `.js` and `.d.ts` file as a TypeScript AST. It finds import declarations, export-from declarations, and dynamic `import()` calls. For each import specifier, it checks if it references an internal package. If so, it resolves the target using the package's `exports` or `main` field, computes the relative path from the importing file to that resolved location, and rewrites the import. This handles all the edge cases: scoped packages, subpath exports, re-exports.

The output is a standard npm package. The `package.json` merges all third-party dependencies from the closure (and detects version conflicts). Entry points (`main`, `types`, `exports`) work unchanged because each package maintains its relative structure. You can publish it, and it installs cleanly. You can run your bundler on it, and tree-shaking works because the module boundaries are intact. You can debug it, and source locations make sense because files aren't concatenated.

Why not use a bundler? Bundlers create a single output file (or a small set of chunks). That's fine for applications, but libraries benefit from preserved module structure. Users can import just the submodule they need. Tree-shaking can eliminate dead code at the function level, not the package level. TypeScript's declaration emit naturally produces one `.d.ts` per `.ts` file—you don't want to flatten that.

Why AST-based rewriting? Regex will fail on template strings, comments that look like imports, or imports split across lines. We need the same resolution logic TypeScript uses—respecting `exports` maps, handling Node's module resolution algorithm. `ts-morph` gives us that, and it handles both JavaScript and TypeScript declarations with the same code path.

The philosophy: do one thing, do it well, integrate with the ecosystem. Monopush doesn't run your build (use `tsc` or `esbuild`). It doesn't manage versions across your monorepo (use Changesets or manual versioning). It solves the extraction and import rewriting problem, which nothing else solves cleanly.

## Guiding Principles

**Monorepo to npm should take seconds, not days.** Just run `npx monopush publish packages/my-app`. It just works. Easy to remember, nothing to configure. Ergonomics win.

**Don't be clever.** We use `npm pack` to determine publishable files instead of reimplementing the logic. We use `ts-morph` for parsing instead of regex. We delegate to existing, battle-tested tools rather than rolling our own. The tool should be boring and reliable.

**Fail early and loud.** When we detect third-party dependency version conflicts, we error immediately instead of silently picking one. When package boundaries would create circular dependencies, we tell you. When import resolution is ambiguous, we don't guess. Silent failures and "best effort" heuristics create downstream debugging nightmares. Better to stop at build time than ship broken packages.

**Workflow integration, not workflow replacement.** Monopush doesn't care how you build (`tsc`, `esbuild`, `swc`). It doesn't manage your monorepo (`npm`, `yarn`, `pnpm` workspaces all work). It doesn't handle versioning across packages (pass `--bump` or manage it yourself). It does one thing: make your built package publishable.

**Open-source is the goal.** The `--mirror-to` flag exists because we needed it: publish to npm from our private monorepo, but also mirror sources to a public GitHub repo for community contributions. This isn't a commercial product. It's infrastructure we built to give back, and we're giving back the infrastructure too.

## Why Are We the Right Team?

We're not building this from a spec or a product roadmap. We're building it because we hit this problem every time we tried to open-source something from our monorepo. Our monorepo has 110+ packages and over 100,000 lines of code. We've filed thousands of PRs. At that scale, manual processes don't work. You need tooling, and it needs to be reliable.

We tried the existing solutions. We tried bundling with esbuild and lost module structure. We tried isolate-package and wrote orchestration scripts. We tried manually copying files and broke TypeScript types. We tried publishing everything separately and gave up on open-sourcing anything.

Monopush exists because we needed it. We built it, tested it on our real packages, and used it to publish. The edge cases it handles—`exports` field resolution, dynamic imports in `.d.ts` files, devDependencies in mirror output—those are edge cases we actually hit. The ergonomics—one command, sensible defaults, clear error messages—reflect what we wanted when we were the users.

We're open-sourcing this not because it's a cool side project, but because we think other teams have the same problem. If you have a monorepo and want to share packages without publishing your entire dependency graph, you need something like this. We built it for ourselves, and now we're giving it back.
