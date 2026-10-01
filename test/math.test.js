/**
 * math.test.js —— CRT / BigInt 核心算法的零依赖断言测试
 * 运行：npm test
 */

import assert from 'node:assert/strict';
import {
  bigMod,
  bigGcd,
  bigLcm,
  isCompatible,
  mergeCongruence,
  solve,
  positionsWithinCloth,
  suggestOffsetFixes,
  mergeIntervals,
  avoidForbiddenIntervals,
} from '../lib/crt.js';
import { validateScheme } from '../lib/validation.js';
import { solveBody } from '../lib/solver.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const r = (perimeter, offset) => ({ perimeter: BigInt(perimeter), offset: BigInt(offset) });

test('bigMod 非负取模', () => {
  assert.equal(bigMod(-10n, 6n), 2n);
  assert.equal(bigMod(10n, 6n), 4n);
  assert.equal(bigMod(0n, 7n), 0n);
});

test('gcd / lcm', () => {
  assert.equal(bigGcd(640n, 800n), 160n);
  assert.equal(bigLcm(640n, 800n), 3200n);
  assert.equal(bigLcm(6n, 10n), 30n);
});

test('相容性判定：偏移差必须被 gcd 整除', () => {
  assert.equal(isCompatible(2n, 6n, 4n, 8n), true);   // gcd=2, diff=-2
  assert.equal(isCompatible(0n, 6n, 3n, 4n), false);  // gcd(6,4)=2 不整除 -3
});

test('合并同余 x≡2(mod 6), x≡4(mod 8) => x≡20(mod 24)', () => {
  const m = mergeCongruence(2n, 6n, 4n, 8n);
  assert.equal(m.a, 20n);
  assert.equal(m.m, 24n);
  // 20 同时满足两式：20%6=2，20%8=4
  assert.equal(20n % 6n, 2n);
  assert.equal(20n % 8n, 4n);
});

test('经典 CRT：互质模数', () => {
  const out = solve([r(3, 2), r(5, 3), r(7, 2)]);
  assert.equal(out.solvable, true);
  assert.equal(out.firstPosition, 23n);
  assert.equal(out.period, 105n);
});

test('偏移全 0：首次位置 0，周期为 LCM', () => {
  const out = solve([r(640, 0), r(800, 0), r(900, 0)]);
  assert.equal(out.solvable, true);
  assert.equal(out.firstPosition, 0n);
  assert.equal(out.period, bigLcm(bigLcm(640n, 800n), 900n));
  assert.equal(out.period, 28800n);
});

test('无解：返回一对互不相容色筒及证据', () => {
  const out = solve([r(6, 0), r(4, 3), r(9, 5)]);
  assert.equal(out.solvable, false);
  assert.equal(out.conflict.i, 0);
  assert.equal(out.conflict.j, 1);
  assert.equal(out.conflict.gcd, 2n);
});

test('三个色筒的相容解：x≡1(mod 6), x≡4(mod 9), x≡7(mod 15)', () => {
  const out = solve([r(6, 1), r(9, 4), r(15, 7)]);
  assert.equal(out.solvable, true);
  // 解 x≡? (mod 90)，校验 x=22: 22%6=4 ≠1；实际最小解需满足：
  // x≡1 mod6, x≡4 mod9 -> gcd3 |3，合并得 x≡13 mod18；
  // 与 x≡7 mod15：gcd(18,15)=3，13-7=6 可整除 => x≡67 mod90
  assert.equal(out.firstPosition, 67n);
  assert.equal(out.period, 90n);
});

test('超大整数：超过 Number.MAX_SAFE_INTEGER', () => {
  // 两个 ~30 位的“近似质数级”周长，偏移全 0，周期 = 乘积
  const p1 = 123456789012345678901234567891n;
  const p2 = 987654321098765432109876543211n;
  const out = solve([r(p1, 0n), r(p2, 0n)]);
  assert.equal(out.solvable, true);
  assert.equal(out.firstPosition, 0n);
  assert.equal(out.period, p1 * p2);
  // 结果远超 2^53，仍精确
  assert.ok(out.period > BigInt(Number.MAX_SAFE_INTEGER));
});

