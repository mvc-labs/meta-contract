import 'dotenv/config'
import { FtManager, Wallet, API_NET, API_TARGET } from '../../../src'

let wallet: Wallet
let wallet2: Wallet
let wallet3: Wallet
let ftManager: FtManager
let genesis
let codehash

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

  // 创世并铸造
  // const currentDate = new Date().getHours() + ':' + new Date().getMinutes()
  // const tokenName = '测试MVC Token - ' + currentDate
  // const tokenSymbol = 'HelloWorld'
  // const decimalNum = 8
  // const genesisResult = await ftManager.genesis({
  //   tokenName,
  //   tokenSymbol,
  //   decimalNum,
  // })
  // codehash = genesisResult.codehash
  // genesis = genesisResult.genesis
  // sensibleId = genesisResult.sensibleId
  // let { txid } = await ftManager.mint({
  //   sensibleId,
  //   genesisWif: process.env.WIF,
  //   receiverAddress: wallet.address.toString(),
  //   tokenAmount: '10000',
  // })
  // mintTxId = txid
  // console.log({ mintTxId })

  codehash = '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04'
  genesis = '4aaf336ad752d24bbd6aa78e69c55a872a8d06c0'
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

describe('转账', () => {
  it('正常初始化', async () => {
    expect(ftManager).toHaveProperty('transfer')
  })

  it.skip('正常转账', async () => {
    // console.log({ genesis, codehash })
    // let { txid } = await ftManager.transfer({
    //   genesis,
    //   codehash,
    //   receivers: [
    //     {
    //       amount: '100000',
    //       address: wallet2.address.toString(),
    //       // address: 'n3bupZH1K1NEqXdBRw5dfkJtpAhSvLwedM',
    //     },
    //   ],
    //   senderWif: process.env.WIF,
    // })
    let { txid: transferTxId } = await ftManager.transfer({
      genesis,
      codehash,
      receivers: [
        {
          amount: '100000',
          address: 'mjdRRKd3qCwiLwyHhuCQA5nniUEPofwpro',
        },
      ],
      senderWif: process.env.WIF,
    })
    console.log(transferTxId)
    expect(transferTxId).toHaveLength(64)
  })

  it.skip('归并', async () => {
    let { txid: mergeTxId } = await ftManager.merge({
      genesis,
      codehash,
      ownerWif: process.env.WIF,
    })
    console.log(mergeTxId)
    expect(mergeTxId).toHaveLength(64)
  })

  it.skip('多人转账', async () => {
    const receivers = []
    for (let i = 0; i < 99; i++) {
      receivers.push({
        amount: '10',
        address: process.env.ADDRESS2,
      })
    }
    let { txid: transferTxId } = await ftManager.transfer({
      genesis,
      codehash,
      receivers,
      senderWif: process.env.WIF,
    })
    console.log(transferTxId)
    expect(transferTxId).toHaveLength(64)
  })

  it.skip('mtt转账', async () => {
    const mttGenesis = '1828fa4fa01c6e6b76509355ea0c16abd3535660'
    const mttCodehash = '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04'
    const mttManager = new FtManager({
      network: API_NET.TEST,
      apiTarget: API_TARGET.MVC,
      purse: process.env.WIF3,
      feeb: 1,
    })
    mttManager.api.authorize({ authorization: process.env.METASV_BEARER })
    let { txid } = await mttManager.transfer({
      genesis: mttGenesis,
      codehash: mttCodehash,
      receivers: [
        {
          amount: '10000',
          address: wallet.address.toString(),
          // address: 'n3bupZH1K1NEqXdBRw5dfkJtpAhSvLwedM',
        },
      ],
      senderWif: process.env.WIF3,
    })

    console.log(txid)
    expect(txid).toHaveLength(64)
  })
})
