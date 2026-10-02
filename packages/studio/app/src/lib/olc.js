/**
 * Open Location Code（Google 地图里的 Plus Code，如 8FVC9G8F+6W）：解码成中心点；短码（9G8F+6W）靠一个参考点补全。
 * 算法见 https://github.com/google/open-location-code/blob/main/Documentation/Specification/specification.md
 */
const ALPHABET = '23456789CFGHJMPQRVWX';
const SEP = '+', SEP_POS = 8, PAD = '0';
const PAIR_RES = [20, 1, 1 / 20, 1 / 400, 1 / 8000];

const valid = (code) => {
  const i = code.indexOf(SEP);
  if (i < 0 || i !== code.lastIndexOf(SEP) || i > SEP_POS || i % 2 === 1 || code.length === 1) return false;
  if (code.length - i - 1 === 1) return false; // 加号后面不能只有一位
  const body = code.replace(SEP, '').replace(/0+$/, '');
  if (code.includes(PAD) && !/^[^0]*0+\+$/.test(code)) return false;
  return [...body].every((c) => ALPHABET.includes(c)) && body.length >= 2;
};
const isShort = (code) => code.indexOf(SEP) < SEP_POS;

/** 全码 → { lat, lng }（区域中心）；不是全码返回 null */
export function decode(raw) {
  const code = String(raw).trim().toUpperCase();
  if (!valid(code) || isShort(code)) return null;
  const digits = code.replace(SEP, '').replace(/0+$/, '').slice(0, 15);
  let lat = -90, lng = -180, h = 0, w = 0;
  const pair = digits.slice(0, 10);
  for (let i = 0; i < pair.length; i += 2) {
    const res = PAIR_RES[i / 2];
    lat += ALPHABET.indexOf(pair[i]) * res;
    if (i + 1 < pair.length) lng += ALPHABET.indexOf(pair[i + 1]) * res;
    h = res; w = i + 1 < pair.length ? res : res * 20; // 只剩一位纬度时，经度还是整格
  }
  if (pair.length % 2 === 1) w = PAIR_RES[(pair.length - 1) / 2];
  let latSize = h, lngSize = pair.length % 2 === 1 ? w : h;
  if (pair.length % 2 === 1) lngSize = PAIR_RES[(pair.length - 1) / 2];
  for (const c of digits.slice(10)) {
    const idx = ALPHABET.indexOf(c);
    latSize /= 5; lngSize /= 4;
    lat += Math.floor(idx / 4) * latSize;
    lng += (idx % 4) * lngSize;
  }
  return { lat: lat + latSize / 2, lng: lng + lngSize / 2 };
}

/** 经纬度 → 前 10 位的全码（补短码前缀用） */
function encodePairs(lat, lng) {
  lat = Math.min(90, Math.max(-90, lat)) + 90;
  lng = ((lng + 180) % 360 + 360) % 360;
  if (lat >= 180) lat = 180 - 1e-9;
  let out = '';
  for (const res of PAIR_RES) {
    const la = Math.floor(lat / res); lat -= la * res;
    const lo = Math.floor(lng / res); lng -= lo * res;
    out += ALPHABET[Math.min(la, 19)] + ALPHABET[Math.min(lo, 19)];
  }
  return out.slice(0, 8) + SEP + out.slice(8);
}

/** 短码 + 参考点（[经度, 纬度]）→ { lat, lng }；参考点离得太远会补到错的地方，一般取同一趟旅程里的上一个地点就够 */
export function recover(raw, ref) {
  const code = String(raw).trim().toUpperCase();
  if (!valid(code) || !isShort(code) || !ref) return null;
  const pad = SEP_POS - code.indexOf(SEP);
  const res = Math.pow(20, 2 - pad / 2), half = res / 2;
  const prefix = encodePairs(ref[1], ref[0]).replace(SEP, '').slice(0, pad);
  const full = prefix + code;
  const area = decode(full.slice(0, SEP_POS) + SEP + full.slice(SEP_POS + 0).replace(SEP, ''));
  if (!area) return null;
  let { lat, lng } = area;
  if (ref[1] - lat > half && lat + res <= 90) lat += res; else if (ref[1] - lat < -half && lat - res >= -90) lat -= res;
  if (ref[0] - lng > half) lng += res; else if (ref[0] - lng < -half) lng -= res;
  return { lat, lng: ((lng + 540) % 360) - 180 };
}