test('超大整数：非零偏移的广义 CRT', () => {
  // 构造解 X，令 p1=大质数A，p2=大质数B，偏移 = X mod p
  const p1 = 1000000007n; // 质数
  const p2 = 1000000009n; // 质数
  const X = 9007199254740993n; // 2^53+1，超出安全整数
  const a1 = X % p1;
  const a2 = X % p2;
  const out = solve([r(p1, a1), r(p2, a2)]);
  assert.equal(out.solvable, true);
  assert.equal(out.firstPosition, X);
  assert.equal(out.period, p1 * p2);
});

test('positionsWithinCloth：分页与总数', () => {
  // first=10, period=24，布长 100：10,34,58,82 -> 4 个
  const out = positionsWithinCloth(10n, 24n, 100n, 20);
  assert.deepEqual(out.positions, [10n, 34n, 58n, 82n]);
  assert.equal(out.total, 4n);

  // limit=2 时只取前两个，但 total 不变
  const out2 = positionsWithinCloth(10n, 24n, 100n, 2);
  assert.deepEqual(out2.positions, [10n, 34n]);
  assert.equal(out2.total, 4n);

  // 首次对花已超过布长
  const out3 = positionsWithinCloth(200n, 24n, 100n, 20);
  assert.deepEqual(out3.positions, []);
  assert.equal(out3.total, 0n);

  // 布长恰好等于某个对花点（端点包含）
  const out4 = positionsWithinCloth(0n, 100n, 250n, 20);
  assert.deepEqual(out4.positions, [0n, 100n, 200n]);
  assert.equal(out4.total, 3n);
});

test('修正建议：两色筒互不相容时双方都可单独修复', () => {
  // x≡0(mod6) 与 x≡3(mod4)：gcd=2 不整除 -3，无解
  const out = suggestOffsetFixes([r(6, 0), r(4, 3)]);
  assert.equal(out.length, 2);
  // 色筒1：其余解集 x≡3(mod4)，g=gcd(6,4)=2，d≡3(mod2) → d=+1，新偏移 1
  assert.deepEqual(out[0], { index: 0, fixable: true, newOffset: 1n, adjustment: 1n });
  // 色筒2：其余解集 x≡0(mod6)，g=gcd(4,6)=2，d≡-3≡1(mod2) → d=+1，新偏移 0（3+1 折回）
  assert.deepEqual(out[1], { index: 1, fixable: true, newOffset: 0n, adjustment: 1n });
});

test('修正建议：等距时优先偏移增大（正向）', () => {
  // 修色筒1：其余 x≡2(mod4)，g=gcd(8,4)=4，d≡2(mod4)，|d|=2=g/2 等距 → 取 +2
  const out = suggestOffsetFixes([r(8, 0), r(4, 2)]);
  const fix1 = out.find((s) => s.index === 0);
  assert.equal(fix1.fixable, true);
  assert.equal(fix1.adjustment, 2n);
  assert.equal(fix1.newOffset, 2n);
});

test('修正建议：负向更近时取负调整', () => {
  // 修色筒1：其余 x≡0(mod4)，g=gcd(8,4)=4，d≡-1(mod4) → d=-1，新偏移 0
  const out = suggestOffsetFixes([r(8, 1), r(4, 0)]);
  const fix1 = out.find((s) => s.index === 0);
  assert.equal(fix1.adjustment, -1n);
  assert.equal(fix1.newOffset, 0n);
});

