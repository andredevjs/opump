import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const TestMinimalEvents = [];

export const TestMinimalAbi = [
    {
        name: 'getTest',
        constant: true,
        inputs: [],
        outputs: [{ name: 'result', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...TestMinimalEvents,
    ...OP_NET_ABI,
];

export default TestMinimalAbi;
