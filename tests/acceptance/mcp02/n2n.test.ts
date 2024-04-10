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

describe('n对n转账测试', () => {
  // it('3对1转账', async () => {
  //   const tokenInfo = await fakeIt()

  //   console.log({ tokenInfo })
  // })

  it.todo('5对1转账')
  it.skip('指定Token 10对1转账', async () => {
    const tokenInfo = await fakeIt()
    console.log({ tokenInfo })

    // 给1号拆10个面值为1的token
    let dividing: {
      address: string
      amount: string
    }[] = []
    for (let i = 0; i < 10; i++) {
      dividing.push({
        address: wallet.address.toString(),
        amount: '1',
      })
    }
    await ftManager.transfer({
      genesis: tokenInfo.genesis,
      codehash: tokenInfo.codehash,
      senderWif: process.env.WIF,
      receivers: dividing,
    })

    // 构建10个Token信息
    const tokens = []
    for (let i = 0; i < 10; i++) {
      tokens.push({
        genesis: tokenInfo.genesis,
        codehash: tokenInfo.codehash,
        amount: '1',
      })
    }

    // console.log({ txid })
  })
  it.todo('20对1转账')
  it.todo('50对1转账')
  it.todo('99对1转账')

  it.todo('1对3转账')
  it.todo('1对10转账')

  it.skip('1对50转账', async () => {
    const tokenInfo = await fakeIt()
    console.log({ tokenInfo })

    // 先归集
    await ftManager.merge({
      genesis: tokenInfo.genesis,
      codehash: tokenInfo.codehash,
      ownerWif: process.env.WIF,
    })

    // 转给账号2、3
    const receivers = []
    for (let i = 0; i < 50; i++) {
      receivers.push({
        address: wallet2.address.toString(),
        amount: '1',
      })
    }

    const { txid } = await ftManager.transfer({
      genesis: tokenInfo.genesis,
      codehash: tokenInfo.codehash,
      senderWif: process.env.WIF,
      receivers,
    })

    console.log({ txid })
  })

  it.skip('2对2转账', async () => {
    const tokenInfo = await fakeIt()
    console.log({ tokenInfo })

    // 拆分
    const selfReceiver1 = {
      address: wallet.address.toString(),
      amount: '5000',
    }
    const selfReceiver2 = {
      address: wallet.address.toString(),
      amount: '4000',
    }
    await ftManager.transfer({
      genesis: tokenInfo.genesis,
      codehash: tokenInfo.codehash,
      senderWif: process.env.WIF,
      receivers: [selfReceiver1, selfReceiver2],
    })

    // 转给账号2、3
    const receiver1 = {
      address: wallet2.address.toString(),
      amount: '7000',
    }
    const receiver2 = {
      address: wallet3.address.toString(),
      amount: '2000',
    }
    const { txid } = await ftManager.transfer({
      genesis: tokenInfo.genesis,
      codehash: tokenInfo.codehash,
      senderWif: process.env.WIF,
      receivers: [receiver1, receiver2],
    })

    console.log({ txid })
  })

  it.todo('指定Token Utxo的2对2转账')
  it.todo('3对3转账')
  it.todo('10对10转账')
  it.todo('50对50转账')
})
