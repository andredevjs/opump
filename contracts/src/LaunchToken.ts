import { u256 } from '@btc-vision/as-bignum/assembly';
import {
  Address,
  Blockchain,
  BytesWriter,
  Calldata,
  OP20,
  OP20InitParameters,
  Revert,
  SafeMath,
  StoredU256,
  StoredBoolean,
  StoredU64,
  StoredString,
  StoredAddress,
  AddressMemoryMap,
  EMPTY_POINTER,
} from '@btc-vision/btc-runtime/runtime';

import { BondingCurve } from './lib/BondingCurve';
import {
  INITIAL_VIRTUAL_BTC,
  INITIAL_VIRTUAL_TOKEN,
  DEFAULT_MAX_SUPPLY,
  DEFAULT_GRADUATION_THRESHOLD,
  MIN_TRADE_AMOUNT,
  FEE_DENOMINATOR,
  MAX_CREATOR_ALLOCATION_BPS,
  MAX_AIRDROP_BPS,
  MAX_COMBINED_ALLOCATION_BPS,
  MAX_BUY_TAX_BPS,
  MAX_SELL_TAX_BPS,
  RESERVATION_TTL_BLOCKS,
} from './lib/Constants';

import { BuyEvent, SellEvent, GraduationEvent, ReservationEvent, FeeClaimedEvent, MigrationEvent } from './events/Events';

@final
export class LaunchToken extends OP20 {
  // Bonding curve state
  private readonly virtualBtcReservePtr: u16 = Blockchain.nextPointer;
  private readonly virtualTokenSupplyPtr: u16 = Blockchain.nextPointer;
  private readonly kConstantPtr: u16 = Blockchain.nextPointer;
  private readonly realBtcReservePtr: u16 = Blockchain.nextPointer;
  private readonly totalVolumeSatsPtr: u16 = Blockchain.nextPointer;
  private readonly graduatedPtr: u16 = Blockchain.nextPointer;
  private readonly migratedPtr: u16 = Blockchain.nextPointer;

  // Fee pools
  private readonly creatorFeePoolPtr: u16 = Blockchain.nextPointer;
  private readonly platformFeePoolPtr: u16 = Blockchain.nextPointer;

  // Deployment info (block number stored as u64 in a StoredU64 slot)
  private readonly deployBlockPtr: u16 = Blockchain.nextPointer;

  // Configuration
  private readonly creatorAllocationBpsPtr: u16 = Blockchain.nextPointer;
  private readonly buyTaxBpsPtr: u16 = Blockchain.nextPointer;
  private readonly sellTaxBpsPtr: u16 = Blockchain.nextPointer;
  private readonly flywheelDestinationPtr: u16 = Blockchain.nextPointer;

  // Reservations
  private readonly reservationsPtr: u16 = Blockchain.nextPointer;
  private readonly reservationExpiryPtr: u16 = Blockchain.nextPointer;

  // Thresholds
  private readonly graduationThresholdPtr: u16 = Blockchain.nextPointer;
  private readonly minTradeAmountPtr: u16 = Blockchain.nextPointer;

  private readonly virtualBtcReserve: StoredU256 = new StoredU256(this.virtualBtcReservePtr, EMPTY_POINTER);
  private readonly virtualTokenSupply: StoredU256 = new StoredU256(this.virtualTokenSupplyPtr, EMPTY_POINTER);
  private readonly kConstant: StoredU256 = new StoredU256(this.kConstantPtr, EMPTY_POINTER);
  private readonly realBtcReserve: StoredU256 = new StoredU256(this.realBtcReservePtr, EMPTY_POINTER);
  private readonly totalVolumeSats: StoredU256 = new StoredU256(this.totalVolumeSatsPtr, EMPTY_POINTER);
  private readonly graduated: StoredBoolean = new StoredBoolean(this.graduatedPtr, false);
  private readonly migrated: StoredBoolean = new StoredBoolean(this.migratedPtr, false);

