/**
 * ChainAdapter.ts - Abstract Chain Interface
 * 
 * DESCRIPTION:
 * Abstract interface for blockchain interactions. This adapter pattern enables
 * seamless migration between different blockchain implementations (Besu, Fabric EVM,
 * Enterprise Besu, private Ethereum) without changing application code.
 * 
 * PORTABILITY:
 * - Defines standard interface for all chain operations
 * - Implementation-agnostic - works with any EVM-compatible chain
 * - Easy to implement new adapters for different chains
 * 
 * USAGE:
 * - Extend this class to create chain-specific adapters
 * - Application code should only use the ChainAdapter interface
 * - Inject the appropriate adapter based on deployment environment
 * 
 * COMPLIANCE:
 * - All methods support audit logging requirements
 * - Transaction receipts include data for compliance reporting
 */

import { EventEmitter } from "events";

/**
 * Transaction receipt structure
 */
export interface TransactionReceipt {
    transactionHash: string;
    transactionIndex: number;
    blockHash: string;
    blockNumber: number;
    from: string;
    to: string | null;
    cumulativeGasUsed: number;
    gasUsed: number;
    effectiveGasPrice: number;
    status: number; // 1 = success, 0 = failure
    logs: Log[];
    byzantium: boolean;
}

/**
 * Log event structure
 */
export interface Log {
    address: string;
    topics: string[];
    data: string;
    blockNumber: number;
    transactionHash: string;
    transactionIndex: number;
    blockHash: string;
    logIndex: number;
    removed: boolean;
}

/**
 * Event filter options
 */
export interface EventFilter {
    fromBlock?: number;
    toBlock?: number;
    address?: string;
    topics?: (string | string[] | null)[];
}

/**
 * Network information
 */
export interface NetworkInfo {
    chainId: number;
    networkName: string;
    blockNumber: number;
    gasPrice: number;
    peerCount: number;
    isListening: boolean;
    protocolVersion: string;
}

/**
 * Account information
 */
export interface AccountInfo {
    address: string;
    balance: bigint;
    nonce: number;
    isContract: boolean;
}

/**
 * Call options for read operations
 */
export interface CallOptions {
    from?: string;
    gasLimit?: number;
    gasPrice?: number;
    value?: bigint;
    blockTag?: number | "latest" | "earliest" | "pending";
}

/**
 * Transaction options for write operations
 */
export interface TransactionOptions {
    from: string;
    gasLimit?: number;
    gasPrice?: number;
    maxFeePerGas?: number;
    maxPriorityFeePerGas?: number;
    value?: bigint;
    nonce?: number;
}

/**
 * Decoded event data
 */
export interface DecodedEvent {
    eventName: string;
    args: Record<string, unknown>;
    blockNumber: number;
    transactionHash: string;
    logIndex: number;
}

/**
 * ChainAdapter - Abstract base class for blockchain adapters
 * 
 * PORTABILITY NOTES:
 * - This interface is designed to work with any EVM-compatible chain
 * - Implementations should handle chain-specific details internally
 * - Application code should never depend on implementation-specific methods
 */
export abstract class ChainAdapter extends EventEmitter {
    protected connected: boolean = false;
    protected rpcUrl: string;
    protected chainId: number;
    protected networkName: string;

    constructor(rpcUrl: string, chainId: number, networkName: string) {
        super();
        this.rpcUrl = rpcUrl;
        this.chainId = chainId;
        this.networkName = networkName;
    }

    // ========================================================================
    // CONNECTION MANAGEMENT
    // ========================================================================

    /**
     * Initialize connection to the blockchain
     * Must be called before any other operations
     */
    abstract connect(): Promise<void>;

    /**
     * Close connection to the blockchain
     */
    abstract disconnect(): Promise<void>;

    /**
     * Check if adapter is connected
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Get current RPC URL
     */
    getRpcUrl(): string {
        return this.rpcUrl;
    }

    // ========================================================================
    // NETWORK INFORMATION
    // ========================================================================

    /**
     * Get network information
     */
    abstract getNetworkInfo(): Promise<NetworkInfo>;

    /**
     * Get current block number
     */
    abstract getBlockNumber(): Promise<number>;

    /**
     * Get chain ID
     */
    getChainId(): number {
        return this.chainId;
    }

    /**
     * Get gas price
     */
    abstract getGasPrice(): Promise<number>;

    /**
     * Get peer count (for permissioned networks)
     */
    abstract getPeerCount(): Promise<number>;

    // ========================================================================
    // ACCOUNT OPERATIONS
    // ========================================================================

    /**
     * Get account information
     */
    abstract getAccountInfo(address: string): Promise<AccountInfo>;

    /**
     * Get account balance
     */
    abstract getBalance(address: string): Promise<bigint>;

    /**
     * Get account nonce
     */
    abstract getNonce(address: string): Promise<number>;

