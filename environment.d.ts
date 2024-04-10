declare global {
  namespace NodeJS {
    interface ProcessEnv {
      WIF: string
      PK_BG: string
      ADDRESS2: string
    }
  }
}

export {}
