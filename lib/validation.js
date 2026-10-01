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
 * 校验并规范化方案。
 * @returns {{ ok: true, data: {name, clothLength, rollers, forbiddenIntervals} } | { ok: false, error: string }}
 *   data 中的数值均为无前导零的十进制字符串；bigints 附带 BigInt 形式。
 *   forbiddenIntervals 为禁印区间（布面瑕疵避让），缺省时视为空数组（兼容旧方案）。
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

  // 禁印区间（布面瑕疵避让）：可选，至多 MAX_INTERVALS 个；
  // 闭区间，端点也不可印花，需满足 0 ≤ 起点 ≤ 终点 ≤ 布长。
  const rawIntervals =
    body.forbiddenIntervals === undefined ? [] : body.forbiddenIntervals;
  if (!Array.isArray(rawIntervals)) {
    return { ok: false, error: '禁印区间必须是数组' };
  }
  if (rawIntervals.length > MAX_INTERVALS) {
    return { ok: false, error: `禁印区间最多 ${MAX_INTERVALS} 个` };
  }

  const forbiddenIntervals = [];
  const intervalBigs = [];
  for (let i = 0; i < rawIntervals.length; i++) {
    const item = rawIntervals[i];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: `禁印区间 ${i + 1} 数据格式不正确` };
    }
    const label = `禁印区间 ${i + 1}`;
    const s = validateInteger(item.start, {
      fieldName: `${label} 的起点`,
      positive: false,
      maxDigits,
    });
    if (s.error) return { ok: false, error: s.error };

    const e = validateInteger(item.end, {
      fieldName: `${label} 的终点`,
      positive: false,
      maxDigits,
    });
    if (e.error) return { ok: false, error: e.error };

    if (s.big > e.big) {
      return {
        ok: false,
        error: `${label} 的起点（${s.value}）不能大于终点（${e.value}）`,
      };
    }
    if (e.big > cloth.big) {
      return {
        ok: false,
        error: `${label} 的终点（${e.value}）不能超过布长（${cloth.value}）`,
      };
    }
    forbiddenIntervals.push({ start: s.value, end: e.value });
    intervalBigs.push({ start: s.big, end: e.big });
  }

  return {
    ok: true,
    data: { name, clothLength: cloth.value, rollers, forbiddenIntervals },
    bigints: {
      clothLength: cloth.big,
      rollers: rollers.map((r) => ({
        perimeter: BigInt(r.perimeter),
        offset: BigInt(r.offset),
      })),
      forbiddenIntervals: intervalBigs,
    },
  };
}