  private readonly creatorFeePool: StoredU256 = new StoredU256(this.creatorFeePoolPtr, EMPTY_POINTER);
  private readonly platformFeePool: StoredU256 = new StoredU256(this.platformFeePoolPtr, EMPTY_POINTER);

  private readonly deployBlock: StoredU64 = new StoredU64(this.deployBlockPtr, EMPTY_POINTER);

  private readonly creatorAllocationBps: StoredU256 = new StoredU256(this.creatorAllocationBpsPtr, EMPTY_POINTER);
  private readonly buyTaxBps: StoredU256 = new StoredU256(this.buyTaxBpsPtr, EMPTY_POINTER);
  private readonly sellTaxBps: StoredU256 = new StoredU256(this.sellTaxBpsPtr, EMPTY_POINTER);
  // Values: 0 = burn, 1 = community pool, 2 = creator
  private readonly flywheelDestination: StoredU256 = new StoredU256(this.flywheelDestinationPtr, EMPTY_POINTER);

  private readonly reservations: AddressMemoryMap = new AddressMemoryMap(this.reservationsPtr);
  private readonly reservationExpiry: AddressMemoryMap = new AddressMemoryMap(this.reservationExpiryPtr);

  private readonly graduationThreshold: StoredU256 = new StoredU256(this.graduationThresholdPtr, EMPTY_POINTER);
  private readonly minTradeAmount: StoredU256 = new StoredU256(this.minTradeAmountPtr, EMPTY_POINTER);

  // Vault address for BTC output verification
  private readonly vaultAddressPtr: u16 = Blockchain.nextPointer;
  private readonly vaultAddress: StoredString = new StoredString(this.vaultAddressPtr);

  // Creator address — stored at deployment so creator fees can be claimed
  // even when the contract is deployed through a factory (where deployer != creator)
  private readonly creatorAddressPtr: u16 = Blockchain.nextPointer;
  private readonly creatorAddress: StoredAddress = new StoredAddress(this.creatorAddressPtr);

  // Airdrop allocation (basis points)
  private readonly airdropBpsPtr: u16 = Blockchain.nextPointer;
  private readonly airdropBpsStorage: StoredU256 = new StoredU256(this.airdropBpsPtr, EMPTY_POINTER);

  public constructor() {
    super();
  }

