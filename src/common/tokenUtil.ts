import * as mvc from '../mvc'
import { Bytes } from '../scryptlib'
import BN = require('../bn.js')

export const RABIN_SIG_LEN = 384

export let toBufferLE = function (num: number | string, width: number) {
  const hex = num.toString(16)
  const buffer = Buffer.from(hex.padStart(width * 2, '0').slice(0, width * 2), 'hex')
  buffer.reverse()
  return buffer
}

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

export let getTxIdBuf = function (txid: string) {
  const buf = Buffer.from(txid, 'hex').reverse()
  return buf
}

export let getScriptHashBuf = function (scriptBuf: Buffer) {
  const buf = Buffer.from(mvc.crypto.Hash.sha256ripemd160(scriptBuf))
  return buf
}

export let writeVarint = function (buf: Buffer) {
  const n = buf.length
  let header: Buffer
  let res = Buffer.alloc(0)
  if (n < 0xfd) {
    header = getUInt8Buf(n)
  } else if (n < 0x10000) {
    header = Buffer.concat([Buffer.from('fd', 'hex'), getUInt16Buf(n)])
  } else if (n < 0x100000000) {
    header = Buffer.concat([Buffer.from('fe', 'hex'), getUInt32Buf(n)])
  } else if (n < 0x10000000000000000) {
    header = Buffer.concat([Buffer.from('ff', 'hex'), getUInt64Buf(n)])
  }

  return Buffer.concat([header, buf])
}

export let getLockingScriptFromPreimage = function (buf: Buffer) {
  const offset = 4 + 32 + 32 + 32 + 4
  buf = buf.slice(offset, buf.length)
  const n = buf[0]
  buf = buf.slice(1, buf.length)
  let lockingScriptBuf
  if (n < 0xfd) {
    let len = n
    lockingScriptBuf = buf.slice(0, len)
  } else if (n == 0xfd) {
    let len = buf.slice(0, 2).readInt16LE(0)
    lockingScriptBuf = buf.slice(2, len + 2)
  } else if (n == 0xfe) {
    let len = buf.slice(0, 4).readInt32LE(0)
    lockingScriptBuf = buf.slice(4, len + 4)
  } else if (n == 0xff) {
    let len = Number(buf.slice(0, 8).readBigUInt64LE(0))
    lockingScriptBuf = buf.slice(8, len + 8)
  }
  return lockingScriptBuf
}

export let getGenesisHashFromLockingScript = function (lockingScript: any): Buffer {
  let genesisHash: Buffer
  let c = 0
  for (let i = 0; i < lockingScript.chunks.length; i++) {
    let chunk = lockingScript.chunks[i]
    if (chunk.buf && chunk.buf.length == 20) {
      c++
      if (c == 11) {
        genesisHash = chunk.buf
        break
      }
    }
  }
  return genesisHash
}

export let getRabinPubKeyHashArray = function (rabinPubKeys: BN[]) {
  let buf = Buffer.alloc(0)
  for (let i = 0; i < rabinPubKeys.length; i++) {
    buf = Buffer.concat([
      buf,
      mvc.crypto.Hash.sha256ripemd160(
        this.toBufferLE(rabinPubKeys[i].toString(16), this.RABIN_SIG_LEN)
      ),
    ])
  }
  return buf
}

export function getOutpointBuf(txid: string, index: number): Buffer {
  const txidBuf = Buffer.from(txid, 'hex').reverse()
  const indexBuf = Buffer.alloc(4, 0)
  indexBuf.writeUInt32LE(index)
  let buf = Buffer.concat([txidBuf, indexBuf])
  return buf
}

export const getEmptyTxOutputProof = function () {
  const data = {
    txHeader: new Bytes(''),
    hashProof: new Bytes(''),
    satoshiBytes: new Bytes(''),
    scriptHash: new Bytes(''),
  }
  return data
}

export const buildScriptData = function (data: Buffer) {
  let res = Buffer.concat([data, getUInt32Buf(0), getUInt8Buf(255)])
  const pushDataLen = getOpPushDataLen(res.length)
  res.writeUInt32LE(pushDataLen + data.length, data.length)
  return res
}

export const getOpPushDataLen = function (dataLen: number) {
  if (dataLen <= 75) {
    return 1
  } else if (dataLen <= 255) {
    return 2
  } else if (dataLen <= 65535) {
    return 3
  } else {
    return 5
  }
}

export function getTxidInfo(tx: mvc.Transaction) {
  const writer: any = new mvc.encoding.BufferWriter()
  writer.writeUInt32LE(tx.version)
  writer.writeUInt32LE(tx.nLockTime)
  writer.writeUInt32LE(tx.inputs.length)
  writer.writeUInt32LE(tx.outputs.length)

  const inputWriter: any = new mvc.encoding.BufferWriter()
  const inputWriter2: any = new mvc.encoding.BufferWriter()
  for (const input of tx.inputs) {
    inputWriter.writeReverse(input.prevTxId)
    inputWriter.writeUInt32LE(input.outputIndex)
    inputWriter.writeUInt32LE(input.sequenceNumber)

    inputWriter2.write(mvc.crypto.Hash.sha256(input.script.toBuffer()))
  }
  const inputHashProof = inputWriter.toBuffer()
  writer.write(mvc.crypto.Hash.sha256(inputHashProof))
  writer.write(mvc.crypto.Hash.sha256(inputWriter2.toBuffer()))

  const outputWriter: any = new mvc.encoding.BufferWriter()
  for (const output of tx.outputs) {
    outputWriter.writeUInt64LEBN(output.satoshisBN)
    outputWriter.write(mvc.crypto.Hash.sha256(output.script.toBuffer()))
  }
  const outputHashProof = outputWriter.toBuffer()
  writer.write(mvc.crypto.Hash.sha256(outputHashProof))

  const txHeader = writer.toBuffer().toString('hex')
  return {
    txHeader,
    inputHashProof: inputHashProof.toString('hex'),
    outputHashProof: outputHashProof.toString('hex'),
  }
}

export const getTxInputProof = function (tx: mvc.Transaction, inputIndex: number) {
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

export const getTxOutputProof = function (tx: mvc.Transaction, outputIndex: number) {
  const info = getTxidInfo(tx)
  const output = tx.outputs[outputIndex]
  const res = {
    txHeader: new Bytes(info.txHeader),
    hashProof: new Bytes(info.outputHashProof),
    satoshiBytes: new Bytes(getUInt64Buf(output.satoshis).toString('hex')),
    scriptHash: new Bytes(mvc.crypto.Hash.sha256(output.script.toBuffer()).toString('hex')),
  }
  return res
}
