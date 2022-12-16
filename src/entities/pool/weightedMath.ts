import { MathSol, BONE } from '../../utils/math';

export function _calcOutGivenIn(
  balanceIn: bigint,
  weightIn: bigint,
  balanceOut: bigint,
  weightOut: bigint,
  amountIn: bigint,
): bigint {
  const denominator = balanceIn + amountIn;
  const base = MathSol.divUpFixed(balanceIn, denominator);
  const exponent = MathSol.divDownFixed(weightIn, weightOut);
  const power = MathSol.powUpFixed(base, exponent);
  return MathSol.mulDownFixed(balanceOut, MathSol.complementFixed(power));
}

export function _calcInGivenOut(
  balanceIn: bigint,
  weightIn: bigint,
  balanceOut: bigint,
  weightOut: bigint,
  amountOut: bigint
): bigint {
  const base = MathSol.divUpFixed(balanceOut, balanceOut - amountOut);
  const exponent = MathSol.divUpFixed(weightOut, weightIn);
  const power = MathSol.powUpFixed(base, exponent);
  const ratio = power - BONE;
  return MathSol.mulUpFixed(balanceIn, ratio);
}
