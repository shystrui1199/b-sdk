import {
    PoolState,
    CreatePool,
    InitPool,
    Slippage,
    CreatePoolV3WeightedInput,
    InitPoolInputV3,
    InitPoolInput,
    InitPoolDataProvider,
    PoolType,
    TokenType,
    ChainId,
    CHAINS,
} from 'src';
import { startFork, ANVIL_NETWORKS } from 'test/anvil/anvil-global-setup';
import { TOKENS } from 'test/lib/utils/addresses';
import { doCreatePool } from 'test/lib/utils/createPoolHelper';
import { forkSetup } from 'test/lib/utils/helper';
import { doInitPool, assertInitPool } from 'test/lib/utils/initPoolHelper';
import { CreatePoolTxInput, InitPoolTxInput } from 'test/lib/utils/types';
import {
    Address,
    createTestClient,
    http,
    publicActions,
    walletActions,
    parseEther,
    zeroAddress,
    parseUnits,
} from 'viem';

const { rpcUrl } = await startFork(ANVIL_NETWORKS.SEPOLIA);
const chainId = ChainId.SEPOLIA;

describe('Initialize Pool V3 - Weighted Pool', async () => {
    let poolAddress: Address;
    let createWeightedPoolInput: CreatePoolV3WeightedInput;
    let createTxInput: CreatePoolTxInput;
    let initPoolTxInput: InitPoolTxInput;
    let initPoolInput: InitPoolInputV3;
    let poolState: PoolState;
    beforeAll(async () => {
        const client = createTestClient({
            mode: 'anvil',
            chain: CHAINS[chainId],
            transport: http(rpcUrl),
        })
            .extend(publicActions)
            .extend(walletActions);
        const initPoolDataProvider = new InitPoolDataProvider(chainId, rpcUrl);
        const signerAddress = (await client.getAddresses())[0];

        createWeightedPoolInput = {
            poolType: PoolType.Weighted,
            symbol: '50BAL-50WETH',
            tokens: [
                {
                    address: TOKENS[chainId].BAL.address, // BAL
                    weight: parseEther(`${1 / 2}`),
                    rateProvider: zeroAddress,
                    tokenType: TokenType.STANDARD,
                },
                {
                    address: TOKENS[chainId].WETH.address, // WETH
                    weight: parseEther(`${1 / 2}`),
                    rateProvider: zeroAddress,
                    tokenType: TokenType.STANDARD,
                },
            ],
            chainId,
            vaultVersion: 3,
        };

        createTxInput = {
            client,
            createPool: new CreatePool(),
            testAddress: signerAddress,
            createPoolInput: createWeightedPoolInput,
        };

        initPoolInput = {
            amountsIn: [
                {
                    address: createWeightedPoolInput.tokens[0].address,
                    rawAmount: parseEther('100'),
                    decimals: 18,
                },
                {
                    address: createWeightedPoolInput.tokens[1].address,
                    rawAmount: parseEther('100'),
                    decimals: 18,
                },
            ],
            minBptAmountOut: parseEther('90'),
            chainId,
        };
        poolAddress = await doCreatePool(createTxInput);

        initPoolTxInput = {
            client,
            initPool: new InitPool(),
            testAddress: signerAddress,
            initPoolInput: {} as InitPoolInput,
            slippage: Slippage.fromPercentage('0.01'),
            poolState: {} as PoolState,
        };

        poolState = await initPoolDataProvider.getInitPoolData(
            poolAddress,
            PoolType.Weighted,
            3,
        );
        await forkSetup(
            initPoolTxInput.client,
            initPoolTxInput.testAddress,
            [...poolState.tokens.map((t) => t.address)],
            [3, 1],
            [...poolState.tokens.map((t) => parseUnits('100', t.decimals))],
            undefined,
            3,
        );
    }, 10000);
    test('Initialize Pool V3 - Weighted Pool', async () => {
        const addLiquidityOutput = await doInitPool({
            ...initPoolTxInput,
            initPoolInput,
            poolState: poolState,
        });

        assertInitPool(initPoolInput, addLiquidityOutput);
    }, 10000);
});