  public override onDeployment(calldata: Calldata): void {
    const name: string = calldata.readStringWithLength();
    const symbol: string = calldata.readStringWithLength();
    const maxSupply: u256 = calldata.readU256();
    const creatorAllocBps: u256 = calldata.readU256();
    const airdropBps: u256 = calldata.readU256();
    const buyTax: u256 = calldata.readU256();
    const sellTax: u256 = calldata.readU256();
    const flywheelDest: u256 = calldata.readU256();
    const gradThreshold: u256 = calldata.readU256();
    const vaultAddr: string = calldata.readStringWithLength();

    // Validate
    if (name.length == 0) throw new Revert('Name required');
    if (symbol.length == 0) throw new Revert('Symbol required');
    if (vaultAddr.length == 0) {
      throw new Revert('Vault address required');
    }
    if (creatorAllocBps > MAX_CREATOR_ALLOCATION_BPS) {
      throw new Revert('Creator allocation exceeds max');
    }
    if (airdropBps > MAX_AIRDROP_BPS) {
      throw new Revert('Airdrop exceeds max');
    }
    const totalOffCurve = SafeMath.add(creatorAllocBps, airdropBps);
    if (totalOffCurve > MAX_COMBINED_ALLOCATION_BPS) {
      throw new Revert('Combined allocation exceeds 70%');
    }
    if (buyTax > MAX_BUY_TAX_BPS) {
      throw new Revert('Buy tax exceeds 3%');
    }
    if (sellTax > MAX_SELL_TAX_BPS) {
      throw new Revert('Sell tax exceeds 5%');
    }

    // Use defaults if zero
    const finalSupply = maxSupply == u256.Zero ? DEFAULT_MAX_SUPPLY : maxSupply;
    const finalThreshold = gradThreshold == u256.Zero ? DEFAULT_GRADUATION_THRESHOLD : gradThreshold;

    if (finalSupply < INITIAL_VIRTUAL_TOKEN) {
      throw new Revert('Max supply must be >= initial virtual token supply');
    }

    // Initialize OP20
    this.instantiate(new OP20InitParameters(finalSupply, 8, name, symbol));

    // Store configuration
    this.creatorAllocationBps.set(creatorAllocBps);
    this.airdropBpsStorage.set(airdropBps);
    this.buyTaxBps.set(buyTax);
    this.sellTaxBps.set(sellTax);
    this.flywheelDestination.set(flywheelDest);
    this.graduationThreshold.set(finalThreshold);
    this.minTradeAmount.set(MIN_TRADE_AMOUNT);
    this.vaultAddress.value = vaultAddr;

    // Initialize bonding curve — reduce virtualTokenSupply by off-curve allocation
    // so that totalMinted (allocation + curve trades + migration) never exceeds maxSupply.
    const curveBps = SafeMath.sub(FEE_DENOMINATOR, totalOffCurve);
    const curveSupply = SafeMath.div(SafeMath.mul(finalSupply, curveBps), FEE_DENOMINATOR);

    this.virtualBtcReserve.set(INITIAL_VIRTUAL_BTC);
    this.virtualTokenSupply.set(curveSupply);
    this.kConstant.set(SafeMath.mul(INITIAL_VIRTUAL_BTC, curveSupply));

    // Store deploy block
    this.deployBlock.set(0, Blockchain.block.number);
    this.deployBlock.save();

    // Use tx.origin (not tx.sender) to give creator allocation to the
    // human signer, even when deployed through a factory contract.
    const origin = Blockchain.tx.origin;

    // Store the creator address for fee claims (distinct from deployer/platform)
    this.creatorAddress.value = origin;

    // Mint creator allocation if > 0
    if (creatorAllocBps > u256.Zero) {
      const creatorTokens = SafeMath.div(
        SafeMath.mul(finalSupply, creatorAllocBps),
        FEE_DENOMINATOR,
      );
      this._mint(origin, creatorTokens);
    }

    // Mint airdrop tokens to creator (distributed off-chain)
    if (airdropBps > u256.Zero) {
      const airdropTokens = SafeMath.div(
        SafeMath.mul(finalSupply, airdropBps),
        FEE_DENOMINATOR,
      );
      this._mint(origin, airdropTokens);
    }
  }

