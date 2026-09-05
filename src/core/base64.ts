const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const packed = (a << 16) | (b << 8) | c;
    result += alphabet[(packed >>> 18) & 63];
    result += alphabet[(packed >>> 12) & 63];
    result += index + 1 < bytes.length ? alphabet[(packed >>> 6) & 63] : "=";
    result += index + 2 < bytes.length ? alphabet[packed & 63] : "=";
  }
  return result;
}

export function base64ToBytes(input: string): Uint8Array {
  const normalized = input.replace(/\s/g, "");
  if (normalized.length % 4 !== 0) throw new Error("Invalid base64 length.");
  const output: number[] = [];
  for (let index = 0; index < normalized.length; index += 4) {
    const chars = normalized.slice(index, index + 4);
    const values = [...chars].map((char) => (char === "=" ? 0 : alphabet.indexOf(char)));
    if (values.some((value, position) => value < 0 && chars[position] !== "=")) throw new Error("Invalid base64 character.");
    const packed = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    output.push((packed >>> 16) & 255);
    if (chars[2] !== "=") output.push((packed >>> 8) & 255);
    if (chars[3] !== "=") output.push(packed & 255);
  }
  return new Uint8Array(output);
}

export function textToBase64(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value));
}

export function base64ToText(value: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(base64ToBytes(value));
}
