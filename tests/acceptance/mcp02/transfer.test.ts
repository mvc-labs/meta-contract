import 'dotenv/config'
import { FtManager, Wallet, API_NET, API_TARGET } from '../../../src'
import { Transaction } from '../../../src/mvc'
import { sleep } from '../test-helpers'

let wallet: Wallet
let wallet2: Wallet
let wallet3: Wallet
let ftManager: FtManager

type Receiver = {
  address: string
  amount: string
}

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

async function mintSomeTokens(reGenesis: boolean = false, version = 2) {
  let genesisInfo: any
  if (reGenesis) {
    const currentDate = new Date().getHours() + ':' + new Date().getMinutes()
    const tokenName = 'Test Token - ' + currentDate
    const tokenSymbol = 'RR'
    const decimalNum = 18
    const { sensibleId, genesis, codehash } = await ftManager.genesis({
      version,
      tokenName,
      tokenSymbol,
      decimalNum,
    })
    genesisInfo = { sensibleId, genesis, codehash }
    console.log({ genesisInfo })

    let { txid } = await ftManager.mint({
      version,
      sensibleId,
      genesisWif: process.env.WIF!,
      receiverAddress: wallet.address.toString(),
      tokenAmount: '10000',
    })
  } else {
    genesisInfo = {
      // release mainnet
      sensibleId: 'fe7c1750d06235c4ee42c32de3e3e29beb82e349aeecf65091f0e804a692582100000000',
      genesis: '02496ae0a5ed28bd04583ca8aabf9138ae6113b1',
      codehash: 'e205939ad9956673ce7da9fbd40514b30f66dc35',
      // release testnet
      // sensibleId: 'a93c28288643b2425f984c93e6b6ad7c1b3330c0c69d8613e5557238922e16ae00000000',
      // genesis: '039032ade3d49a6d4ff41c33b3d63ea5c986f310',
      // codehash: 'a2421f1e90c6048c36745edd44fad682e8644693',
      // debug testnet
      // sensibleId: '27a97925b5550f6178661489a73602ce0e14a725e4f86bfa664de21eaff2964100000000',
      // genesis: '728996c04c1571b122f20f466698c55c7dbcca5e',
      // codehash: '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04',
    }
  }

  return genesisInfo
}