  @payable
  @method({ name: 'btcAmount', type: ABIDataTypes.UINT256 })
  @returns({ name: 'tokensOut', type: ABIDataTypes.UINT256 })
  @emit('Buy')
  public buy(calldata: Calldata): BytesWriter {
    const btcAmount: u256 = calldata.readU256();

    if (this.graduated.value) {
      throw new Revert('Token has graduated');
    }
    if (btcAmount < this.minTradeAmount.value) {
      throw new Revert('Below minimum trade amount');
    }

    // Verify BTC was actually sent to the vault
    this._verifyBtcOutput(btcAmount);

    const sender = Blockchain.tx.sender;

    // NOTE: Reservation is for the gross btcAmount. After fees, netBtc enters
    // the curve, so tokens received will be slightly less than a pure-AMM
    // estimate at reservation time. This is by design — fees are always applied.

    // Consume reservation if active (two-transaction model)
    this._consumeReservation(sender, btcAmount);

    // Calculate fees
    const fees = BondingCurve.splitFees(btcAmount);
    const platformFee = fees[0];
    const creatorFee = fees[1];
    const totalFee = BondingCurve.calculateTotalFee(btcAmount);

    // Calculate flywheel tax
    const flywheelFee = BondingCurve.calculateFee(btcAmount, this.buyTaxBps.value);

    // Net BTC going into the curve
    const netBtc = SafeMath.sub(SafeMath.sub(btcAmount, totalFee), flywheelFee);

    // Prevent buying beyond graduation threshold
    const currentRealBtc = this.realBtcReserve.value;
    const currentVolume = this.totalVolumeSats.value;
    const threshold = this.graduationThreshold.value;
    if (SafeMath.add(currentRealBtc, netBtc) > threshold) {
      throw new Revert('Exceeds graduation threshold');
    }

    // Calculate tokens out
    const vBtc = this.virtualBtcReserve.value;
    const vToken = this.virtualTokenSupply.value;
    const k = this.kConstant.value;
    const tokensOut = BondingCurve.calculateBuy(vBtc, vToken, k, netBtc);

    // Update reserves — use already-loaded values to avoid redundant storage reads
    this.virtualBtcReserve.set(SafeMath.add(vBtc, netBtc));
    this.virtualTokenSupply.set(SafeMath.sub(vToken, tokensOut));
    this.realBtcReserve.set(SafeMath.add(currentRealBtc, netBtc));
    this.totalVolumeSats.set(SafeMath.add(currentVolume, btcAmount));

    // Accumulate fee pools
    this.platformFeePool.set(SafeMath.add(this.platformFeePool.value, platformFee));
    this.creatorFeePool.set(SafeMath.add(this.creatorFeePool.value, creatorFee));

    // Apply flywheel tax based on destination
    this._applyFlywheel(flywheelFee, sender);

    // Mint tokens to buyer
    this._mint(sender, tokensOut);

    // Check graduation
    this._checkGraduation();

    // Emit event
    const newPrice = BondingCurve.calculatePrice(
      this.virtualBtcReserve.value,
      this.virtualTokenSupply.value,
    );
    this.emitEvent(new BuyEvent(sender, btcAmount, tokensOut, newPrice));

    const writer = new BytesWriter(32);
    writer.writeU256(tokensOut);
    return writer;
  }

  /**
   * Sells tokens back to the bonding curve.
   *
   * NOTE: The sell operation updates reserves and accounting but does NOT
   * directly transfer BTC to the seller. The caller must construct appropriate
   * BTC outputs. The btcOut value emitted in the SellEvent indicates the
   * amount the seller should receive via transaction outputs.
   */
  @method({ name: 'tokenAmount', type: ABIDataTypes.UINT256 })
  @returns({ name: 'btcOut', type: ABIDataTypes.UINT256 })
  @emit('Sell')
  public sell(calldata: Calldata): BytesWriter {
    const tokenAmount: u256 = calldata.readU256();

    if (this.graduated.value) {
      throw new Revert('Token has graduated');
    }

    const sender = Blockchain.tx.sender;

    // Calculate BTC out before fees
    const vBtc = this.virtualBtcReserve.value;
    const vToken = this.virtualTokenSupply.value;
    const k = this.kConstant.value;
    const grossBtcOut = BondingCurve.calculateSell(vBtc, vToken, k, tokenAmount);

    if (grossBtcOut > this.realBtcReserve.value) {
      throw new Revert('Insufficient liquidity');
    }

    if (grossBtcOut < this.minTradeAmount.value) {
      throw new Revert('Below minimum trade amount');
    }

    // Calculate fees on the BTC output
    const fees = BondingCurve.splitFees(grossBtcOut);
    const platformFee = fees[0];
    const creatorFee = fees[1];
    const totalFee = BondingCurve.calculateTotalFee(grossBtcOut);

    // Calculate flywheel tax
    const flywheelFee = BondingCurve.calculateFee(grossBtcOut, this.sellTaxBps.value);

    // Net BTC to seller
    const btcOut = SafeMath.sub(SafeMath.sub(grossBtcOut, totalFee), flywheelFee);

    // Burn tokens first
    this._burn(sender, tokenAmount);

    // Update reserves
    this.virtualBtcReserve.set(SafeMath.sub(vBtc, grossBtcOut));
    this.virtualTokenSupply.set(SafeMath.add(vToken, tokenAmount));
    this.realBtcReserve.set(SafeMath.sub(this.realBtcReserve.value, grossBtcOut));
    this.totalVolumeSats.set(SafeMath.add(this.totalVolumeSats.value, grossBtcOut));

    // Accumulate fee pools
    this.platformFeePool.set(SafeMath.add(this.platformFeePool.value, platformFee));
    this.creatorFeePool.set(SafeMath.add(this.creatorFeePool.value, creatorFee));

    // Apply flywheel
    this._applyFlywheel(flywheelFee, sender);

    // Emit event
    const newPrice = BondingCurve.calculatePrice(
      this.virtualBtcReserve.value,
      this.virtualTokenSupply.value,
    );
    this.emitEvent(new SellEvent(sender, tokenAmount, btcOut, newPrice));

    const writer = new BytesWriter(32);
    writer.writeU256(btcOut);
    return writer;
  }

