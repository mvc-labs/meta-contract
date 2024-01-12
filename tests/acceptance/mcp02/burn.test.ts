import 'dotenv/config'
import { API_NET, API_TARGET, FtManager, Wallet } from '../../../src'
import { Address } from '../../../src/mvc'
import { BURN_ADDRESS } from '../../../src/mcp02/constants'

let wallet: Wallet
let ftManager: FtManager
let codehash: string
let genesis: string
let sensibleId: string
let genesisTxId: string

jest.setTimeout(3000000)

/**
 * test method, provide wif with enough mvc balance, and it will run through all the test and return balance to the wif address
 */
beforeAll(async () => {
  const network = process.env.NETWORK === 'testnet' ? API_NET.TEST : API_NET.MAIN
  const [wif] = [process.env.WIF] as string[]
  const feeb = 1

  wallet = new Wallet(wif, network, feeb, API_TARGET.MVC)

  ftManager = new FtManager({
    network: network,
    apiTarget: API_TARGET.MVC,
    purse: wif,
    feeb: feeb,
    debug: true,
  })

  const currentDate = new Date().getHours() + ':' + new Date().getMinutes()
  const tokenName = 'Mint - ' + currentDate
  const tokenSymbol = 'HelloWorld'
  const decimalNum = 8

  const genesisResult = await ftManager.genesis({
    tokenName,
    tokenSymbol,
    decimalNum,
    genesisWif: wif,
  })
  codehash = genesisResult.codehash
  genesis = genesisResult.genesis
  genesisTxId = genesisResult.txid
  sensibleId = genesisResult.sensibleId
})

jest.setTimeout(60000)
const burnTokenAmount = '100000'
describe('FT burn test', () => {
  it('normal initialized', async () => {
    expect(ftManager).toBeInstanceOf(FtManager)
  })

  it('burn test', async () => {
    const receiverAddress = wallet.address

    // mint some token to burn
    let { txid } = await ftManager.mint({
      sensibleId,
      genesisWif: process.env.WIF!,
      receiverAddress,
      tokenAmount: '10000000000',
    })
    expect(txid).toHaveLength(64)
    console.log('mint txid ', txid)

    // transfer to zero address in order to burn
    let transfer = await ftManager.transfer({
      genesis,
      codehash,
      receivers: [
        {
          amount: burnTokenAmount,
          address: Address.fromPublicKeyHash(BURN_ADDRESS, API_NET.TEST).toString(),
        },
      ],
      senderWif: process.env.WIF,
    })

    console.log('transfer to zero address txid1 ', transfer.txid)

    // transfer to zero address in order to burn
    let transfer2 = await ftManager.transfer({
      genesis,
      codehash,
      receivers: [
        {
          amount: burnTokenAmount,
          address: Address.fromPublicKeyHash(BURN_ADDRESS, API_NET.TEST).toString(),
        },
      ],
      senderWif: process.env.WIF,
    })

    console.log('transfer to zero address txid2 ', transfer2.txid)
    const ftUtxos = [
      {
        txId: transfer.txid,
        outputIndex: 0,
        tokenAddress: Address.fromPublicKeyHash(BURN_ADDRESS, API_NET.TEST).toString(),
        tokenAmount: burnTokenAmount,
      },
      {
        txId: transfer2.txid,
        outputIndex: 0,
        tokenAddress: Address.fromPublicKeyHash(BURN_ADDRESS, API_NET.TEST).toString(),
        tokenAmount: burnTokenAmount,
      },
    ]

    // burn
    const burnResult = await ftManager.burn({
      genesis,
      codehash,
      ftUtxos,
    })
    console.log('burn check txid ', burnResult.routeCheckTx.hash)
    console.log('burn txid ', burnResult.txid)
  })

  // generate 4 fee utxos , 1 for mint, 2 for transfer, 1 for burn
  it('should success when fix utxo', async function () {
    const receiverAddress = wallet.address
    const receivers = []
    for (let i = 0; i < 4; i++) {
      receivers.push({
        amount: '20000',
        address: wallet.address,
      })
    }
    const feeTxid = (await wallet.sendArray(receivers)) as string
    console.log('fee txid ', feeTxid)

    const tokenAmount = '10000000000'
    // mint some token to burn
    let { txid } = await ftManager.mint({
      sensibleId,
      genesisWif: process.env.WIF!,
      receiverAddress,
      tokenAmount: tokenAmount,
      utxos: [
        {
          txId: feeTxid,
          outputIndex: 0,
          wif: wallet.privateKey.toWIF(),
          satoshis: 20000,
          address: wallet.address,
        },
      ],
    })
    expect(txid).toHaveLength(64)
    console.log('mint txid ', txid)

    // transfer to zero address in order to burn
    let transfer = await ftManager.transfer({
      genesis,
      codehash,
      receivers: [
        {
          amount: tokenAmount,
          address: Address.fromPublicKeyHash(BURN_ADDRESS, API_NET.TEST).toString(),
        },
      ],
      senderWif: process.env.WIF,
      ftUtxos: [
        {
          txId: txid,
          outputIndex: 1,
          tokenAddress: wallet.address.toString(),
          tokenAmount: tokenAmount,
          wif: wallet.privateKey.toWIF(),
        },
      ],
      utxos: [
        {
          txId: feeTxid,
          outputIndex: 1,
          wif: wallet.privateKey.toWIF(),
          satoshis: 20000,
          address: wallet.address,
        },
      ],
    })

    console.log('transfer to zero address txid1 ', transfer.txid)

    const ftUtxos = [
      {
        txId: transfer.txid,
        outputIndex: 0,
        tokenAddress: Address.fromPublicKeyHash(BURN_ADDRESS, API_NET.TEST).toString(),
        tokenAmount: tokenAmount,
      },
    ]

    // burn
    const burnResult = await ftManager.burn({
      genesis,
      codehash,
      ftUtxos,
      utxos: [
        {
          txId: feeTxid,
          outputIndex: 3,
          wif: wallet.privateKey.toWIF(),
          satoshis: 20000,
          address: wallet.address,
        },
      ],
    })
    console.log('burn check txid ', burnResult.routeCheckTx.hash)
    console.log('burn txid ', burnResult.txid)
  })
})
