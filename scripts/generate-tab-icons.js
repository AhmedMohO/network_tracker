const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Pure JS Minimal PNG Builder using zlib deflate
function createPng(width, height, drawPixelFn) {
  // RGB + Alpha = 4 bytes per pixel + 1 filter byte per scanline
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawPixelFn(x / width, y / height, x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = crc32(Buffer.concat([typeBuf, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// CRC32 implementation for PNG chunks
function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Distance helper for shapes
function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

// Icon Drawing Functions (Normalised coords 0..1)
function drawHome(u, v) {
  // House roof (triangle) + base
  // Roof peak at (0.5, 0.18), eaves at (0.15, 0.50) and (0.85, 0.50)
  // Walls from (0.24, 0.48) to (0.76, 0.84)
  const isInsideRoof = v >= 0.18 && v <= 0.52 && Math.abs(u - 0.5) <= (v - 0.18) * 1.1;
  const isInsideWalls = u >= 0.25 && u <= 0.75 && v >= 0.48 && v <= 0.82;
  const isDoor = u >= 0.40 && u <= 0.60 && v >= 0.58 && v <= 0.82;
  if ((isInsideRoof || isInsideWalls) && !isDoor) {
    return [255, 255, 255, 255];
  }
  return [255, 255, 255, 0];
}

function drawCompare(u, v) {
  // Two vertical comparison bars with arrows / delta indicators
  // Left bar (0.22 to 0.42), v: 0.35 to 0.82
  // Right bar (0.58 to 0.78), v: 0.18 to 0.82
  const leftBar = u >= 0.22 && u <= 0.42 && v >= 0.38 && v <= 0.82;
  const rightBar = u >= 0.58 && u <= 0.78 && v >= 0.18 && v <= 0.82;
  // Trend arrow in top left
  const arrow = (u >= 0.22 && u <= 0.42 && v >= 0.20 && v <= 0.32 && Math.abs(u - 0.32) <= (0.32 - v));
  if (leftBar || rightBar || arrow) {
    return [255, 255, 255, 255];
  }
  return [255, 255, 255, 0];
}

function drawLive(u, v) {
  // Pulse / Activity wave line with thickness
  // Center pulse: (0.15, 0.52) -> (0.35, 0.52) -> (0.45, 0.22) -> (0.55, 0.82) -> (0.65, 0.45) -> (0.75, 0.52) -> (0.85, 0.52)
  // Distance to segments
  const pts = [
    [0.15, 0.52],
    [0.35, 0.52],
    [0.45, 0.20],
    [0.55, 0.82],
    [0.65, 0.42],
    [0.72, 0.52],
    [0.85, 0.52],
  ];
  let minD = 999;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const l2 = (p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2;
    let t = Math.max(0, Math.min(1, ((u - p1[0]) * (p2[0] - p1[0]) + (v - p1[1]) * (p2[1] - p1[1])) / l2));
    const projX = p1[0] + t * (p2[0] - p1[0]);
    const projY = p1[1] + t * (p2[1] - p1[1]);
    const d = Math.hypot(u - projX, v - projY);
    if (d < minD) minD = d;
  }
  if (minD <= 0.058) {
    return [255, 255, 255, 255];
  }
  return [255, 255, 255, 0];
}

function drawSettings(u, v) {
  // Sliders / Controls icon: 3 horizontal tracks with knobs
  // Track 1: y=0.28, knob at x=0.35
  // Track 2: y=0.50, knob at x=0.65
  // Track 3: y=0.72, knob at x=0.40
  const tracks = [
    { y: 0.28, knobX: 0.35 },
    { y: 0.50, knobX: 0.65 },
    { y: 0.72, knobX: 0.40 },
  ];
  for (const tr of tracks) {
    const inLine = u >= 0.18 && u <= 0.82 && Math.abs(v - tr.y) <= 0.04;
    const inKnob = dist(u, v, tr.knobX, tr.y) <= 0.12;
    if (inKnob || inLine) {
      return [255, 255, 255, 255];
    }
  }
  return [255, 255, 255, 0];
}

function drawProbe(u, v) {
  // Diagnostic Terminal/Chip icon: rectangular boundary + terminal prompt '>' or chip pins
  // Terminal outline
  const inBorder = (u >= 0.18 && u <= 0.82 && v >= 0.22 && v <= 0.78) &&
    !(u >= 0.26 && u <= 0.74 && v >= 0.30 && v <= 0.70);
  // Terminal prompt '>'
  const inChevron = (u >= 0.32 && u <= 0.48 && v >= 0.38 && v <= 0.62) &&
    Math.abs(v - 0.50) <= (u - 0.32) * 1.3 && Math.abs(v - 0.50) >= (u - 0.40) * 1.3;
  // Cursor '_'
  const inCursor = u >= 0.52 && u <= 0.66 && v >= 0.56 && v <= 0.62;
  if (inBorder || inChevron || inCursor) {
    return [255, 255, 255, 255];
  }
  return [255, 255, 255, 0];
}

const outDir = path.join(__dirname, '..', 'assets', 'images', 'tabIcons');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const icons = [
  { name: 'home', fn: drawHome },
  { name: 'compare', fn: drawCompare },
  { name: 'live', fn: drawLive },
  { name: 'settings', fn: drawSettings },
  { name: 'probe', fn: drawProbe },
];

const scales = [
  { suffix: '', size: 24 },
  { suffix: '@2x', size: 48 },
  { suffix: '@3x', size: 72 },
];

for (const icon of icons) {
  for (const scale of scales) {
    const filename = `${icon.name}${scale.suffix}.png`;
    const filepath = path.join(outDir, filename);
    const pngBuf = createPng(scale.size, scale.size, (u, v) => icon.fn(u, v));
    fs.writeFileSync(filepath, pngBuf);
    console.log(`Generated ${filename} (${scale.size}x${scale.size})`);
  }
}
console.log('Tab icons generation complete.');
