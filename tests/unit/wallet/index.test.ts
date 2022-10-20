import { API_NET, API_TARGET } from '../../../src/api'
import { Wallet } from '../../../src/wallet'
import 'dotenv/config'
import { Transaction } from '../../../src/mvc'

let wallet: Wallet
let wallet2: Wallet

jest.setTimeout(30000)
beforeAll(async () => {
  const [wif, wif2] = [process.env.WIF, process.env.WIF2] as string[]
  const feeb = 0.5

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

  it('转账', async () => {
    // const receiverAddress = wallet2.address.toString()
    const receiverAddress = 'moKL4yva1SAb3j736k5m14GX9j7Fv4n3MS'
    const txId = await wallet.send(receiverAddress, 1000000000)
    expect(txId).toHaveLength(64)
    console.log(txId)
  })

  it('批量转账', async () => {
    // await wallet2.merge()
    // const receivers = [
    //   { address: wallet2.address.toString(), amount: 1000 },
    //   { address: wallet2.address.toString(), amount: 2000 },
    // ]
    // const txId = (await wallet.sendArray(receivers)) as String
    // expect(txId).toHaveLength(64)
    // // 检查wallet2多出两个utxo
    // const utxos = await wallet2.getUtxos()
    // expect(utxos.length).toBe(3)
  })

  it('合并UTXO', async () => {
    const txId = await wallet2.merge()
    expect(txId).toHaveLength(64)
  })

  it.todo('广播')
  it.todo('发送OpReturn')
})
