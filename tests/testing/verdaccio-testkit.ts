import type { ChildProcess } from 'node:child_process'
import { execSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createTempDir } from './monocrate-teskit.js'
import getPort from 'get-port'
import path from 'node:path'
import fs from 'node:fs'
import { folderify } from './folderify.js'
import { z } from 'zod'

interface VerdaccioServer {
  process: ChildProcess
  url: string
  configDir: string
  npmrcPath: string
}

const NpmViewResult = z.object({
  name: z.string(),
  version: z.string(),
  versions: z.array(z.string()).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  'dist-tags': z.record(z.string(), z.string()),
})
type NpmViewResult = z.infer<typeof NpmViewResult>

interface RunConsumerOptions {
  manager?: 'npm' | 'yarn@v1' | 'yarn@berry' | 'pnpm' | 'bun'
}

// Both yarn v1 (`yarn`) and yarn berry (`@yarnpkg/cli-dist`) register the same binary
// names (`yarn`, `yarnpkg`), so npx can't distinguish them when both are installed.
// We resolve the exact bin paths instead.
const yarnV1Bin = path.resolve(import.meta.dirname, '../../node_modules/yarn/bin/yarn.js')
const yarnBerryBin = path.resolve(import.meta.dirname, '../../node_modules/@yarnpkg/cli-dist/bin/yarn.js')
const bunBin = path.resolve(import.meta.dirname, '../../node_modules/.bin/bun')

export class VerdaccioTestkit {
  private server: VerdaccioServer | undefined = undefined

  async start() {
    this.server = await startVerdaccio()
  }

  get() {
    if (!this.server) {
      throw new Error(`Verdaccio server is not up. Did you call start()?`)
    }

    return this.server
  }

  npmrcPath() {
    return this.get().npmrcPath
  }

  async shutdown() {
    await stopVerdaccio(this.get())
  }

  runView(packageName: string): NpmViewResult {
    // Verify the package was published by checking npm view
    const viewResult = execSync(`npm view ${packageName} --registry=${this.get().url} --json`, {
      encoding: 'utf-8',
    })

    const parsed = NpmViewResult.safeParse(JSON.parse(viewResult))
    if (!parsed.success) {
      throw new Error(`Failed to parse npm view result: ${parsed.error.message}`)
    }
    return parsed.data
  }

  runInstall(dir: string, packageName: string, options?: RunConsumerOptions) {
    const registry = this.get().url
    switch (options?.manager) {
    case 'yarn@v1': {
      execSync(`node ${yarnV1Bin} add ${packageName} --registry=${registry}`, { cwd: dir, stdio: 'pipe' })
      return
    }
    case 'yarn@berry': {
      writeYarnBerryConfig(dir, registry)
      execSync(`node ${yarnBerryBin} add ${packageName}`, {
        cwd: dir,
        stdio: 'pipe',
        env: noProxyEnv(),
      })
      return
    }
    case 'pnpm': {
      fs.copyFileSync(this.get().npmrcPath, path.join(dir, '.npmrc'))
      execSync(`pnpm add ${packageName}`, { cwd: dir, stdio: 'pipe', env: noProxyEnv() })
      return
    }
    case 'bun': {
      fs.copyFileSync(this.get().npmrcPath, path.join(dir, '.npmrc'))
      try {
        execSync(`${bunBin} add ${packageName}`, { cwd: dir, stdio: 'pipe', env: noProxyEnv() })
      } catch (e) {
        const ee = e as { stdout: Buffer; stderr: Buffer }
        console.error(`stdout=`, ee.stdout.toString())
        console.error(`stderr=`, ee.stderr.toString())
        throw e
      }
      return
    }
    default: {
      execSync(`npm install ${packageName} --registry=${registry}`, { cwd: dir, stdio: 'pipe' })
    }
    }
  }

  publishPackage(name: string, version: string, jsSourceCode: string) {
    const dir = folderify({
      '.npmrc': fs.readFileSync(this.get().npmrcPath, 'utf-8'),
      'package.json': { name, version, main: 'index.js' },
      'index.js': jsSourceCode,
    })
    // Publish a package directly to Verdaccio
    // execSync throws if the command fails, which will fail the test
    execSync(`npm publish --registry=${this.get().url}`, { cwd: dir, stdio: 'pipe' })
  }

  publishTarball(tarballPath: string) {
    execSync(`npm publish ${JSON.stringify(tarballPath)} --userconfig ${JSON.stringify(this.get().npmrcPath)}`, {
      stdio: 'pipe',
    })
  }

