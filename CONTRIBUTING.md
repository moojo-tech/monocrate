# Contributing to Monocrate

## Setup

Requires Node.js >= 20 and pnpm (`corepack enable`).

```bash
git clone https://github.com/YOUR_USERNAME/monocrate.git
cd monocrate
git remote add upstream https://github.com/imaman/monocrate.git
pnpm install
pnpm build && pnpm test  # verify setup works
```

Read [CLAUDE.md](CLAUDE.md) for architecture and coding patterns.

## Commands

```bash
pnpm build          # compile
pnpm test           # run tests
pnpm test:watch     # tests in watch mode
pnpm lint           # check formatting and linting
pnpm lint:fix       # fix formatting and linting
pnpm typecheck      # type check
```

## Pre-commit Hook

This repo runs `pnpm lint` automatically on pre-commit. Not everyone loves pre-commit hooks—if you find it disruptive, you can bypass it with `git commit --no-verify`.

That said, there's a reason we have it: it's frustrating to push a PR, wait for CI, and then discover it failed because of an indentation issue, a missing trailing newline, or some other trivial formatting problem. These are easy to fix but annoying to discover after the fact. The pre-commit hook catches these issues locally, before they waste your time on a round-trip.

## Before Submitting

1. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
2. Write tests for new code

## PR Titles

We squash commits, so your local commit messages don't matter—make them whatever you want. Only the PR title survives.

The PR title should tell the story in a short sentence. Finding the right balance between brief and descriptive is tricky. Examples from this repo:

- `do not publish if the deps graph is cyclic`
- `support negative workspaces patterns`
- `error on "workspace:" dependency not found in monorepo`
- `migrate to pnpm`
- `Fix typo: "Incosistency" → "Inconsistency"`

## Pull Requests

- Open an issue first for significant changes
- One feature or fix per PR
- PRs must pass CI

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Help

[Open an issue](https://github.com/imaman/monocrate/issues) or [start a discussion](https://github.com/imaman/monocrate/discussions).
