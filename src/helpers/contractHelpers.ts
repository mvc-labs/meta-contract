import {NftFactory} from '../mcp01/contract-factory/nft'
import {NftGenesis, NftGenesisFactory} from '../mcp01/contract-factory/nftGenesis'
import {Address, PrivateKey, Transaction} from '../mvc'
import {BN} from '..'
import {Bytes} from '../scryptlib'
import * as nftProto from '../mcp01/contract-proto/nft.proto'
import * as ftProto from '../mcp02/contract-proto/token.proto'
import {PROTO_TYPE} from '../common/protoheader'
import {TokenFactory} from '../mcp02/contract-factory/token'
import * as TokenUtil from '../common/tokenUtil'

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
