#!/bin/bash
# =============================================================================
# setup_qbft.sh - QBFT Network Setup Script
# =============================================================================
#
# DESCRIPTION:
# Generates node keys and updates the genesis file with validator addresses
# for a QBFT permissioned network. Creates the config/besu/keys/ directory
# with secp256k1 keypairs for each node.
#
# USAGE:
#   ./scripts/network/setup_qbft.sh [options]
#
# OPTIONS:
#   -n, --nodes <count>     Number of validator nodes (default: 3)
#   -o, --observers <count> Number of observer nodes (default: 1)
#   -c, --chain-id <id>     Chain ID (default: 1981)
#   -b, --block-time <sec>  Block time in seconds (default: 5)
#   -h, --help              Show this help message
#
# NOTE: This script generates keys locally using openssl. For production,
#       use besu operator generate-blockchain-config or an HSM.
# =============================================================================

set -euo pipefail

VALIDATOR_COUNT=3
OBSERVER_COUNT=1
CHAIN_ID=1981
BLOCK_TIME=5
CONFIG_DIR="$(cd "$(dirname "$0")/../.." && pwd)/config/besu"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

show_help() {
    head -25 "$0" | tail -15
    exit 0
}

check_dependencies() {
    log_info "Checking dependencies..."
    if ! command -v openssl &> /dev/null; then
        log_error "openssl is required but not installed."
        exit 1
    fi
    if ! command -v xxd &> /dev/null; then
        log_error "xxd is required but not installed (usually in vim-common or xxd package)."
        exit 1
    fi
    log_success "Dependencies found."
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--nodes)     VALIDATOR_COUNT="$2"; shift 2 ;;
        -o|--observers) OBSERVER_COUNT="$2";  shift 2 ;;
        -c|--chain-id)  CHAIN_ID="$2";        shift 2 ;;
        -b|--block-time) BLOCK_TIME="$2";     shift 2 ;;
        -h|--help)      show_help ;;
        *)              log_error "Unknown option: $1"; show_help ;;
    esac
done

# =============================================================================
# Generate secp256k1 keypair for a node
# Outputs: private_key_hex public_key_hex (uncompressed, 64 bytes = 128 hex chars)
# =============================================================================
generate_keypair() {
    local node_name="$1"
    # Generate private key (32 bytes)
    local priv_key
    priv_key=$(openssl ecparam -genkey -name secp256k1 -noout 2>/dev/null | \
               openssl ec -text -noout 2>/dev/null | \
               grep -A 100 "priv:" | grep -v "priv:" | grep -v "pub:" | \
               tr -d '[:space:]:' | head -c 64)

    # Generate public key (uncompressed, 64 bytes without 04 prefix)
    local pub_key
    pub_key=$(openssl ec -in <(openssl ecparam -genkey -name secp256k1 -noout 2>/dev/null) \
              -pubout -conv_form uncompressed 2>/dev/null | \
              openssl ec -pubin -text -noout 2>/dev/null | \
              grep -A 100 "pub:" | grep -v "pub:" | grep -v "ASN1" | \
              tr -d '[:space:]:' | tail -c 128)

    echo "${priv_key}:${pub_key}"
}

