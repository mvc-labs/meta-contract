import { NftFactory } from '../mcp01/contract-factory/nft'
import { NftGenesis, NftGenesisFactory } from '../mcp01/contract-factory/nftGenesis'
import { Address, PrivateKey, Transaction } from '../mvc'
import { BN } from '..'
import { Bytes, mvc } from '../scryptlib'
import * as nftProto from '../mcp01/contract-proto/nft.proto'
import * as ftProto from '../mcp02/contract-proto/token.proto'
import { getFlag, PROTO_TYPE } from '../common/protoheader'
import { TokenFactory } from '../mcp02/contract-factory/token'
import * as TokenUtil from '../common/tokenUtil'
import { hash160 } from 'mvc-scryptlib/dist'

type Purse = {
  privateKey: PrivateKey
  address: Address
}

export function createNftGenesisContract({
  totalSupply,
  address,
}: {
  totalSupply: string
  address: Address
}) {
  const totalSupplyInBn = new BN(totalSupply.toString())
  const nftAddress = address.hashBuffer.toString('hex')

  const genesisContract = NftGenesisFactory.createContract()
  genesisContract.setFormatedDataPart({
    totalSupply: totalSupplyInBn,
    nftAddress,
  })

  return genesisContract
}

export function createNftMintContract({
  genesisHash,
  genesisContract,
  metaTxId,
  metaOutputIndex,
  sensibleID,
  receiverAddress,
  unlockContractCodeHashArray,
}: {
  genesisHash: string
  genesisContract: NftGenesis
  metaTxId: string
  metaOutputIndex: number
  sensibleID: any
  receiverAddress: Address
  unlockContractCodeHashArray: Bytes[]
}) {
  const nftAddress = receiverAddress.hashBuffer.toString('hex')
  const mintContract = NftFactory.createContract(unlockContractCodeHashArray)

  mintContract.setFormatedDataPart({
    metaidOutpoint: {
      txid: metaTxId,
      index: metaOutputIndex,
    },
    nftAddress,
    totalSupply: genesisContract.getFormatedDataPart().totalSupply,
    tokenIndex: genesisContract.getFormatedDataPart().tokenIndex,
    genesisHash,
    sensibleID,
  })

  return mintContract
}

export function rebuildNftLockingScript(nftUtxo: any, receiverAddress: Address) {
  const nftScriptBuf = nftUtxo.lockingScript.toBuffer()

  let dataPart = nftProto.parseDataPart(nftScriptBuf)
  dataPart.protoType = PROTO_TYPE.NFT
  dataPart.protoVersion = nftProto.PROTO_VERSION
  dataPart.nftAddress = receiverAddress.hashBuffer.toString('hex')

  return nftProto.updateScript(nftScriptBuf, dataPart)
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
  const genesisLockingScript = genesisTx.outputs[genesisOutputIndex].script
  let genesisLockingScriptBuf = genesisLockingScript.toBuffer()

  // const dataPartObj: any = proto.parseDataPart(genesisLockingScriptBuf)
  // console.log('dataPartObj', dataPartObj)
  // dataPartObj.sensibleID = {
  //   txid: genesisTxId,
  //   index: genesisOutputIndex,
  // }
  // dataPartObj.tokenIndex = BN.Zero
  // console.log(genesisLockingScriptBuf == proto.updateScript(genesisLockingScriptBuf, dataPartObj))
  // genesisLockingScriptBuf = proto.updateScript(genesisLockingScriptBuf, dataPartObj)
  // console.log('dataPartObj', proto.parseDataPart(genesisLockingScriptBuf))

  const genesisContract = NftGenesisFactory.createContract()
  genesisContract.setFormatedDataPartFromLockingScript(genesisLockingScript)
  genesisContract.setFormatedDataPart({
    sensibleID: {
      txid: genesisTxId,
      index: genesisOutputIndex,
    },
    tokenIndex: BN.Zero,
  })
  let genesisHash = genesisContract.getScriptHash()

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
    // genesisHash: TokenUtil.getScriptHashBuf(genesisLockingScriptBuf).toString('hex'),
    genesisHash,
    tokenAddress: purse.address.hashBuffer.toString('hex'),
  })

  let scriptBuf = artifactContract.lockingScript.toBuffer()

  // const sensibleIdPart = scriptBuf.slice(scriptBuf.length - (36 + 25), scriptBuf.length - 25)
  // const genesisHashPart = scriptBuf.slice(
  //   scriptBuf.length - (36 + 20 + 25),
  //   scriptBuf.length - (25 + 36)
  // )
  // const genesisPart = scriptBuf.slice(scriptBuf.length - (36 + 20 + 25), scriptBuf.length - 25)
  // const genesisH = mvc.crypto.Hash.sha256ripemd160(genesisPart)
  // const g = hash160(genesisPart)
  // console.log({
  //   sensibleIdPart: sensibleIdPart.toString('hex'),
  //   genesisHashPart: genesisHashPart.toString('hex'),
  //   genesishashPart2: nftProto.getGenesisHash(scriptBuf),
  //   genesisHashPart3: TokenUtil.getScriptHashBuf(genesisLockingScriptBuf).toString('hex'),
  //   genesisHashPart4: genesisHash4,
  //   genesisPart: genesisPart.toString('hex'),
  //   genesisPartLength: genesisPart.length,
  //   genesisH: genesisH.toString('hex'),
  //   genesisH2: g,
  // })
  // const oldScript = genesisLockingScriptBuf.toString('hex')
  // const newScript = genesisContract.lockingScript.toBuffer().toString('hex')
  // for (let i = 0; i < oldScript.length; i++) {
  //   if (oldScript[i] !== newScript[i]) {
  //     console.log('diff', i, oldScript[i], newScript[i])
  //   }
  // }
  // console.log({
  //   oldScript: genesisLockingScriptBuf.toString('hex').length,
  //   newScript: genesisContract.lockingScript.toBuffer().toString('hex').length,
  //   diff:
  //     genesisLockingScriptBuf.toString('hex') ===
  //     genesisContract.lockingScript.toBuffer().toString('hex'),
  // })

  genesis = proto.getQueryGenesis(scriptBuf)
  codehash = artifactContract.getCodeHash()
  sensibleId = TokenUtil.getOutpointBuf(genesisTxId, genesisOutputIndex).toString('hex')

  return { codehash, genesis, sensibleId }
}
