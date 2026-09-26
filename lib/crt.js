/**
 * crt.js —— 多色滚筒套准（广义中国剩余定理 / 同余合并）
 *
 * 模型：色筒 i 的重复周长为 p_i，标记偏移为 a_i（0 ≤ a_i < p_i）。
 * 标记在布面上出现的位置 x 满足：
 *
 *     x ≡ a_i (mod p_i)
 *
 * 全部色筒同时对花 ⇔ 该同余方程组有解。
 *
 * 有解时：
 *   - firstPosition 为布头 0 mm 起的最小非负解；
 *   - period 为共同重复周期，即所有周长的最小公倍数 LCM(p_1,…,p_n)；
 *   - 之后所有对花位置为 firstPosition + k·period（k 为非负整数）。
 *
 * 无解时，至少存在一对色筒 i,j 互不相容：
 *   gcd(p_i, p_j) 不能整除 (a_i − a_j)，接口返回这样的一对作为证据。
 *
 * 全部计算使用 BigInt，整数位数不受 JavaScript Number 安全整数范围限制。
 */

/** 非负取模（BigInt）。 */
export function bigMod(a, m) {
  return ((a % m) + m) % m;
}

/** 最大公约数（BigInt，结果非负）。 */
export function bigGcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** 最小公倍数（BigInt，入参均为正）。 */
export function bigLcm(a, b) {
  return (a / bigGcd(a, b)) * b;
}

/**
 * 扩展欧几里得：求 (g, x, y) 使 a·x + b·y = g = gcd(a,b)。
 */
function extendedGcd(a, b) {
  if (b === 0n) {
    return { g: a < 0n ? -a : a, x: a < 0n ? -1n : 1n, y: 0n };
  }
  const { g, x, y } = extendedGcd(b, a % b);
  return { g, x: y, y: x - (a / b) * y };
}

/**
 * 判定同余组 a（模 m）与 b（模 n）是否相容。
 * 相容条件：gcd(m, n) 整除 (a − b)。
 */
export function isCompatible(a, m, b, n) {
  const g = bigGcd(m, n);
  return bigMod(a - b, g) === 0n;
}

/**
 * 合并两条同余：x ≡ a1 (mod m1) 与 x ≡ a2 (mod m2)。
 * 调用前必须保证二者相容（isCompatible）。
 *
 * 合并结果：x ≡ r (mod lcm(m1,m2))，r 取最小非负代表元。
 */
export function mergeCongruence(a1, m1, a2, m2) {
  const g = bigGcd(m1, m2);
  const m = bigLcm(m1, m2);

  // 解 k：m1·k ≡ (a2 − a1) (mod m2)
  // 令 M1 = m1/g，M2 = m2/g，diff = (a2-a1)/g
  // M1·k ≡ diff (mod M2)，gcd(M1, M2) = 1，可求逆元。
  const M1 = m1 / g;
  const M2 = m2 / g;
  const diff = ((a2 - a1) / g) % (M2 === 0n ? 1n : M2);

  let k;
  if (M2 === 1n) {
    k = 0n;
  } else {
    const { x } = extendedGcd(M1 % M2, M2);
    k = bigMod(diff * x, M2);
  }

  const r = bigMod(a1 + m1 * k, m);
  return { a: r, m };
}

/**
 * 求解一个套准方案。
 *
 * @param {Array<{perimeter: bigint, offset: bigint}>} rollers 2～8 个色筒
 * @returns 结果对象（字段均为 bigint / 索引 / 数组）：
 *   {
 *     solvable: true,
 *     firstPosition: bigint,         // 布头起首次对花位置（mm）
 *     period: bigint,                // 共同重复周期（mm）
 *   }
 *   或
 *   {
 *     solvable: false,
 *     conflict: { i, j, gcd, diff }  // 一对互不相容的色筒（0 基索引）
 *   }
 */
export function solve(rollers) {
  // 第一步：两两扫描，找出一对互不相容的色筒（天然满足“指出一对”）。
  for (let i = 0; i < rollers.length; i++) {
    for (let j = i + 1; j < rollers.length; j++) {
      const ri = rollers[i];
      const rj = rollers[j];
      if (!isCompatible(ri.offset, ri.perimeter, rj.offset, rj.perimeter)) {
        return {
          solvable: false,
          conflict: {
            i,
            j,
            gcd: bigGcd(ri.perimeter, rj.perimeter),
            diff: ri.offset - rj.offset,
          },
        };
      }
    }
  }

  // 第二步：依次合并全部同余。
  let acc = { a: rollers[0].offset, m: rollers[0].perimeter };
  for (let k = 1; k < rollers.length; k++) {
    acc = mergeCongruence(
      acc.a,
      acc.m,
      rollers[k].offset,
      rollers[k].perimeter
    );
  }

  return { solvable: true, firstPosition: acc.a, period: acc.m };
}

