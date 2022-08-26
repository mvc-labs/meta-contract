import * as mvc from '../mvc'
import { CONTRACT_TYPE, dumpTx, SigHashInfo } from '../common/utils'
import { getPreimage, signTx, toHex, Sig } from '../scryptlib'

const Signature = mvc.crypto.Signature
export const sighashType = Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID
const P2PKH_UNLOCK_SIZE = 1 + 1 + 71 + 1 + 33
const P2PKH_DUST_AMOUNT = 1
const MIN_FEE_AMOUNT = 56
const TX_VERSION = 10
export class TxComposer {
  tx: mvc.Transaction
  sigHashList: SigHashInfo[] = []
  changeOutputIndex: number = -1
  constructor(tx?: mvc.Transaction) {
    this.tx = tx || new mvc.Transaction()
    this.tx.version = TX_VERSION
  }

  toObject() {
    let composer = {
      tx: this.tx.toObject(),
      sigHashList: this.sigHashList,
      changeOutputIndex: this.changeOutputIndex,
    }
    return composer
  }

  static fromObject(composerObj: any) {
    let txObj = composerObj.tx
    let tx = new mvc.Transaction()
    txObj.inputs.forEach((v) => {
      tx.addInput(new mvc.Transaction.Input(v))
    })
    txObj.outputs.forEach((v) => {
      tx.addOutput(new mvc.Transaction.Output(v))
    })
    tx.nLockTime = txObj.nLockTime
    tx.version = txObj.version

    let txComposer = new TxComposer(tx)
    txComposer.sigHashList = composerObj.sigHashList
    txComposer.changeOutputIndex = composerObj.changeOutputIndex
    return txComposer
  }

  getRawHex() {
    return this.tx.serialize(true)
  }

  getTx() {
    return this.tx
  }
  getTxId() {
    return this.tx.id
  }

  getInput(inputIndex: number) {
    return this.tx.inputs[inputIndex]
  }

  getOutput(outputIndex: number) {
    return this.tx.outputs[outputIndex]
  }

  appendP2PKHInput(utxo: {
    address: mvc.Address
    satoshis: number
    txId: string
    outputIndex: number
  }) {
    this.tx.addInput(
      new mvc.Transaction.Input.PublicKeyHash({
        output: new mvc.Transaction.Output({
          script: mvc.Script.buildPublicKeyHashOut(utxo.address),
          satoshis: utxo.satoshis,
        }),
        prevTxId: utxo.txId,
        outputIndex: utxo.outputIndex,
        script: mvc.Script.empty(),
      })
    )
    const inputIndex = this.tx.inputs.length - 1
    return inputIndex
  }

  appendInput(input: {
    txId: string
    outputIndex: number
    lockingScript?: mvc.Script
    satoshis?: number
  }) {
    this.tx.addInput(
      new mvc.Transaction.Input({
        output: new mvc.Transaction.Output({
          script: input.lockingScript,
          satoshis: input.satoshis,
        }),
        prevTxId: input.txId,
        outputIndex: input.outputIndex,
        script: mvc.Script.empty(),
      })
    )
    const inputIndex = this.tx.inputs.length - 1
    return inputIndex
  }

  appendP2PKHOutput(output: { address: mvc.Address; satoshis: number }) {
    this.tx.addOutput(
      new mvc.Transaction.Output({
        script: new mvc.Script(output.address),
        satoshis: output.satoshis,
      })
    )
    const outputIndex = this.tx.outputs.length - 1
    return outputIndex
  }

  appendOutput(output: { lockingScript: mvc.Script; satoshis: number }) {
    this.tx.addOutput(
      new mvc.Transaction.Output({
        script: output.lockingScript,
        satoshis: output.satoshis,
      })
    )
    const outputIndex = this.tx.outputs.length - 1
    return outputIndex
  }

  appendOpReturnOutput(opreturnData: any) {
    this.tx.addOutput(
      new mvc.Transaction.Output({
        script: mvc.Script.buildSafeDataOut(opreturnData),
        satoshis: 0,
      })
    )
    const outputIndex = this.tx.outputs.length - 1
    return outputIndex
  }

