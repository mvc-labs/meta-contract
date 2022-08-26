import { Transaction, Address, PrivateKey, Script } from '../mvc'
import { CodeError, ErrCode } from './error'
import { API_NET, Api, TxComposer } from '..'
import { sighashType, CONTRACT_TYPE } from './utils'
import { ContractAdapter } from './ContractAdapter'
import { DustCalculator } from './DustCalculator'
import * as TokenUtil from '../common/tokenUtil'
import { Bytes } from '../scryptlib'
import { NftFactory } from '../mcp01/contract-factory/nft'
import { NftGenesisFactory } from '../mcp01/contract-factory/nftGenesis'
import { TokenGenesisFactory } from '../mcp02/contract-factory/tokenGenesis'
import * as nftProto from '../mcp01/contract-proto/nft.proto'
import * as ftProto from '../mcp02/contract-proto/token.proto'
import { TokenFactory } from '../mcp02/contract-factory/token'

type Utxo = {
  txId: string
  outputIndex: number
  satoshis: number
  address: Address
}

type Purse = {
  privateKey: PrivateKey
  address: Address
}

export async function prepareUtxos(
  purse: Purse,
  api: Api,
  network: API_NET
): Promise<{
  utxos: Utxo[]
  utxoPrivateKeys: PrivateKey[]
}> {
  let utxoPrivateKeys = []

  const utxos: any[] = await api.getUnspents(purse.address.toString())
  utxos.forEach((utxo) => {
    utxoPrivateKeys.push(purse.privateKey)
    utxo.address = new Address(utxo.address, network)
  })

  if (utxos.length == 0) throw new CodeError(ErrCode.EC_INSUFFICIENT_BSV, 'Insufficient balance.')

  return { utxos, utxoPrivateKeys }
}

export function addP2PKHInputs(txComposer: TxComposer, utxos: Utxo[]) {
  const p2pkhInputIndexs = utxos.map((utxo) => {
    const inputIndex = txComposer.appendP2PKHInput(utxo)
    txComposer.addSigHashInfo({
      inputIndex,
      address: utxo.address.toString(),
      sighashType,
      contractType: CONTRACT_TYPE.P2PKH,
    })

    return inputIndex
  })

  return p2pkhInputIndexs
}

export function addContractInput(
  txComposer: TxComposer,
  contractUTxo: Utxo,
  address: string,
  contractType: CONTRACT_TYPE
) {
  const contractInputIndex = txComposer.appendInput(contractUTxo)
  txComposer.addSigHashInfo({
    inputIndex: contractInputIndex,
    address,
    sighashType,
    contractType,
  })

  return contractInputIndex
}

export function addContractOutput({
  txComposer,
  contract,
  lockingScript,
  dustCalculator,
}: {
  txComposer: TxComposer
  contract?: ContractAdapter
  lockingScript?: Script
  dustCalculator: DustCalculator
}) {
  if (!lockingScript) {
    lockingScript = contract.lockingScript
  }
  const contractSize = lockingScript.toBuffer().length
  const satoshis = dustCalculator.getDustThreshold(contractSize)

  return txComposer.appendOutput({
    lockingScript,
    satoshis,
  })
}

export function addChangeOutput(txComposer: TxComposer, changeAddress: Address, feeb) {
  return txComposer.appendChangeOutput(changeAddress, feeb)
}

export function unlockP2PKHInputs(
  txComposer: TxComposer,
  inputIndexes: any[],
  utxoPrivateKeys: PrivateKey[]
) {
  inputIndexes.forEach((inputIndex) => {
    let privateKey = utxoPrivateKeys.splice(0, 1)[0]
    txComposer.unlockP2PKHInput(privateKey, inputIndex)
  })
}

export function checkFeeRate(txComposer: TxComposer, feeb) {
  let feeRate = txComposer.getFeeRate()
  if (feeRate < feeb) {
    throw new CodeError(
      ErrCode.EC_INSUFFICIENT_BSV,
      `Insufficient balance.The fee rate should not be less than ${feeb}, but in the end it is ${feeRate}.`
    )
  }
}

export function getGenesisIdentifiers({
  genesisTx,
  purse,
  transferCheckCodeHashArray,
  unlockContractCodeHashArray,
  type,
}: {
  genesisTx: Transaction
  purse: Purse
  transferCheckCodeHashArray?: Bytes[]
  unlockContractCodeHashArray: Bytes[]
  type: string
}) {
  let genesis: string, codehash: string, sensibleId: string
  const proto = type === 'nft' ? nftProto : ftProto

  const genesisOutputIndex = 0
  const genesisTxId = genesisTx.id
  let genesisLockingScriptBuf = genesisTx.outputs[genesisOutputIndex].script.toBuffer()

  const dataPartObj: any = proto.parseDataPart(genesisLockingScriptBuf)
  dataPartObj.sensibleID = {
    txid: genesisTxId,
    index: genesisOutputIndex,
  }
  genesisLockingScriptBuf = proto.updateScript(genesisLockingScriptBuf, dataPartObj)

  let artifactContract: any
  if (type === 'nft') {
    artifactContract = NftFactory.createContract(unlockContractCodeHashArray)
  } else {
    artifactContract = TokenFactory.createContract(
      transferCheckCodeHashArray,
      unlockContractCodeHashArray
    )
  }

  artifactContract.setFormatedDataPart({
    sensibleID: {
      txid: genesisTxId,
      index: genesisOutputIndex,
    },
    genesisHash: TokenUtil.getScriptHashBuf(genesisLockingScriptBuf).toString('hex'),
    tokenAddress: purse.address.hashBuffer.toString('hex'),
  })

  let scriptBuf = artifactContract.lockingScript.toBuffer()
  genesis = proto.getQueryGenesis(scriptBuf)
  codehash = artifactContract.getCodeHash()
  sensibleId = TokenUtil.getOutpointBuf(genesisTxId, genesisOutputIndex).toString('hex')

  return { codehash, genesis, sensibleId }
}