# =============================================================================
# Main
# =============================================================================
main() {
    log_info "=============================================="
    log_info "Philippine Government Federated Blockchain"
    log_info "QBFT Network Setup"
    log_info "=============================================="
    echo ""
    log_info "Configuration:"
    log_info "  Validators:    $VALIDATOR_COUNT"
    log_info "  Observers:     $OBSERVER_COUNT"
    log_info "  Chain ID:      $CHAIN_ID"
    log_info "  Block Time:    ${BLOCK_TIME}s"
    log_info "  Config Dir:    $CONFIG_DIR"
    echo ""

    check_dependencies

    # Create keys directory
    mkdir -p "$CONFIG_DIR/keys"

    # Generate keys for all nodes
    TOTAL_NODES=$((VALIDATOR_COUNT + OBSERVER_COUNT + 1))  # +1 for bootnode
    declare -a NODE_NAMES
    declare -a NODE_PRIV_KEYS
    declare -a NODE_PUB_KEYS
    declare -a VALIDATOR_ADDRESSES

    log_info "Generating secp256k1 keypairs for $TOTAL_NODES nodes..."

    # Bootnode
    NODE_NAMES[0]="bootnode"
    local kp
    kp=$(generate_keypair "bootnode")
    NODE_PRIV_KEYS[0]="${kp%%:*}"
    NODE_PUB_KEYS[0]="${kp##*:}"
    echo "${NODE_PRIV_KEYS[0]}" > "$CONFIG_DIR/keys/bootnode.key"
    echo "${NODE_PUB_KEYS[0]}" > "$CONFIG_DIR/keys/bootnode.key.pub"
    log_success "  bootnode key generated"

    # Validators
    for i in $(seq 1 $VALIDATOR_COUNT); do
        local name="validator${i}"
        NODE_NAMES[$i]="$name"
        kp=$(generate_keypair "$name")
        NODE_PRIV_KEYS[$i]="${kp%%:*}"
        NODE_PUB_KEYS[$i]="${kp##*:}"
        echo "${NODE_PRIV_KEYS[$i]}" > "$CONFIG_DIR/keys/${name}.key"
        echo "${NODE_PUB_KEYS[$i]}" > "$CONFIG_DIR/keys/${name}.key.pub"

        # Derive Ethereum address (last 20 bytes of keccak256 of public key)
        local address
        address=$(echo -n "${NODE_PUB_KEYS[$i]}" | xxd -r -p | \
                  openssl dgst -sha3-256 -binary | xxd -p | tail -c 40)
        VALIDATOR_ADDRESSES+=("0x${address}")
        log_success "  ${name} key generated (address: 0x${address})"
    done

    # Observers
    for i in $(seq 1 $OBSERVER_COUNT); do
        local idx=$((VALIDATOR_COUNT + i))
        local name="observer${i}"
        NODE_NAMES[$idx]="$name"
        kp=$(generate_keypair "$name")
        NODE_PRIV_KEYS[$idx]="${kp%%:*}"
        NODE_PUB_KEYS[$idx]="${kp##*:}"
        echo "${NODE_PRIV_KEYS[$idx]}" > "$CONFIG_DIR/keys/${name}.key"
        echo "${NODE_PUB_KEYS[$idx]}" > "$CONFIG_DIR/keys/${name}.key.pub"
        log_success "  ${name} key generated"
    done

    # Build QBFT extraData with validator addresses
    # Format: 32 bytes of zeros + 20 bytes * N validator addresses
    log_info ""
    log_info "Building QBFT extraData with ${#VALIDATOR_ADDRESSES[@]} validator addresses..."

    local extra_data="0x"
    # 32 bytes of zeros (vanity data)
    extra_data+="0000000000000000000000000000000000000000000000000000000000000000"
    # Append validator addresses (20 bytes each, no 0x prefix)
    for addr in "${VALIDATOR_ADDRESSES[@]}"; do
        extra_data+="${addr#0x}"
    done
    # Pad to 65 bytes minimum (130 hex chars) if needed
    local current_len=${#extra_data}
    if [ $current_len -lt 130 ]; then
        local padding=$((130 - current_len))
        extra_data+=$(printf '%0*d' $padding 0)
    fi

    log_success "  extraData: ${extra_data:0:66}..."

    # Update genesis file with extraData
    if [ -f "$CONFIG_DIR/genesis_qbft.json" ]; then
        log_info "Updating genesis_qbft.json with validator addresses..."
        # Use python for reliable JSON manipulation
        python3 -c "
import json, sys
with open('$CONFIG_DIR/genesis_qbft.json', 'r') as f:
    genesis = json.load(f)
genesis['extraData'] = '${extra_data}'
# Remove contract mode since we're using static validators
if 'validatorSelectionMode' in genesis.get('config', {}).get('qbft', {}):
    del genesis['config']['qbft']['validatorSelectionMode']
if 'validatorContractAddress' in genesis.get('config', {}).get('qbft', {}):
    del genesis['config']['qbft']['validatorContractAddress']
with open('$CONFIG_DIR/genesis_qbft.json', 'w') as f:
    json.dump(genesis, f, indent=2)
" 2>/dev/null || {
            log_warning "python3 not available, writing extraData manually with sed"
            sed -i "s|\"extraData\": \"0x0000.*\"|\"extraData\": \"${extra_data}\"|" \
                "$CONFIG_DIR/genesis_qbft.json"
        }
        log_success "  genesis_qbft.json updated"
    else
        log_warning "genesis_qbft.json not found at $CONFIG_DIR/genesis_qbft.json"
        log_info "  extraData value (paste into genesis manually):"
        echo "  $extra_data"
    fi

    # Generate enodes summary
    log_info ""
    log_info "=============================================="
    log_info "Setup Complete"
    log_info "=============================================="
    echo ""
    log_info "Generated files:"
    log_info "  $CONFIG_DIR/keys/bootnode.key"
    for i in $(seq 1 $VALIDATOR_COUNT); do
        log_info "  $CONFIG_DIR/keys/validator${i}.key"
    done
    for i in $(seq 1 $OBSERVER_COUNT); do
        log_info "  $CONFIG_DIR/keys/observer${i}.key"
    done
    echo ""
    log_warning "SECURITY: Store private keys securely!"
    log_warning "         Never commit keys to version control."
    echo ""
    log_info "Next steps:"
    log_info "  1. Review config/besu/genesis_qbft.json"
    log_info "  2. cd docker && docker compose up -d"
    log_info "  3. npm run deploy:besuLocal"
}

main
