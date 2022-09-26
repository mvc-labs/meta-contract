import { API_NET, API_TARGET } from '../../../src/api'
import { Wallet } from '../../../src/wallet'
import 'dotenv/config'
import { Transaction } from '../../../src/mvc'

let wallet: Wallet
let wallet2: Wallet

beforeAll(async () => {
  const [wif, wif2] = [process.env.WIF, process.env.WIF2] as string[]
  const feeb = 0.5

  wallet = new Wallet(wif, API_NET.MAIN, feeb, API_TARGET.MVC)
  wallet2 = new Wallet(wif2, API_NET.MAIN, feeb, API_TARGET.MVC)
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
    // console.log(utxos)

    const totalBalance = utxos.reduce((acc, cur) => acc + cur.satoshis, 0)
    expect(totalBalance).toBeGreaterThan(0)
  })

  it('获取余额', async () => {
    const balance = await wallet.getBalance()
    expect(balance).toBeGreaterThan(0)
  })

  // it('test', async () => {
  //   const txHex =
  //     '0a0000000150e942765c8ed9c7c3afe0b596ba328a46fa8d01709f6c85bb57e3ecd75723c7000000006a473044022077aa4c9188772c3a901445632afc714c72d0bafcf162a6a8af266069faad83a402205ca64b4518de78ee200440fb98207a7f13982458b58e96f236936d27f69501c1c1210361a2eed32a607aeb4ad65fd6515821403a4cf10598356a2be5c9023377f82f40ffffffff02000000000000000075006a046d65746142303336316132656564333261363037616562346164363566643635313538323134303361346366313035393833353661326265356339303233333737663832663430044e554c4c066d657461696404526f6f74044e554c4c044e554c4c05312e302e31044e554c4c044e554c4cff0a0000000000001976a91417309302f8264ddff1d1fbcb97f00dbcb4be51d488ac00000000'
  //   const tx = new Transaction(txHex)
  //   tx.verify()
  //   // tx.version = 1
  //   await wallet.api.broadcast(txHex)

  //   console.log(tx.inputs[0].prevTxId.toString('hex'), tx.version, tx.verify())
  // })

  it('转账', async () => {
    // const receiverAddress = wallet2.address.toString()
    const receiverAddress = '1D1RFHJUAWRk3oEu7wvQo9gPehiavJdfNV'
    const txId = await wallet.send(receiverAddress, 100000000)
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
