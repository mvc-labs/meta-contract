import { buildTypeClasses, Bytes } from '../scryptlib'
import { Transaction, crypto, encoding } from '../mvc'
import { BN } from '..'
const jsonDescr = require('../mcp01/contract-desc/txUtil_desc.json')
const { TxInputProof, TxOutputProof } = buildTypeClasses(jsonDescr)

export let getUInt8Buf = function (amount: number) {
  const buf = Buffer.alloc(1, 0)
  buf.writeUInt8(amount)
  return buf
}

export let getUInt16Buf = function (amount: number) {
  const buf = Buffer.alloc(2, 0)
  buf.writeUInt16LE(amount)
  return buf
}

export let getUInt32Buf = function (index: number) {
  const buf = Buffer.alloc(4, 0)
  buf.writeUInt32LE(index)
  return buf
}

export let getUInt64Buf = function (amount: number) {
  return new BN(amount.toString()).toBuffer({ endian: 'little', size: 8 })
}
export function getTxidInfo(tx: Transaction) {
  const writer: any = new encoding.BufferWriter()
  writer.writeUInt32LE(tx.version)
  writer.writeUInt32LE(tx.nLockTime)
  writer.writeUInt32LE(tx.inputs.length)
  writer.writeUInt32LE(tx.outputs.length)

  const inputWriter: any = new encoding.BufferWriter()
  const inputWriter2: any = new encoding.BufferWriter()
  for (const input of tx.inputs) {
    inputWriter.writeReverse(input.prevTxId)
    inputWriter.writeUInt32LE(input.outputIndex)
    inputWriter.writeUInt32LE(input.sequenceNumber)

    inputWriter2.write(crypto.Hash.sha256(input.script.toBuffer()))
  }
  const inputHashProof = inputWriter.toBuffer()
  writer.write(crypto.Hash.sha256(inputHashProof))
  writer.write(crypto.Hash.sha256(inputWriter2.toBuffer()))

  const outputWriter: any = new encoding.BufferWriter()
  for (const output of tx.outputs) {
    outputWriter.writeUInt64LEBN(output.satoshisBN)
    outputWriter.write(crypto.Hash.sha256(output.script.toBuffer()))
  }
  const outputHashProof = outputWriter.toBuffer()
  writer.write(crypto.Hash.sha256(outputHashProof))

  const txHeader = writer.toBuffer().toString('hex')
  return {
    txHeader,
    inputHashProof: inputHashProof.toString('hex'),
    outputHashProof: outputHashProof.toString('hex'),
  }
}

export function createTxInputProof(tx: Transaction, inputIndex: number) {
  const info = getTxidInfo(tx)
  const txHeader = new Bytes(info.txHeader)
  const input = tx.inputs[inputIndex]
  const res = {
    hashProof: new Bytes(info.inputHashProof),
    txHash: new Bytes(
      Buffer.from(input.prevTxId as any, 'hex')
        .reverse()
        .toString('hex')
    ),
    outputIndexBytes: new Bytes(getUInt32Buf(input.outputIndex).toString('hex')),
    sequenceBytes: new Bytes(getUInt32Buf(input.sequenceNumber).toString('hex')),
  }
  return [res, txHeader]
}

export function createTxOutputProof(tx: Transaction, outputIndex: number) {
  const info = getTxidInfo(tx)
  const output = tx.outputs[outputIndex]
  const res = {
    txHeader: new Bytes(info.txHeader),
    hashProof: new Bytes(info.outputHashProof),
    satoshiBytes: new Bytes(getUInt64Buf(output.satoshis).toString('hex')),
    scriptHash: new Bytes(crypto.Hash.sha256(output.script.toBuffer()).toString('hex')),
  }
  return res
}

export function createGenesisTxInputProof(genesisUtxo: any) {
  const genesisTx = new Transaction(genesisUtxo.satotxInfo.txHex)
  const prevInputIndex = 0
  const inputRes = createTxInputProof(genesisTx, prevInputIndex)
  const genesisTxInputProof = new TxInputProof(inputRes[0])
  const genesisTxHeader = inputRes[1] as Bytes // TODO:

  return { genesisTxHeader, prevInputIndex, genesisTxInputProof }
}

export function createPrevGenesisTxOutputProof(genesisUtxo) {
  const preGenesisOutputIndex = genesisUtxo.satotxInfo.preOutputIndex
  const preGenesisTx = new Transaction(genesisUtxo.satotxInfo.preTxHex)
  const prevOutputProof = createTxOutputProof(preGenesisTx, preGenesisOutputIndex)

  return {
    prevGenesisTxHeader: prevOutputProof.txHeader,
    prevTxOutputHashProof: prevOutputProof.hashProof,
    prevTxOutputSatoshiBytes: prevOutputProof.satoshiBytes,
  }
}
