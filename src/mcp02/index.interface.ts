import { API_NET, API_TARGET, mvc } from '..'

export interface Mcp02 {
  genesis: (options: GenesisOptions) => any
  issue: () => any
  mint: () => any
  transfer: () => any
  merge: () => any

  // totalSupply()
  // balanceOf()
  // approve()
  // allowance()
  // transferFrom()
  // batchTransfer()
  // burn()
}
