import { WebSocket, type RawData } from 'ws';
import { OpenStar, KeyManager } from 'open-star';
import type { MessageRequest, MessageResponse } from "../types";
import { mineBlock } from "./shared/PoWChallenge";
import { Oracle } from './server/oracle';

const keyManager = new KeyManager('client')
const oracle = new Oracle()
new OpenStar<'starFS', ReturnType<typeof oracle.getState>, typeof oracle.methods, typeof oracle>(oracle, keyManager)

const step = 8
const hash = '1234'

class ClientHandler {
  readonly socket: WebSocket;
  pendingDownloads: { [seed: number]: { hash: string, address: string, difficulty: number, size: number, start: number, end: number, content: string } } = {}
  pendingFiles: { [id: number]: string } = {}

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.socket.on('open', () => this.onOpen());
    this.socket.on('error', console.error);
    this.socket.on('message', (e) => this.onResponse(e));
    this.socket.on('close', console.log);
  }

  readonly onOpen = async (): Promise<void> => {
    console.log('Connected to the server');
    setTimeout(() => this.getFile(hash), 10_000)
  }

  readonly sendRequest = (payload: MessageRequest): void => this.socket.send(JSON.stringify(payload));

  async onResponse(rawData: RawData): Promise<void> {
    const data = JSON.parse(rawData.toString());

    if (data.error) return console.error('Error:', data.error);
    const response = data.data as MessageResponse

    if (response[0] === 'file') {
      const { id, difficulty, address, size } = response[1]
      const hash = this.pendingFiles[id]
      if (!hash) return console.error('Unexpected file response')
      this.downloadFile(hash, address, difficulty, size, 0, step)
    } else if (response[0] === 'download') {
      const oldSeed = response[1].seed
      if (oldSeed in this.pendingDownloads) {
        const download = this.pendingDownloads[oldSeed]!;
        const seed = Math.random()
        const content = download.content + response[1].content

        this.pendingDownloads[seed] = {
          ...download,
          content: content,
          start: download.end + 1,
          end: Math.min(download.end + 1 + step, download.size-1)
        };

        delete this.pendingDownloads[oldSeed]

        if (this.pendingDownloads[seed].start === download.size) return console.log(this.pendingDownloads[seed].content)
        if (this.pendingDownloads[seed].end > download.size-1) this.pendingDownloads[seed].end = download.size-1
        this.downloadFile(download.hash, download.address, download.difficulty, download.size, this.pendingDownloads[seed].start, this.pendingDownloads[seed].end, seed)
      }
    } else console.log('Unexpected Message:', response);
  }

  async getFile(hash: string) {
    const id = Math.random()
    this.pendingFiles[id] = hash
    this.sendRequest(['file', { id, hash }]);
  }

  async downloadFile(hash: string, address: string, difficulty: number, size: number, start: number, end: number, seed: number = 0) {
    if (seed === 0) {
      seed = Math.random()
      this.pendingDownloads[seed] = { hash, address, difficulty, size, start, end, content: '' }
    }
    const time = +new Date()
    const nonce = await mineBlock(BigInt(difficulty*(end-start)), address, seed, time)
    this.sendRequest(['download', { hash, start, end, seed, nonce, time }]);
  }
}

new ClientHandler('ws://localhost:3000');
