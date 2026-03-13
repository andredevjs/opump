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
  MINTER_WINDOW_BLOCKS,
  MINTER_HOLD_BLOCKS,
  MAX_CREATOR_ALLOCATION_BPS,
  MAX_BUY_TAX_BPS,
  MAX_SELL_TAX_BPS,
  RESERVATION_TTL_BLOCKS,
} from './lib/Constants';

import { BuyEvent, SellEvent, GraduationEvent, ReservationEvent, FeeClaimedEvent } from './events/Events';

@final
export class LaunchToken extends OP20 {
  // Bonding curve state
  private readonly virtualBtcReservePtr: u16 = Blockchain.nextPointer;
  private readonly virtualTokenSupplyPtr: u16 = Blockchain.nextPointer;
  private readonly kConstantPtr: u16 = Blockchain.nextPointer;
  private readonly realBtcReservePtr: u16 = Blockchain.nextPointer;
  private readonly totalVolumeSatsPtr: u16 = Blockchain.nextPointer;
  private readonly graduatedPtr: u16 = Blockchain.nextPointer;

  // Fee pools
  private readonly creatorFeePoolPtr: u16 = Blockchain.nextPointer;
  private readonly minterFeePoolPtr: u16 = Blockchain.nextPointer;
  private readonly platformFeePoolPtr: u16 = Blockchain.nextPointer;

  // Deployment info (block number stored as u64 in a StoredU64 slot)
  private readonly deployBlockPtr: u16 = Blockchain.nextPointer;

  // Configuration
  private readonly creatorAllocationBpsPtr: u16 = Blockchain.nextPointer;
  private readonly buyTaxBpsPtr: u16 = Blockchain.nextPointer;
  private readonly sellTaxBpsPtr: u16 = Blockchain.nextPointer;
  private readonly flywheelDestinationPtr: u16 = Blockchain.nextPointer;

  // Minter tracking
  private readonly minterSharesPtr: u16 = Blockchain.nextPointer;
  private readonly minterBuyBlockPtr: u16 = Blockchain.nextPointer;
  private readonly totalMinterSharesPtr: u16 = Blockchain.nextPointer;

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

  private readonly creatorFeePool: StoredU256 = new StoredU256(this.creatorFeePoolPtr, EMPTY_POINTER);
  private readonly minterFeePool: StoredU256 = new StoredU256(this.minterFeePoolPtr, EMPTY_POINTER);
  private readonly platformFeePool: StoredU256 = new StoredU256(this.platformFeePoolPtr, EMPTY_POINTER);

  private readonly deployBlock: StoredU64 = new StoredU64(this.deployBlockPtr, EMPTY_POINTER);

  private readonly creatorAllocationBps: StoredU256 = new StoredU256(this.creatorAllocationBpsPtr, EMPTY_POINTER);
  private readonly buyTaxBps: StoredU256 = new StoredU256(this.buyTaxBpsPtr, EMPTY_POINTER);
  private readonly sellTaxBps: StoredU256 = new StoredU256(this.sellTaxBpsPtr, EMPTY_POINTER);
  private readonly flywheelDestination: StoredU256 = new StoredU256(this.flywheelDestinationPtr, EMPTY_POINTER);

  private readonly minterShares: AddressMemoryMap = new AddressMemoryMap(this.minterSharesPtr);
  private readonly minterBuyBlock: AddressMemoryMap = new AddressMemoryMap(this.minterBuyBlockPtr);
  private readonly totalMinterShares: StoredU256 = new StoredU256(this.totalMinterSharesPtr, EMPTY_POINTER);

  private readonly reservations: AddressMemoryMap = new AddressMemoryMap(this.reservationsPtr);
  private readonly reservationExpiry: AddressMemoryMap = new AddressMemoryMap(this.reservationExpiryPtr);

  private readonly graduationThreshold: StoredU256 = new StoredU256(this.graduationThresholdPtr, EMPTY_POINTER);
  private readonly minTradeAmount: StoredU256 = new StoredU256(this.minTradeAmountPtr, EMPTY_POINTER);

  // Vault address for BTC output verification
  private readonly vaultAddressPtr: u16 = Blockchain.nextPointer;
  private readonly vaultAddress: StoredString = new StoredString(this.vaultAddressPtr);

  public constructor() {
    super();
  }

