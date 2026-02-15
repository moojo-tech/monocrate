import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import type { Arguments, Argv } from 'yargs'
import { z } from 'zod'
import type { MonocrateOptions } from './monocrate.js'
import { monocrate } from './monocrate.js'
import { createConsoleReporter } from './reporter.js'

function findPackageJson(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 3; i++) {
    const candidate = path.join(dir, 'package.json')
    if (fs.existsSync(candidate)) {
      return candidate
    }
    dir = path.dirname(dir)
  }
  throw new Error('Could not find package.json')
}

const pkg = JSON.parse(fs.readFileSync(findPackageJson(), 'utf-8')) as { version: string }

interface CommonYargsArgs {
  packages: string[]
  root?: string
  bump?: string
  'result-file'?: string
  'mirror-to'?: string
  max: boolean
}

interface PackYargsArgs extends CommonYargsArgs {
  'pack-destination'?: string
}

interface PublishYargsArgs extends CommonYargsArgs {
  otp?: string
}

function withCommonCommandOptions(parser: Argv, packageDescription: string): Argv<CommonYargsArgs> {
  return parser
    .positional('packages', {
      describe: packageDescription,
      type: 'string',
      array: true,
      demandOption: true,
    })
    .option('bump', {
      alias: 'b',
      type: 'string',
      description: 'Version, increment (patch/minor/major), or "package" to use package.json version',
    })
    .option('root', {
      alias: 'r',
      type: 'string',
      description: 'Monorepo root (auto-detected if omitted)',
    })
    .option('result-file', {
      type: 'string',
      description: 'Write full result as JSON to file',
    })
    .option('mirror-to', {
      alias: 'm',
      type: 'string',
      description: 'Mirror source files to directory',
    })
    .option('max', {
      type: 'boolean',
      description: 'Use max version across all packages (default: false)',
      default: false,
    })
}

function withPackCommandOptions(parser: Argv): Argv<PackYargsArgs> {
  return withCommonCommandOptions(parser, 'Package directories to create tarballs for').option('pack-destination', {
    alias: 'd',
    type: 'string',
    description: 'Directory to write tarballs to',
  })
}

const NpmPassthroughArgs = z.array(z.string()).optional()

async function runCommand(
  args: Arguments<CommonYargsArgs>,
  publish: boolean,
  packDestination?: string,
  npmPublishArgs?: string[],
  otp?: string
): Promise<void> {
  const cwd = process.cwd()
  const options: MonocrateOptions = {
    pathToSubjectPackages: args.packages,
    packDestination,
    monorepoRoot: args.root,
    bump: args.bump,
    publish,
    cwd,
    mirrorTo: args['mirror-to'],
    max: args.max,
    npmPublishArgs,
    otp,
    reporter: createConsoleReporter(),
  }
  const result = await monocrate(options)
  if (args['result-file']) {
    const resultFilePath = path.resolve(cwd, args['result-file'])
    fs.writeFileSync(resultFilePath, JSON.stringify(result, undefined, 2) + '\n')
  }
}

export function monocrateCli(): void {
  const parser = yargs(hideBin(process.argv))
    .scriptName('monocrate')
    .version(pkg.version)
    .parserConfiguration({ 'populate--': true })
    .command<PackYargsArgs>(
      'pack <packages...>',
      `Create publish-ready tarball(s) without publishing to npm.`,
      (yargs) => withPackCommandOptions(yargs),
      async (args) => runCommand(args, false, args['pack-destination'])
    )
    .command<PublishYargsArgs>(
      'publish <packages...>',
      `Publish one or more packages to npm.`,
      (yargs) =>
        withCommonCommandOptions(yargs, 'Package directories to publish').option('otp', {
          type: 'string',
          description: 'One-time password for npm 2FA (forwarded to all npm write operations)',
        }),
      async (args) => {
        const parsed = NpmPassthroughArgs.safeParse(args['--'])
        if (!parsed.success) {
          throw new Error(`Invalid passthrough args: ${parsed.error.message}`)
        }
        return runCommand(args, true, undefined, parsed.data, args.otp)
      }
    )
    .demandCommand(1)
    .strictCommands()
    .example('$0 publish pkg/foo --bump patch', 'Bump to next patch and publish')
    .example('$0 publish libs/a libs/b', 'Multi-package publish (defaults to minor bump)')
    .example('$0 pack pkg/foo --pack-destination /tmp/inspect', 'Create tarballs without publishing')
    .example('$0 publish pkg/foo --bump package', 'Use version from package.json and publish')
    .example('$0 publish pkg/foo -- --tag beta --access public', 'Passthrough args to npm publish')
    .strict()
    .help()
    .option('help', { hidden: true })

  void parser.parseAsync().catch((error: unknown) => {
    console.error('Fatal error:', error instanceof Error ? error.stack : error)
    process.exit(1)
  })
}
