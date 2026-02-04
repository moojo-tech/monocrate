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
pnpm lint           # check style
pnpm lint:fix       # fix style
pnpm typecheck      # type check
```

## Before Submitting

1. Run `pnpm lint && pnpm test && pnpm build`
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
