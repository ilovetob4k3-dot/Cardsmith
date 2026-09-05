const table = new Uint32Array(256);

for (let value = 0; value < 256; value += 1) {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) {
    current = (current & 1) !== 0 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  }
  table[value] = current >>> 0;
}

export function crc32(parts: Uint8Array[]): number {
  let crc = 0xffffffff;
  for (const part of parts) {
    for (const byte of part) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
