import { u256 } from '@btc-vision/as-bignum/assembly';
import { Address, BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';

export class BuyEvent extends NetEvent {
  constructor(buyer: Address, btcIn: u256, tokensOut: u256, newPrice: u256) {
    // Size: 1 address (32 bytes) + 3 u256 values (32 bytes each) = 128 bytes
    const data = new BytesWriter(32 + 32 + 32 + 32);
    data.writeAddress(buyer);
    data.writeU256(btcIn);
    data.writeU256(tokensOut);
    data.writeU256(newPrice);
    super('Buy', data);
  }
}

export class SellEvent extends NetEvent {
  constructor(seller: Address, tokensIn: u256, btcOut: u256, newPrice: u256) {
    // Size: 1 address (32 bytes) + 3 u256 values (32 bytes each) = 128 bytes
    const data = new BytesWriter(32 + 32 + 32 + 32);
    data.writeAddress(seller);
    data.writeU256(tokensIn);
    data.writeU256(btcOut);
    data.writeU256(newPrice);
    super('Sell', data);
  }
}

export class GraduationEvent extends NetEvent {
  constructor(triggerer: Address, finalBtcReserve: u256) {
    // Size: 1 address (32 bytes) + 1 u256 value (32 bytes) = 64 bytes
    const data = new BytesWriter(32 + 32);
    data.writeAddress(triggerer);
    data.writeU256(finalBtcReserve);
    super('Graduation', data);
  }
}

export class ReservationEvent extends NetEvent {
  constructor(user: Address, amount: u256, expiryBlock: u256) {
    // Size: 1 address (32 bytes) + 2 u256 values (32 bytes each) = 96 bytes
    const data = new BytesWriter(32 + 32 + 32);
    data.writeAddress(user);
    data.writeU256(amount);
    data.writeU256(expiryBlock);
    super('Reservation', data);
  }
}

export class FeeClaimedEvent extends NetEvent {
  constructor(claimer: Address, amount: u256, feeType: u256) {
    // Size: 1 address (32 bytes) + 2 u256 values (32 bytes each) = 96 bytes
    const data = new BytesWriter(32 + 32 + 32);
    data.writeAddress(claimer);
    data.writeU256(amount);
    data.writeU256(feeType);
    super('FeeClaimed', data);
  }
}

export class MigrationEvent extends NetEvent {
  constructor(recipient: Address, tokenAmount: u256, btcReserve: u256) {
    // Size: 1 address (32 bytes) + 2 u256 values (32 bytes each) = 96 bytes
    const data = new BytesWriter(32 + 32 + 32);
    data.writeAddress(recipient);
    data.writeU256(tokenAmount);
    data.writeU256(btcReserve);
    super('Migration', data);
  }
}

export class TokenRegisteredEvent extends NetEvent {
  constructor(creator: Address, tokenIndex: u256) {
    // Size: 1 address (32 bytes) + 1 u256 value (32 bytes) = 64 bytes
    const data = new BytesWriter(32 + 32);
    data.writeAddress(creator);
    data.writeU256(tokenIndex);
    super('TokenRegistered', data);
  }
}
