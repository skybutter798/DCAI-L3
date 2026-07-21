import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TYPES = new Set(['erc20', 'erc721', 'erc1155']);

function requiredText(value, field, maxLength) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${field} is required`);
  if (text.length > maxLength) throw new Error(`${field} must be ${maxLength} characters or fewer`);
  return text;
}

function optionalText(value, field, maxLength) {
  const text = String(value ?? '').trim();
  if (text.length > maxLength) throw new Error(`${field} must be ${maxLength} characters or fewer`);
  return text;
}

export function normalizeFeaturedTokens(input) {
  const rows = Array.isArray(input) ? input : input?.featured;
  if (!Array.isArray(rows)) throw new Error('featured must be an array');
  if (rows.length > 100) throw new Error('featured supports at most 100 tokens');

  const seen = new Set();
  return rows.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`featured[${index}] must be an object`);
    }
    const address = requiredText(raw.address, `featured[${index}].address`, 42);
    if (!ADDRESS_RE.test(address)) throw new Error(`featured[${index}].address is not a valid EVM address`);
    const addressKey = address.toLowerCase();
    if (seen.has(addressKey)) throw new Error(`duplicate featured token address: ${address}`);
    seen.add(addressKey);

    const type = optionalText(raw.type || 'erc20', `featured[${index}].type`, 16).toLowerCase();
    if (!TYPES.has(type)) throw new Error(`featured[${index}].type must be erc20, erc721, or erc1155`);
    const decimals = raw.decimals == null || raw.decimals === '' ? (type === 'erc20' ? 18 : 0) : Number(raw.decimals);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
      throw new Error(`featured[${index}].decimals must be an integer from 0 to 255`);
    }

    return {
      address,
      symbol: requiredText(raw.symbol, `featured[${index}].symbol`, 32),
      name: requiredText(raw.name, `featured[${index}].name`, 100),
      type,
      decimals,
      note: optionalText(raw.note, `featured[${index}].note`, 280),
      enabled: raw.enabled !== false,
    };
  });
}

export function readFeaturedTokens(filePath) {
  if (!fs.existsSync(filePath)) return { featured: [], updatedAt: null };
  const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    featured: normalizeFeaturedTokens(document),
    updatedAt: typeof document?.updatedAt === 'string' ? document.updatedAt : null,
  };
}

export function writeFeaturedTokens(filePath, input, now = new Date()) {
  const document = {
    featured: normalizeFeaturedTokens(input),
    updatedAt: now.toISOString(),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o755 });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(document, null, 2) + '\n', { mode: 0o644 });
    fs.chmodSync(temporaryPath, 0o644);
    fs.renameSync(temporaryPath, filePath);
  } finally {
    try { fs.rmSync(temporaryPath, { force: true }); } catch {}
  }
  return document;
}