  @payable
  @method({ name: 'btcAmount', type: ABIDataTypes.UINT256 })
  @returns({ name: 'expiryBlock', type: ABIDataTypes.UINT256 })
  @emit('Reservation')
  public reserve(calldata: Calldata): BytesWriter {
    const btcAmount: u256 = calldata.readU256();
    const sender = Blockchain.tx.sender;

    // Check no active reservation
    const existingExpiry = this.reservationExpiry.get(sender);
    const currentBlock = u256.fromU64(Blockchain.block.number);
    if (existingExpiry > currentBlock) {
      throw new Revert('Active reservation exists');
    }

    // Verify BTC was actually sent to the vault
    this._verifyBtcOutput(btcAmount);

    // Store reservation
    this.reservations.set(sender, btcAmount);
    const expiryBlock = SafeMath.add(currentBlock, RESERVATION_TTL_BLOCKS);
    this.reservationExpiry.set(sender, expiryBlock);

    this.emitEvent(new ReservationEvent(sender, btcAmount, expiryBlock));

    const writer = new BytesWriter(32);
    writer.writeU256(expiryBlock);
    return writer;
  }

  /**
   * Cancels an active reservation.
   *
   * WARNING: Cancellation does NOT refund BTC sent during reserve().
   * The CANCEL_PENALTY_BPS constant in Constants.ts is reserved for
   * a future penalty-based refund mechanism. Currently, reservations
   * are non-refundable once BTC is sent to the vault.
   */
  @method()
  @returns({ name: 'success', type: ABIDataTypes.BOOL })
  public cancelReservation(calldata: Calldata): BytesWriter {
    const sender = Blockchain.tx.sender;

    const reservedAmount = this.reservations.get(sender);
    if (reservedAmount == u256.Zero) {
      throw new Revert('No active reservation');
    }

    // Clear reservation
    this.reservations.set(sender, u256.Zero);
    this.reservationExpiry.set(sender, u256.Zero);

    const writer = new BytesWriter(1);
    writer.writeBoolean(true);
    return writer;
  }

  /**
   * Claims accumulated platform fees.
   *
   * NOTE: This method records the claim and zeros the pool, but does NOT
   * transfer BTC directly. On OPNet, BTC transfers happen via transaction
   * outputs constructed by the caller. The claim emits an event that an
   * off-chain settlement process monitors to fulfill the BTC transfer.
   *
   * The caller must construct the appropriate BTC outputs in their transaction.
   *
   * Only the deployer (platform/factory) can claim platform fees. When deployed
   * through a factory, the factory address IS the deployer and acts as the platform.
   */
  @method()
  @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
  @emit('FeeClaimed')
  public claimPlatformFees(calldata: Calldata): BytesWriter {
    const sender = Blockchain.tx.sender;

    // Only deployer (platform owner) can claim platform fees.
    // When deployed via factory, the factory IS the deployer/platform.
    this.onlyDeployer(sender);

    const amount = this.platformFeePool.value;
    if (amount == u256.Zero) {
      throw new Revert('No fees to claim');
    }

    // Zero out pool before returning
    this.platformFeePool.set(u256.Zero);

    // feeType 2 = platform
    this.emitEvent(new FeeClaimedEvent(sender, amount, u256.fromU32(2)));

    const writer = new BytesWriter(32);
    writer.writeU256(amount);
    return writer;
  }