/**
 * 为无解方案生成“单色筒偏移修正”建议。
 *
 * 依次尝试只修改色筒 k 的偏移（其余色筒保持不动）：
 *
 *   1. 若其余 n−1 个色筒的同余组自身无解，则色筒 k 记为“不可单独修复”；
 *   2. 否则其余色筒的解集为 x ≡ A (mod M)（M 为其余周长的 LCM），
 *      新偏移 a′ 只需满足 a′ ≡ A (mod g)，g = gcd(p_k, M)，
 *      即可与合并式相容，从而全组有解（g 整除每个 gcd(p_k, p_j)，
 *      故与合并式相容 ⟹ 与每个色筒两两相容）。
 *
 * 调整量 d = a′ − a_k 满足 d ≡ A − a_k (mod g)，候选 d 构成公差为 g
 * 的等差类。该类在 (−g/2, g/2] 内的代表元即环形最短位移：任意候选 w
 * 折回环上后的位移绝对值 |fold(w)| = dist(w, p_k·Z) ≥ dist(w, g·Z)，
 * 下界正好由该代表元取得；等距（2·|d| = g）时取正值，即“偏移增大”方向。
 * 该代表元直接由取模得到，无需枚举候选（候选数量 p_k/g 可能是天文数字）。
 *
 * @param {Array<{perimeter: bigint, offset: bigint}>} rollers 2～8 个色筒
 * @returns {Array<object>} 每项形如：
 *   { index, fixable: true,  newOffset: bigint, adjustment: bigint }  // 可单独修复
 *   { index, fixable: false }                                          // 不可单独修复
 *   可修复项在前，按 |adjustment| 升序、再按色筒序号升序；
 *   不可修复项列于其后，按色筒序号升序。
 */
export function suggestOffsetFixes(rollers) {
  const fixable = [];
  const unfixable = [];

  for (let k = 0; k < rollers.length; k++) {
    const others = rollers.filter((_, idx) => idx !== k);
    const rest = solve(others);
    if (!rest.solvable) {
      unfixable.push({ index: k, fixable: false });
      continue;
    }

    const p = rollers[k].perimeter;
    const a = rollers[k].offset;
    const g = bigGcd(p, rest.period);
    // um ∈ [0, g) 为 d 模 g 的最小非负代表；折到 (−g/2, g/2]（等距取正）。
    const um = bigMod(rest.firstPosition - a, g);
    const d = um * 2n <= g ? um : um - g;

    fixable.push({
      index: k,
      fixable: true,
      newOffset: bigMod(a + d, p),
      adjustment: d,
    });
  }

  fixable.sort((x, y) => {
    const ax = x.adjustment < 0n ? -x.adjustment : x.adjustment;
    const ay = y.adjustment < 0n ? -y.adjustment : y.adjustment;
    if (ax !== ay) return ax < ay ? -1 : 1;
    return x.index - y.index;
  });

  return [...fixable, ...unfixable];
}

/**
 * 列出不超过布长的最早若干个对花位置（含 0 mm 与布长端点）。
 *
 * @param {bigint} firstPosition 首次对花位置
 * @param {bigint} period        共同重复周期
 * @param {bigint} clothLength   布长（mm，非负）
 * @param {number} limit         最多返回个数（默认 20）
 * @returns {{ positions: bigint[], total: bigint }}
 *   positions 为最早的 limit 个（不足则全部）；total 为布长内总个数。
 */
export function positionsWithinCloth(firstPosition, period, clothLength, limit = 20) {
  const positions = [];
  if (firstPosition <= clothLength) {
    // x_k = first + k·period ≤ clothLength
    // total = floor((clothLength − first)/period) + 1
    const total = (clothLength - firstPosition) / period + 1n;
    let x = firstPosition;
    for (let k = 0; k < limit && x <= clothLength; k++) {
      positions.push(x);
      x += period;
    }
    return { positions, total };
  }
  return { positions, total: 0n };
}