test('修正建议：其余同余式自身无解时标为不可单独修复', () => {
  const rollers = [r(6, 0), r(4, 3), r(9, 5)];
  const out = suggestOffsetFixes(rollers);
  const fixable = out.filter((s) => s.fixable);
  const unfixable = out.filter((s) => !s.fixable);
  // 只有色筒1 可修复：其余 x≡3(mod4)、x≡5(mod9) 相容（解集 x≡23(mod36)），
  // g=gcd(6,36)=6，d≡23≡5(mod6) → d=-1，新偏移 5（共同解 x=23 验证：23%6=5）
  assert.equal(fixable.length, 1);
  assert.equal(fixable[0].index, 0);
  assert.equal(fixable[0].adjustment, -1n);
  assert.equal(fixable[0].newOffset, 5n);
  // 色筒2、3 的其余组（含互不相容的一对）自身无解 → 不可单独修复
  assert.deepEqual(unfixable.map((s) => s.index), [1, 2]);
  // 不可修复项列于可修复项之后
  assert.deepEqual(out.map((s) => s.index), [0, 1, 2]);
});

test('修正建议：按 |调整量| 升序、再按色筒序号排序', () => {
  // 色筒1：g=gcd(24,lcm(36,8))=24，d≡40(mod24) → d=-8；色筒2：g=gcd(36,24)=12，d≡-4(mod12) → d=-4
  const out = suggestOffsetFixes([r(24, 0), r(36, 4), r(8, 0)]);
  const fixable = out.filter((s) => s.fixable);
  assert.equal(fixable.length, 2);
  assert.equal(fixable[0].index, 1); // |d|=4 排前
  assert.equal(fixable[0].adjustment, -4n);
  assert.equal(fixable[0].newOffset, 0n);
  assert.equal(fixable[1].index, 0); // |d|=8 排后
  assert.equal(fixable[1].adjustment, -8n);
  assert.equal(fixable[1].newOffset, 16n);

  // |调整量| 相同（±2）时按色筒序号升序
  const tie = suggestOffsetFixes([r(12, 0), r(18, 2)]);
  assert.equal(tie[0].index, 0);
  assert.equal(tie[0].adjustment, 2n);
  assert.equal(tie[1].index, 1);
  assert.equal(tie[1].adjustment, -2n);
});

test('修正建议：超大整数场景，且每条建议都能使全组有解', () => {
  const p1 = 123456789012345678901234567890n; // 偶
  const p2 = 987654321098765432109876543210n; // 偶
  const rollers = [r(p1, 0), r(p2, 1)]; // gcd≥2 不整除偏移差 -1 → 无解
  assert.equal(solve(rollers).solvable, false);

  const out = suggestOffsetFixes(rollers);
  assert.equal(out.length, 2);
  for (const s of out) {
    assert.equal(s.fixable, true);
    // 新偏移合法且在周长环内
    assert.ok(s.newOffset >= 0n && s.newOffset < rollers[s.index].perimeter);
    // newOffset ≡ 原偏移 + 调整量 (mod 周长)
    assert.equal(
      bigMod(rollers[s.index].offset + s.adjustment, rollers[s.index].perimeter),
      s.newOffset
    );
    // 采用建议后全组有解
    const next = rollers.map((x, i) =>
      i === s.index ? { perimeter: x.perimeter, offset: s.newOffset } : x
    );
    assert.equal(solve(next).solvable, true);
  }
});

test('区间合并：重叠、相邻、包含、无序输入', () => {
  const merged = mergeIntervals([
    { start: 9n, end: 20n },  // 与 [5,8] 相邻（9 = 8+1）→ 合并为 [5,20]
    { start: 5n, end: 8n },
    { start: 21n, end: 25n }, // 与 [5,20] 相邻（21 = 20+1）→ 合并为 [5,25]
    { start: 30n, end: 35n },
    { start: 6n, end: 7n },   // 含于 [5,8]
  ]);
  assert.deepEqual(merged, [
    { start: 5n, end: 25n },
    { start: 30n, end: 35n },
  ]);
  // 间隔 ≥ 1 个可用整数点的区间不合并：[5,8] 与 [10,20] 之间隔着 9
  assert.deepEqual(
    mergeIntervals([
      { start: 5n, end: 8n },
      { start: 10n, end: 20n },
    ]),
    [
      { start: 5n, end: 8n },
      { start: 10n, end: 20n },
    ]
  );
  // 空输入
  assert.deepEqual(mergeIntervals([]), []);
});