  runConsumer(depToInstall: string, ...jsSourceCode: string[]): string
  runConsumer(depToInstall: string, options: RunConsumerOptions, ...jsSourceCode: string[]): string
  runConsumer(depToInstall: string, optionsOrCode?: RunConsumerOptions | string, ...jsSourceCode: string[]): string {
    const options: RunConsumerOptions = typeof optionsOrCode === 'object' ? optionsOrCode : {}
    const allCode = typeof optionsOrCode === 'string' ? [optionsOrCode, ...jsSourceCode] : jsSourceCode

    const fileName = `dist/index.js`
    const dir = folderify({
      'package.json': { name: 'na', version: '1.0.0' },
      [fileName]: allCode.join('\n'),
    })

    this.runInstall(dir, depToInstall, options)

    return execSync(`node ${fileName}`, { cwd: dir, encoding: 'utf-8' }).trim()
  }
}
async function startVerdaccio(): Promise<VerdaccioServer> {
  const configDir = createTempDir('verdaccio-config-')
  const storageDir = path.join(configDir, 'storage')
  fs.mkdirSync(storageDir, { recursive: true })

  const port = await getPort()
  const url = `http://localhost:${String(port)}`

  // Create htpasswd file with a test user
  // Using SHA1 format ({SHA}base64hash) which is supported by Apache htpasswd and Verdaccio
  const testUser = 'testuser'
  const testPassword = 'testpassword'
  const sha1Hash = createHash('sha1').update(testPassword).digest('base64')
  const hashedPassword = `{SHA}${sha1Hash}`
  const htpasswdPath = path.join(configDir, 'htpasswd')
  fs.writeFileSync(htpasswdPath, `${testUser}:${hashedPassword}\n`)

  // Create Verdaccio config file (JSON format)
  const configPath = path.join(configDir, 'config.json')
  const config = {
    storage: storageDir,
    auth: {
      htpasswd: {
        file: htpasswdPath,
      },
    },
    packages: {
      '@*/*': {
        access: '$all',
        publish: '$authenticated',
        unpublish: '$authenticated',
      },
      '**': {
        access: '$all',
        publish: '$authenticated',
        unpublish: '$authenticated',
      },
    },
    log: {
      type: 'stdout',
      format: 'pretty',
      level: 'warn',
    },
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

  // Create npm auth token for the test user
  // npm uses base64(username:password) as the token for basic auth
  const authToken = Buffer.from(`${testUser}:${testPassword}`).toString('base64')
  const npmrcContent = `registry=${url}\n//${new URL(url).host}/:_auth=${authToken}\n`

  const npmrcPath = path.join(configDir, 'verdaccio.npmrc')
  fs.writeFileSync(npmrcPath, npmrcContent)

  return new Promise((resolve, reject) => {
    const verdaccioProcess = spawn('npx', ['verdaccio', '--config', configPath, '--listen', String(port)], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let started = false
    const timeout = setTimeout(() => {
      if (!started) {
        verdaccioProcess.kill()
        reject(new Error('Verdaccio failed to start within timeout'))
      }
    }, 30000)

    const checkReady = (data: Buffer) => {
      const output = data.toString()
      if (output.includes('http address') || output.includes('listen on')) {
        started = true
        clearTimeout(timeout)
        // Give it a moment to be fully ready
        setTimeout(() => {
          resolve({
            process: verdaccioProcess,
            url,
            configDir,
            npmrcPath,
          })
        }, 500)
      }
    }

    verdaccioProcess.stdout.on('data', checkReady)
    verdaccioProcess.stderr.on('data', checkReady)

    verdaccioProcess.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

function noProxyEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!/proxy/i.test(key)) {
      env[key] = value
    }
  }
  return env
}

function writeYarnBerryConfig(dir: string, registry: string) {
  fs.writeFileSync(
    path.join(dir, '.yarnrc.yml'),
    [
      'nodeLinker: node-modules',
      `npmRegistryServer: "${registry}"`,
      'enableImmutableInstalls: false',
      'enableGlobalCache: false',
      'httpProxy: ""',
      'httpsProxy: ""',
      'unsafeHttpWhitelist:',
      '  - localhost',
    ].join('\n')
  )
}

function stopVerdaccio(verdaccio: VerdaccioServer): Promise<void> {
  return new Promise((resolve) => {
    verdaccio.process.on('exit', () => {
      resolve()
    })
    verdaccio.process.kill()
    // Force resolve after 5 seconds if process doesn't exit
    setTimeout(() => {
      resolve()
    }, 5000)
  })
}
