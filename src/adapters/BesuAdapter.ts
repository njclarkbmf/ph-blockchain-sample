/**
 * BesuAdapter.ts - Hyperledger Besu Implementation
 * 
 * DESCRIPTION:
 * Concrete implementation of ChainAdapter for Hyperledger Besu networks.
 * Supports QBFT consensus, permissioned networks, and standard EVM operations.
 * 
 * FEATURES:
 * - Full EVM compatibility via ethers.js v6
 * - QBFT consensus support
 * - Permissioned network operations
 * - Metrics and monitoring hooks
 * - Transaction retry logic for permissioned networks
 * 
 * COMPLIANCE:
 * - RA 10173: No PII handling in adapter
 * - DICT Guidelines: Supports audit logging via events
 * 
 * PORTABILITY:
 * - Uses standard ethers.js - no Besu-specific RPC calls
 * - Can be replaced with ProductionAdapter for enterprise deployment
 * - Compatible with Fabric EVM, Enterprise Besu, private Ethereum
 */

import {
    ethers,
    Contract,
    Provider,
    JsonRpcProvider,
    WebSocketProvider,
    Signer,
    Wallet,
    TransactionResponse,
    TransactionReceipt,
    Block,
    Log,
    EventLog,
} from "ethers";
import {
    ChainAdapter,
    NetworkInfo,
    AccountInfo,
    EventFilter,
    CallOptions,
    TransactionOptions,
    DecodedEvent,
} from "./ChainAdapter";

/**
 * Besu-specific configuration options
 */
export interface BesuAdapterConfig {
    rpcUrl: string;
    wsUrl?: string; // WebSocket URL for subscriptions
    chainId: number;
    networkName: string;
    privateKey?: string; // For transaction signing
    gasLimit?: number; // Default gas limit
    gasPrice?: number; // Default gas price (for permissioned networks)
    maxRetries?: number; // Transaction retry count
    retryDelay?: number; // Delay between retries (ms)
    timeout?: number; // RPC timeout (ms)
}

/**
 * BesuAdapter - Hyperledger Besu implementation
 */
export class BesuAdapter extends ChainAdapter {
    private provider: JsonRpcProvider | WebSocketProvider;
    private wsProvider: WebSocketProvider | null = null;
    private signer: Signer | null = null;
    private config: BesuAdapterConfig;
    private subscriptions: Map<string, () => void> = new Map();

    constructor(config: BesuAdapterConfig) {
        super(config.rpcUrl, config.chainId, config.networkName);
        this.config = {
            maxRetries: 3,
            retryDelay: 1000,
            timeout: 60000,
            ...config,
        };

        // Initialize provider
        this.provider = new JsonRpcProvider(this.config.rpcUrl, this.config.chainId, {
            staticNetwork: true,
        });
    }

    // ========================================================================
    // CONNECTION MANAGEMENT
    // ========================================================================

    async connect(): Promise<void> {
        if (this.connected) {
            return;
        }

        try {
            // Verify connection
            const network = await this.provider.getNetwork();
            
            if (Number(network.chainId) !== this.config.chainId) {
                throw new Error(
                    `Chain ID mismatch: expected ${this.config.chainId}, got ${network.chainId}`
                );
            }

            // Initialize signer if private key provided
            if (this.config.privateKey) {
                this.signer = new Wallet(this.config.privateKey, this.provider);
            }

            // Initialize WebSocket provider for subscriptions if URL provided
            if (this.config.wsUrl) {
                this.wsProvider = new WebSocketProvider(
                    this.config.wsUrl,
                    this.config.chainId
                );
            }

            this.connected = true;
            this.emit("connected", { network: this.config.networkName });
        } catch (error) {
            this.connected = false;
            throw new Error(`Failed to connect to Besu: ${(error as Error).message}`);
        }
    }

    async disconnect(): Promise<void> {
        // Unsubscribe from all events
        for (const [id, unsubscribe] of this.subscriptions) {
            try {
                unsubscribe();
            } catch (error) {
                console.warn(`Failed to unsubscribe ${id}:`, error);
            }
        }
        this.subscriptions.clear();

        // Destroy providers
        await this.provider.destroy();
        if (this.wsProvider) {
            await this.wsProvider.destroy();
        }

        this.connected = false;
        this.signer = null;
        this.emit("disconnected");
    }

    // ========================================================================
    // NETWORK INFORMATION
    // ========================================================================

