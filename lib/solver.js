/**
 * solver.js —— 方案求解服务（校验 + CRT + 结果序列化）
 *
 * 对外返回的所有整数均为十进制字符串，天然支持超出
 * Number.MAX_SAFE_INTEGER 的输入与结果。
 */

import { validateScheme } from './validation.js';
import {
  solve,
  positionsWithinCloth,
  suggestOffsetFixes,
  mergeIntervals,
  countPositionsInRange,
  usablePositionsWithinCloth,
} from './crt.js';

const POSITION_LIMIT = 20;

/**
 * 把 suggestOffsetFixes 的 BigInt 结果序列化为十进制字符串。
 * adjustment 为带显式符号的十进制字符串（如 "+30" / "-15"）。
 */
function serializeSuggestions(suggestions, rollers) {
  return suggestions.map((s) => {
    if (!s.fixable) {
      return { roller: s.index + 1, fixable: false };
    }
    return {
      roller: s.index + 1,
      fixable: true,
      perimeter: rollers[s.index].perimeter.toString(),
      currentOffset: rollers[s.index].offset.toString(),
      suggestedOffset: s.newOffset.toString(),
      adjustment: (s.adjustment >= 0n ? '+' : '') + s.adjustment.toString(),
    };
  });
}

/**
 * 求解方案。
 * @returns {{ ok: true, result: object } | { ok: false, status: number, error: string }}
 */
export function solveBody(body) {
  const checked = validateScheme(body);
  if (!checked.ok) {
    return { ok: false, status: 400, error: checked.error };
  }

  const { rollers, clothLength, forbiddenIntervals } = checked.bigints;
  const solved = solve(rollers);

  if (!solved.solvable) {
    const { i, j, gcd, diff } = solved.conflict;
    return {
      ok: true,
      result: {
        solvable: false,
        conflict: {
          rollerA: i + 1,
          rollerB: j + 1,
          perimeterA: body.rollers[i].perimeter.toString().trim(),
          perimeterB: body.rollers[j].perimeter.toString().trim(),
          offsetA: body.rollers[i].offset.toString().trim(),
          offsetB: body.rollers[j].offset.toString().trim(),
          gcd: gcd.toString(),
          offsetDifference: diff.toString(),
          message:
            `色筒 ${i + 1} 与色筒 ${j + 1} 互不相容：` +
            `gcd(${rollers[i].perimeter}, ${rollers[j].perimeter}) = ${gcd} ` +
            `不能整除偏移差（${rollers[i].offset} − ${rollers[j].offset} = ${diff}），` +
            `两者的标记永远无法对齐。`,
        },
        suggestions: serializeSuggestions(suggestOffsetFixes(rollers), rollers),
      },
    };
  }

  const { positions, total } = positionsWithinCloth(
    solved.firstPosition,
    solved.period,
    clothLength,
    POSITION_LIMIT
  );

  // 布面瑕疵避让：先合并重叠/相邻区间，再按区间边界计数扣除落在
  // 区间内的对花点（BigInt 计数，不逐点扫描）。
  const merged = mergeIntervals(forbiddenIntervals);
  let excluded = 0n;
  for (const iv of merged) {
    excluded += countPositionsInRange(
      solved.firstPosition,
      solved.period,
      iv.start,
      iv.end
    );
  }
  const usablePositions = usablePositionsWithinCloth(
    solved.firstPosition,
    solved.period,
    clothLength,
    merged,
    POSITION_LIMIT
  );

  return {
    ok: true,
    result: {
      solvable: true,
      firstPosition: solved.firstPosition.toString(),
      period: solved.period.toString(),
      clothLength: clothLength.toString(),
      withinCloth: {
        total: total.toString(),
        positions: positions.map((p) => p.toString()),
        limit: POSITION_LIMIT,
      },
      avoidance: {
        intervals: merged.map((iv) => ({
          start: iv.start.toString(),
          end: iv.end.toString(),
        })),
        inputCount: forbiddenIntervals.length,
        excluded: excluded.toString(),
        usableTotal: (total - excluded).toString(),
        positions: usablePositions.map((p) => p.toString()),
        limit: POSITION_LIMIT,
      },
    },
  };
}
