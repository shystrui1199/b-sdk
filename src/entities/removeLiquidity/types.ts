import { TokenAmount } from '../tokenAmount';
import { Slippage } from '../slippage';
import { Address, InputAmount } from '../../types';
import { PoolState } from '../types';

export enum RemoveLiquidityKind {
    Unbalanced = 'Unbalanced', // exact out
    SingleTokenExactOut = 'SingleTokenExactOut', // exact out (single token out)
    SingleTokenExactIn = 'SingleTokenExactIn', // exact in (single token out)
    Proportional = 'Proportional', // exact in (all tokens out)
    Recovery = 'Recovery', // exact in (all tokens out) - Pool in recovery mode
}

// This will be extended for each pools specific output requirements
export type RemoveLiquidityBaseInput = {
    chainId: number;
    rpcUrl: string;
    toInternalBalance?: boolean;
};

export type RemoveLiquidityUnbalancedInput = RemoveLiquidityBaseInput & {
    amountsOut: InputAmount[];
    kind: RemoveLiquidityKind.Unbalanced;
};

export type RemoveLiquiditySingleTokenExactOutInput =
    RemoveLiquidityBaseInput & {
        amountOut: InputAmount;
        kind: RemoveLiquidityKind.SingleTokenExactOut;
    };

export type RemoveLiquiditySingleTokenExactInInput =
    RemoveLiquidityBaseInput & {
        bptIn: InputAmount;
        tokenOut: Address;
        kind: RemoveLiquidityKind.SingleTokenExactIn;
    };

export type RemoveLiquidityProportionalInput = RemoveLiquidityBaseInput & {
    bptIn: InputAmount;
    kind: RemoveLiquidityKind.Proportional;
};

export type RemoveLiquidityRecoveryInput = RemoveLiquidityBaseInput & {
    bptIn: InputAmount;
    kind: RemoveLiquidityKind.Recovery;
};

export type RemoveLiquidityInput =
    | RemoveLiquidityUnbalancedInput
    | RemoveLiquiditySingleTokenExactOutInput
    | RemoveLiquiditySingleTokenExactInInput
    | RemoveLiquidityProportionalInput
    | RemoveLiquidityRecoveryInput;

// Returned from a remove liquidity query
export type RemoveLiquidityBaseQueryOutput = {
    poolType: string;
    poolId: Address;
    removeLiquidityKind: RemoveLiquidityKind;
    bptIn: TokenAmount;
    amountsOut: TokenAmount[];
    tokenOutIndex?: number;
    toInternalBalance: boolean;
    vaultVersion: 2 | 3;
    chainId: number;
};

export type RemoveLiquidityComposableStableQueryOutput =
    RemoveLiquidityBaseQueryOutput & {
        bptIndex: number;
    };
export type RemoveLiquidityWeightedQueryOutput = RemoveLiquidityBaseQueryOutput;

export type RemoveLiquidityQueryOutput =
    | RemoveLiquidityBaseQueryOutput
    | RemoveLiquidityComposableStableQueryOutput
    | RemoveLiquidityWeightedQueryOutput;

export type RemoveLiquidityBaseCall = {
    slippage: Slippage;
    chainId: number;
    wethIsEth?: boolean;
} & RemoveLiquidityBaseQueryOutput;

export type RemoveLiquidityBaseCallV2 = RemoveLiquidityBaseCall & {
    sender: Address;
    recipient: Address;
};

export type RemoveLiquidityComposableStableCall = RemoveLiquidityBaseCallV2 &
    RemoveLiquidityComposableStableQueryOutput;
export type RemoveLiquidityWeightedCall = RemoveLiquidityBaseCallV2;

export type RemoveLiquidityCall =
    | RemoveLiquidityBaseCall
    | RemoveLiquidityComposableStableCall
    | RemoveLiquidityWeightedCall;

export type RemoveLiquidityBuildOutput = {
    call: Address;
    to: Address;
    value: bigint;
    maxBptIn: TokenAmount;
    minAmountsOut: TokenAmount[];
};

export interface RemoveLiquidityBase {
    query(
        input: RemoveLiquidityInput,
        poolState: PoolState,
    ): Promise<RemoveLiquidityQueryOutput>;
    buildCall(input: RemoveLiquidityCall): RemoveLiquidityBuildOutput;
}

export type RemoveLiquidityConfig = {
    customRemoveLiquidityTypes: Record<string, RemoveLiquidityBase>;
};

export type ExitPoolRequest = {
    assets: Address[];
    minAmountsOut: bigint[];
    userData: Address;
    toInternalBalance: boolean;
};
