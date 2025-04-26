# Star File System
StarFS is a modular server that allows for content to be monetized by hosts via PoW challenges. StarFS allows for content to be streamed out as PoW payments get streamed in.

StarFS is built on [Open Star](https://github.com/QuixThe2nd/open-star), an oracle framework, for core consensus.

## Installation
Clone the repo and install dependencies
```bash
https://github.com/QuixThe2nd/star-file-system
npm install
```

## Execution

Start up your server and wait for "announcing" to be logged:
```bash
npx tsx src/server.ts
```

Then start a client:
```bash
npx tsx src/client.ts
```

Both the client and server will run Open Star nodes, partaking in consensus. After 10 seconds, the client will fetch the demo file from the server.

## How it Works
When a client fetches a file from a server, the following process takes place:
1. The client connects to the server's WebSocket.
2. The client requests file metadata such as size and cost to download.
3. The client does a PoW challenge for a piece of the file and sends it to the server.
4. The server validates the PoW challenge and submits it to the StarFS Open Star oracle to mint tokens.
5. The server sends back the requested byte-range of the file.
6. Go back to step 3 and loop until the complete file is served.

### Download Prices and PoW Challenges
The core functionality of StarFS comes from the download pricing. To better explain how this works, I'll provide an example.

The server is able to set a price per byte served (e.g. `100` hashes per byte). The client then generates random SHA256 hashes, until one is found that has a difficulty of 100. This hash is then used as payment to download 1 byte.

The client has the option to choose the granularity of this. For example for a 20 byte file, they could choose to do 10x challenges of 200 difficulty, 5x challenges of 400 difficulty, or any other combination.

Difficulty is calculated using the probability of finding that hash. For example a difficulty of 100 would mean that on average you would have had to hash 100 times before finding a matching hash. Below is the formula to calculate the difficulty:
```ts
function hashMeetsDifficulty(sha256Hash: bigint, difficulty: bigint = 100n): boolean {
  const maxValue = (BigInt(1) << BigInt(256)) - BigInt(1)
  const target = maxValue / difficulty
  return sha256Hash <= target
}
```
Or in simpler terms, a hash can be represented as an integer (e.g. between 0 - 100). To find a hash that is smaller than 50, you'd on average need to generate 2 hashes. To find a hash smaller than 20, you'd need to generate 5 hashes. The number of hashes needed is the difficulty of the hash. This formula allows for ultra-high granularity.

## TODO:
- Turn StarFS into a library for actual use-cases
- Route through Hydrafiles for anonymous URIs
- Validate hash of downloaded content
