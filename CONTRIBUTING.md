# Contributing to Monocrate

Thank you for your interest in contributing to Monocrate! We welcome contributions from everyone, regardless of experience level. This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Testing](#testing)
- [Commit Message Format](#commit-message-format)
- [Pull Request Process](#pull-request-process)
- [Troubleshooting](#troubleshooting)
- [Getting Help](#getting-help)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the maintainers.

## Ways to Contribute

There are many ways to contribute to Monocrate:

- **Report bugs**: Found something broken? [Open a bug report](https://github.com/imaman/monocrate/issues/new?template=bug_report.md)
- **Suggest features**: Have an idea? [Submit a feature request](https://github.com/imaman/monocrate/issues/new?template=feature_request.md)
- **Improve documentation**: Help others by clarifying docs or adding examples
- **Submit code changes**: Fix bugs, add features, or improve performance
- **Review pull requests**: Help review and test changes from other contributors
- **Answer questions**: Help others in issues and discussions

## Development Setup

### Prerequisites

- Node.js >= 20.0.0
- pnpm (install via `corepack enable` or `npm install -g pnpm`)
- Git

### Getting Started

1. **Fork the repository** on GitHub

2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/monocrate.git
   cd monocrate
   ```

3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/imaman/monocrate.git
   ```

4. **Install dependencies**:
   ```bash
   pnpm install
   ```

5. **Verify your setup**:
   ```bash
   pnpm build
   pnpm test
   ```

6. **Read CLAUDE.md** for architecture overview and coding patterns used in this project

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm build` | Compile TypeScript to JavaScript |
| `pnpm test` | Run tests once |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm lint` | Check code for linting errors |
| `pnpm lint:fix` | Automatically fix linting errors |
| `pnpm format` | Format code with Prettier |
| `pnpm format:check` | Check if code is formatted |
| `pnpm typecheck` | Run TypeScript type checking |

## Code Style

We use ESLint and Prettier to maintain consistent code style.

### ESLint

Our ESLint configuration enforces:

- TypeScript strict type checking
- No explicit `any` types
- Explicit function return types (warning)
- Consistent type imports
- No unused variables (except those prefixed with `_`)

Run the linter:
```bash
pnpm lint
pnpm lint:fix  # Auto-fix issues
```

### Prettier

Our Prettier configuration:

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

Format your code:
```bash
pnpm format
pnpm format:check  # Check without modifying
```

### TypeScript

We use strict TypeScript settings. Key requirements:

- All code must pass type checking with `pnpm typecheck`
- Use type imports: `import type { Foo } from './foo'`
- Avoid `any` - use `unknown` with type guards if needed
- All function parameters and return types should be typed

## Testing

We use [Vitest](https://vitest.dev/) for testing.

### Running Tests

```bash
pnpm test              # Run all tests once
pnpm test:watch        # Run tests in watch mode (recommended during development)
pnpm test:coverage     # Run tests with coverage report
```

### Writing Tests

- Test files should be named `*.test.ts` and placed alongside the source files
- Write descriptive test names that explain expected behavior
- Aim for high test coverage on new code
- Include both happy path and error cases

Example test structure:
```typescript
import { describe, it, expect } from 'vitest'
import { myFunction } from './my-module'

describe('myFunction', () => {
  it('should return expected value for valid input', () => {
    expect(myFunction('valid')).toBe('expected')
  })

  it('should throw error for invalid input', () => {
    expect(() => myFunction('')).toThrow('Input required')
  })
})
```

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/) for clear, consistent commit history.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only changes |
| `style` | Code style changes (formatting, semicolons, etc.) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `build` | Changes to build system or dependencies |
| `ci` | Changes to CI configuration |
| `chore` | Other changes that don't modify src or test files |

### Examples

```bash
feat(bundler): add support for workspace dependencies
fix(resolver): handle circular dependency detection
docs: update installation instructions
test(transformer): add tests for edge cases
refactor(core): simplify package resolution logic
```

### Scope (Optional)

Use a scope to provide additional context:
- `core` - Core bundling functionality
- `resolver` - Dependency resolution
- `transformer` - Package transformation
- `security` - Security-related code
- `cli` - Command-line interface

## Pull Request Process

### Before You Start

1. **Check existing issues** to avoid duplicate work
2. **Open an issue first** for significant changes to discuss the approach
3. **Keep PRs focused** - one feature or fix per PR

### Creating a Pull Request

1. **Create a branch** from `main`:
   ```bash
   git checkout main
   git pull upstream main
   git checkout -b feat/my-feature
   ```

2. **Make your changes** following the code style guidelines

3. **Write or update tests** for your changes

4. **Run all checks locally**:
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

5. **Commit your changes** using conventional commit format

6. **Push to your fork**:
   ```bash
   git push origin feat/my-feature
   ```

7. **Open a pull request** against `main`

### PR Requirements

Your pull request should:

- [ ] Have a clear, descriptive title
- [ ] Reference any related issues
- [ ] Include tests for new functionality
- [ ] Pass all CI checks (lint, typecheck, tests, build)
- [ ] Update documentation if needed
- [ ] Have no merge conflicts with `main`

### Review Process

1. A maintainer will review your PR
2. Address any requested changes
3. Once approved, a maintainer will merge your PR
4. Your contribution will be included in the next release

## Troubleshooting

### pnpm not found

If you see "pnpm: command not found", install pnpm:

```bash
corepack enable
# or
npm install -g pnpm
```

### Module not found errors

pnpm uses a stricter `node_modules` structure than npm. If you see "module not found" errors for a package you're using but didn't declare, add it explicitly:

```bash
pnpm add <package-name>
```

### IDE not finding types

Some editors cache `node_modules` paths. Try:

1. Restart your editor/IDE
2. In VS Code: `Cmd/Ctrl + Shift + P` → "TypeScript: Restart TS Server"

## Getting Help

- **Questions?** Open a [GitHub Discussion](https://github.com/imaman/monocrate/discussions)
- **Found a bug?** [Open an issue](https://github.com/imaman/monocrate/issues/new?template=bug_report.md)
- **Have an idea?** [Submit a feature request](https://github.com/imaman/monocrate/issues/new?template=feature_request.md)

---

Thank you for contributing to Monocrate!
