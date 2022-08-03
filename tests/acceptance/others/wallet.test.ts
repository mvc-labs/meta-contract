import { SIGNER_NUM } from '../../../src/bcp01/contract-proto/nft.proto'
import * as mvc from '../../../src/mvc'
import * as Utils from '../../../src/common/utils'
import { API_NET, API_TARGET, Wallet } from '../../../src/index'
import { MockApi } from '../MockApi'
Utils.isNull(SIGNER_NUM)

let wallets: {
  privateKey: mvc.PrivateKey
  publicKey: mvc.PublicKey
  address: mvc.Address
}[] = []
for (let i = 0; i < 4; i++) {
  let privateKey = new mvc.PrivateKey()
  wallets.push({
    privateKey,
    publicKey: privateKey.publicKey,
    address: privateKey.toAddress('mainnet'),
  })
}
let [FeePayer, CoffeeShop, Alice, Bob] = wallets
// console.log(`
// FeePayer:   ${FeePayer.address.toString()}
// CoffeeShop: ${CoffeeShop.address.toString()}
// Alice:      ${Alice.address.toString()}
// Bob:        ${Bob.address.toString()}
// `);

let api = new MockApi()
async function genDummyFeeUtxos(satoshis: number, count: number = 1) {
  let feeTx = new mvc.Transaction()
  let unitSatoshis = Math.ceil(satoshis / count)
  let satoshisArray = []

  for (let i = 0; i < count; i++) {
    if (satoshis < unitSatoshis) {
      satoshisArray.push(satoshis)
    } else {
      satoshisArray.push(unitSatoshis)
    }
    satoshis -= unitSatoshis
  }
  for (let i = 0; i < count; i++) {
    feeTx.addOutput(
      new mvc.Transaction.Output({
        script: mvc.Script.buildPublicKeyHashOut(FeePayer.address),
        satoshis: satoshisArray[i],
      })
    )
  }
  let utxos = []
  for (let i = 0; i < count; i++) {
    utxos.push({
      txId: feeTx.id,
      outputIndex: i,
      satoshis: satoshisArray[i],
      address: FeePayer.address.toString(),
      wif: FeePayer.privateKey.toWIF(),
    })
  }
  await api.broadcast(feeTx.serialize(true))
  return utxos
}
function cleanBsvUtxos() {
  api.cleanBsvUtxos()
}

describe('Wallet Test', () => {
  let wallet: Wallet
  describe('basic test ', () => {
    before(async () => {
      wallet = new Wallet(FeePayer.privateKey.toWIF(), API_NET.MAIN, 0.5, API_TARGET.SENSIBLE)
      wallet.blockChainApi = api
      await genDummyFeeUtxos(100000001)
    })
    it('send Alice 1000 Sat. should be ok', async () => {
      let txComposer = await wallet.send(Alice.address.toString(), 1000, {
        noBroadcast: false,
        dump: true,
      })
    })

    it('split 3000 Sat. should be ok', async () => {
      wallet = new Wallet(Alice.privateKey.toWIF(), API_NET.MAIN, 0.5, API_TARGET.SENSIBLE)
      wallet.blockChainApi = api
      let txComposer = await wallet.sendArray(
        [
          {
            address: Alice.address.toString(),
            amount: 1000,
          },
          {
            address: Alice.address.toString(),
            amount: 1000,
          },
          {
            address: Alice.address.toString(),
            amount: 1000,
          },
        ],
        {
          noBroadcast: false,
          dump: true,
        }
      )
    })

    it('merge Alice satoshis should be ok', async () => {
      wallet = new Wallet(Alice.privateKey.toWIF(), API_NET.MAIN, 0.5, API_TARGET.SENSIBLE)
      wallet.blockChainApi = api
      let txComposer = await wallet.merge({
        noBroadcast: false,
        dump: true,
      })
    })

    it('send opreturnData should be ok', async () => {
      wallet = new Wallet(Alice.privateKey.toWIF(), API_NET.MAIN, 0.5, API_TARGET.SENSIBLE)
      wallet.blockChainApi = api
      let txComposer = await wallet.sendOpReturn('Alice and Bob are friends', {
        noBroadcast: false,
        dump: true,
      })
    })
  })
})
