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

  it('test', async () => {
    const txHex =
      '0a000000017ed1e0b3255e745ca5c3e1c442d7e42618711a1e8af6208f5ed1e5a9e158be71000000006b483045022100c09762d54829fd45ceb77e02b601fa5771e5673dc825b40602d6a845af24d5790220460eae308afc8ec541e4fcede06d05329303f5c9f20093a38de2604181cbb5054121022918ce053849bfc2d2059a28dd371af68e17544444cb3384bcc0e0e0366b2165ffffffff05d0070000000000001976a914ecfa07f9e69af6f4283b47ca5139546ce220e55b88ac22020000000000001976a9145bd8e061781b56d50f17d3f47cf49e95cd966b3588ac2a221801000000001976a914b0ee85fad1bc231afeda1ac52b64784bcae849f788ac0000000000000000fd7301006a046d657461423032343138643930363664653231663862613861306165353338653930326135626230643531353838633163616263303062663832346233386463383233636163374064343633386532356432633236663535643964663034363336306137323538383436653465653534313762323131303466313838656162633536333061653061066d6574616964125061794c696b652d313636323131323136344cad7b22706179223a323030302c22706179546f223a22314e63317a6a7a6f775a514d776e454756366f396d4b4375545534714d4570716e46222c2269734c696b65223a2231222c2263726561746554696d65223a313636323131323132343539392c226c696b65546f223a2264356466393864323939323637343563316262616663643262373966666665616235653036623134353435373236643039623434383335353938653135353035227d013005312e302e32106170706c69636174696f6e2f6a736f6e055554462d38000000000000000006006a03694f5300000000'
    const tx = new Transaction(txHex)
    // tx.version = 1
    // await wallet.api.broadcast(txHex)

    console.log(tx.id, tx.version)
  })

  it('转账', async () => {
    // const receiverAddress = wallet2.address.toString()
    const receiverAddress = '1NYHDf8df6ZfUgQP8BM5rEtmZciGTw7YdS'
    const txId = await wallet.send(receiverAddress, 50000)
    expect(txId).toHaveLength(64)
    console.log(txId)
  })

  it('批量转账', async () => {
    await wallet2.merge()
    const receivers = [
      { address: wallet2.address.toString(), amount: 1000 },
      { address: wallet2.address.toString(), amount: 2000 },
    ]
    const txId = (await wallet.sendArray(receivers)) as String
    expect(txId).toHaveLength(64)
    // 检查wallet2多出两个utxo
    const utxos = await wallet2.getUtxos()
    expect(utxos.length).toBe(3)
  })

  it('合并UTXO', async () => {
    const txId = await wallet2.merge()
    expect(txId).toHaveLength(64)
  })

  it.todo('广播')
  it.todo('发送OpReturn')
})