test('瑕疵避让：端点不可用，按边界公式计数', () => {
  // first=0, period=10，布长 100 → 0,10,…,100 共 11 点
  // [10,20] 排除 10、20（端点同样禁印）；[55,65] 只排除 60
  const av = avoidForbiddenIntervals(0n, 10n, 100n, [
    { start: 10n, end: 20n },
    { start: 55n, end: 65n },
  ], 20);
  assert.equal(av.total, 11n);
  assert.equal(av.excluded, 3n);
  assert.equal(av.usable, 8n);
  assert.deepEqual(av.positions, [0n, 30n, 40n, 50n, 70n, 80n, 90n, 100n]);
  assert.deepEqual(av.merged, [
    { start: 10n, end: 20n },
    { start: 55n, end: 65n },
  ]);
});

test('瑕疵避让：相邻区间先合并再连续扣除', () => {
  // [10,19] 与 [20,30] 相邻 → 合并为 [10,30]，排除 10、20、30
  const av = avoidForbiddenIntervals(0n, 10n, 50n, [
    { start: 10n, end: 19n },
    { start: 20n, end: 30n },
  ], 20);
  assert.deepEqual(av.merged, [{ start: 10n, end: 30n }]);
  assert.equal(av.excluded, 3n);
  assert.equal(av.usable, 3n);
  assert.deepEqual(av.positions, [0n, 40n, 50n]);
});

test('瑕疵避让：空区间等价原序列', () => {
  const av = avoidForbiddenIntervals(10n, 24n, 100n, [], 20);
  assert.equal(av.total, 4n);
  assert.equal(av.excluded, 0n);
  assert.equal(av.usable, 4n);
  assert.deepEqual(av.positions, [10n, 34n, 58n, 82n]);
});

test('瑕疵避让：首次对花超过布长时全部为零', () => {
  const av = avoidForbiddenIntervals(200n, 24n, 100n, [{ start: 0n, end: 100n }], 20);
  assert.equal(av.total, 0n);
  assert.equal(av.excluded, 0n);
  assert.equal(av.usable, 0n);
  assert.deepEqual(av.positions, []);
});

test('瑕疵避让：limit 截断且按区间边界跳跃（不逐点扫描）', () => {
  // period=1，布长 100 → 101 个点；[0,90] 排除前 91 个
  const av = avoidForbiddenIntervals(0n, 1n, 100n, [{ start: 0n, end: 90n }], 5);
  assert.equal(av.total, 101n);
  assert.equal(av.excluded, 91n);
  assert.equal(av.usable, 10n);
  assert.deepEqual(av.positions, [91n, 92n, 93n, 94n, 95n]);
});

test('瑕疵避让：天文数字级对花点也能按公式即时计数', () => {
  // period = 10^30，布长 = 1000·period → 对花点 0,P,…,1000P 共 1001 个
  const P = 10n ** 30n;
  const cloth = P * 1000n;
  // 区间 [3P, 997P] 覆盖第 3～997 个点（共 995 个）
  const av = avoidForbiddenIntervals(0n, P, cloth, [
    { start: 3n * P, end: 997n * P },
  ], 20);
  assert.equal(av.total, 1001n);
  assert.equal(av.excluded, 995n);
  assert.equal(av.usable, 6n);
  assert.deepEqual(av.positions, [0n, P, 2n * P, 998n * P, 999n * P, 1000n * P]);
});

test('校验：旧方案缺少 forbiddenIntervals 字段时视为空', () => {
  const out = validateScheme({
    name: '旧方案',
    clothLength: '100',
    rollers: [
      { perimeter: '6', offset: '0' },
      { perimeter: '4', offset: '2' },
    ],
  });
  assert.equal(out.ok, true);
  assert.deepEqual(out.data.forbiddenIntervals, []);
  assert.deepEqual(out.bigints.forbiddenIntervals, []);
});

