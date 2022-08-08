export {}

declare global {
  type Utxo = {
    txId: string
    outputIndex: number
    satoshis: number
    address?: string | mvc.Address
  }

  type Receiver = {
    amount: number
    address: any
  }

  type GenesisOptions = {
    tokenName: string
    tokenSymbol: string
    decimalNum: number
    genesisWif: string
  }

  type ParamUtxo = {
    txId: string
    outputIndex: number
    satoshis: number
    wif?: string
    address?: string | mvc.Address
  }
}
