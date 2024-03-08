import { encodeFunctionData } from 'viem';
import { Token } from '@/entities/token';
import { TokenAmount } from '@/entities/tokenAmount';
import { VAULT, MAX_UINT256, ZERO_ADDRESS } from '@/utils';
import { vaultV2Abi } from '@/abi';
import {
    AddLiquidityBase,
    AddLiquidityBuildOutput,
    AddLiquidityInput,
    AddLiquidityKind,
    AddLiquidityComposableStableCall,
} from '@/entities/addLiquidity/types';
import {
    AddLiquidityAmounts as AddLiquidityAmountsBase,
    PoolState,
} from '@/entities/types';
import {
    doAddLiquidityQuery,
    getAmounts,
    getSortedTokens,
    parseAddLiquidityArgs,
} from '@/entities/utils';
import { ComposableStableEncoder } from '@/entities/encoders/composableStable';
import { getValue } from '../../helpers';
import { AddLiquidityV2ComposableStableQueryOutput } from './types';

type AddLiquidityAmounts = AddLiquidityAmountsBase & {
    maxAmountsInWithoutBpt: bigint[];
};

export class AddLiquidityComposableStable implements AddLiquidityBase {
    public async query(
        input: AddLiquidityInput,
        poolState: PoolState,
    ): Promise<AddLiquidityV2ComposableStableQueryOutput> {
        const sortedTokens = getSortedTokens(poolState.tokens, input.chainId);
        const bptIndex = sortedTokens.findIndex(
            (t) => t.address === poolState.address,
        );
        const amounts = this.getAmountsQuery(sortedTokens, input, bptIndex);

        const userData = ComposableStableEncoder.encodeAddLiquidityUserData(
            input.kind,
            amounts,
        );

        const { args, tokensIn } = parseAddLiquidityArgs({
            chainId: input.chainId,
            sortedTokens,
            poolId: poolState.id,
            sender: ZERO_ADDRESS,
            recipient: ZERO_ADDRESS,
            maxAmountsIn: amounts.maxAmountsIn,
            userData,
            fromInternalBalance: input.fromInternalBalance ?? false,
        });

        const queryOutput = await doAddLiquidityQuery(
            input.rpcUrl,
            input.chainId,
            args,
        );

        const bpt = new Token(input.chainId, poolState.address, 18);
        const bptOut = TokenAmount.fromRawAmount(bpt, queryOutput.bptOut);

        const amountsIn = queryOutput.amountsIn.map((a, i) =>
            TokenAmount.fromRawAmount(tokensIn[i], a),
        );

        return {
            poolType: poolState.type,
            addLiquidityKind: input.kind,
            poolId: poolState.id,
            bptOut,
            amountsIn,
            tokenInIndex: amounts.tokenInIndex,
            fromInternalBalance: !!input.fromInternalBalance,
            bptIndex,
            vaultVersion: 2,
        };
    }

    public buildCall(
        input: AddLiquidityComposableStableCall,
    ): AddLiquidityBuildOutput {
        const amounts = this.getAmountsCall(input);

        const userData = ComposableStableEncoder.encodeAddLiquidityUserData(
            input.addLiquidityKind,
            amounts,
        );

        const { args } = parseAddLiquidityArgs({
            ...input,
            sortedTokens: input.amountsIn.map((a) => a.token),
            maxAmountsIn: amounts.maxAmountsIn,
            userData,
            fromInternalBalance: input.fromInternalBalance,
            sendNativeAsset: !!input.sendNativeAsset,
        });

        const call = encodeFunctionData({
            abi: vaultV2Abi,
            functionName: 'joinPool',
            args,
        });

        return {
            call,
            to: VAULT[input.chainId],
            value: getValue(input),
            minBptOut: TokenAmount.fromRawAmount(
                input.bptOut.token,
                amounts.minimumBpt,
            ),
            maxAmountsIn: input.amountsIn.map((a, i) =>
                TokenAmount.fromRawAmount(a.token, amounts.maxAmountsIn[i]),
            ),
        };
    }

    private getAmountsQuery(
        poolTokens: Token[],
        input: AddLiquidityInput,
        bptIndex: number,
    ): AddLiquidityAmounts {
        let addLiquidityAmounts: AddLiquidityAmountsBase;
        switch (input.kind) {
            case AddLiquidityKind.Unbalanced: {
                addLiquidityAmounts = {
                    minimumBpt: 0n,
                    maxAmountsIn: getAmounts(
                        poolTokens,
                        input.amountsIn,
                        BigInt(0),
                    ),
                    tokenInIndex: undefined,
                };
                break;
            }
            case AddLiquidityKind.SingleToken: {
                const tokenInIndex = poolTokens
                    .filter((_, index) => index !== bptIndex) // Need to remove Bpt
                    .findIndex((t) => t.isSameAddress(input.tokenIn));
                if (tokenInIndex === -1)
                    throw Error("Can't find index of SingleToken");
                const maxAmountsIn = Array(poolTokens.length).fill(0n);
                maxAmountsIn[tokenInIndex] = MAX_UINT256;
                addLiquidityAmounts = {
                    minimumBpt: input.bptOut.rawAmount,
                    maxAmountsIn,
                    tokenInIndex,
                };
                break;
            }
            case AddLiquidityKind.Proportional: {
                addLiquidityAmounts = {
                    minimumBpt: input.bptOut.rawAmount,
                    maxAmountsIn: Array(poolTokens.length).fill(MAX_UINT256),
                    tokenInIndex: undefined,
                };
                break;
            }
        }

        return {
            ...addLiquidityAmounts,
            maxAmountsInWithoutBpt: [
                ...addLiquidityAmounts.maxAmountsIn.slice(0, bptIndex),
                ...addLiquidityAmounts.maxAmountsIn.slice(bptIndex + 1),
            ],
        };
    }

    private getAmountsCall(
        input: AddLiquidityComposableStableCall,
    ): AddLiquidityAmounts {
        let addLiquidityAmounts: AddLiquidityAmountsBase;
        switch (input.addLiquidityKind) {
            case AddLiquidityKind.Unbalanced: {
                const minimumBpt = input.slippage.applyTo(
                    input.bptOut.amount,
                    -1,
                );
                addLiquidityAmounts = {
                    minimumBpt,
                    maxAmountsIn: input.amountsIn.map((a) => a.amount),
                    tokenInIndex: input.tokenInIndex,
                };
                break;
            }
            case AddLiquidityKind.SingleToken:
            case AddLiquidityKind.Proportional: {
                addLiquidityAmounts = {
                    minimumBpt: input.bptOut.amount,
                    maxAmountsIn: input.amountsIn.map((a) =>
                        input.slippage.applyTo(a.amount),
                    ),
                    tokenInIndex: input.tokenInIndex,
                };
                break;
            }
        }
        return {
            ...addLiquidityAmounts,
            maxAmountsInWithoutBpt: [
                ...addLiquidityAmounts.maxAmountsIn.slice(0, input.bptIndex),
                ...addLiquidityAmounts.maxAmountsIn.slice(input.bptIndex + 1),
            ],
        };
    }
}
