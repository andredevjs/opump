/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;

  readonly VITE_OPNET_RPC_URL: string;
  readonly VITE_OPNET_NETWORK: 'mainnet' | 'testnet' | 'regtest';
  readonly VITE_FACTORY_ADDRESS: string;
  readonly VITE_MOTOSWAP_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
