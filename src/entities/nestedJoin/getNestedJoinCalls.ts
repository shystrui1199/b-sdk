import { Token } from '../token';
import { getPoolAddress } from '../../utils';
import { NestedJoinInput, NestedJoinCall } from './types';
import { NestedPoolState } from '../types';

export const getNestedJoinCalls = (
    {
        amountsIn,
        chainId,
        accountAddress,
        useNativeAssetAsWrappedAmountIn,
        fromInternalBalance,
    }: NestedJoinInput,
    { pools }: NestedPoolState,
): NestedJoinCall[] => {
    /**
     * Overall logic to build sequence of join calls:
     * 1. Go from bottom pool to up filling out input amounts and output refs
     * 2. Inputs will be amountsIn provided, output of the previous level or 0n
     * 3. Output at max level is the bptOut
     */

    const poolsSortedByLevel = pools.sort((a, b) => a.level - b.level);

    const calls: NestedJoinCall[] = [];
    for (const pool of poolsSortedByLevel) {
        const sortedTokens = pool.tokens
            .sort((a, b) => a.index - b.index)
            .map((t) => new Token(chainId, t.address, t.decimals));
        calls.push({
            chainId: chainId,
            useNativeAssetAsWrappedAmountIn:
                useNativeAssetAsWrappedAmountIn ?? false,
            sortedTokens,
            poolId: pool.id,
            poolType: pool.type,
            kind: 0,
            sender: accountAddress,
            recipient: accountAddress,
            maxAmountsIn: sortedTokens.map((token) => {
                const amountIn = amountsIn.find((a) =>
                    token.isSameAddress(a.address),
                );
                const lowerLevelCall = calls.find(
                    (call) => getPoolAddress(call.poolId) === token.address,
                );
                if (amountIn) {
                    return {
                        amount: amountIn.rawAmount,
                        isRef: false,
                    };
                } else if (lowerLevelCall !== undefined) {
                    return {
                        amount: lowerLevelCall.outputReferenceKey,
                        isRef: true,
                    };
                } else {
                    return {
                        amount: 0n,
                        isRef: false,
                    };
                }
            }),
            minBptOut: 0n,
            fromInternalBalance: fromInternalBalance ?? false,
            outputReferenceKey: BigInt(poolsSortedByLevel.indexOf(pool)) + 100n,
        });
    }
    return calls;
};
