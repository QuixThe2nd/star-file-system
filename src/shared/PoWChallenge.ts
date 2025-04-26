const generateSHA256Hash = async (seed: string) => BigInt(`0x${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed.trim())))).map(b => b.toString(16).padStart(2, '0')).join('')}`)

function hashMeetsDifficulty(hash: bigint, estimatedHashesNeeded: bigint): boolean {
  const maxValue = (BigInt(1) << BigInt(256)) - BigInt(1)
  const target = maxValue / estimatedHashesNeeded
  return hash <= target
}

export const checkHashRoot = async (difficulty: bigint, blockData: string, nonce: number) => hashMeetsDifficulty(await generateSHA256Hash(blockData + nonce), difficulty)

const powChallenge = async (difficulty: bigint, blockData: string) => {
  let nonce = 0
  while (true) {
    nonce++
    if (await checkHashRoot(difficulty, blockData, nonce)) break
  }
  return nonce
}

export const mineBlock = async (difficulty: bigint, address: string, seed: number, time: number) => await powChallenge(difficulty, JSON.stringify({ address, seed, time }))
