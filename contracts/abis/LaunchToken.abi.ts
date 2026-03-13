import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const LaunchTokenEvents = [
    {
        name: 'Buy',
        values: [
            { name: 'buyer', type: ABIDataTypes.ADDRESS },
            { name: 'btcIn', type: ABIDataTypes.UINT256 },
            { name: 'tokensOut', type: ABIDataTypes.UINT256 },
            { name: 'newPrice', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'Sell',
        values: [
            { name: 'seller', type: ABIDataTypes.ADDRESS },
            { name: 'tokensIn', type: ABIDataTypes.UINT256 },
            { name: 'btcOut', type: ABIDataTypes.UINT256 },
            { name: 'newPrice', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'Reservation',
        values: [
            { name: 'user', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'FeeClaimed',
        values: [
            { name: 'claimer', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'feeType', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'Migration',
        values: [
            { name: 'recipient', type: ABIDataTypes.ADDRESS },
            { name: 'tokenAmount', type: ABIDataTypes.UINT256 },
            { name: 'btcReserve', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
];

export const LaunchTokenAbi = [
    {
        name: 'buy',
        payable: true,
        inputs: [{ name: 'btcAmount', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'tokensOut', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'sell',
        inputs: [{ name: 'tokenAmount', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'btcOut', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'reserve',
        payable: true,
        inputs: [{ name: 'btcAmount', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'expiryBlock', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'cancelReservation',
        inputs: [],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'claimPlatformFees',
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'claimCreatorFees',
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'claimMinterReward',
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'migrate',
        inputs: [{ name: 'recipient', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'tokenAmount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'isMigrated',
        constant: true,
        inputs: [],
        outputs: [{ name: 'isMigrated', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getReserves',
        constant: true,
        inputs: [],
        outputs: [
            { name: 'virtualBtc', type: ABIDataTypes.UINT256 },
            { name: 'virtualToken', type: ABIDataTypes.UINT256 },
            { name: 'realBtc', type: ABIDataTypes.UINT256 },
            { name: 'k', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPrice',
        constant: true,
        inputs: [],
        outputs: [{ name: 'priceSatsPerToken', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getConfig',
        constant: true,
        inputs: [],
        outputs: [
            { name: 'creatorBps', type: ABIDataTypes.UINT256 },
            { name: 'buyTax', type: ABIDataTypes.UINT256 },
            { name: 'sellTax', type: ABIDataTypes.UINT256 },
            { name: 'destination', type: ABIDataTypes.UINT256 },
            { name: 'threshold', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'isGraduated',
        constant: true,
        inputs: [],
        outputs: [{ name: 'isGraduated', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getMinterInfo',
        constant: true,
        inputs: [{ name: 'addr', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'shares', type: ABIDataTypes.UINT256 },
            { name: 'buyBlock', type: ABIDataTypes.UINT256 },
            { name: 'eligible', type: ABIDataTypes.BOOL },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getFeePools',
        constant: true,
        inputs: [],
        outputs: [
            { name: 'platformFees', type: ABIDataTypes.UINT256 },
            { name: 'creatorFees', type: ABIDataTypes.UINT256 },
            { name: 'minterFees', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getReservation',
        constant: true,
        inputs: [{ name: 'addr', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    ...LaunchTokenEvents,
    ...OP_NET_ABI,
];

export default LaunchTokenAbi;