export async function getNftInfo({
  tokenIndex,
  codehash,
  genesis,
  api,
  network,
}: {
  tokenIndex: string
  codehash: string
  genesis: string
  api: Api
  network: API_NET
}) {
  let _res = await api.getNonFungibleTokenUnspentDetail(codehash, genesis, tokenIndex)
  let nftUtxo: any = {
    txId: _res.txId,
    outputIndex: _res.outputIndex,
    nftAddress: new Address(_res.tokenAddress, network),
  }

  return { nftUtxo }
}

// 获取最新的创世合约及tx信息
export async function getLatestGenesisInfo({
  sensibleId,
  api,
  address,
  type,
}: {
  sensibleId: string
  api: Api
  address: Address
  type: string
}) {
  const factory = type === 'nft' ? NftGenesisFactory : TokenGenesisFactory
  const proto = type === 'nft' ? nftProto : ftProto
  let genesisContract = factory.createContract()

  let { genesisTxId, genesisOutputIndex } = parseSensibleId(sensibleId)
  let genesisUtxo = await getLatestGenesisUtxo(
    proto,
    genesisContract.getCodeHash(),
    genesisTxId,
    genesisOutputIndex,
    api,
    address,
    type
  )

  if (!genesisUtxo) {
    throw new CodeError(ErrCode.EC_FIXED_TOKEN_SUPPLY, 'token supply is fixed')
  }
  let txHex = await api.getRawTxData(genesisUtxo.txId)
  const tx = new Transaction(txHex)
  let preTxId = tx.inputs[0].prevTxId.toString('hex')
  let preOutputIndex = tx.inputs[0].outputIndex
  let preTxHex = await api.getRawTxData(preTxId)
  genesisUtxo.satotxInfo = {
    txId: genesisUtxo.txId,
    outputIndex: genesisUtxo.outputIndex,
    txHex,
    preTxId,
    preOutputIndex,
    preTxHex,
  }

  let output = tx.outputs[genesisUtxo.outputIndex]
  genesisUtxo.satoshis = output.satoshis
  genesisUtxo.lockingScript = output.script
  genesisContract.setFormatedDataPartFromLockingScript(genesisUtxo.lockingScript)

  return {
    genesisContract,
    genesisTxId,
    genesisOutputIndex,
    genesisUtxo,
  }
}

async function getLatestGenesisUtxo(
  proto: any,
  codehash: string,
  genesisTxId: string,
  genesisOutputIndex: number,
  api: Api,
  address: Address,
  type: string
): Promise<any> {
  // 使用创世txid从接口获取该创世tx内容
  let unspent: any
  let latestGenesisTxHex = await api.getRawTxData(genesisTxId)
  let latestGenesisTx = new Transaction(latestGenesisTxHex)

  // 重新构建该创世脚本
  let scriptBuffer = latestGenesisTx.outputs[genesisOutputIndex].script.toBuffer()
  let originGenesis = proto.getQueryGenesis(scriptBuffer)

  // 找回utxo
  let genesisUtxos
  if (type === 'nft') {
    genesisUtxos = await api.getNonFungibleTokenUnspents(
      codehash,
      originGenesis,
      address.toString()
    )
  } else {
    genesisUtxos = await api.getFungibleTokenUnspents(codehash, originGenesis, address.toString())
  }

  unspent = genesisUtxos.find((v) => v.txId == genesisTxId && v.outputIndex == genesisOutputIndex)

  if (!unspent) {
    let _dataPartObj = proto.parseDataPart(scriptBuffer)
    _dataPartObj.sensibleID = {
      txid: genesisTxId,
      index: genesisOutputIndex,
    }
    let newScriptBuf = proto.updateScript(scriptBuffer, _dataPartObj)

    let issueGenesis = proto.getQueryGenesis(newScriptBuf)
    let issueUtxos
    if (type === 'nft') {
      issueUtxos = await api.getNonFungibleTokenUnspents(codehash, issueGenesis, address.toString())
    } else {
      issueUtxos = await api.getFungibleTokenUnspents(codehash, issueGenesis, address.toString())
    }
    if (issueUtxos.length > 0) {
      unspent = issueUtxos[0]
    }
  }

  if (unspent) {
    return {
      txId: unspent.txId,
      outputIndex: unspent.outputIndex,
    }
  }
}

export function parseSensibleId(sensibleId: string) {
  let sensibleIDBuf = Buffer.from(sensibleId, 'hex')
  let genesisTxId = sensibleIDBuf.slice(0, 32).reverse().toString('hex')
  let genesisOutputIndex = sensibleIDBuf.readUIntLE(32, 4)

  return {
    genesisTxId,
    genesisOutputIndex,
  }
}
