**The trap looks like this:**

You have a monorepo, you're really proud of `@acme/my-awesome-package` and you want to publish it to npm. The package imports your internal utilities:

```typescript
// packages/my-awesome-package/src/index.ts
import { validateUserInput } from '@acme/internal-utils'
// A bunch of stuff goes here ...
```

When you publish, things look great:

```bash
$ cd packages/my-awesome-package
$ npm publish
npm notice
npm notice 📦  @acme/my-awesome-package@1.0.0
...
+ @acme/my-awesome-package@1.0.0
```

But when you try to install it:

```bash
$ npm install @acme/my-awesome-package
npm error code E404
npm error 404  '@acme/internal-utils@1.0.0' is not in this registry.
```

**Why this happens:**

1. **The tarball only contains `my-awesome-package`.** Your workspace sibling `@acme/internal-utils` is not bundled.
2. **`package.json` still declares `@acme/internal-utils` as a dependency.** npm tries to install it from the registry.
3. **The package does not exist on npm.** It only exists in your local workspace.

**This is the big "oh-no" moment.** Your package is live but broken for every consumer.

(And the obvious escape hatches — `bundledDependencies`, `file:` dependencies — don't get you out of it either. See [approaches-considered.md](approaches-considered.md) for why.)

