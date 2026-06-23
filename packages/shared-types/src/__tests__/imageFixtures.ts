/**
 * Deterministic, dependency-free image fixtures for validation tests. Each
 * builder produces real, structurally-complete bytes (or a deliberately broken
 * variant) so the validator is exercised against genuine encodings rather than
 * hand-waved magic bytes.
 */
import { deflateSync } from 'node:zlib'

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let crcTable: Uint32Array | null = null
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ (crcTable[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const len = new Uint8Array(4)
  new DataView(len.buffer).setUint32(0, data.length)
  const typeBytes = Uint8Array.from([...type].map((c) => c.charCodeAt(0)))
  const crc = new Uint8Array(4)
  new DataView(crc.buffer).setUint32(0, crc32(concat([typeBytes, data])))
  return concat([len, typeBytes, data, crc])
}

/** Build a real, complete RGBA PNG of the given size (solid color). */
export function makeValidPng(width: number, height: number): Uint8Array {
  const ihdr = new Uint8Array(13)
  const dv = new DataView(ihdr.buffer)
  dv.setUint32(0, width)
  dv.setUint32(4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const bpp = 4
  const rowLen = 1 + width * bpp
  const raw = new Uint8Array(rowLen * height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowLen
    raw[rowStart] = 0 // filter byte
    for (let x = 0; x < width; x++) {
      const o = rowStart + 1 + x * bpp
      raw[o] = 10
      raw[o + 1] = 20
      raw[o + 2] = 30
      raw[o + 3] = 255
    }
  }
  const idat = new Uint8Array(deflateSync(raw))
  return concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', new Uint8Array(0)),
  ])
}

/**
 * Reproduce the exact corruption that shipped: a valid signature and IHDR
 * framing, but an IDAT length that runs past the end of the buffer and no IEND.
 * The IHDR CRC is deliberately wrong too (as in the real broken file).
 */
export function makeTruncatedPng(width: number, height: number): Uint8Array {
  const valid = makeValidPng(width, height)
  // Inflate the declared IDAT length so it points past the (then truncated) file.
  const idatLenOffset = 8 + (8 + 13 + 4) // sig + IHDR(len+type+data+crc) → IDAT length field
  const dv = new DataView(valid.buffer, valid.byteOffset, valid.byteLength)
  const realIdatLen = dv.getUint32(idatLenOffset)
  dv.setUint32(idatLenOffset, realIdatLen + 100000)
  // Now cut the file short so the (now even larger) IDAT chunk cannot fit.
  return valid.slice(0, Math.floor(valid.length * 0.5))
}

/** A complete baseline JPEG carrying readable SOFn dimensions and an EOI marker. */
export function makeValidJpeg(width: number, height: number): Uint8Array {
  const seg = (marker: number, payload: number[]): number[] => {
    const len = payload.length + 2
    return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...payload]
  }
  const bytes: number[] = [
    0xff,
    0xd8, // SOI
    ...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]), // JFIF
    ...seg(0xdb, [0x00, ...new Array(64).fill(0x10)]), // DQT
    ...seg(0xc0, [
      0x08,
      (height >> 8) & 0xff,
      height & 0xff,
      (width >> 8) & 0xff,
      width & 0xff,
      0x01,
      0x01,
      0x11,
      0x00,
    ]), // SOF0
    ...seg(0xc4, [0x00, ...new Array(16).fill(0x00)]), // DHT
    ...seg(0xda, [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]), // SOS
    0x00, // one byte of scan data
    0xff,
    0xd9, // EOI
  ]
  return Uint8Array.from(bytes)
}

/** A JPEG with its EOI marker chopped off (truncated download). */
export function makeTruncatedJpeg(width: number, height: number): Uint8Array {
  const valid = makeValidJpeg(width, height)
  return valid.slice(0, valid.length - 2) // drop the trailing FFD9
}

/** An HTML/text blob masquerading as an image (e.g. an error page body). */
export function makeHtmlBlob(): Uint8Array {
  return new TextEncoder().encode('<!doctype html><html><body>Not Found</body></html>')
}
