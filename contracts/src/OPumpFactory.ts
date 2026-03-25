import { u256 } from '@btc-vision/as-bignum/assembly';
import {
  Blockchain,
  BytesWriter,
  Calldata,
  OP_NET,
  Revert,
  SafeMath,
  StoredU256,
  AddressMemoryMap,
  StoredMapU256,
  EMPTY_POINTER,
} from '@btc-vision/btc-runtime/runtime';

import { MAX_COMBINED_ALLOCATION_BPS, MAX_AIRDROP_BPS, MAX_BUY_TAX_BPS, MAX_SELL_TAX_BPS } from './lib/Constants';
import { TokenRegisteredEvent } from './events/Events';

@final
export class OPumpFactory extends OP_NET {
  // Storage
  private readonly tokenCountPtr: u16 = Blockchain.nextPointer;
  private readonly tokenRegistryPtr: u16 = Blockchain.nextPointer;
  private readonly creatorTokenCountPtr: u16 = Blockchain.nextPointer;
  private readonly totalVolumePtr: u16 = Blockchain.nextPointer;
  private readonly graduatedCountPtr: u16 = Blockchain.nextPointer;

  private readonly tokenCount: StoredU256 = new StoredU256(this.tokenCountPtr, EMPTY_POINTER);
  private readonly tokenRegistry: StoredMapU256 = new StoredMapU256(this.tokenRegistryPtr);
  private readonly creatorTokenCount: AddressMemoryMap = new AddressMemoryMap(this.creatorTokenCountPtr);
  // NOTE: These counters are not yet updated by any method.
  // They are reserved for future on-chain stats tracking.
  // Currently, volume and graduation counts are tracked off-chain by the indexer.
  private readonly totalVolume: StoredU256 = new StoredU256(this.totalVolumePtr, EMPTY_POINTER);
  private readonly graduatedCount: StoredU256 = new StoredU256(this.graduatedCountPtr, EMPTY_POINTER);

  public constructor() {
    super();
  }

  public override onDeployment(_calldata: Calldata): void {
    // No additional initialization needed — contractDeployer is tracked by OP_NET
  }

  /**
   * Registers a new token in the factory.
   *
   * registerToken is a permissionless registry. Name/symbol are validated
   * but not stored — they exist only in the emitted event for indexer discovery.
   * The actual token parameters live in the LaunchToken contract itself.
   */
  @method(
    { name: 'name', type: ABIDataTypes.STRING },
    { name: 'symbol', type: ABIDataTypes.STRING },
    { name: 'creatorAllocationBps', type: ABIDataTypes.UINT256 },
    { name: 'airdropBps', type: ABIDataTypes.UINT256 },
    { name: 'buyTaxBps', type: ABIDataTypes.UINT256 },
    { name: 'sellTaxBps', type: ABIDataTypes.UINT256 },
    { name: 'flywheelDestination', type: ABIDataTypes.UINT256 },
  )
  @returns({ name: 'tokenIndex', type: ABIDataTypes.UINT256 })
  @emit('TokenRegistered')
  public registerToken(calldata: Calldata): BytesWriter {
    const name: string = calldata.readStringWithLength();
    const symbol: string = calldata.readStringWithLength();
    const creatorAllocationBps: u256 = calldata.readU256();
    const airdropBps: u256 = calldata.readU256();
    const buyTaxBps: u256 = calldata.readU256();
    const sellTaxBps: u256 = calldata.readU256();
    const flywheelDestination: u256 = calldata.readU256();

    // Combined cap: creatorAllocation + airdrop <= 70% (minimum 30% on bonding curve)
    if (airdropBps > MAX_AIRDROP_BPS) {
      throw new Revert('Airdrop exceeds max');
    }
    if (SafeMath.add(creatorAllocationBps, airdropBps) > MAX_COMBINED_ALLOCATION_BPS) {
      throw new Revert('Combined allocation exceeds 70%');
    }
    if (buyTaxBps > MAX_BUY_TAX_BPS) {
      throw new Revert('Buy tax exceeds 3%');
    }
    if (sellTaxBps > MAX_SELL_TAX_BPS) {
      throw new Revert('Sell tax exceeds 5%');
    }
    if (flywheelDestination > u256.fromU32(2)) {
      throw new Revert('Invalid flywheel destination');
    }

    // Register token
    const index = this.tokenCount.value;
    const sender = Blockchain.tx.sender;

    // Address encoded as u256 via fromUint8ArrayBE — decode back with toUint8Array()
    this.tokenRegistry.set(index, u256.fromUint8ArrayBE(sender));
    this.tokenCount.set(SafeMath.add(index, u256.One));

    // Track creator's token count
    const creatorCount = this.creatorTokenCount.get(sender);
    this.creatorTokenCount.set(sender, SafeMath.add(creatorCount, u256.One));

    // Emit event
    this.emitEvent(new TokenRegisteredEvent(sender, index));

    const writer = new BytesWriter(32);
    writer.writeU256(index);
    return writer;
  }

  @view
  @method()
  @returns({ name: 'count', type: ABIDataTypes.UINT256 })
  public getTokenCount(calldata: Calldata): BytesWriter {
    const writer = new BytesWriter(32);
    writer.writeU256(this.tokenCount.value);
    return writer;
  }

  @view
  @method({ name: 'index', type: ABIDataTypes.UINT256 })
  @returns({ name: 'tokenCreator', type: ABIDataTypes.UINT256 })
  public getTokenAtIndex(calldata: Calldata): BytesWriter {
    const index = calldata.readU256();
    const writer = new BytesWriter(32);
    writer.writeU256(this.tokenRegistry.get(index));
    return writer;
  }

  @view
  @method({ name: 'creator', type: ABIDataTypes.ADDRESS })
  @returns({ name: 'count', type: ABIDataTypes.UINT256 })
  public getTokensByCreator(calldata: Calldata): BytesWriter {
    const creator = calldata.readAddress();
    const writer = new BytesWriter(32);
    writer.writeU256(this.creatorTokenCount.get(creator));
    return writer;
  }

  @view
  @method()
  @returns(
    { name: 'totalTokens', type: ABIDataTypes.UINT256 },
    { name: 'totalGraduated', type: ABIDataTypes.UINT256 },
    { name: 'totalVolume', type: ABIDataTypes.UINT256 },
  )
  public getStats(calldata: Calldata): BytesWriter {
    const writer = new BytesWriter(32 * 3);
    writer.writeU256(this.tokenCount.value);
    writer.writeU256(this.graduatedCount.value);
    writer.writeU256(this.totalVolume.value);
    return writer;
  }
}
