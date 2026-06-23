/**
 * Real, structurally-complete image fixtures for backend upload tests, plus the
 * truncated variant that reproduces the corrupt hero images that shipped.
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

function buildValidPng(width: number, height: number): Uint8Array {
  const ihdr = new Uint8Array(13)
  const dv = new DataView(ihdr.buffer)
  dv.setUint32(0, width)
  dv.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = 6
  const bpp = 4
  const rowLen = 1 + width * bpp
  const raw = new Uint8Array(rowLen * height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowLen
    raw[rowStart] = 0
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

/** A real, complete RGBA PNG large enough to pass the min-dimension gate. */
export function validPngBuffer(width = 800, height = 700): Buffer {
  return Buffer.from(buildValidPng(width, height))
}

/** A PNG truncated mid-IDAT with no IEND — the corruption that shipped. */
export function truncatedPngBuffer(width = 800, height = 700): Buffer {
  const valid = buildValidPng(width, height)
  return Buffer.from(valid.slice(0, Math.floor(valid.length * 0.5)))
}

/** A valid PNG that is below the minimum hero dimension. */
export function tooSmallPngBuffer(): Buffer {
  return Buffer.from(buildValidPng(100, 100))
}
