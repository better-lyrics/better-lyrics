import { LOG_PREFIX } from "@constants";
import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";

const COMPRESSED_PREFIX = "__COMPRESSED__";

export function compressString(data: string): string {
  try {
    const compressed = gzipSync(strToU8(data));
    let binary = "";
    for (let i = 0; i < compressed.length; i++) {
      binary += String.fromCharCode(compressed[i]);
    }
    return `${COMPRESSED_PREFIX}${btoa(binary)}`;
  } catch (error) {
    console.warn(LOG_PREFIX, "Failed to compress:", error);
    return data;
  }
}

export function decompressString(data: string): string {
  if (!data.startsWith(COMPRESSED_PREFIX)) {
    return data;
  }

  try {
    const base64 = data.slice(COMPRESSED_PREFIX.length);
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return strFromU8(gunzipSync(bytes));
  } catch (err) {
    console.warn(LOG_PREFIX, "Failed to decompress:", err);
    return data;
  }
}

export function isCompressed(data: string): boolean {
  return data.startsWith(COMPRESSED_PREFIX);
}