  public override onDeployment(calldata: Calldata): void {
    const name: string = calldata.readStringWithLength();
    const symbol: string = calldata.readStringWithLength();
    const maxSupply: u256 = calldata.readU256();
    const creatorAllocBps: u256 = calldata.readU256();
    const buyTax: u256 = calldata.readU256();
    const sellTax: u256 = calldata.readU256();
    const flywheelDest: u256 = calldata.readU256();
    const gradThreshold: u256 = calldata.readU256();
    const vaultAddr: string = calldata.readStringWithLength();

    // Validate
    if (vaultAddr.length == 0) {
      throw new Revert('Vault address required');
    }
    if (creatorAllocBps > MAX_CREATOR_ALLOCATION_BPS) {
      throw new Revert('Creator allocation exceeds 10%');
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

    // Initialize OP20
    this.instantiate(new OP20InitParameters(finalSupply, 8, name, symbol));

    // Store configuration
    this.creatorAllocationBps.set(creatorAllocBps);
    this.buyTaxBps.set(buyTax);
    this.sellTaxBps.set(sellTax);
    this.flywheelDestination.set(flywheelDest);
    this.graduationThreshold.set(finalThreshold);
    this.minTradeAmount.set(MIN_TRADE_AMOUNT);
    this.vaultAddress.value = vaultAddr;

    // Initialize bonding curve
    this.virtualBtcReserve.set(INITIAL_VIRTUAL_BTC);
    this.virtualTokenSupply.set(INITIAL_VIRTUAL_TOKEN);
    this.kConstant.set(SafeMath.mul(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN));

    // Store deploy block
    this.deployBlock.set(0, Blockchain.block.number);
    this.deployBlock.save();

    // Mint creator allocation if > 0
    const origin = Blockchain.tx.origin;
    if (creatorAllocBps > u256.Zero) {
      const creatorTokens = SafeMath.div(
        SafeMath.mul(finalSupply, creatorAllocBps),
        FEE_DENOMINATOR,
      );
      this._mint(origin, creatorTokens);
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

    // Consume reservation if active (two-transaction model)
    this._consumeReservation(sender, btcAmount);

    // Calculate fees
    const fees = BondingCurve.splitFees(btcAmount);
    const platformFee = fees[0];
    const creatorFee = fees[1];
    const minterFee = fees[2];
    const totalFee = BondingCurve.calculateTotalFee(btcAmount);

    // Calculate flywheel tax
    const flywheelFee = BondingCurve.calculateFee(btcAmount, this.buyTaxBps.value);

    // Net BTC going into the curve
    const netBtc = SafeMath.sub(SafeMath.sub(btcAmount, totalFee), flywheelFee);

    // Prevent buying beyond graduation threshold
    const currentRealBtc = this.realBtcReserve.value;
    const threshold = this.graduationThreshold.value;
    if (SafeMath.add(currentRealBtc, netBtc) > threshold) {
      throw new Revert('Exceeds graduation threshold');
    }

    // Calculate tokens out
    const vBtc = this.virtualBtcReserve.value;
    const vToken = this.virtualTokenSupply.value;
    const k = this.kConstant.value;
    const tokensOut = BondingCurve.calculateBuy(vBtc, vToken, k, netBtc);

    // Update reserves
    this.virtualBtcReserve.set(SafeMath.add(vBtc, netBtc));
    this.virtualTokenSupply.set(SafeMath.sub(vToken, tokensOut));
    this.realBtcReserve.set(SafeMath.add(this.realBtcReserve.value, netBtc));
    this.totalVolumeSats.set(SafeMath.add(this.totalVolumeSats.value, btcAmount));

    // Accumulate fee pools
    this.platformFeePool.set(SafeMath.add(this.platformFeePool.value, platformFee));
    this.creatorFeePool.set(SafeMath.add(this.creatorFeePool.value, creatorFee));
    this.minterFeePool.set(SafeMath.add(this.minterFeePool.value, minterFee));

    // Apply flywheel tax based on destination
    this._applyFlywheel(flywheelFee, sender);

    // Mint tokens to buyer
    this._mint(sender, tokensOut);

    // Track minter eligibility (first ~30 days)
    this._trackMinter(sender, tokensOut);

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
    const minterFee = fees[2];
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
    this.minterFeePool.set(SafeMath.add(this.minterFeePool.value, minterFee));

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

  @method()
  @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
  @emit('FeeClaimed')
  public claimPlatformFees(calldata: Calldata): BytesWriter {
    const sender = Blockchain.tx.sender;

    // Only deployer (platform owner) can claim
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

  @method()
  @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
  @emit('FeeClaimed')
  public claimCreatorFees(calldata: Calldata): BytesWriter {
    const sender = Blockchain.tx.sender;

    // Only deployer can claim — uses built-in OP_NET deployer check
    this.onlyDeployer(sender);

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

  @method()
  @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
  @emit('FeeClaimed')
  public claimMinterReward(calldata: Calldata): BytesWriter {
    const sender = Blockchain.tx.sender;

    // Check eligibility
    const sharesValue = this.minterShares.get(sender);
    if (sharesValue == u256.Zero) {
      throw new Revert('No minter shares');
    }

    // Check hold period
    const buyBlock = this.minterBuyBlock.get(sender);
    const currentBlock = u256.fromU64(Blockchain.block.number);
    if (currentBlock < SafeMath.add(buyBlock, MINTER_HOLD_BLOCKS)) {
      throw new Revert('Hold period not met');
    }

    // Check still holds tokens
    if (this._balanceOf(sender) == u256.Zero) {
      throw new Revert('Must hold tokens');
    }

    // Calculate proportional share
    const totalShares = this.totalMinterShares.value;
    if (totalShares == u256.Zero) {
      throw new Revert('No minter shares in pool');
    }
    const pool = this.minterFeePool.value;
    const amount = SafeMath.div(SafeMath.mul(pool, sharesValue), totalShares);

    // Zero out shares (prevent double claim)
    this.minterShares.set(sender, u256.Zero);
    this.totalMinterShares.set(SafeMath.sub(totalShares, sharesValue));
    this.minterFeePool.set(SafeMath.sub(pool, amount));

    // feeType 1 = minter
    this.emitEvent(new FeeClaimedEvent(sender, amount, u256.One));

    const writer = new BytesWriter(32);
    writer.writeU256(amount);
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
    { name: 'buyTax', type: ABIDataTypes.UINT256 },
    { name: 'sellTax', type: ABIDataTypes.UINT256 },
    { name: 'destination', type: ABIDataTypes.UINT256 },
    { name: 'threshold', type: ABIDataTypes.UINT256 },
  )
  public getConfig(calldata: Calldata): BytesWriter {
    const writer = new BytesWriter(32 * 5);
    writer.writeU256(this.creatorAllocationBps.value);
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
  @method({ name: 'addr', type: ABIDataTypes.ADDRESS })
  @returns(
    { name: 'shares', type: ABIDataTypes.UINT256 },
    { name: 'buyBlock', type: ABIDataTypes.UINT256 },
    { name: 'eligible', type: ABIDataTypes.BOOL },
  )
  public getMinterInfo(calldata: Calldata): BytesWriter {
    const addr = calldata.readAddress();
    const shares = this.minterShares.get(addr);
    const buyBlock = this.minterBuyBlock.get(addr);

    // Check eligibility
    const currentBlock = u256.fromU64(Blockchain.block.number);
    const eligible = shares > u256.Zero &&
      currentBlock >= SafeMath.add(buyBlock, MINTER_HOLD_BLOCKS) &&
      this._balanceOf(addr) > u256.Zero;

    const writer = new BytesWriter(32 + 32 + 1);
    writer.writeU256(shares);
    writer.writeU256(buyBlock);
    writer.writeBoolean(eligible);
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
    let totalToVault: u64 = 0;

    for (let i: i32 = 0; i < txOutputs.length; i++) {
      const output = txOutputs[i];
      if (output.hasTo && output.to == vault) {
        totalToVault += output.value;
      }
    }

    if (totalToVault < requiredSats.toU64()) {
      throw new Revert('Insufficient BTC output to vault');
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

  private _trackMinter(buyer: Address, tokensOut: u256): void {
    const currentBlock = u256.fromU64(Blockchain.block.number);
    const deployBlockU256 = u256.fromU64(this.deployBlock.get(0));
    const windowEnd = SafeMath.add(deployBlockU256, MINTER_WINDOW_BLOCKS);

    if (currentBlock < windowEnd) {
      const existingSharesValue = this.minterShares.get(buyer);

      // Record buy block if first purchase
      if (existingSharesValue == u256.Zero) {
        this.minterBuyBlock.set(buyer, currentBlock);
      }

      // Add shares proportional to tokens purchased
      this.minterShares.set(buyer, SafeMath.add(existingSharesValue, tokensOut));
      this.totalMinterShares.set(SafeMath.add(this.totalMinterShares.value, tokensOut));
    }
  }

  private _checkGraduation(): void {
    const realBtc = this.realBtcReserve.value;
    const threshold = this.graduationThreshold.value;

    if (realBtc >= threshold) {
      this.graduated.value = true;
      this.emitEvent(new GraduationEvent(Blockchain.tx.origin, realBtc));
    }
  }

  private _applyFlywheel(flywheelFee: u256, sender: Address): void {
    if (flywheelFee == u256.Zero) return;

    const dest = this.flywheelDestination.value;

    if (dest == u256.Zero) {
      // Burn destination: sats already deducted from curve input, not redistributed
      return;
    } else if (dest == u256.One) {
      // Community pool — add to minter fee pool
      this.minterFeePool.set(SafeMath.add(this.minterFeePool.value, flywheelFee));
    } else {
      // Creator — add to creator fee pool
      this.creatorFeePool.set(SafeMath.add(this.creatorFeePool.value, flywheelFee));
    }
  }
}
