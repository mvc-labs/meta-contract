import { API_NET, TxDecoder } from '../../../src'
import { MVC } from '../../../src/api/MVC'
import 'dotenv/config'
import { Transaction } from '../../../src/mvc'
import { getFlag, hasProtoFlag, getHeaderLen, getProtoType } from '../../../src/common/protoheader'

let txDecoder: TxDecoder
let MVCAPI: MVC
beforeAll(async () => {
  txDecoder = new TxDecoder()
  const network = process.env.NETWORK === 'testnet' ? API_NET.TEST : API_NET.MAIN
  MVCAPI = new MVC(network)
  MVCAPI.authorize({ authorization: process.env.METASV_BEARER })
})

describe('TxDecoder测试', () => {
  it('正常初始化', async () => {
    expect(txDecoder).toBeInstanceOf(TxDecoder)
  })

  it('解码能正确识别NFT输入类型', async () => {
    const nftTransferTxId = '009e91e36eceaed18fcd9ef34a0c9f96d3c06a549a098809e2d737c2a3200256'
    const txHex = await MVCAPI.getRawTxData(nftTransferTxId)
    const tx = new Transaction(txHex)

    const vins = await MVCAPI.getVins(nftTransferTxId)

    let inputs = tx.inputs
    let i = 0
    for (let input of inputs) {
      if (vins[i]) {
        input.output = new Transaction.Output({
          script: vins[i].script,
          satoshis: vins[i].value,
        })
      }
      i++
    }
    // const decodedTx = TxDecoder.decodeTx(tx, API_NET.TEST)
    const nftInput = tx.inputs[0]
    const nft = TxDecoder.decodeOutput(nftInput.output, API_NET.TEST)
    const scriptBuf = nftInput.output.script.toBuffer()
    const has = hasProtoFlag(scriptBuf)
    const flag = getFlag(scriptBuf).toString()
    const header = scriptBuf.slice(scriptBuf.length - getHeaderLen(), scriptBuf.length).toString()
    const script = scriptBuf.toString()
    console.log({ has, flag, header, script, type: getProtoType(scriptBuf) })
    // console.log({ nft: decodedTx.inputs[0] })
  })

  it.skip('dev', async () => {
    const hex =
      '0a0000000147b83d05df8c946bd8b435019dd503fe98f8bb4e90585bf77759eb23094f910c010000006a4730440220066f947a78d70d4afb08699b81ead3021ee3d0bbfbb57cf1b8eb95457102100e02205ea18fc1a7fd041a73da1a7972dd499b794589b4f7489770c6c98486e296755c412102e45470a184e84658ea7aa412470c674cf8fa19afd9802e40a656f44c8eb95601ffffffff02000000000000000074006a046d65746142303265343534373061313834653834363538656137616134313234373063363734636638666131396166643938303265343061363536663434633865623935363031044e554c4c066d657461696404526f6f74044e554c4c044e554c4c044e554c4c044e554c4c044e554c4c46030300000000001976a91412e05e38481043bb00cb78be5f190940567d0cab88ac00000000'
    const tx = new Transaction(hex)

    console.log(tx.id)
  })
})
