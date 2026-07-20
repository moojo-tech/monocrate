import type { AbsolutePath } from './paths.js'
import type { NpmClient } from './npm-client.js'

export async function publish(npmClient: NpmClient, outputDir: AbsolutePath, tag: string, passThroughArgs: string[]) {
  await npmClient.publish(outputDir, tag, passThroughArgs)
}