  /**
   * Claims accumulated creator fees.
   *
   * NOTE: This method records the claim and zeros the pool, but does NOT
   * transfer BTC directly. On OPNet, BTC transfers happen via transaction
   * outputs constructed by the caller. The claim emits an event that an
   * off-chain settlement process monitors to fulfill the BTC transfer.
   *
   * The caller must construct the appropriate BTC outputs in their transaction.
   *
   * Only the original creator (tx.origin at deployment time) can claim.
   * This is distinct from onlyDeployer — when deployed through a factory,
   * the deployer is the factory, but the creator is the human signer.
   */
  @method()
  @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
  @emit('FeeClaimed')
  public claimCreatorFees(calldata: Calldata): BytesWriter {
    const sender = Blockchain.tx.sender;

    // Check against stored creator address (set during onDeployment)
    // This ensures the actual creator can claim even when deployed via factory
    if (sender !== this.creatorAddress.value) {
      throw new Revert('Only creator can claim creator fees');
    }

    const amount = this.creatorFeePool.value;
    if (amount == u256.Zero) {
      throw new Revert('No fees to claim');
    }

    // Zero out pool before returning
    this.creatorFeePool.set(u256.Zero);

    // feeType 0 = creator
    this.emitEvent(new FeeClaimedEvent(sender, amount, u256.Zero));

    const writer = new BytesWriter(32);
    writer.writeU256(amount);
    return writer;
  }

  @method({ name: 'recipient', type: ABIDataTypes.ADDRESS })
  @returns({ name: 'tokenAmount', type: ABIDataTypes.UINT256 })
  @emit('Migration')
  public migrate(calldata: Calldata): BytesWriter {
    const recipient = calldata.readAddress();
    const sender = Blockchain.tx.sender;

    if (!this.graduated.value) {
      throw new Revert('Not graduated');
    }
    if (this.migrated.value) {
      throw new Revert('Already migrated');
    }

    this.onlyDeployer(sender);

    // Remaining tokens on the curve that were never minted
    const liquidityTokens = this.virtualTokenSupply.value;

    // Mint liquidity tokens to the recipient address
    this._mint(recipient, liquidityTokens);

    this.migrated.value = true;

    const realBtc = this.realBtcReserve.value;
    this.emitEvent(new MigrationEvent(recipient, liquidityTokens, realBtc));

    const writer = new BytesWriter(32);
    writer.writeU256(liquidityTokens);
    return writer;
  }

  @view
  @method()
  @returns({ name: 'isMigrated', type: ABIDataTypes.BOOL })
  public isMigrated(calldata: Calldata): BytesWriter {
    const writer = new BytesWriter(1);
    writer.writeBoolean(this.migrated.value);
    return writer;
  }

  @view
  @method()
  @returns(
    { name: 'virtualBtc', type: ABIDataTypes.UINT256 },
    { name: 'virtualToken', type: ABIDataTypes.UINT256 },
    { name: 'realBtc', type: ABIDataTypes.UINT256 },
    { name: 'k', type: ABIDataTypes.UINT256 },
  )
  public getReserves(calldata: Calldata): BytesWriter {
    const writer = new BytesWriter(32 * 4);
    writer.writeU256(this.virtualBtcReserve.value);
    writer.writeU256(this.virtualTokenSupply.value);
    writer.writeU256(this.realBtcReserve.value);
    writer.writeU256(this.kConstant.value);
    return writer;
  }

  @view
  @method()
  @returns({ name: 'priceSatsPerToken', type: ABIDataTypes.UINT256 })
  public getPrice(calldata: Calldata): BytesWriter {
    const price = BondingCurve.calculatePrice(
      this.virtualBtcReserve.value,
      this.virtualTokenSupply.value,
    );
    const writer = new BytesWriter(32);
    writer.writeU256(price);
    return writer;
  }

