export {}

declare global {
  type Utxo = {
    txId: string
    outputIndex: number
    satoshis: number
    address: string
  }

  type Receiver = {
    amount: number
    address: any
  }
}
