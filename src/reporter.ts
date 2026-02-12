import * as path from 'node:path'

export type ReporterEvent =
  | { type: 'monorepoRoot'; root: string }
  | { type: 'npmLogin'; username: string }
  | { type: 'closure'; packageName: string; inRepoDeps: string[] }
  | { type: 'version'; packageName: string; version: string }
  | { type: 'assemble'; packageName: string; version: string }
  | { type: 'publish'; packageName: string; version: string }
  | { type: 'tagLatest'; packageName: string; version: string }
  | { type: 'pack'; packageName: string; tarballPath: string }

export type Reporter = (event: ReporterEvent) => void

export function createSilentReporter(): Reporter {
  return () => {}
}

export function createConsoleReporter(): Reporter {
  return (event) => {
    switch (event.type) {
    case 'monorepoRoot':
      console.log(`📍 root      ${event.root}`)
      break
    case 'npmLogin':
      console.log(`📍 login     ${event.username}`)
      break
    case 'closure':
      console.log(`📍 closure   ${event.packageName} -> ${event.inRepoDeps.join(' -> ')}`)
      break
    case 'version':
      console.log(`📍 version   ${event.packageName} ${event.version}`)
      break
    case 'assemble':
      console.log(`📍 assemble  ${event.packageName}@${event.version}`)
      break
    case 'publish':
      console.log(`📡 publish   ${event.packageName}@${event.version}`)
      break
    case 'tagLatest':
      console.log(`🏷️  latest    ${event.packageName}@${event.version}`)
      break
    case 'pack':
      console.log(`📦 pack      ${path.basename(event.tarballPath)}`)
      break
    }
  }
}