describe('transfer', () => {
  it('initialization', async () => {
    expect(ftManager).toHaveProperty('transfer')
  })

  it.skip('mint then transfer - v1', async () => {
    const { genesis, codehash } = await mintSomeTokens(true, 1)

    const receiverAddress = process.env.ADDRESS2!

    let { txid: transferTxId } = await ftManager.transfer({
      genesis,
      codehash,
      receivers: [
        {
          amount: '10',
          address: receiverAddress,
        },
      ],
      senderWif: process.env.WIF,
    })
    
    await sleep(10000)
    
    let res = await ftManager.api.getFungibleTokenBalance(codehash, genesis, receiverAddress)

    expect(res.pendingBalance).toBe('10')

    expect(transferTxId).toHaveLength(64)

    // remain v1 codehash
    expect(codehash).toBe('a2421f1e90c6048c36745edd44fad682e8644693')
  })

  it.skip('mint then transfer - v2', async () => {
    const { genesis, codehash } = await mintSomeTokens(true)

    const receiverAddress = process.env.ADDRESS2!

    let { txid: transferTxId } = await ftManager.transfer({
      genesis,
      codehash,
      receivers: [
        {
          amount: '10',
          address: receiverAddress,
        },
      ],
      senderWif: process.env.WIF,
    })

    await sleep(10000)
    let res = await ftManager.api.getFungibleTokenBalance(codehash, genesis, receiverAddress)

    expect(res.pendingBalance).toBe('10')

    expect(transferTxId).toHaveLength(64)

    // remain v2 codehash
    expect(codehash).toBe('c9cc7bbd1010b44873959a8b1a2bcedeb62302b7')
  })

  it('transfer then transfer again - v1', async () => {
    // 先转20到地址2
    const { genesis, codehash } = await mintSomeTokens(true, 1)
    let { txid: transferTxId } = await ftManager.transfer({
      genesis,
      codehash,
      receivers: [
        {
          amount: '50',
          address: process.env.ADDRESS2!,
        },
      ],
      senderWif: process.env.WIF,
    })

    await sleep(5000)

    // 再从地址2转10到地址3
    let { txid: transferTxId2 } = await ftManager.transfer({
      genesis,
      codehash,
      receivers: [
        {
          amount: '30',
          address: process.env.ADDRESS3!,
        },
      ],
      senderWif: process.env.WIF2,
    })

    console.log({ transferTxId, transferTxId2 })

    await sleep(5000)
    let res = await ftManager.api.getFungibleTokenBalance(codehash, genesis, process.env.ADDRESS3!)

    expect(res.pendingBalance).toBe('30')

    expect(transferTxId).toHaveLength(64)

    // remain v2 codehash
    expect(codehash).toBe('a2421f1e90c6048c36745edd44fad682e8644693')
  })

  it.skip('transfer then transfer again - v2', async () => {
    // 先转20到地址2
    const { genesis, codehash } = await mintSomeTokens(true)
    let { txid: transferTxId } = await ftManager.transfer({
      genesis,
      codehash,
      receivers: [
        {
          amount: '20',
          address: process.env.ADDRESS2!,
        },
      ],
      senderWif: process.env.WIF,
    })

    await sleep(5000)

    // 再从地址2转10到地址3
    let { txid: transferTxId2 } = await ftManager.transfer({
      genesis,
      codehash,
      receivers: [
        {
          amount: '10',
          address: process.env.ADDRESS3!,
        },
      ],
      senderWif: process.env.WIF2,
    })

    console.log({ transferTxId, transferTxId2 })

    await sleep(5000)
    let res = await ftManager.api.getFungibleTokenBalance(codehash, genesis, process.env.ADDRESS3!)

    expect(res.pendingBalance).toBe('10')

    expect(transferTxId).toHaveLength(64)

    // remain v2 codehash
    expect(codehash).toBe('c9cc7bbd1010b44873959a8b1a2bcedeb62302b7')
  })

  it.skip('归并', async () => {
    const { genesis, codehash } = await mintSomeTokens(false)
    let { txid: mergeTxId } = await ftManager.merge({
      genesis,
      codehash,
      ownerWif: process.env.WIF!,
    })
    console.log(mergeTxId)
    expect(mergeTxId).toHaveLength(64)
  })

  it.skip('多人转账', async () => {
    const { genesis, codehash } = await mintSomeTokens(false)
    const receivers: Receiver[] = []
    for (let i = 0; i < 99; i++) {
      receivers.push({
        amount: '10',
        address: process.env.ADDRESS2!,
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

  it.skip('test', async () => {
    const hex = await ftManager.api.getRawTxData(
      'b7b861159e1f2a87c5917436768fd7d5b29c7da8c0f38e114539c4289a8fa4e4'
    )

    const tx = new Transaction(hex)
    const output = tx.outputs[0]

    const rr = new FtManager({
      network: 'testnet' as API_NET,
      apiTarget: API_TARGET.MVC,
      purse: process.env.RRWIF!,
      feeb: 1,
    })

    rr.api.authorize({ authorization: process.env.METASV_BEARER })
    const token = {
      txId: 'b7b861159e1f2a87c5917436768fd7d5b29c7da8c0f38e114539c4289a8fa4e4',
      outputIndex: 0,
      tokenAddress: process.env.RRADDRESS!,
      tokenAmount: '19000010000',
      wif: process.env.RRWIF!,
    }

    const { txid } = await rr.transfer({
      genesis: '76a8a2122b4f4213921cb0b4de0e7c704628f149',
      codehash: '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04',
      receivers: [
        {
          amount: '100',
          address: process.env.RRADDRESS!,
        },
      ],
      senderWif: process.env.RRWIF!,
      ftUtxos: [token],
      // ftChangeAddress: process.env.RRADDRESS!,
    })

    console.log({ txid })
  })

  it.skip('速度测试 - 转移 - 代理', async () => {
    const { genesis, codehash } = await mintSomeTokens(false)
    const network = process.env.NETWORK === 'testnet' ? API_NET.TEST : API_NET.MAIN
    const apiHost =
      network === API_NET.MAIN ? 'https://api.show3.io/metasv' : 'https://testmvc.showmoney.app/metasv'

    const proxy = new FtManager({
      network,
      apiTarget: API_TARGET.MVC,
      apiHost,
      purse: process.env.WIF!,
      feeb: 1,
    })
    proxy.api.authorize({ authorization: process.env.METASV_BEARER })

    const timerName = 'transfer'
    console.time(timerName)
    const wallet = new Wallet(process.env.WIF!, network, 1, API_TARGET.MVC, apiHost)
    await wallet.merge()
    let { txid: transferTxId } = await proxy.transfer({
      genesis,
      codehash,
      receivers: [
        {
          amount: '10',
          address: process.env.ADDRESS2!,
        },
      ],
      senderWif: process.env.WIF,
    })
    console.timeEnd(timerName)

    console.log({ transferTxId })
    expect(transferTxId).toHaveLength(64)
  })
})
