import type { NpmClient } from './npm-client.js'

export async function publish(npmClient: NpmClient, tag: string, passThroughArgs: string[], tarballPath: string) {
  await npmClient.publish(tarballPath, tag, passThroughArgs)
}
