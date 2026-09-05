export function downloadBytes(bytes: Uint8Array, fileName: string, mimeType: string): void {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const blob = new Blob([copy], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function editedFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? `${fileName.slice(0, dot)}-edited${fileName.slice(dot)}` : `${fileName}-edited`;
}
