/**
 * The most atomic way to train and inference a GPT in pure, dependency-free TypeScript.
 * This file is the complete algorithm.
 * Everything else is just efficiency.
 *
 * Translated from @karpathy's Python implementation.
 *
 * Run with: npx tsx src/gpt.ts
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

// --- Safe array indexing (needed for noUncheckedIndexedAccess) ---

function at<T>(arr: readonly T[], i: number): T {
  const val = arr[i]
  if (val === undefined) throw new Error('Index ' + String(i) + ' out of bounds (length ' + String(arr.length) + ')')
  return val
}

// --- Seeded PRNG (mulberry32) ---

function createRandom(seed: number) {
  let s = seed | 0

  function random(): number {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  function gauss(mean: number, std: number): number {
    // Box-Muller transform
    let u1 = random()
    while (u1 === 0) u1 = random()
    const u2 = random()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    return mean + std * z
  }

  function choices(population: readonly number[], weights: readonly number[]): number {
    let totalWeight = 0
    for (const w of weights) totalWeight += w
    let r = random() * totalWeight
    for (let i = 0; i < population.length; i++) {
      r -= at(weights, i)
      if (r <= 0) return at(population, i)
    }
    return at(population, population.length - 1)
  }

  function shuffle(arr: unknown[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      const ai = at(arr, i)
      const aj = at(arr, j)
      arr[i] = aj
      arr[j] = ai
    }
  }

  return { random, gauss, choices, shuffle }
}

const rng = createRandom(42) // Let there be order among chaos

// --- Autograd: recursively apply the chain rule through a computation graph ---

class Value {
  data: number
  grad: number
  private readonly _children: readonly Value[]
  private readonly _localGrads: readonly number[]

  constructor(data: number, children: readonly Value[] = [], localGrads: readonly number[] = []) {
    this.data = data // scalar value of this node calculated during forward pass
    this.grad = 0 // derivative of the loss w.r.t. this node, calculated in backward pass
    this._children = children // children of this node in the computation graph
    this._localGrads = localGrads // local derivative of this node w.r.t. its children
  }

  add(other: Value | number): Value {
    const o = other instanceof Value ? other : new Value(other)
    return new Value(this.data + o.data, [this, o], [1, 1])
  }

  mul(other: Value | number): Value {
    const o = other instanceof Value ? other : new Value(other)
    return new Value(this.data * o.data, [this, o], [o.data, this.data])
  }

  pow(exp: number): Value {
    return new Value(this.data ** exp, [this], [exp * this.data ** (exp - 1)])
  }

  log(): Value {
    return new Value(Math.log(this.data), [this], [1 / this.data])
  }

  exp(): Value {
    return new Value(Math.exp(this.data), [this], [Math.exp(this.data)])
  }

  relu(): Value {
    return new Value(Math.max(0, this.data), [this], [this.data > 0 ? 1 : 0])
  }

  neg(): Value {
    return this.mul(-1)
  }

  sub(other: Value | number): Value {
    const o = other instanceof Value ? other : new Value(other)
    return this.add(o.neg())
  }

  div(other: Value | number): Value {
    const o = other instanceof Value ? other : new Value(other)
    return this.mul(o.pow(-1))
  }

  backward(): void {
    const topo: Value[] = []
    const visited = new Set<Value>()

    function buildTopo(v: Value): void {
      if (!visited.has(v)) {
        visited.add(v)
        for (const child of v._children) {
          buildTopo(child)
        }
        topo.push(v)
      }
    }

    buildTopo(this)
    this.grad = 1

    for (let i = topo.length - 1; i >= 0; i--) {
      const v = at(topo, i)
      for (let j = 0; j < v._children.length; j++) {
        const child = at(v._children, j)
        const localGrad = at(v._localGrads, j)
        child.grad += localGrad * v.grad
      }
    }
  }
}

// --- Helpers ---

function sumValues(values: readonly Value[]): Value {
  let result = new Value(0)
  for (const v of values) result = result.add(v)
  return result
}

// --- Model architecture ---
// Follow GPT-2, blessed among the GPTs, with minor differences:
// layernorm -> rmsnorm, no biases, GeLU -> ReLU

function linear(x: readonly Value[], w: readonly Value[][]): Value[] {
  return w.map((wo) => sumValues(wo.map((wi, i) => wi.mul(at(x, i)))))
}

function softmax(logits: readonly Value[]): Value[] {
  let maxVal = -Infinity
  for (const val of logits) {
    if (val.data > maxVal) maxVal = val.data
  }
  const exps = logits.map((val) => val.sub(maxVal).exp())
  const total = sumValues(exps)
  return exps.map((e) => e.div(total))
}

function rmsnorm(x: readonly Value[]): Value[] {
  const ms = sumValues(x.map((xi) => xi.mul(xi))).div(x.length)
  const scale = ms.add(1e-5).pow(-0.5)
  return x.map((xi) => xi.mul(scale))
}

// --- Download dataset if needed ---

async function ensureDataset(filePath: string): Promise<void> {
  if (!existsSync(filePath)) {
    const url = 'https://raw.githubusercontent.com/karpathy/makemore/refs/heads/master/names.txt'
    const response = await fetch(url)
    const text = await response.text()
    writeFileSync(filePath, text)
  }
}

// --- Main ---

async function main(): Promise<void> {
  // Let there be an input dataset `docs`: string[] of documents (e.g. a dataset of names)
  const inputPath = 'input.txt'
  await ensureDataset(inputPath)
  const text = readFileSync(inputPath, 'utf-8')
  const docs = text
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  rng.shuffle(docs)
  console.log('num docs: ' + String(docs.length))

  // Let there be a Tokenizer to translate strings to discrete symbols and back
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- ASCII-only name data, no multi-byte concerns
  const uchars = [...new Set([...docs.join('')])].sort() // unique characters -> token ids 0..n-1
  const BOS = uchars.length // token id for the special Beginning of Sequence (BOS) token
  const vocabSize = uchars.length + 1 // total number of unique tokens, +1 is for BOS
  console.log('vocab size: ' + String(vocabSize))

  // Initialize the parameters, to store the knowledge of the model.
  const nEmbd = 16 // embedding dimension
  const nHead = 4 // number of attention heads
  const nLayer = 1 // number of layers
  const blockSize = 16 // maximum sequence length
  const headDim = nEmbd / nHead // dimension of each head

  function matrix(nout: number, nin: number, std = 0.08): Value[][] {
    return Array.from({ length: nout }, () => Array.from({ length: nin }, () => new Value(rng.gauss(0, std))))
  }

  const stateDict = new Map<string, Value[][]>()
  stateDict.set('wte', matrix(vocabSize, nEmbd))
  stateDict.set('wpe', matrix(blockSize, nEmbd))
  stateDict.set('lm_head', matrix(vocabSize, nEmbd))
  function layerKey(layer: number, suffix: string): string {
    return 'layer' + String(layer) + '.' + suffix
  }

  for (let i = 0; i < nLayer; i++) {
    stateDict.set(layerKey(i, 'attn_wq'), matrix(nEmbd, nEmbd))
    stateDict.set(layerKey(i, 'attn_wk'), matrix(nEmbd, nEmbd))
    stateDict.set(layerKey(i, 'attn_wv'), matrix(nEmbd, nEmbd))
    stateDict.set(layerKey(i, 'attn_wo'), matrix(nEmbd, nEmbd))
    stateDict.set(layerKey(i, 'mlp_fc1'), matrix(4 * nEmbd, nEmbd))
    stateDict.set(layerKey(i, 'mlp_fc2'), matrix(nEmbd, 4 * nEmbd))
  }

  function getWeight(key: string): Value[][] {
    const w = stateDict.get(key)
    if (w === undefined) throw new Error(`Missing weight: ${key}`)
    return w
  }

  const params: Value[] = [] // flatten params into a single Value[] list
  for (const mat of stateDict.values()) {
    for (const row of mat) {
      for (const p of row) {
        params.push(p)
      }
    }
  }
  console.log('num params: ' + String(params.length))

  // Define the model architecture: a stateless function mapping token sequence
  // and parameters to logits over what comes next.
  function gpt(tokenId: number, posId: number, keys: Value[][][], values: Value[][][]): Value[] {
    const tokEmb = at(getWeight('wte'), tokenId) // token embedding
    const posEmb = at(getWeight('wpe'), posId) // position embedding
    let x = tokEmb.map((t, i) => t.add(at(posEmb, i))) // joint token and position embedding
    x = rmsnorm(x)

    for (let li = 0; li < nLayer; li++) {
      // 1) Multi-head attention block
      const xResidual1 = x
      x = rmsnorm(x)
      const q = linear(x, getWeight(layerKey(li, 'attn_wq')))
      const k = linear(x, getWeight(layerKey(li, 'attn_wk')))
      const v = linear(x, getWeight(layerKey(li, 'attn_wv')))
      at(keys, li).push(k)
      at(values, li).push(v)
      const xAttn: Value[] = []
      for (let h = 0; h < nHead; h++) {
        const hs = h * headDim
        const qH = q.slice(hs, hs + headDim)
        const kH = at(keys, li).map((ki) => ki.slice(hs, hs + headDim))
        const vH = at(values, li).map((vi) => vi.slice(hs, hs + headDim))
        const attnLogits = kH.map((kHt) => sumValues(qH.map((qj, j) => qj.mul(at(kHt, j)))).div(headDim ** 0.5))
        const attnWeights = softmax(attnLogits)
        const headOut = Array.from({ length: headDim }, (_, j) =>
          sumValues(attnWeights.map((aw, t) => aw.mul(at(at(vH, t), j))))
        )
        xAttn.push(...headOut)
      }
      x = linear(xAttn, getWeight(layerKey(li, 'attn_wo')))
      x = x.map((a, i) => a.add(at(xResidual1, i)))

      // 2) MLP block
      const xResidual2 = x
      x = rmsnorm(x)
      x = linear(x, getWeight(layerKey(li, 'mlp_fc1')))
      x = x.map((xi) => xi.relu())
      x = linear(x, getWeight(layerKey(li, 'mlp_fc2')))
      x = x.map((a, i) => a.add(at(xResidual2, i)))
    }

    return linear(x, getWeight('lm_head'))
  }

  // Let there be Adam, the blessed optimizer and its buffers
  const learningRate = 0.01
  const beta1 = 0.85
  const beta2 = 0.99
  const epsAdam = 1e-8
  const m = new Array<number>(params.length).fill(0) // first moment buffer
  const vBuf = new Array<number>(params.length).fill(0) // second moment buffer

  // Repeat in sequence
  const numSteps = 1000 // number of training steps
  for (let step = 0; step < numSteps; step++) {
    // Take single document, tokenize it, surround it with BOS special token on both sides
    const doc = at(docs, step % docs.length)
    // eslint-disable-next-line @typescript-eslint/no-misused-spread -- ASCII-only name data
    const tokens = [BOS, ...[...doc].map((ch) => uchars.indexOf(ch)), BOS]
    const n = Math.min(blockSize, tokens.length - 1)

    // Forward the token sequence through the model, building up the computation graph
    // all the way to the loss.
    const keys: Value[][][] = Array.from({ length: nLayer }, () => [])
    const vals: Value[][][] = Array.from({ length: nLayer }, () => [])
    const losses: Value[] = []
    for (let posId = 0; posId < n; posId++) {
      const tokenId = at(tokens, posId)
      const targetId = at(tokens, posId + 1)
      const logits = gpt(tokenId, posId, keys, vals)
      const probs = softmax(logits)
      const lossT = at(probs, targetId).log().neg()
      losses.push(lossT)
    }
    const loss = sumValues(losses).div(n) // final average loss. May yours be low.

    // Backward the loss, calculating gradients with respect to all model parameters.
    loss.backward()

    // Adam optimizer update: update the model parameters based on the corresponding gradients.
    const lrT = learningRate * (1 - step / numSteps) // linear learning rate decay
    for (let i = 0; i < params.length; i++) {
      const p = at(params, i)
      m[i] = beta1 * at(m, i) + (1 - beta1) * p.grad
      vBuf[i] = beta2 * at(vBuf, i) + (1 - beta2) * p.grad ** 2
      const mHat = at(m, i) / (1 - beta1 ** (step + 1))
      const vHat = at(vBuf, i) / (1 - beta2 ** (step + 1))
      p.data -= (lrT * mHat) / (vHat ** 0.5 + epsAdam)
      p.grad = 0
    }

    console.log(
      'step ' + String(step + 1).padStart(4) + ' / ' + String(numSteps).padStart(4) + ' | loss ' + loss.data.toFixed(4)
    )
  }

  // Inference: may the model babble back to us
  const temperature = 0.5 // in (0, 1], control the "creativity", low to high
  console.log('\n--- inference (new, hallucinated names) ---')
  const population = Array.from({ length: vocabSize }, (_, i) => i)
  for (let sampleIdx = 0; sampleIdx < 20; sampleIdx++) {
    const keys: Value[][][] = Array.from({ length: nLayer }, () => [])
    const vals: Value[][][] = Array.from({ length: nLayer }, () => [])
    let tokenId = BOS
    const sample: string[] = []
    for (let posId = 0; posId < blockSize; posId++) {
      const logits = gpt(tokenId, posId, keys, vals)
      const probs = softmax(logits.map((l) => l.div(temperature)))
      tokenId = rng.choices(
        population,
        probs.map((p) => p.data)
      )
      if (tokenId === BOS) break
      sample.push(at(uchars, tokenId))
    }
    console.log('sample ' + String(sampleIdx + 1).padStart(2) + ': ' + sample.join(''))
  }
}

void main()
