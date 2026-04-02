import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Hardhat Configuration for Philippine Government Federated Blockchain
 *
 * PORTABILITY NOTES:
 * - Configured for QBFT consensus (permissioned network)
 * - Gas settings optimized for private/permissioned networks
 * - Network configs use environment variables for easy migration
 * - Compatible with Hyperledger Fabric EVM, Enterprise Besu, private Ethereum
 *
 * COMPLIANCE:
 * - No hardcoded private keys - use environment variables
 * - Chain ID configurable for different environments
 */

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      metadata: {
        bytecodeHash: "ipfs",
        useLiteralContent: true,
      },
    },
  },

  networks: {
    /**
     * Local Hardhat Network
     * Used for POC development and testing
     */
    hardhat: {
      chainId: 1337,
      gas: 12000000,
      gasPrice: 80000000000,
      blockGasLimit: 12000000,
      allowUnlimitedContractSize: true,
      mining: {
        auto: true,
        interval: 1000,
      },
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },

    /**
     * Local Besu QBFT Network (Docker Compose)
     * Default network for POC deployment
     * Ports: 8545 (RPC), 30303 (P2P)
     */
    besuLocal: {
      url: process.env.BESU_RPC_URL || "http://localhost:8545",
      chainId: parseInt(process.env.CHAIN_ID || "1981"),
      gas: 12000000,
      gasPrice: 1000000000,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      timeout: 60000,
    },

    /**
     * Production Besu Network
     * For production deployment with HA setup
     */
    besuProduction: {
      url: process.env.PRODUCTION_RPC_URL || "http://localhost:8545",
      chainId: parseInt(process.env.PRODUCTION_CHAIN_ID || "19810"),
      gas: 12000000,
      gasPrice: parseInt(process.env.GAS_PRICE || "1000000000"),
      accounts: process.env.PRODUCTION_DEPLOYER_PRIVATE_KEY
        ? [process.env.PRODUCTION_DEPLOYER_PRIVATE_KEY]
        : [],
      timeout: 120000,
    },

    /**
     * Hyperledger Fabric EVM Network
     * Template for migration to Fabric EVM chaincode
     */
    fabricEVM: {
      url: process.env.FABRIC_EVM_RPC_URL || "http://localhost:8545",
      chainId: parseInt(process.env.FABRIC_CHAIN_ID || "19820"),
      gas: 12000000,
      gasPrice: 0,
      accounts: process.env.FABRIC_DEPLOYER_PRIVATE_KEY
        ? [process.env.FABRIC_DEPLOYER_PRIVATE_KEY]
        : [],
    },

    /**
     * Enterprise Besu Network
     * Template for migration to Enterprise Besu with Tessera/Orion
     */
    enterpriseBesu: {
      url: process.env.ENTERPRISE_BESU_RPC_URL || "http://localhost:8545",
      chainId: parseInt(process.env.ENTERPRISE_CHAIN_ID || "19830"),
      gas: 12000000,
      gasPrice: parseInt(process.env.GAS_PRICE || "1000000000"),
      accounts: process.env.ENTERPRISE_DEPLOYER_PRIVATE_KEY
        ? [process.env.ENTERPRISE_DEPLOYER_PRIVATE_KEY]
        : [],
    },
  },

  paths: {
    sources: "./contracts/src",
    tests: "./tests",
    cache: "./contracts/cache",
    artifacts: "./contracts/artifacts",
  },

  mocha: {
    timeout: 100000,
    reporter: "spec",
  },

  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
    customChains: [
      {
        network: "besuLocal",
        chainId: parseInt(process.env.CHAIN_ID || "1981"),
        urls: {
          apiURL: process.env.BLOCK_EXPLORER_API_URL || "",
          browserURL: process.env.BLOCK_EXPLORER_URL || "",
        },
      },
    ],
  },

  sourcify: {
    enabled: false,
  },

  typechain: {
    outDir: "./src/types",
    target: "ethers-v6",
    alwaysGenerateOverloads: false,
    shouldOverWriteExisting: true,
    tsNocheck: false,
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    gasPrice: parseInt(process.env.GAS_PRICE || "1000000000"),
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
};

export default config;