    /**
     * Check if address is a contract
     */
    abstract isContract(address: string): Promise<boolean>;

    // ========================================================================
    // CONTRACT INTERACTIONS - READ
    // ========================================================================

    /**
     * Call a contract read function
     * @param contractAddress Contract address
     * @param abi Contract ABI fragment for the function
     * @param functionName Function name
     * @param args Function arguments
     * @param options Call options
     * @returns Decoded return values
     */
    abstract callContract(
        contractAddress: string,
        abi: unknown[],
        functionName: string,
        args: unknown[],
        options?: CallOptions
    ): Promise<unknown>;

    /**
     * Get contract bytecode
     */
    abstract getContractCode(address: string): Promise<string>;

    // ========================================================================
    // CONTRACT INTERACTIONS - WRITE
    // ========================================================================

    /**
     * Send a contract transaction
     * @param contractAddress Contract address
     * @param abi Contract ABI fragment for the function
     * @param functionName Function name
     * @param args Function arguments
     * @param options Transaction options
     * @returns Transaction receipt
     */
    abstract sendTransaction(
        contractAddress: string,
        abi: unknown[],
        functionName: string,
        args: unknown[],
        options: TransactionOptions
    ): Promise<TransactionReceipt>;

    /**
     * Send raw transaction
     * @param signedTx Signed transaction hex
     * @returns Transaction receipt
     */
    abstract sendRawTransaction(signedTx: string): Promise<TransactionReceipt>;

    /**
     * Estimate gas for a transaction
     */
    abstract estimateGas(
        contractAddress: string,
        abi: unknown[],
        functionName: string,
        args: unknown[],
        from: string
    ): Promise<number>;

    // ========================================================================
    // EVENT SUBSCRIPTIONS
    // ========================================================================

    /**
     * Get past events from a contract
     * @param contractAddress Contract address
     * @param abi Contract ABI
     * @param eventName Event name
     * @param filter Event filter
     * @returns Array of decoded events
     */
    abstract getPastEvents(
        contractAddress: string,
        abi: unknown[],
        eventName: string,
        filter: EventFilter
    ): Promise<DecodedEvent[]>;

    /**
     * Subscribe to contract events
     * @param contractAddress Contract address
     * @param abi Contract ABI
     * @param eventName Event name (or '*' for all events)
     * @param callback Event callback
     * @returns Subscription ID for unsubscribing
     */
    abstract subscribeToEvents(
        contractAddress: string,
        abi: unknown[],
        eventName: string,
        callback: (event: DecodedEvent) => void
    ): Promise<string>;

    /**
     * Unsubscribe from events
     * @param subscriptionId Subscription ID
     */
    abstract unsubscribeFromEvents(subscriptionId: string): Promise<void>;

    // ========================================================================
    // TRANSACTION UTILITIES
    // ========================================================================

    /**
     * Get transaction by hash
     */
    abstract getTransaction(txHash: string): Promise<unknown>;

    /**
     * Get transaction receipt
     */
    abstract getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null>;

    /**
     * Wait for transaction confirmation
     * @param txHash Transaction hash
     * @param confirmations Number of confirmations to wait for
     * @returns Transaction receipt
     */
    abstract waitForTransaction(txHash: string, confirmations?: number): Promise<TransactionReceipt>;

    /**
     * Get transaction count for an address
     */
    abstract getTransactionCount(address: string): Promise<number>;

    // ========================================================================
    // BLOCK OPERATIONS
    // ========================================================================

    /**
     * Get block by number
     */
    abstract getBlock(blockNumber: number): Promise<unknown>;

    /**
     * Get block by hash
     */
    abstract getBlockByHash(blockHash: string): Promise<unknown>;

    /**
     * Get transaction count in a block
     */
    abstract getBlockTransactionCount(blockNumber: number): Promise<number>;

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Convert address to checksum format
     */
    abstract toChecksumAddress(address: string): string;

    /**
     * Check if address is valid
     */
    abstract isValidAddress(address: string): boolean;

    /**
     * Hash data using Keccak-256
     */
    abstract keccak256(data: string | Buffer): string;

    /**
     * Encode function parameters
     */
    abstract encodeFunctionData(abi: unknown, args: unknown[]): string;

    /**
     * Decode function return values
     */
    abstract decodeFunctionReturn(abi: unknown, data: string): unknown;

    /**
     * Sign a message with private key
     * @param message Message to sign
     * @param privateKey Private key (use with caution)
     * @returns Signature
     */
    abstract signMessage(message: string, privateKey: string): Promise<string>;

    /**
     * Recover signer address from signature
     */
    abstract recoverSigner(message: string, signature: string): string;

    /**
     * Get current timestamp
     */
    async getCurrentTimestamp(): Promise<number> {
        const block = await this.getBlock(await this.getBlockNumber());
        return (block as { timestamp?: number }).timestamp ?? Math.floor(Date.now() / 1000);
    }
}