    async getNetworkInfo(): Promise<NetworkInfo> {
        const network = await this.provider.getNetwork();
        const blockNumber = await this.getBlockNumber();
        const gasPrice = await this.getGasPrice();
        
        // Get peer count (Besu-specific, but falls back gracefully)
        let peerCount = 0;
        try {
            const peerCountResult = await this.provider.send("net_peerCount", []);
            peerCount = Number(peerCountResult);
        } catch {
            peerCount = 0;
        }

        return {
            chainId: Number(network.chainId),
            networkName: this.config.networkName,
            blockNumber,
            gasPrice: Number(gasPrice),
            peerCount,
            isListening: this.connected,
            protocolVersion: "eth/66", // Standard Ethereum protocol version
        };
    }

    async getBlockNumber(): Promise<number> {
        return Number(await this.provider.getBlockNumber());
    }

    async getGasPrice(): Promise<number> {
        const gasPrice = await this.provider.getGasPrice();
        return Number(gasPrice);
    }

    async getPeerCount(): Promise<number> {
        try {
            const peerCount = await this.provider.send("net_peerCount", []);
            return Number(peerCount);
        } catch {
            return 0;
        }
    }

    // ========================================================================
    // ACCOUNT OPERATIONS
    // ========================================================================

    async getAccountInfo(address: string): Promise<AccountInfo> {
        const [balance, nonce, code] = await Promise.all([
            this.getBalance(address),
            this.getNonce(address),
            this.provider.getCode(address),
        ]);

        return {
            address: ethers.getAddress(address),
            balance,
            nonce,
            isContract: code !== "0x",
        };
    }

    async getBalance(address: string): Promise<bigint> {
        return await this.provider.getBalance(ethers.getAddress(address));
    }

    async getNonce(address: string): Promise<number> {
        return await this.provider.getTransactionCount(ethers.getAddress(address));
    }

    async isContract(address: string): Promise<boolean> {
        const code = await this.provider.getCode(ethers.getAddress(address));
        return code !== "0x";
    }

    // ========================================================================
    // CONTRACT INTERACTIONS - READ
    // ========================================================================

    async callContract(
        contractAddress: string,
        abi: unknown[],
        functionName: string,
        args: unknown[],
        options?: CallOptions
    ): Promise<unknown> {
        const contract = new Contract(contractAddress, abi, this.provider);
        
        if (typeof contract[functionName] !== "function") {
            throw new Error(`Function ${functionName} not found on contract`);
        }

        const callOptions = options ? {
            from: options.from,
            gasLimit: options.gasLimit,
            gasPrice: options.gasPrice,
            value: options.value,
            blockTag: options.blockTag ?? "latest",
        } : { blockTag: "latest" };

        return await contract[functionName].staticCall(...args, callOptions);
    }

    async getContractCode(address: string): Promise<string> {
        return await this.provider.getCode(ethers.getAddress(address));
    }

    // ========================================================================
    // CONTRACT INTERACTIONS - WRITE
    // ========================================================================

    async sendTransaction(
        contractAddress: string,
        abi: unknown[],
        functionName: string,
        args: unknown[],
        options: TransactionOptions
    ): Promise<TransactionReceipt> {
        if (!this.signer) {
            throw new Error("No signer configured. Provide privateKey in config.");
        }

        const contract = new Contract(contractAddress, abi, this.signer);
        
        if (typeof contract[functionName] !== "function") {
            throw new Error(`Function ${functionName} not found on contract`);
        }

        // Build transaction with retry logic
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= (this.config.maxRetries ?? 3); attempt++) {
            try {
                // Get current nonce if not provided
                const nonce = options.nonce ?? await this.getNonce(options.from);
                
                // Build transaction options
                const txOptions: Record<string, unknown> = {
                    nonce,
                    gasLimit: options.gasLimit ?? this.config.gasLimit ?? 300000,
                };

                // For permissioned networks, use gasPrice instead of EIP-1559
                if (this.config.gasPrice || options.gasPrice) {
                    txOptions.gasPrice = options.gasPrice ?? this.config.gasPrice;
                } else {
                    txOptions.maxFeePerGas = options.maxFeePerGas;
                    txOptions.maxPriorityFeePerGas = options.maxPriorityFeePerGas;
                }

                if (options.value) {
                    txOptions.value = options.value;
                }

                // Send transaction
                const txResponse: TransactionResponse = await contract[functionName](
                    ...args,
                    txOptions
                );

                // Wait for receipt
                return await this.waitForTransaction(txResponse.hash);
            } catch (error) {
                lastError = error as Error;
                
                // Don't retry on certain errors
                if (this.isNonRetryableError(lastError)) {
                    break;
                }

                // Wait before retry
                if (attempt < (this.config.maxRetries ?? 3)) {
                    await this.delay((this.config.retryDelay ?? 1000) * attempt);
                }
            }
        }

