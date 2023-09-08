import { createPublicClient, encodeFunctionData, http } from 'viem';
import { Token, TokenAmount, WeightedEncoder } from '../../..';
import { Address } from '../../../types';
import {
    BALANCER_HELPERS,
    BALANCER_VAULT,
    CHAINS,
    NATIVE_ASSETS,
    ZERO_ADDRESS,
} from '../../../utils';
import { balancerHelpersAbi, vaultAbi } from '../../../abi';
import {
    checkInputs,
    getAmountsIn,
    getJoinParameters,
    getUserData,
} from './helpers';
import {
    BaseJoin,
    JoinCallInput,
    JoinInput,
    JoinKind,
    JoinQueryResult,
    PoolState,
} from '..';

export class WeightedJoin implements BaseJoin {
    // TODO - Probably not needed
    getInstance(): WeightedJoin {
        return new WeightedJoin();
    }

    public async query(
        input: JoinInput,
        poolState: PoolState,
    ): Promise<JoinQueryResult> {
        // TODO - This would need extended to work with relayer

        checkInputs(input, poolState);

        const maxAmountsIn = getAmountsIn(input, poolState.tokens);
        const userData = getUserData(input, maxAmountsIn);

        // replace wrapped token with native asset if needed
        const tokensIn = poolState.tokens.map((token) => {
            if (
                input.joinWithNativeAsset &&
                token.isUnderlyingEqual(NATIVE_ASSETS[input.chainId])
            ) {
                return new Token(input.chainId, ZERO_ADDRESS, 18);
            } else {
                return token;
            }
        });

        const queryArgs = getJoinParameters({
            poolId: poolState.id,
            assets: tokensIn.map((t) => t.address),
            sender: ZERO_ADDRESS,
            recipient: ZERO_ADDRESS,
            maxAmountsIn,
            userData,
        });

        const client = createPublicClient({
            transport: http(input.rpcUrl),
            chain: CHAINS[input.chainId],
        });

        const {
            result: [queryBptOut, queryAmountsIn],
        } = await client.simulateContract({
            address: BALANCER_HELPERS[input.chainId],
            abi: balancerHelpersAbi,
            functionName: 'queryJoin',
            args: queryArgs,
        });

        const bpt = new Token(input.chainId, poolState.address, 18);
        const bptOut = TokenAmount.fromRawAmount(bpt, queryBptOut);

        const amountsIn = queryAmountsIn.map((a, i) =>
            TokenAmount.fromRawAmount(tokensIn[i], a),
        );

        return {
            joinKind: input.kind,
            id: poolState.id,
            bptOut,
            amountsIn,
        };
    }

    public buildCall(input: JoinCallInput): {
        call: Address;
        to: Address;
        value: bigint | undefined;
        minBptOut: bigint;
    } {
        let maxAmountsIn: bigint[];
        let userData: Address;
        let minBptOut = input.bptOut.amount;

        switch (input.joinKind) {
            case JoinKind.Init: {
                maxAmountsIn = input.amountsIn.map((a) => a.amount);
                userData = WeightedEncoder.joinInit(maxAmountsIn);
                break;
            }
            case JoinKind.Proportional:
            case JoinKind.Unbalanced:
            case JoinKind.SingleAsset: {
                maxAmountsIn = input.amountsIn.map((a) => a.amount);
                minBptOut = input.slippage.removeFrom(input.bptOut.amount);
                userData = WeightedEncoder.joinGivenIn(maxAmountsIn, minBptOut);
                break;
            }
            case JoinKind.ExactOut: {
                maxAmountsIn = input.amountsIn.map((a) =>
                    input.slippage.applyTo(a.amount),
                );
                userData = WeightedEncoder.joinGivenOut(input.bptOut.amount);
                break;
            }
            default:
                throw new Error('Invalid join kind');
        }

        const queryArgs = getJoinParameters({
            poolId: input.id,
            assets: input.amountsIn.map((a) => a.token.address),
            sender: input.sender,
            recipient: input.recipient,
            maxAmountsIn,
            userData,
        });

        const call = encodeFunctionData({
            abi: vaultAbi,
            functionName: 'joinPool',
            args: queryArgs,
        });

        const value = input.amountsIn.find(
            (a) => a.token.address === ZERO_ADDRESS,
        )?.amount;

        // Encode data
        return {
            call,
            to: BALANCER_VAULT,
            value,
            minBptOut,
        };
    }
}
