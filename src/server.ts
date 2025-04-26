import { WebSocketServer, WebSocket, type RawData } from 'ws';
import * as http from 'http';
import { OpenStar, KeyManager } from "open-star";
import type { MessageResponse, MessageRequest } from "../types";
import { checkHashRoot } from "./shared/PoWChallenge";
import { Oracle } from "./shared/oracle";

const keyManager = new KeyManager('host')
const oracle = new Oracle()
const openStar = new OpenStar<'starFS', ReturnType<typeof oracle.getState>, typeof oracle.methods, typeof oracle>(oracle, keyManager)

const files: { [hash: string]: { content: string } } = { '1234': { 'content': '0000111122223333444455556666777788889999' } }

const difficulty = 1_000
const address = keyManager.getPublicKey()

class ServerHandler {
  readonly ws:  WebSocket
  constructor(ws: WebSocket, message: RawData) {
    this.ws = ws

    this.onRequest(message)
  }

  readonly sendResponse = (data: MessageResponse): void => this.ws.send(JSON.stringify({ data })) as unknown as void;
  readonly sendError = (error: string): void => this.ws.send(JSON.stringify({ error })) as unknown as void;

  async onRequest(payload: RawData): Promise<void> {
    const message = JSON.parse(payload.toString()) as MessageRequest;

    if (message[0] === 'file') {
      const file = files[message[1].hash]
      if (!file) return this.sendError('File not found')

      const id = message[1].id
      const size = file.content.length
      this.sendResponse([ 'file', { id, difficulty, address, size } ])
    } else if (message[0] === 'download') {
      const { hash, seed, nonce, start, end, time } = message[1]

      const file = files[hash]

      if (!await checkHashRoot(BigInt(difficulty), JSON.stringify({ address, seed, time }), Number(nonce))) return this.sendError('Insufficient work complete');
      await oracle.call('redeem', { difficulty, address, seed, nonce, time }, openStar.signalling)

      if (!file) return this.sendError('File not found')
      if (Number(end) > file.content.length) return this.sendError('Out of range')

      this.sendResponse([ 'download', { seed, content: file.content.slice(start, end) } ])
    } else this.sendError(`Unknown command: ${message[0]}`);
  }
}

new WebSocketServer({
  server: http.createServer((_, res) => res.writeHead(200).end("SFS Node")).listen(3000, () => console.log('Server started on port 3000'))
}).on('connection', (ws) => ws.on('message', (message) => new ServerHandler(ws, message)));