/* --------------------------------------------------------------------
 * 布面瑕疵避让（禁印区间）
 *
 * 禁印区间为闭区间 [start, end]（端点也不可印花），位置一律为整数毫米。
 * 对花序列 x = first + k·period（k = 0,1,2,…）中落在任一区间内的点
 * 视为不可用。以下函数全部基于 BigInt 按周期与区间边界做 O(区间数)
 * 的计数/跳转，不按布长或对花点总数逐点扫描。
 * ------------------------------------------------------------------ */

/**
 * 合并重叠或相邻的禁印区间。
 *
 * 相邻指两区间之间没有空闲整数位置：下一区间起点 ≤ 当前终点 + 1
 * （如 [2,5] 与 [6,9] 合并为 [2,9]）。
 *
 * @param {Array<{start: bigint, end: bigint}>} intervals 输入区间（可乱序、可重叠）
 * @returns {Array<{start: bigint, end: bigint}>}
 *   按起点升序、两两不相交也不相邻的合并结果（不修改入参）。
 */
export function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((u, v) =>
    u.start < v.start ? -1 : u.start > v.start ? 1 : u.end < v.end ? -1 : u.end > v.end ? 1 : 0
  );
  const merged = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end + 1n) {
      if (iv.end > last.end) last.end = iv.end;
    } else {
      merged.push({ start: iv.start, end: iv.end });
    }
  }
  return merged;
}

/**
 * 统计对花序列 x = first + k·period（k ≥ 0）落在闭区间 [lo, hi] 内的项数。
 * 只计算首末项下标（ceil/floor 除法），不逐项枚举。
 *
 * @param {bigint} firstPosition 首次对花位置
 * @param {bigint} period        共同重复周期（正数）
 * @param {bigint} lo            区间起点（含）
 * @param {bigint} hi            区间终点（含）
 * @returns {bigint} 落在区间内的对花点数
 */
export function countPositionsInRange(firstPosition, period, lo, hi) {
  if (hi < lo || hi < firstPosition) return 0n;
  const start = lo > firstPosition ? lo : firstPosition;
  // kLo = ceil((start − first)/period)，kHi = floor((hi − first)/period)
  const kLo = (start - firstPosition + period - 1n) / period;
  const kHi = (hi - firstPosition) / period;
  if (kLo > kHi) return 0n;
  return kHi - kLo + 1n;
}

/**
 * 扣除禁印区间后，列出布长内最早若干个可用对花位置。
 *
 * 按下标 k 在“可用段”（相邻合并区间之间的空隙）内顺序取点，
 * 每取满 limit 个即返回；越过禁印区间时直接用除法跳到区间后的
 * 第一个对花点，不逐点扫描。
 *
 * @param {bigint} firstPosition   首次对花位置
 * @param {bigint} period          共同重复周期
 * @param {bigint} clothLength     布长（mm，非负）
 * @param {Array<{start: bigint, end: bigint}>} mergedIntervals
 *   已经 mergeIntervals 合并（升序、互不重叠且不相邻）的禁印区间，
 *   且满足 0 ≤ start ≤ end ≤ clothLength
 * @param {number} limit           最多返回个数（默认 20）
 * @returns {bigint[]} 最早的 limit 个可用位置（升序）
 */
export function usablePositionsWithinCloth(
  firstPosition,
  period,
  clothLength,
  mergedIntervals,
  limit = 20
) {
  const positions = [];
  if (firstPosition > clothLength) return positions;
  // 布长内最大下标：kMax = floor((clothLength − first)/period)
  const kMax = (clothLength - firstPosition) / period;
  let k = 0n;

  for (const iv of mergedIntervals) {
    // 区间起点之前的可用段：[.., iv.start − 1]
    const segEnd = iv.start - 1n;
    if (segEnd >= firstPosition) {
      let kEnd = (segEnd - firstPosition) / period;
      if (kEnd > kMax) kEnd = kMax;
      while (k <= kEnd && positions.length < limit) {
        positions.push(firstPosition + k * period);
        k += 1n;
      }
      if (positions.length >= limit) return positions;
    }
    // 跳过禁印区间：推进到第一个满足 x > iv.end 的下标
    if (iv.end >= firstPosition) {
      const kSkip = (iv.end - firstPosition) / period + 1n;
      if (kSkip > k) k = kSkip;
      if (k > kMax) return positions;
    }
  }

  // 最后一个区间之后的可用段
  while (k <= kMax && positions.length < limit) {
    positions.push(firstPosition + k * period);
    k += 1n;
  }
  return positions;
}
