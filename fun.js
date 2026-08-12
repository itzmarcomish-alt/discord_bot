const sharp = require('sharp');

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitize(text, max) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';

  for (let word of words) {
    while (word.length > maxChars) {
      if (line) {
        lines.push(line);
        line = '';
      }

      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }

    const candidate = line ? `${line} ${word}` : word;

    if (candidate.length <= maxChars) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);

  return lines.length ? lines : [''];
}

function svgDoc(width, height, inner) {
  return '<svg width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
    inner +
    '</svg>';
}

function textBlock(lines, x, y, size, lineHeight, fill, family, weight, style, anchor) {
  return '<text x="' + x + '" y="' + y + '" font-family="' + family + '" font-size="' + size + '" fill="' + fill + '"' +
    (weight ? ' font-weight="' + weight + '"' : '') +
    (style ? ' font-style="' + style + '"' : '') +
    (anchor ? ' text-anchor="' + anchor + '"' : '') +
    '>' +
    lines.map((line, index) =>
      '<tspan x="' + x + '" dy="' + (index === 0 ? 0 : lineHeight) + '">' + escapeXml(line) + '</tspan>'
    ).join('') +
    '</text>';
}

async function downloadBuffer(url, maxBytes) {
  const limit = maxBytes || 8 * 1024 * 1024;

  try {
    const response = await fetch(url);

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.startsWith('image/')) return null;

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0 || buffer.length > limit) return null;

    return buffer;
  } catch {
    return null;
  }
}

function circleMask(size) {
  return Buffer.from(svgDoc(size, size,
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + size / 2 + '" fill="white"/>'
  ));
}

function initialsFallback(size, initials, color, textColor) {
  return `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${color}"/>` +
    `<text x="${size / 2}" y="${size / 2 + size * 0.14}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${size * 0.5}" font-weight="bold" fill="${textColor}">${escapeXml((initials || '?').slice(0, 2))}</text>`;
}

async function circularAvatar(url, size, initials) {
  const buffer = await downloadBuffer(url);

  if (buffer) {
    try {
      const output = await sharp(buffer)
        .resize(size, size, { fit: 'cover' })
        .composite([{ input: circleMask(size), blend: 'dest-in' }])
        .png()
        .toBuffer();

      return output.toString('base64');
    } catch {
      // fall through al respaldo
    }
  }

  try {
    const fallback = await sharp(Buffer.from(svgDoc(size, size,
      initialsFallback(size, initials, '#bdc3c7', '#7f8c8d')
    ))).png().toBuffer();

    return fallback.toString('base64');
  } catch {
    return null;
  }
}

async function squareAvatarGray(url, size, initials) {
  const buffer = await downloadBuffer(url);

  if (buffer) {
    try {
      const output = await sharp(buffer)
        .resize(size, size, { fit: 'cover' })
        .grayscale()
        .png()
        .toBuffer();

      return output.toString('base64');
    } catch {
      // fall through al respaldo
    }
  }

  try {
    const fallback = await sharp(Buffer.from(svgDoc(size, size,
      '<rect width="' + size + '" height="' + size + '" fill="#95a5a6"/>' +
      initialsFallback(size, initials, '#95a5a6', '#ecf0f1')
    ))).png().toBuffer();

    return fallback.toString('base64');
  } catch {
    return null;
  }
}

async function squarePhoto(buffer, size) {
  if (!buffer) return null;

  try {
    const output = await sharp(buffer)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toBuffer();

    return output.toString('base64');
  } catch {
    return null;
  }
}

