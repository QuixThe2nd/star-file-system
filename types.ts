import type { MethodsType, MessageType } from "open-star"

type DownloadRequest = [ 'download', { hash: string, start: number, end: number, seed: number, nonce: number, time: number } ]
type FileRequest = [ 'file', { id: number, hash: string } ]
export type MessageRequest = DownloadRequest | FileRequest

type DownloadResponse = [ 'download', { seed: number, content: string } ]
type FileResponse = [ 'file', { id: number, difficulty: number, address: string, size: number } ]
export type MessageResponse = DownloadResponse | FileResponse


export type PaymentToken = { difficulty: number, address: `0x${string}`, seed: number, nonce: number, time: number }

export interface Methods extends MethodsType {
  redeem: (_args: PaymentToken) => Promise<true | string>;
  mint: (_args: { to: `0x${string}`, amount: `0x${string}` }) => true | string;
  burn: (_args: { to: `0x${string}`, amount: `0x${string}` }) => true | string;
}

export type State = { [address: string]: `0x${string}` }
export type Message = MessageType<'starFS', Methods, State>
