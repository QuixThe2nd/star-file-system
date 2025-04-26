import { type OracleType, type PeerStates, type Signalling, sortObjectByKeys } from "open-star";
import { checkHashRoot } from "./PoWChallenge";
import type { Message, State, Methods } from "../../types";

export class Oracle implements OracleType<'starFS', Message, State, Methods> {
  public readonly name = 'starFS' // Note that the name must be unique and not used by other oracles
  private state: State = {}
  public readonly boilerplateState: State = {};
  public readonly peerStates: PeerStates<State> = {}
  private mempool: Parameters<Methods['redeem']>[0][] = []
  getState = (): State => sortObjectByKeys(this.state)

  blockYield(epochTime: number): number {
    const state = this.state
    let supply = 0n
    Object.keys(state).forEach(peer => {
      supply += BigInt(state[peer as keyof PeerStates<State>]!)
    })
    let coinsStaked = 0n
    Object.keys(this.peerStates).forEach(peer => {
      coinsStaked += BigInt(state[peer as keyof PeerStates<State>] ?? '0x0')
    })

    const stakingRate = coinsStaked === 0n || supply === 0n ? 1 : Number(coinsStaked) / Number(supply)
    const stakingYield = 0.05 * (1 - stakingRate * 0.5) / stakingRate * 100
    return Math.pow(stakingYield, 1 / ((365 * 24 * 60 * 60 * 1000) / epochTime)) - 1;
  }

  onConnect = async (signalling: Signalling<Message>): Promise<void> => {
    signalling.sendMessage([ this.name, 'state', this.getState() ]).catch(console.error)

    let mostCommonState
    while (!mostCommonState) {
      await new Promise((res) => setTimeout(res, 100))
      const peerStates = Object.values(this.peerStates).map(state => state.lastReceive)
      mostCommonState = peerStates.toSorted((a,b) => peerStates.filter(v => v===a).length - peerStates.filter(v => v===b).length).pop()
    }

    this.state = mostCommonState
    signalling.sendMessage([ this.name, 'state', mostCommonState ]).catch(console.error)
  }

  readonly methods: Methods = {
    mint: (args: Parameters<Methods['mint']>[0]): ReturnType<Methods['mint']> => { // TODO: Temporary PoW challenge to get coins, only for initial distribution
      const to = args.to
      const amount = args.amount

      this.state[to] ??= `0x0`
      this.state[to] = `0x${(BigInt(this.state[to]) + BigInt(amount)).toString(16)}`

      return true
    },
    burn: (args: Parameters<Methods['burn']>[0]): ReturnType<Methods['burn']> => {
      const to = args.to
      const amount = args.amount

      if (!this.state[to]) return 'Address does not exist'
      if (this.state[to] < amount) this.state[to] = `0x0`
      else this.state[to] = `0x${(BigInt(this.state[to]) + BigInt(amount)).toString(16)}`

      return true
    },
    redeem: async (token: Parameters<Methods['redeem']>[0]): ReturnType<Methods['redeem']> => {
      console.log('redeeming payment token', token)
      const { difficulty, address, seed, nonce, time } = token
      if (!await checkHashRoot(BigInt(difficulty), JSON.stringify({ address, seed, time }), nonce)) return 'Insufficient work complete';
      if (time + 5000 < +new Date()) return 'PoW challenge too old'

      if (!(address in this.state)) this.state[address] = `0x${difficulty.toString(16)}`
      else this.state[address] = `0x${(BigInt(difficulty) + BigInt(this.state[address]!)).toString(16)}`

      return true
    }
  }

  private onCall = <T extends keyof Methods>(method: T, args: Parameters<Methods[T]>[0]): ReturnType<Methods[T]> => this.methods[method]!(args) as ReturnType<Methods[T]>

  call = async <T extends keyof Methods = keyof Methods>(method: T, args: Parameters<Methods[T]>[0], signalling: Signalling<Message>): Promise<void> => {
    if (!this.mempool.some(tx => JSON.stringify(tx.seed) === JSON.stringify(args.seed))) {
      signalling.sendMessage([ this.name, 'call', method, args ]).catch(console.error)
      const status = await this.onCall('redeem', args)
      if (typeof status === 'string') console.error(status)
      this.mempool.push(args)
    }
  }

  onEpoch = async (signalling: Signalling<Message>, epochTime: number): Promise<void> => {
    const blockYield = this.blockYield(epochTime)

    let netReputation = 0;
    for (const _peer in this.peerStates) {
      const peer = _peer as keyof PeerStates<State>
      const state = this.peerStates[peer]!
      if (state.reputation === null) {
        delete this.peerStates[peer]
        return
      }
      netReputation += state.reputation;
      if (state.reputation > 0) {
        console.log('[STARFS] Rewarding', peer.slice(0, 8) + '...')
        this.onCall('mint', { to: peer, amount: `0x${(this.state[peer] ? BigInt(Math.floor(Number(this.state[peer])*blockYield)).toString(16) : 1n).toString(16)}` })
      } else if (state.reputation < 0 && this.state[peer]) {
        console.log('[STARFS] Slashing', peer.slice(0, 8) + '...')
        this.onCall('burn', { to: peer, amount: `0x${BigInt(Math.floor(Number(this.state[peer])*0.9)).toString(16)}` })
      }
      state.reputation = null
    }
    if (netReputation < 0) console.warn('Net reputation is negative, you may be out of sync')
    this.onCall('mint', { to: signalling.address, amount: `0x${(this.state[signalling.address] ? BigInt(Math.floor(Number(this.state[signalling.address])*blockYield)) : 1n).toString(16)}` })

    this.mempool = []
  }
}