        throw new Error(
            `Transaction failed after ${this.config.maxRetries} attempts: ${lastError?.message}`
        );
    }

    async sendRawTransaction(signedTx: string): Promise<TransactionReceipt> {
        const txResponse = await this.provider.broadcastTransaction(signedTx);
        return await this.waitForTransaction(txResponse.hash);
    }

    async estimateGas(
        contractAddress: string,
        abi: unknown[],
        functionName: string,
        args: unknown[],
        from: string
    ): Promise<number> {
        const contract = new Contract(contractAddress, abi, this.provider);
        
        if (typeof contract[functionName] !== "function") {
            throw new Error(`Function ${functionName} not found on contract`);
        }

        const gasLimit = await contract[functionName].estimateGas(...args, { from });
        return Number(gasLimit);
    }

    // ========================================================================
    // EVENT SUBSCRIPTIONS
    // ========================================================================

    async getPastEvents(
        contractAddress: string,
        abi: unknown[],
        eventName: string,
        filter: EventFilter
    ): Promise<DecodedEvent[]> {
        const contract = new Contract(contractAddress, abi, this.provider);
        
        const fromBlock = filter.fromBlock ?? 0;
        const toBlock = filter.toBlock ?? "latest";

        // Get filter options
        const filterOptions: Record<string, unknown> = {
            fromBlock,
            toBlock,
        };

        if (filter.address) {
            filterOptions.address = filter.address;
        }

        if (filter.topics) {
            filterOptions.topics = filter.topics;
        }

        // Query logs
        const logs = await this.provider.getLogs({
            ...filterOptions,
            address: contractAddress,
        } as {
            fromBlock: number | "latest";
            toBlock: number | "latest";
            address?: string;
            topics?: (string | string[] | null)[];
        });

        // Decode events
        const events: DecodedEvent[] = [];
        const iface = contract.interface;

        for (const log of logs) {
            try {
                const parsedLog = iface.parseLog(log as Log);
                if (parsedLog && (eventName === "*" || parsedLog.name === eventName)) {
                    events.push({
                        eventName: parsedLog.name,
                        args: this.parseEventArgs(parsedLog.args),
                        blockNumber: Number(log.blockNumber),
                        transactionHash: log.transactionHash,
                        logIndex: Number(log.index),
                    });
                }
            } catch {
                // Skip unparseable logs
            }
        }

        return events;
    }

    async subscribeToEvents(
        contractAddress: string,
        abi: unknown[],
        eventName: string,
        callback: (event: DecodedEvent) => void
    ): Promise<string> {
        if (!this.wsProvider) {
            throw new Error("WebSocket provider not configured. Provide wsUrl in config.");
        }

        const contract = new Contract(contractAddress, abi, this.wsProvider);
        const subscriptionId = `${contractAddress}:${eventName}:${Date.now()}`;

        const filter = eventName === "*" ? "*" : eventName;
        
        const listener = (...args: unknown[]) => {
            const event = args[args.length - 1] as EventLog;
            try {
                const parsed = contract.interface.parseLog({
                    topics: event.topics,
                    data: event.data,
                } as Log);

                if (parsed) {
                    callback({
                        eventName: parsed.name,
                        args: this.parseEventArgs(parsed.args),
                        blockNumber: Number(event.blockNumber),
                        transactionHash: event.transactionHash,
                        logIndex: Number(event.index),
                    });
                }
            } catch (error) {
                console.warn("Failed to parse event:", error);
            }
        };

        await contract.on(filter, listener);

        // Store unsubscribe function
        this.subscriptions.set(subscriptionId, () => {
            contract.off(filter, listener);
        });

        return subscriptionId;
    }

    async unsubscribeFromEvents(subscriptionId: string): Promise<void> {
        const unsubscribe = this.subscriptions.get(subscriptionId);
        if (unsubscribe) {
            unsubscribe();
            this.subscriptions.delete(subscriptionId);
        }
    }

    // ========================================================================
    // TRANSACTION UTILITIES
    // ========================================================================

    async getTransaction(txHash: string): Promise<unknown> {
        const tx = await this.provider.getTransaction(txHash);
        if (!tx) {
            throw new Error(`Transaction not found: ${txHash}`);
        }
        return this.serializeTransaction(tx);
    }

    async getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null> {
        return await this.provider.getTransactionReceipt(txHash);
    }

    async waitForTransaction(
        txHash: string,
        confirmations: number = 1
    ): Promise<TransactionReceipt> {
        const receipt = await this.provider.waitForTransaction(txHash, confirmations);
        
        if (!receipt) {
            throw new Error(`Transaction receipt not found: ${txHash}`);
        }

        if (receipt.status === 0) {
            throw new Error(`Transaction reverted: ${txHash}`);
        }

        return receipt;
    }

    async getTransactionCount(address: string): Promise<number> {
        return this.getNonce(address);
    }

    // ========================================================================
    // BLOCK OPERATIONS
    // ========================================================================

    async getBlock(blockNumber: number): Promise<unknown> {
        const block = await this.provider.getBlock(blockNumber);
        if (!block) {
            throw new Error(`Block not found: ${blockNumber}`);
        }
        return this.serializeBlock(block);
    }

    async getBlockByHash(blockHash: string): Promise<unknown> {
        const block = await this.provider.getBlock(blockHash);
        if (!block) {
            throw new Error(`Block not found: ${blockHash}`);
        }
        return this.serializeBlock(block);
    }

    async getBlockTransactionCount(blockNumber: number): Promise<number> {
        const count = await this.provider.getBlockTransactionCount(blockNumber);
        return Number(count);
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    toChecksumAddress(address: string): string {
        return ethers.getAddress(address);
    }

    isValidAddress(address: string): boolean {
        return ethers.isAddress(address);
    }

    keccak256(data: string | Buffer): string {
        return ethers.keccak256(typeof data === "string" ? ethers.toUtf8Bytes(data) : data);
    }

    encodeFunctionData(abi: unknown, args: unknown[]): string {
        const iface = new ethers.Interface([abi]);
        const funcName = (abi as { name: string }).name;
        return iface.encodeFunctionData(funcName, args);
    }

    decodeFunctionReturn(abi: unknown, data: string): unknown {
        const iface = new ethers.Interface([abi]);
        const funcName = (abi as { name: string }).name;
        const result = iface.decodeFunctionResult(funcName, data);
        return result.length === 1 ? result[0] : result;
    }

    async signMessage(message: string, privateKey: string): Promise<string> {
        const wallet = new Wallet(privateKey);
        return await wallet.signMessage(message);
    }

    recoverSigner(message: string, signature: string): string {
        return ethers.verifyMessage(message, signature);
    }

    // ========================================================================
    // PRIVATE HELPER METHODS
    // ========================================================================

    private serializeTransaction(tx: TransactionResponse): Record<string, unknown> {
        return {
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value: tx.value.toString(),
            gasLimit: tx.gasLimit.toString(),
            gasPrice: tx.gasPrice?.toString() ?? null,
            maxFeePerGas: tx.maxFeePerGas?.toString() ?? null,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString() ?? null,
            nonce: tx.nonce,
            data: tx.data,
            chainId: tx.chainId,
            blockNumber: tx.blockNumber,
            blockHash: tx.blockHash,
            index: tx.index,
        };
    }

    private serializeBlock(block: Block): Record<string, unknown> {
        return {
            number: block.number,
            hash: block.hash,
            parentHash: block.parentHash,
            timestamp: block.timestamp,
            nonce: block.nonce,
            difficulty: block.difficulty.toString(),
            gasLimit: block.gasLimit.toString(),
            gasUsed: block.gasUsed.toString(),
            miner: block.miner,
            extraData: block.extraData,
            transactions: block.transactions,
            transactionCount: block.transactions.length,
        };
    }

    private parseEventArgs(args: unknown[]): Record<string, unknown> {
        if (!args || typeof args !== "object") {
            return {};
        }

        const result: Record<string, unknown> = {};
        
        // Handle ethers Result object
        if (Array.isArray(args)) {
            for (let i = 0; i < args.length; i++) {
                result[i] = args[i];
            }
        }

        // Handle named properties
        const obj = args as Record<string, unknown>;
        for (const [key, value] of Object.entries(obj)) {
            if (!key.match(/^\d+$/)) {
                result[key] = value;
            }
        }

        return result;
    }

    private isNonRetryableError(error: Error): boolean {
        const nonRetryableMessages = [
            "insufficient funds",
            "nonce too low",
            "gas required exceeds",
            "sender doesn't have enough funds",
            "already known",
            "replacement transaction underpriced",
        ];

        return nonRetryableMessages.some(msg => 
            error.message.toLowerCase().includes(msg.toLowerCase())
        );
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get the underlying provider (for advanced use cases)
     * PORTABILITY: Avoid using this in application code
     */
    getProvider(): Provider {
        return this.provider;
    }

    /**
     * Get the signer (for advanced use cases)
     * PORTABILITY: Avoid using this in application code
     */
    getSigner(): Signer | null {
        return this.signer;
    }
}
