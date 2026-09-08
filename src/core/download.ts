export const DOWNLOAD_REVOKE_DELAY_MS = 60_000;

export interface DownloadReceipt {
  url: string;
  fileName: string;
}

export function downloadBlockedMessage(fileName: string): string {
  return `Your browser blocked the download for ${fileName}. Allow downloads for this site, then try again. On mobile, also check the browser's Downloads folder.`;
}

export function downloadBytes(bytes: Uint8Array, fileName: string, mimeType: string): DownloadReceipt {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const blob = new Blob([copy], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(downloadBlockedMessage(fileName));
  } finally {
    anchor.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_REVOKE_DELAY_MS);
  return { url, fileName };
}

export function editedFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? `${fileName.slice(0, dot)}-edited${fileName.slice(dot)}` : `${fileName}-edited`;
}

export function ledgerFileName(fileName: string, extension: "md" | "json"): string {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  return `${base}-cardsmith-ledger.${extension}`;
}