  @view
  @method()
  @returns(
    { name: 'creatorBps', type: ABIDataTypes.UINT256 },
    { name: 'airdropBps', type: ABIDataTypes.UINT256 },
    { name: 'buyTax', type: ABIDataTypes.UINT256 },
    { name: 'sellTax', type: ABIDataTypes.UINT256 },
    { name: 'destination', type: ABIDataTypes.UINT256 },
    { name: 'threshold', type: ABIDataTypes.UINT256 },
  )
  public getConfig(calldata: Calldata): BytesWriter {
    const writer = new BytesWriter(32 * 6);
    writer.writeU256(this.creatorAllocationBps.value);
    writer.writeU256(this.airdropBpsStorage.value);
    writer.writeU256(this.buyTaxBps.value);
    writer.writeU256(this.sellTaxBps.value);
    writer.writeU256(this.flywheelDestination.value);
    writer.writeU256(this.graduationThreshold.value);
    return writer;
  }

  @view
  @method()
  @returns({ name: 'isGraduated', type: ABIDataTypes.BOOL })
  public isGraduated(calldata: Calldata): BytesWriter {
    const writer = new BytesWriter(1);
    writer.writeBoolean(this.graduated.value);
    return writer;
  }

  @view
  @method()
  @returns(
    { name: 'platformFees', type: ABIDataTypes.UINT256 },
    { name: 'creatorFees', type: ABIDataTypes.UINT256 },
  )
  public getFeePools(calldata: Calldata): BytesWriter {
    const writer = new BytesWriter(32 * 2);
    writer.writeU256(this.platformFeePool.value);
    writer.writeU256(this.creatorFeePool.value);
    return writer;
  }

  @view
  @method({ name: 'addr', type: ABIDataTypes.ADDRESS })
  @returns(
    { name: 'amount', type: ABIDataTypes.UINT256 },
    { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
  )
  public getReservation(calldata: Calldata): BytesWriter {
    const addr = calldata.readAddress();
    const writer = new BytesWriter(32 * 2);
    writer.writeU256(this.reservations.get(addr));
    writer.writeU256(this.reservationExpiry.get(addr));
    return writer;
  }

  private _verifyBtcOutput(requiredSats: u256): void {
    const vault = this.vaultAddress.value;
    const txOutputs = Blockchain.tx.outputs;
    let totalToVault: u256 = u256.Zero;

    for (let i: i32 = 0; i < txOutputs.length; i++) {
      const output = txOutputs[i];
      if (output.hasTo && output.to == vault) {
        totalToVault = SafeMath.add(totalToVault, u256.fromU64(output.value));
      }
    }

    if (totalToVault < requiredSats) {
      throw new Revert('Insufficient BTC sent to vault');
    }
  }

  private _consumeReservation(sender: Address, btcAmount: u256): void {
    const reservedAmount = this.reservations.get(sender);
    if (reservedAmount == u256.Zero) return;

    const currentBlock = u256.fromU64(Blockchain.block.number);
    const expiry = this.reservationExpiry.get(sender);

    if (expiry >= currentBlock) {
      // Active reservation — buy amount must match
      if (btcAmount != reservedAmount) {
        throw new Revert('Amount must match reservation');
      }
    }

    // Consume or clear expired reservation
    this.reservations.set(sender, u256.Zero);
    this.reservationExpiry.set(sender, u256.Zero);
  }

  private _checkGraduation(): void {
    const realBtc = this.realBtcReserve.value;
    const threshold = this.graduationThreshold.value;

    if (realBtc >= threshold) {
      this.graduated.value = true;
      this.emitEvent(new GraduationEvent(Blockchain.tx.sender, realBtc));
    }
  }

  private _applyFlywheel(flywheelFee: u256, sender: Address): void {
    if (flywheelFee == u256.Zero) return;

    const dest = this.flywheelDestination.value;

    if (dest == u256.Zero) {
      // Burn destination: sats already deducted from curve input, not redistributed
      return;
    } else if (dest == u256.One) {
      // Community pool — add to creator fee pool
      this.creatorFeePool.set(SafeMath.add(this.creatorFeePool.value, flywheelFee));
    } else {
      // Creator — add to creator fee pool
      this.creatorFeePool.set(SafeMath.add(this.creatorFeePool.value, flywheelFee));
    }
  }
}
