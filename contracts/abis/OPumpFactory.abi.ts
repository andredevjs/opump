import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const OPumpFactoryEvents = [
    {
        name: 'TokenRegistered',
        values: [
            { name: 'creator', type: ABIDataTypes.ADDRESS },
            { name: 'tokenIndex', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Event,
    },
];

export const OPumpFactoryAbi = [
    {
        name: 'registerToken',
        inputs: [
            { name: 'name', type: ABIDataTypes.STRING },
            { name: 'symbol', type: ABIDataTypes.STRING },
            { name: 'creatorAllocationBps', type: ABIDataTypes.UINT256 },
            { name: 'airdropBps', type: ABIDataTypes.UINT256 },
            { name: 'buyTaxBps', type: ABIDataTypes.UINT256 },
            { name: 'sellTaxBps', type: ABIDataTypes.UINT256 },
            { name: 'flywheelDestination', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'tokenIndex', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getTokenCount',
        constant: true,
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getTokenAtIndex',
        constant: true,
        inputs: [{ name: 'index', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'tokenCreator', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getTokensByCreator',
        constant: true,
        inputs: [{ name: 'creator', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getStats',
        constant: true,
        inputs: [],
        outputs: [
            { name: 'totalTokens', type: ABIDataTypes.UINT256 },
            { name: 'totalGraduated', type: ABIDataTypes.UINT256 },
            { name: 'totalVolume', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    ...OPumpFactoryEvents,
    ...OP_NET_ABI,
];

export default OPumpFactoryAbi;
