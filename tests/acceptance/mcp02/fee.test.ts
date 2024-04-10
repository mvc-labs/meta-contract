import 'dotenv/config'
import { FtManager, Wallet, API_NET, API_TARGET, mvc } from '../../../src'
import { sleep } from '../test-helpers'
import { BN } from '../../../src/bn.js'
import { Networks } from '../../../src/mvc'

let ftManager: FtManager

jest.setTimeout(300000)
beforeAll(async () => {
  const network = process.env.NETWORK === 'testnet' ? API_NET.TEST : API_NET.MAIN
  const [wif, wif2, wif3] = [process.env.WIF, process.env.WIF2, process.env.WIF3] as string[]
  const feeb = 1

  ftManager = new FtManager({
    network: network,
    apiTarget: API_TARGET.MVC,
    purse: wif,
    feeb: feeb,
  })
  // ftManager.api.authorize({ authorization: process.env.METASV_BEARER })
})

describe('a wield fee rate miscalculation issue', () => {
  it('initialization', async () => {
    expect(ftManager).toHaveProperty('transfer')
  })

  it("let's see", async () => {
    const network = 'testnet'
    const networkSymbol = 0xef // 0x80 for mainnet
    const bigIntBuf = new BN(process.env.PK_BG).toBuffer()
    const pkBuf = Buffer.concat([Buffer.alloc(1, networkSymbol), bigIntBuf, Buffer.alloc(1, 1)])
    const privateKey = mvc.PrivateKey.fromBuffer(pkBuf, network)

    const publicKey = privateKey.publicKey.toString()
    const address = privateKey.toAddress('testnet').toString()

    const wif = privateKey.toWIF()
    console.log({
      // pkStr,
      publicKey,
      address,
      wif,
      privateCompressed: privateKey.compressed,
      publicCompressed: privateKey.publicKey.compressed,
      private2Compressed: mvc.PrivateKey.fromWIF('cNNrbotvSgrgEjas3dtB6kXM2UsbDYMTXkqP8RaS4pUngwDVYyoi')
        .compressed,
      privateInspect: privateKey.inspect(),
      private2Inspect: mvc.PrivateKey.fromWIF(
        'cNNrbotvSgrgEjas3dtB6kXM2UsbDYMTXkqP8RaS4pUngwDVYyoi'
      ).inspect(),
    })
    // const wif = 'cNNrbotvSgrgEjas3dtB6kXM2UsbDYMTXkqP8RaS4pUngwDVYyoi'
    const wallet = new Wallet(wif, API_NET.TEST, 1, API_TARGET.MVC)
    const { txId } = await wallet.send(process.env.ADDRESS2, 1000)

    // const ft = new FtManager({
    //   network: API_NET.TEST,
    //   apiTarget: API_TARGET.MVC,
    //   purse: wif,
    //   feeb: 1,
    // })
    // const balance = await ft.api.getBalance(address)

    // const codehash = 'c9cc7bbd1010b44873959a8b1a2bcedeb62302b7'
    // const genesis = '6b5d44ffe3f08cc03028bf1d8702e8f9bc8b515a'
    // let { txid: transferTxId } = await ftManager.transfer({
    //   genesis,
    //   codehash,
    //   receivers: [
    //     {
    //       amount: '1',
    //       address: process.env.ADDRESS2,
    //     },
    //   ],
    //   senderWif: wif,
    // })
    // console.log({ transferTxId })

    // await sleep(10000)

    // let res = await ftManager.api.getFungibleTokenBalance(codehash, genesis, process.env.ADDRESS2)

    // // expect(res.pendingBalance).toBe('10')

    // expect(transferTxId).toHaveLength(64)

    // // remain v1 codehash
    // expect(codehash).toBe('c9cc7bbd1010b44873959a8b1a2bcedeb62302b7')
  })
})
