import 'dotenv/config'
import { FtManager, Wallet, API_NET, API_TARGET } from '../../../src'
import { PrivateKey } from '../../../src/mvc'

let wallet: Wallet
let wallet2: Wallet
let wallet3: Wallet
let ftManager: FtManager
let genesis
let codehash

jest.setTimeout(300000)
beforeAll(async () => {})

// 创世并铸造
async function genesisAndMint() {
  const currentDate = new Date().getHours() + ':' + new Date().getMinutes()
  const tokenName = '测试MVC Token - ' + currentDate
  const tokenSymbol = 'Riverrun'
  const decimalNum = 18
  const genesisResult = await ftManager.genesis({
    tokenName,
    tokenSymbol,
    decimalNum,
  })

  let { txid } = await ftManager.mint({
    sensibleId: genesisResult.sensibleId,
    genesisWif: process.env.WIF,
    receiverAddress: wallet.address.toString(),
    tokenAmount: '10000',
  })

  return {
    genesis: genesisResult.genesis,
    codehash: genesisResult.codehash,
    mintTxId: txid,
    sensibleId: genesisResult.sensibleId,
  }
}

describe('转账', () => {
  it.skip('mit', async () => {
    const codehash = '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04'
    const genesis = '76a8a2122b4f4213921cb0b4de0e7c704628f149'
    const wif = process.env.MVCWIF
    const privateKey = new PrivateKey(wif)
    const address = privateKey.toAddress('testnet').toString()
    const ftManager = new FtManager({
      network: API_NET.TEST,
      apiTarget: API_TARGET.MVC,
      purse: wif,
      feeb: 1,
    })
    ftManager.api.authorize({ authorization: process.env.METASV_BEARER })

    // let { txid } = await ftManager.transfer({
    //   genesis,
    //   codehash,
    //   receivers: [
    //     {
    //       amount: '1000000000',
    //       address: 'miywgy3uNEzabKhTSp2yReFyayxSLYJoDp',
    //     },
    //   ],
    //   senderWif: wif,
    // })
    // console.log({ txid })
  })

  it.skip('准备钱', async () => {
    wallet = new Wallet(process.env.RRWIF as string, API_NET.TEST, 1)

    await wallet.send('mfjFKftt59ZpVZc1PgYq9Fi4LK1KpCzjUa', 10_000_000)
  })

  it.skip('看看现在能不能转旧合约的mit', async () => {
    const codehash = '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04'
    const genesis = '76a8a2122b4f4213921cb0b4de0e7c704628f149'
    const wif = process.env.MVCWIF as string
    const privateKey = new PrivateKey(wif)
    const address = privateKey.toAddress('testnet').toString()
    console.log({ address })
    const ftManager = new FtManager({
      network: API_NET.TEST,
      apiTarget: API_TARGET.MVC,
      purse: wif,
      feeb: 1,
    })
    ftManager.api.authorize({ authorization: process.env.METASV_BEARER })

    const wallet = new Wallet(wif, API_NET.TEST, 1)
    await wallet.merge()

    // 断铸
    let { txid } = await ftManager.mint({
      sensibleId: '401537558ffb846b01c22a5cf583ca2b783ca790962e8ecabc63a28291cb9ef400000000',
      genesisWif: wif,
      receiverAddress: address,
      tokenAmount: '1',
      allowIncreaseMints: false,
    })

    // await ftManager.merge({
    //   codehash,
    //   genesis,
    //   ownerWif: wif,
    // })
    // return

    // let { txid } = await ftManager.transfer({
    //   genesis,
    //   codehash,
    //   receivers: [
    //     {
    //       amount: '17444539989997',
    //       address: 'mfjFKftt59ZpVZc1PgYq9Fi4LK1KpCzjUa',
    //     },
    //   ],
    //   senderWif: wif,
    // })
    console.log({ txid })
  })
})