test('校验：禁印区间需满足 0 ≤ 起点 ≤ 终点 ≤ 布长', () => {
  const base = {
    name: '',
    clothLength: '100',
    rollers: [
      { perimeter: '6', offset: '0' },
      { perimeter: '4', offset: '2' },
    ],
  };
  // 起点 > 终点
  assert.equal(validateScheme({ ...base, forbiddenIntervals: [{ start: '50', end: '40' }] }).ok, false);
  // 终点 > 布长
  assert.equal(validateScheme({ ...base, forbiddenIntervals: [{ start: '0', end: '101' }] }).ok, false);
  // 非十进制整数
  assert.equal(validateScheme({ ...base, forbiddenIntervals: [{ start: '1.5', end: '10' }] }).ok, false);
  assert.equal(validateScheme({ ...base, forbiddenIntervals: [{ start: '-3', end: '10' }] }).ok, false);
  // 非数组
  assert.equal(validateScheme({ ...base, forbiddenIntervals: 'x' }).ok, false);
  // 合法：端点可以等于布长（闭区间，端点同样禁印）
  const ok = validateScheme({ ...base, forbiddenIntervals: [{ start: '0', end: '100' }] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.data.forbiddenIntervals, [{ start: '0', end: '100' }]);
  assert.deepEqual(ok.bigints.forbiddenIntervals, [{ start: 0n, end: 100n }]);
});

test('校验：禁印区间至多 20 个', () => {
  const base = {
    name: '',
    clothLength: '1000',
    rollers: [
      { perimeter: '6', offset: '0' },
      { perimeter: '4', offset: '2' },
    ],
  };
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ start: String(i), end: String(i) }));
  assert.equal(validateScheme({ ...base, forbiddenIntervals: mk(20) }).ok, true);
  assert.equal(validateScheme({ ...base, forbiddenIntervals: mk(21) }).ok, false);
});

test('solveBody：有解且带禁印区间时返回避让统计', () => {
  const out = solveBody({
    name: '',
    clothLength: '100',
    rollers: [
      { perimeter: '10', offset: '0' },
      { perimeter: '20', offset: '0' },
    ],
    forbiddenIntervals: [
      { start: '10', end: '20' },
      { start: '55', end: '65' },
    ],
  });
  assert.equal(out.ok, true);
  assert.equal(out.result.solvable, true);
  // 对花点 0,20,40,60,80,100 共 6 个；[10,20] 排除 20，[55,65] 排除 60
  assert.equal(out.result.withinCloth.total, '6');
  assert.equal(out.result.avoidance.inputCount, 2);
  assert.deepEqual(out.result.avoidance.mergedIntervals, [
    { start: '10', end: '20' },
    { start: '55', end: '65' },
  ]);
  assert.equal(out.result.avoidance.excluded, '2');
  assert.equal(out.result.avoidance.usable, '4');
  assert.deepEqual(out.result.avoidance.positions, ['0', '40', '80', '100']);
});

test('solveBody：无禁印区间时不返回 avoidance 字段', () => {
  const out = solveBody({
    name: '',
    clothLength: '100',
    rollers: [
      { perimeter: '10', offset: '0' },
      { perimeter: '20', offset: '0' },
    ],
  });
  assert.equal(out.ok, true);
  assert.equal(out.result.solvable, true);
  assert.equal(out.result.avoidance, undefined);
});

test('solveBody：无解时沿用冲突与修正结果（不涉及避让）', () => {
  const out = solveBody({
    name: '',
    clothLength: '1000',
    rollers: [
      { perimeter: '6', offset: '0' },
      { perimeter: '4', offset: '3' },
    ],
    forbiddenIntervals: [{ start: '0', end: '500' }],
  });
  assert.equal(out.ok, true);
  assert.equal(out.result.solvable, false);
  assert.equal(out.result.conflict.rollerA, 1);
  assert.equal(out.result.conflict.rollerB, 2);
  assert.ok(Array.isArray(out.result.suggestions));
  assert.equal(out.result.avoidance, undefined);
});

console.log(`\n全部 ${passed} 项测试通过 ✔\n`);