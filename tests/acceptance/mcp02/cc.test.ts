import 'dotenv/config'
import { FtManager, Wallet, API_NET, API_TARGET } from '../../../src'

let wallet: Wallet
let wallet2: Wallet
let wallet3: Wallet
let ftManager: FtManager

jest.setTimeout(300000)
beforeAll(async () => {
  const network = process.env.NETWORK === 'testnet' ? API_NET.TEST : API_NET.MAIN
  const [wif, wif2, wif3] = [process.env.WIF, process.env.WIF2, process.env.WIF3] as string[]
  const feeb = 1

  wallet = new Wallet(wif, network, feeb, API_TARGET.MVC)
  wallet2 = new Wallet(wif2, network, feeb, API_TARGET.MVC)
  wallet3 = new Wallet(wif3, network, feeb, API_TARGET.MVC)
  wallet.api.authorize({ authorization: process.env.METASV_BEARER })
  wallet2.api.authorize({ authorization: process.env.METASV_BEARER })
  wallet3.api.authorize({ authorization: process.env.METASV_BEARER })

  ftManager = new FtManager({
    network: network,
    apiTarget: API_TARGET.MVC,
    purse: wif,
    feeb: feeb,
  })
  ftManager.api.authorize({ authorization: process.env.METASV_BEARER })
})

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

async function fakeIt() {
  return {
    genesis: '24edc6aa76e2acfef752dbf07d397a65ca28a10d',
    codehash: 'a2421f1e90c6048c36745edd44fad682e8644693',
    mintTxId: 'c6aa99b50950fb12ef0ef5caa932ef69107f6a79ce6ff3e1ef5e0e1a08cc3ca5',
    sensibleId: 'b29a56c1a3ee811c61899f7f9ce59ff92052cb987bedcd6d461ec5d9ed721b5500000000',
  }
}

describe('cc', () => {
  // it('cc的用例', async () => {
  it.skip('cc的用例', async () => {
    const tokenInfo = {
      genesis: '1828fa4fa01c6e6b76509355ea0c16abd3535660',
      codehash: '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04',
    }
    const ccWif = process.env.CCWIF as string
    const ccWallet = new Wallet(ccWif, API_NET.TEST, 1, API_TARGET.MVC)
    const ccAddress = ccWallet.address.toString()
    // mstiV2oJRH7DFCHTQs1HuZApVMkEwNNKA8

    const ftManager = new FtManager({
      network: API_NET.TEST,
      apiTarget: API_TARGET.MVC,
      purse: ccWif,
      feeb: 1,
    })

    const { txid } = await ftManager.transfer({
      genesis: tokenInfo.genesis,
      codehash: tokenInfo.codehash,
      senderWif: ccWif,
      // receivers: [{ address: ccAddress, amount: '10000000' }],
      receivers: [{ address: ccAddress, amount: '10' }],
    })

    console.log({ txid })
  })

  it('我试试', async () => {
    // it.skip('我试试', async () => {
    const tokenInfo = {
      genesis: '1828fa4fa01c6e6b76509355ea0c16abd3535660',
      codehash: '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04',
    }

    // 先拆成两个
    const { txid } = await ftManager.transfer({
      genesis: tokenInfo.genesis,
      codehash: tokenInfo.codehash,
      senderWif: process.env.WIF,
      receivers: [
        { address: process.env.ADDRESS, amount: '75000' },
        { address: process.env.ADDRESS, amount: '75000' },
      ],
    })

    console.log({ txid })

    // 再合并
    const { txid: txid2 } = await ftManager.transfer({
      genesis: tokenInfo.genesis,
      codehash: tokenInfo.codehash,
      senderWif: process.env.WIF,
      receivers: [{ address: process.env.ADDRESS, amount: '150000' }],
    })
  })

  // it.skip('我合并', async () => {
  //   const tokenInfo = {
  //     genesis: '1828fa4fa01c6e6b76509355ea0c16abd3535660',
  //     codehash: '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04',
  //   }

  //   const { txid } = await ftManager.merge({
  //     genesis: tokenInfo.genesis,
  //     codehash: tokenInfo.codehash,
  //     ownerWif: process.env.WIF,
  //   })

  //   console.log({ txid })
  // })
})
