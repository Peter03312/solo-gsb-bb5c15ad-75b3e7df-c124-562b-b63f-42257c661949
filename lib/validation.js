/**
 * validation.js —— 方案入参校验与规范化
 *
 * 大整数一律以十进制字符串形式接收/存储，转换由 BigInt 完成，
 * 因此周长、偏移、布长的数值范围不受 JavaScript 安全整数限制。
 * 为防止超大整数运算造成资源耗尽，限制十进制位数上限（默认 120 位）。
 */

export const MAX_ROLLERS = 8;
export const MIN_ROLLERS = 2;
export const MAX_DIGITS = 120;
export const MAX_NAME_LENGTH = 50;
export const MAX_INTERVALS = 20;

const DECIMAL_INTEGER = /^[0-9]+$/;

function validateInteger(raw, { fieldName, positive, maxDigits }) {
  if (typeof raw !== 'string') {
    return { error: `${fieldName}必须以字符串形式给出` };
  }
  const s = raw.trim();
  if (!DECIMAL_INTEGER.test(s)) {
    return { error: `${fieldName}必须是十进制整数` };
  }
  // 去除前导零（"000" 规范化为 "0"），再按有效位数做上限校验。
  const normalized = s.replace(/^0+(?=[0-9])/, '');
  if (normalized.length > maxDigits) {
    return { error: `${fieldName}位数不能超过 ${maxDigits} 位` };
  }
  let value;
  try {
    value = BigInt(normalized);
  } catch {
    return { error: `${fieldName}不是合法整数` };
  }
  if (positive && value <= 0n) {
    return { error: `${fieldName}必须为正整数` };
  }
  return { value: normalized, big: value };
}

/**
 * 校验并规范化禁印区间列表。
 * 字段缺省（旧方案）时视为空数组；每个区间为 {start, end} 十进制整数字符串，
 * 需满足 0 ≤ start ≤ end ≤ 布长（端点同样禁印）。
 * @returns {{ intervals?: Array<{start: string, end: string}>, error?: string }}
 */
function validateIntervals(raw, cloth, maxDigits) {
  if (raw === undefined || raw === null) {
    return { intervals: [] };
  }
  if (!Array.isArray(raw)) {
    return { error: '禁印区间必须是数组' };
  }
  if (raw.length > MAX_INTERVALS) {
    return { error: `禁印区间最多 ${MAX_INTERVALS} 个` };
  }
  const intervals = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return { error: `禁印区间 ${i + 1} 数据格式不正确` };
    }
    const label = `禁印区间 ${i + 1}`;
    const s = validateInteger(item.start, {
      fieldName: `${label} 的起点`,
      positive: false,
      maxDigits,
    });
    if (s.error) return { error: s.error };
    const e = validateInteger(item.end, {
      fieldName: `${label} 的终点`,
      positive: false,
      maxDigits,
    });
    if (e.error) return { error: e.error };
    if (s.big > e.big) {
      return { error: `${label} 的起点（${s.value}）不能大于终点（${e.value}）` };
    }
    if (e.big > cloth.big) {
      return { error: `${label} 的终点（${e.value}）不能超过布长（${cloth.value}）` };
    }
    intervals.push({ start: s.value, end: e.value });
  }
  return { intervals };
}

/**
 * 校验并规范化方案。
 * @returns {{ ok: true, data: {name, clothLength, rollers, forbiddenIntervals} } | { ok: false, error: string }}
 *   data 中的数值均为无前导零的十进制字符串；bigints 附带 BigInt 形式。
 */
export function validateScheme(body, { maxDigits = MAX_DIGITS } = {}) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: '请求体必须是 JSON 对象' };
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `方案名称不能超过 ${MAX_NAME_LENGTH} 个字符` };
  }

  const cloth = validateInteger(body.clothLength, {
    fieldName: '布长',
    positive: false,
    maxDigits,
  });
  if (cloth.error) return { ok: false, error: cloth.error };

  const rawRollers = body.rollers;
  if (!Array.isArray(rawRollers)) {
    return { ok: false, error: '色筒列表必须是数组' };
  }
  if (rawRollers.length < MIN_ROLLERS || rawRollers.length > MAX_ROLLERS) {
    return {
      ok: false,
      error: `色筒数量必须为 ${MIN_ROLLERS}～${MAX_ROLLERS} 个`,
    };
  }

  const rollers = [];
  for (let i = 0; i < rawRollers.length; i++) {
    const item = rawRollers[i];
    if (item === null || typeof item !== 'object') {
      return { ok: false, error: `色筒 ${i + 1} 数据格式不正确` };
    }
    const label = `色筒 ${i + 1}`;
    const p = validateInteger(item.perimeter, {
      fieldName: `${label} 的重复周长`,
      positive: true,
      maxDigits,
    });
    if (p.error) return { ok: false, error: p.error };

    const a = validateInteger(item.offset, {
      fieldName: `${label} 的标记偏移`,
      positive: false,
      maxDigits,
    });
    if (a.error) return { ok: false, error: a.error };

    if (a.big >= p.big) {
      return {
        ok: false,
        error: `${label} 的标记偏移（${a.value}）必须小于重复周长（${p.value}）`,
      };
    }
    rollers.push({ perimeter: p.value, offset: a.value });
  }

  const checkedIntervals = validateIntervals(body.forbiddenIntervals, cloth, maxDigits);
  if (checkedIntervals.error) return { ok: false, error: checkedIntervals.error };
  const forbiddenIntervals = checkedIntervals.intervals;

  return {
    ok: true,
    data: { name, clothLength: cloth.value, rollers, forbiddenIntervals },
    bigints: {
      clothLength: cloth.big,
      rollers: rollers.map((r) => ({
        perimeter: BigInt(r.perimeter),
        offset: BigInt(r.offset),
      })),
      forbiddenIntervals: forbiddenIntervals.map((iv) => ({
        start: BigInt(iv.start),
        end: BigInt(iv.end),
      })),
    },
  };
}
