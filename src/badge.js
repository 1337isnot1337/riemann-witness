// A Worker needs only the Web Platform compression and binary APIs to print a plate.
import landscape from '../art/generated/landscape.js';
import upright from '../art/generated/portrait.js';
import names from '../art/generated/names.js';
import numbers from '../art/generated/numbers.js';

const encoder = new TextEncoder();
const cache = new WeakMap();
const prefixes = new WeakMap();

export function nameSupported(name) {
  if (typeof name !== 'string') return false;
  const characters = Array.from(name.normalize('NFC'));
  return (
    characters.length > 0 &&
    characters.length <= 48 &&
    name.trim().length > 0 &&
    characters.every((character) => Object.hasOwn(names.g, character))
  );
}

function bytes(base64) {
  if (Uint8Array.fromBase64) return Uint8Array.fromBase64(base64);
  const binary = atob(base64);
  const result = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) result[i] = binary.charCodeAt(i);
  return result;
}

async function inflate(asset) {
  let result = cache.get(asset);
  if (!result) {
    const stream = new Blob([bytes(asset.z)])
      .stream()
      .pipeThrough(new DecompressionStream('deflate'));
    result = new Uint8Array(await new Response(stream).arrayBuffer());
    // Only cache completed buffers. Worker requests own their asynchronous I/O.
    cache.set(asset, result);
  }
  return result;
}

function lettering(
  rows,
  width,
  face,
  alpha,
  text,
  x,
  baseline,
  maxWidth,
  maxScale,
) {
  const letters = Array.from(
    text,
    (character) => face.g[character] || face.g['?'],
  );
  const advance = letters.reduce((sum, glyph) => sum + glyph[5] / 16, 0);
  const scale = Math.min(maxScale, maxWidth / Math.max(advance + 4, 1));
  for (const [start, w, h, left, top, step] of letters) {
    const x0 = Math.round(x + left * scale);
    const y0 = Math.round(baseline + top * scale);
    const destW = Math.round(w * scale),
      destH = Math.round(h * scale);
    for (let dy = 0; dy < destH; dy++) {
      const sy = Math.min(h - 1, Math.floor((dy + 0.5) / scale));
      let offset = (y0 + dy) * (width + 1) + x0 + 1;
      for (let dx = 0; dx < destW; dx++, offset++) {
        const sx = Math.min(w - 1, Math.floor((dx + 0.5) / scale));
        const pixel = sy * w + sx;
        const packed = alpha[start + (pixel >> 1)];
        const ink = pixel % 2 === 0 ? packed >> 4 : packed & 15;
        if (ink) rows[offset] = 104 + ink;
      }
    }
    x += (step * scale) / 16;
  }
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

function chunk(type, data) {
  const out = new Uint8Array(data.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(encoder.encode(type), 4);
  out.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < out.length - 4; i++)
    crc = crcTable[(crc ^ out[i]) & 255] ^ (crc >>> 8);
  view.setUint32(out.length - 4, (crc ^ 0xffffffff) >>> 0);
  return out;
}

async function png(plate, rows) {
  let prefix = prefixes.get(plate);
  if (!prefix) {
    prefix = bytes(plate.prefix);
    prefixes.set(plate, prefix);
  }
  const compressed = new Blob([rows])
    .stream()
    .pipeThrough(new CompressionStream('deflate'));
  const tail = new Uint8Array(await new Response(compressed).arrayBuffer());
  const trailer = new DataView(tail.buffer);
  const checksum = trailer.getUint32(tail.length - 4);
  // Adler-32 composition over the preprinted rows and the personalized label.
  const prime = 65521;
  const a = ((plate.adler & 65535) + (checksum & 65535) - 1) % prime;
  const b =
    ((plate.adler >>> 16) +
      (checksum >>> 16) +
      rows.length * ((plate.adler & 65535) - 1)) %
    prime;
  trailer.setUint32(tail.length - 4, ((b << 16) | a) >>> 0);
  const idat = chunk('IDAT', tail.subarray(2)); // Strip the second zlib header.
  const end = chunk('IEND', new Uint8Array());
  const out = new Uint8Array(prefix.length + idat.length + end.length);
  out.set(prefix);
  out.set(idat, prefix.length);
  out.set(end, prefix.length + idat.length);
  return out;
}

export async function badgePng(witness, portrait = false, host = '') {
  const plate = portrait ? upright : landscape;
  const [base, nameInk, monoInk] = await Promise.all([
    inflate(plate),
    inflate(names),
    inflate(numbers),
  ]);
  const rows = base.slice();
  const { w, h } = plate;
  const top = portrait ? 934 : 404;
  const divider = portrait ? 581 : 822;
  const numberX = divider + 28;
  const number = witness
    ? '#' + String(witness.id).padStart(6, '0')
    : 'SPECIMEN';
  const name = witness ? witness.name.normalize('NFC') : 'Your name here';
  const baseline = portrait ? 132 : 110;
  lettering(rows, w, names, nameInk, name, 59, baseline, divider - 85, 1);
  lettering(
    rows,
    w,
    numbers,
    monoInk,
    number,
    numberX,
    baseline,
    w - numberX - 60,
    0.95,
  );
  const stamp = witness
    ? 'SIGNED ' + witness.created_at.slice(0, 19).replace('T', ' ') + ' UTC'
    : 'SPECIMEN / NO NUMBER ASSIGNED';
  const footerY = h - top - 65;
  lettering(
    rows,
    w,
    numbers,
    monoInk,
    stamp,
    59,
    footerY,
    portrait ? 411 : 500,
    0.256,
  );
  const site = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const website = site || 'I WAS HERE';
  const allowed = portrait ? 335 : 445;
  const actualWidth =
    Array.from(
      website,
      (char) => (numbers.g[char] || numbers.g['?'])[5] / 16,
    ).reduce((a, b) => a + b, 0) * 0.256;
  lettering(
    rows,
    w,
    numbers,
    monoInk,
    website,
    w - 60 - Math.min(allowed, actualWidth),
    footerY,
    allowed,
    0.256,
  );
  return png(plate, rows);
}
