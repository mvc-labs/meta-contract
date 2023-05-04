import { API_NET, API_TARGET, Wallet } from '../../../src'
import 'dotenv/config'
import * as mvc from '../../../src/mvc'

let wallet: Wallet
let wallet2: Wallet

jest.setTimeout(30000)
beforeAll(async () => {
  const [wif, wif2] = [process.env.RRWIF, process.env.WIF2] as string[]
  const feeb = 1

  const network = process.env.NETWORK === 'testnet' ? API_NET.TEST : API_NET.MAIN
  wallet = new Wallet(wif, network, feeb, API_TARGET.MVC)
  wallet2 = new Wallet(wif2, network, feeb, API_TARGET.MVC)
  wallet.api.authorize({ authorization: process.env.METASV_BEARER })
  wallet2.api.authorize({ authorization: process.env.METASV_BEARER })
})

describe('钱包测试', () => {
  it('正常初始化', async () => {
    expect(wallet).toBeInstanceOf(Wallet)
  })

  it('获取Utxos', async () => {
    const utxos = await wallet.getUtxos()
    expect(utxos).toBeInstanceOf(Array)

    const totalBalance = utxos.reduce((acc, cur) => acc + cur.satoshis, 0)
    expect(totalBalance).toBeGreaterThan(0)
  })

  it('获取余额', async () => {
    const balance = await wallet.getBalance()
    expect(balance).toBeGreaterThan(0)
  })

  it.skip('转账', async () => {
    const receiverAddress = wallet2.address.toString()
    const { txId, txHex } = await wallet.send(receiverAddress, 1000)
    expect(txId).toHaveLength(64)
    expect(txHex).toBeTruthy()
    console.log(txId)
  })

  it.skip('批量转账', async () => {
    await wallet2.merge()
    const receivers = [
      { address: wallet2.address.toString(), amount: 1000 },
      { address: wallet2.address.toString(), amount: 2000 },
    ]
    const { txHex, txId } = await wallet.sendArray(receivers)
    expect(txId).toHaveLength(64)
    expect(txHex).toBeTruthy()
    // 检查wallet2多出两个utxo
    const utxos = await wallet2.getUtxos()
    expect(utxos.length).toBe(3)
  })

  it('指定utxo批量转账', async () => {
    await wallet2.merge()
    await wallet.merge()
    await wallet.evenSplit(2)
    const utxos = await wallet.getUtxos()
    const receivers = [
      { address: wallet2.address.toString(), amount: 1000 },
      { address: wallet2.address.toString(), amount: 2000 },
    ]
    const { txHex, txId } = await wallet.sendArray(receivers, [utxos[1]])
    expect(txId).toHaveLength(64)
    expect(txHex).toBeTruthy()
    // 检查wallet2多出两个utxo
    const utxos2 = await wallet2.getUtxos()
    expect(utxos2.length).toBe(3)
    expect(await wallet.getUtxos()).toHaveLength(2)
  })

  it.skip('合并UTXO', async () => {
    const txId = await wallet2.merge()
    expect(txId).toHaveLength(64)
  })

  it.skip('splitUTXO', async () => {
    const txId = await wallet2.evenSplit(10, 10000)
  })

  it.todo('广播')
  it.todo('发送OpReturn')
})