  clearChangeOutput() {
    if (this.changeOutputIndex != -1) {
      this.tx.outputs.splice(this.changeOutputIndex, 1)
      this.changeOutputIndex = 0
    }
  }
  appendChangeOutput(changeAddress: mvc.Address, feeb = 0.05, extraSize = 0) {
    //Calculate the fee and determine whether to change
    //If there is change, it will be output in the last item
    const unlockSize =
      this.tx.inputs.filter((v) => v.output.script.isPublicKeyHashOut()).length * P2PKH_UNLOCK_SIZE
    let fee = Math.ceil(
      (this.tx.toBuffer().length +
        unlockSize +
        extraSize +
        mvc.Transaction.CHANGE_OUTPUT_MAX_SIZE) *
        feeb
    )

    let changeAmount = this.getUnspentValue() - fee
    if (changeAmount >= P2PKH_DUST_AMOUNT) {
      this.changeOutputIndex = this.appendP2PKHOutput({
        address: changeAddress,
        satoshis: changeAmount,
      })
    } else {
      this.changeOutputIndex = -1
    }
    return this.changeOutputIndex
  }

  unlockP2PKHInput(privateKey: mvc.PrivateKey, inputIndex: number, sigtype = sighashType) {
    const tx = this.tx
    const sig = new mvc.Transaction.Signature({
      publicKey: privateKey.publicKey,
      prevTxId: tx.inputs[inputIndex].prevTxId,
      outputIndex: tx.inputs[inputIndex].outputIndex,
      inputIndex,
      signature: mvc.Transaction.Sighash.sign(
        tx,
        privateKey,
        sigtype,
        inputIndex,
        tx.inputs[inputIndex].output.script,
        tx.inputs[inputIndex].output.satoshisBN
      ),
      sigtype,
    })

    tx.inputs[inputIndex].setScript(
      mvc.Script.buildPublicKeyHashIn(sig.publicKey, sig.signature.toDER(), sig.sigtype)
    )
  }

  getTxFormatSig(privateKey: mvc.PrivateKey, inputIndex: number, sigtype = sighashType) {
    let sig: Sig = signTx(
      this.tx,
      privateKey,
      this.getInput(inputIndex).output.script,
      this.getInput(inputIndex).output.satoshis,
      inputIndex,
      sigtype
    )
    return sig
  }

  getInputPreimage(inputIndex: number, sigtype = sighashType) {
    return getPreimage(
      this.tx,
      this.getInput(inputIndex).output.script,
      this.getInput(inputIndex).output.satoshis,
      inputIndex,
      sigtype
    )
  }

  getUnspentValue() {
    const inputAmount = this.tx.inputs.reduce((pre, cur) => cur.output.satoshis + pre, 0)
    const outputAmount = this.tx.outputs.reduce((pre, cur) => cur.satoshis + pre, 0)

    let unspentAmount = inputAmount - outputAmount
    return unspentAmount
  }

  getFeeRate() {
    let unspent = this.getUnspentValue()
    let txSize = this.tx.toBuffer().length
    return unspent / txSize
  }

  getSigHashLit() {
    this.sigHashList.forEach((v) => {
      v.sighash = toHex(
        mvc.Transaction.Sighash.sighash(
          this.tx,
          v.sighashType,
          v.inputIndex,
          this.getInput(v.inputIndex).output.script,
          this.getInput(v.inputIndex).output.satoshisBN
        )
      )
    })
    return this.sigHashList
  }

  addSigHashInfo({
    inputIndex,
    address,
    sighashType,
    contractType,
  }: {
    inputIndex: number
    address: string
    sighashType: number
    contractType: CONTRACT_TYPE
  }) {
    this.sigHashList.push({
      inputIndex,
      address,
      sighash: '',
      sighashType,
      contractType,
    })
  }

  getPrevoutsHash() {
    let prevouts = Buffer.alloc(0)
    this.tx.inputs.forEach((input) => {
      const indexBuf = Buffer.alloc(4, 0)
      indexBuf.writeUInt32LE(input.outputIndex)
      prevouts = Buffer.concat([prevouts, Buffer.from(input.prevTxId).reverse(), indexBuf])
    })
    return mvc.crypto.Hash.sha256sha256(prevouts).toString('hex')
  }

  dumpTx(network?: string) {
    dumpTx(this.tx, network)
  }
}
