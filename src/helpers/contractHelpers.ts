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
import { TokenGenesisFactory } from '../mcp02/contract-factory/tokenGenesis'

type Purse = {
  privateKey?: PrivateKey
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
  version = 2,
  genesisHash,
  genesisContract,
  metaTxId,
  metaOutputIndex,
  sensibleID,
  receiverAddress,
  unlockContractCodeHashArray,
}: {
  version?: number
  genesisHash: string
  genesisContract: NftGenesis
  metaTxId: string
  metaOutputIndex: number
  sensibleID: any
  receiverAddress: Address
  unlockContractCodeHashArray: Bytes[]
}) {
  const nftAddress = receiverAddress.hashBuffer.toString('hex')
  const mintContract = NftFactory.createContract(unlockContractCodeHashArray, version)

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
  version = 2,
  genesisTx,
  purse,
  transferCheckCodeHashArray,
  unlockContractCodeHashArray,
  type,
}: {
  version?: number
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

  let artifactContract: any
  let genesisHash: string

  if (type === 'nft') {
    artifactContract = NftFactory.createContract(unlockContractCodeHashArray, version)
    const genesisContract = NftGenesisFactory.createContract()
    genesisContract.setFormatedDataPartFromLockingScript(genesisLockingScript)
    genesisContract.setFormatedDataPart({
      sensibleID: {
        txid: genesisTxId,
        index: genesisOutputIndex,
      },
      tokenIndex: BN.Zero,
    })
    genesisHash = genesisContract.getScriptHash()

    artifactContract.setFormatedDataPart({
      sensibleID: {
        txid: genesisTxId,
        index: genesisOutputIndex,
      },
      genesisHash,
      tokenAddress: purse.address.hashBuffer.toString('hex'),
    })
  } else {
    artifactContract = TokenFactory.createContract(
      transferCheckCodeHashArray,
      unlockContractCodeHashArray,
      version,
    )
    let newGenesisContract = TokenGenesisFactory.createContract()
    newGenesisContract.setFormatedDataPartFromLockingScript(genesisLockingScript)
    newGenesisContract.setFormatedDataPart({
      sensibleID: {
        txid: genesisTxId,
        index: genesisOutputIndex,
      },
    })
    genesisHash = newGenesisContract.getScriptHash()

    artifactContract.setFormatedDataPart({
      sensibleID: {
        txid: genesisTxId,
        index: genesisOutputIndex,
      },
      genesisHash,
      tokenAmount: new BN(0),
      tokenAddress: purse.address.hashBuffer.toString('hex'),
    })
  }

  let scriptBuf = artifactContract.lockingScript.toBuffer()

  genesis = proto.getQueryGenesis(scriptBuf)
  codehash = artifactContract.getCodeHash()
  sensibleId = TokenUtil.getOutpointBuf(genesisTxId, genesisOutputIndex).toString('hex')

  return { codehash, genesis, sensibleId }
}
