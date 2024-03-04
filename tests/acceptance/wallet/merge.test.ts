import 'dotenv/config'
import { API_NET, API_TARGET, Wallet } from '../../../src'

let wallet: Wallet

beforeAll(async () => {
  const network = API_NET.TEST
  wallet = new Wallet(process.env.WIF as string, network, 1, API_TARGET.MVC)
  let utxos = await wallet.getUnspents()
  if (utxos.length < 300) {
    const { txId } = await wallet.sendArray(Array(500).fill({ address: wallet.address, amount: 1 }))
    expect(txId).toHaveLength(64)
  }
})

describe('merge api test', () => {
  jest.setTimeout(30000)
  it('merge api test', async () => {
    let utxos = await wallet.getUnspents()
    expect(utxos.length).toBeGreaterThanOrEqual(300)
    const { txId } = await wallet.merge()
    expect(txId).toHaveLength(64)
  })
})