async function createQuoteImage(content, authorName, avatarUrl) {
  const WIDTH = 800;
  const PADDING = 50;
  const FONT_SIZE = 32;
  const LINE_HEIGHT = 44;
  const AVATAR_SIZE = 130;

  const lines = wrapText(sanitize(content, 300), 26);

  lines[0] = '"' + lines[0];
  lines[lines.length - 1] = lines[lines.length - 1] + '"';

  const textBlockHeight = lines.length * LINE_HEIGHT;
  const quoteStart = PADDING + 40;
  const attributionY = quoteStart + textBlockHeight + 20;
  const avatarY = attributionY + 50;
  const HEIGHT = avatarY + AVATAR_SIZE + PADDING;

  const avatar = await circularAvatar(avatarUrl, AVATAR_SIZE, authorName);

  const svg = svgDoc(WIDTH, HEIGHT,
    '<rect width="' + WIDTH + '" height="' + HEIGHT + '" fill="#ffffff"/>' +
    textBlock(lines, PADDING, quoteStart, FONT_SIZE, LINE_HEIGHT, '#222222', 'Georgia, serif', 'normal', 'italic') +
    '<text x="' + PADDING + '" y="' + attributionY + '" font-family="Arial, sans-serif" font-size="26" fill="#777777">-' + escapeXml(authorName) + '</text>' +
    '<image x="' + PADDING + '" y="' + avatarY + '" width="' + AVATAR_SIZE + '" height="' + AVATAR_SIZE + '" xlink:href="data:image/png;base64,' + avatar + '"/>'
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function createSignatureImage(name, avatarUrl) {
  const W = 900;
  const AV = 130;
  const safe = sanitize(name, 40);
  const size = Math.max(48, Math.min(96, 140 - safe.length * 3));
  const lineHeight = Math.round(size * 1.25);
  const lines = wrapText(safe, 12);

  const nameY = 240;
  const underlineY = nameY + lines.length * lineHeight + 30;
  const captionY = underlineY + 50;
  const H = captionY + 60;

  const avatar = await circularAvatar(avatarUrl, AV, safe);

  const svg = svgDoc(W, H,
    '<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>' +
    '<image x="' + (W - AV - 60) + '" y="40" width="' + AV + '" height="' + AV + '" xlink:href="data:image/png;base64,' + avatar + '"/>' +
    '<text x="' + (W / 2) + '" y="180" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#aaaaaa" letter-spacing="6">FIRMA OFICIAL</text>' +
    textBlock(lines, W / 2, nameY, size, lineHeight, '#2c3e50', 'Georgia, serif', 'bold', 'italic', 'middle') +
    '<line x1="' + (W / 2 - 150) + '" y1="' + underlineY + '" x2="' + (W / 2 + 150) + '" y2="' + underlineY + '" stroke="#e74c3c" stroke-width="4" stroke-linecap="round"/>' +
    '<text x="' + (W / 2) + '" y="' + captionY + '" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#888888">— firma de ' + escapeXml(safe) + '</text>'
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function createPolaroidImage(photo, caption) {
  const PHOTO_SIZE = 440;
  const MARGIN = 35;
  const CAPTION_LINE_HEIGHT = 36;
  const CAPTION_MAX_CHARS = 32;
  const safeCaption = sanitize(caption, 90);
  const captionLines = safeCaption ? wrapText(safeCaption, CAPTION_MAX_CHARS).slice(0, 3) : [];
  const captionHeight = captionLines.length * CAPTION_LINE_HEIGHT;
  const W = PHOTO_SIZE + MARGIN * 2;
  const H = MARGIN + PHOTO_SIZE + 30 + captionHeight + 40;
  const captionBaseline = MARGIN + PHOTO_SIZE + 30 + CAPTION_LINE_HEIGHT;

  const base64 = await squarePhoto(photo, PHOTO_SIZE);

  let photoElement;

  if (base64) {
    photoElement = '<image x="' + MARGIN + '" y="' + MARGIN + '" width="' + PHOTO_SIZE + '" height="' + PHOTO_SIZE + '" xlink:href="data:image/png;base64,' + base64 + '"/>';
  } else {
    photoElement =
      '<rect x="' + MARGIN + '" y="' + MARGIN + '" width="' + PHOTO_SIZE + '" height="' + PHOTO_SIZE + '" fill="#d5dbdb"/>' +
      '<text x="' + (W / 2) + '" y="' + (MARGIN + PHOTO_SIZE / 2) + '" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#7f8c8d">sin foto</text>';
  }

  const svg = svgDoc(W, H,
    '<rect x="8" y="8" width="' + W + '" height="' + H + '" fill="#00000022"/>' +
    '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>' +
    '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none" stroke="#e0e0e0" stroke-width="1"/>' +
    photoElement +
    (captionLines.length ? textBlock(captionLines, W / 2, captionBaseline, 28, CAPTION_LINE_HEIGHT, '#444444', 'Arial, sans-serif', 'normal', 'italic', 'middle') : '')
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function createWantedImage(avatarUrl, name, reward) {
  const W = 500;
  const H = 660;
  const AV = 190;
  const safeName = sanitize(name, 40);

  const gray = await squareAvatarGray(avatarUrl, AV, safeName);
  const lines = wrapText(safeName, 20).slice(0, 2);

  const svg = svgDoc(W, H,
    '<rect width="' + W + '" height="' + H + '" fill="#efe0b8"/>' +
    '<rect x="12" y="12" width="' + (W - 24) + '" height="' + (H - 24) + '" fill="none" stroke="#1a1a1a" stroke-width="6"/>' +
    '<rect x="26" y="26" width="' + (W - 52) + '" height="' + (H - 52) + '" fill="none" stroke="#1a1a1a" stroke-width="2"/>' +
    '<text x="' + (W / 2) + '" y="100" text-anchor="middle" font-family="\'Liberation Serif\', \'Times New Roman\', Georgia, serif" font-size="52" font-weight="bold" letter-spacing="4" fill="#7f1d1d">¡SE BUSCA!</text>' +
    '<line x1="' + (W / 2 - 170) + '" y1="122" x2="' + (W / 2 + 170) + '" y2="122" stroke="#1a1a1a" stroke-width="3"/>' +
    '<image x="' + (W / 2 - AV / 2) + '" y="145" width="' + AV + '" height="' + AV + '" xlink:href="data:image/png;base64,' + gray + '"/>' +
    '<rect x="' + (W / 2 - AV / 2 - 6) + '" y="139" width="' + (AV + 12) + '" height="' + (AV + 12) + '" fill="none" stroke="#1a1a1a" stroke-width="3"/>' +
    '<text x="' + (W / 2) + '" y="375" text-anchor="middle" font-family="\'Liberation Serif\', \'Times New Roman\', Georgia, serif" font-size="22" font-weight="bold" letter-spacing="3" fill="#7f1d1d">MUERTO O VIVO</text>' +
    '<rect x="130" y="405" width="240" height="48" fill="#1a1a1a"/>' +
    '<text x="' + (W / 2) + '" y="437" text-anchor="middle" font-family="\'Liberation Mono\', \'Courier New\', monospace" font-size="23" font-weight="bold" fill="#f5f0e1">RECOMPENSA: $' + reward + '</text>' +
    textBlock(lines, W / 2, 495, 34, 42, '#1a1a1a', "'Liberation Serif', 'Times New Roman', Georgia, serif", 'bold', 'normal', 'middle') +
    '<text x="' + (W / 2) + '" y="600" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#5a4a1f" font-style="italic">* por crímenes de lesa diversión *</text>'
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function createAchievementImage(text) {
  const W = 640;
  const H = 320;
  const safe = sanitize(text, 120);
  const lines = wrapText(safe, 30).slice(0, 4);
  const startY = 120;
  const lineHeight = 34;
  const starY = Math.round(H / 2);

  const svg = svgDoc(W, H,
    '<rect width="' + W + '" height="' + H + '" fill="#1d1d1d"/>' +
    '<rect x="6" y="6" width="' + (W - 12) + '" height="' + (H - 12) + '" fill="none" stroke="#8a8a8a" stroke-width="3"/>' +
    '<rect x="45" y="' + (starY - 34) + '" width="68" height="68" rx="6" fill="#8b5a2b"/>' +
    '<rect x="50" y="' + (starY - 29) + '" width="58" height="58" rx="4" fill="#c49a4a"/>' +
    '<path d="M79 ' + (starY - 20) + ' L84 ' + (starY - 4) + ' L100 ' + (starY - 4) + ' L87 ' + (starY + 7) + ' L91 ' + (starY + 24) + ' L79 ' + (starY + 15) + ' L67 ' + (starY + 24) + ' L71 ' + (starY + 7) + ' L58 ' + (starY - 4) + ' L74 ' + (starY - 4) + ' Z" fill="#ffd700"/>' +
    '<text x="140" y="80" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#ffce54">¡Logro desbloqueado!</text>' +
    textBlock(lines, 140, startY, 30, lineHeight, '#ffffff', 'Arial, sans-serif', 'bold', 'normal') +
    '<text x="140" y="' + (startY + lines.length * lineHeight + 20) + '" font-family="Arial, sans-serif" font-size="18" fill="#aaaaaa">Puntos: +50</text>'
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = {
  downloadBuffer,
  createQuoteImage,
  createSignatureImage,
  createPolaroidImage,
  createWantedImage,
  createAchievementImage
};
