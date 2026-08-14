const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const FONTS = {
  Rye: 'Rye-Regular.ttf',
  'Special Elite': 'SpecialElite-Regular.ttf',
  'Dancing Script': 'DancingScript-Regular.ttf',
  Caveat: 'Caveat-Regular.ttf',
  'Luckiest Guy': 'LuckiestGuy-Regular.ttf',
  'Playfair Display': 'PlayfairDisplay-Italic.ttf'
};

function loadFontFaceCss() {
  const css = [];

  for (const family of Object.keys(FONTS)) {
    try {
      const buffer = fs.readFileSync(path.join(__dirname, 'fonts', FONTS[family]));
      css.push(`@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${buffer.toString('base64')}) format('truetype');}`);
    } catch {
      // fuente opcional, si falta se usa el fallback del navegador SVG
    }
  }

  return css.join('\n');
}

const FONT_FACE_CSS = loadFontFaceCss();

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

function svgDoc(width, height, inner, withFonts) {
  const style = withFonts ? '<style>' + FONT_FACE_CSS + '</style>' : '';

  return '<svg width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
    style +
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

function averageColor(pixels) {
  let r = 0;
  let g = 0;
  let b = 0;

  for (const p of pixels) {
    r += p[0];
    g += p[1];
    b += p[2];
  }

  const n = pixels.length || 1;

  return { r: r / n, g: g / n, b: b / n };
}

function colorToHex(c) {
  return '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function colorLuminance(c) {
  return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
}

async function avatarBorderColors(url) {
  const buffer = await downloadBuffer(url);

  if (!buffer) return null;

  try {
    const SIZE = 32;
    const { data, info } = await sharp(buffer)
      .resize(SIZE, SIZE, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    const px = (x, y) => {
      const i = (y * SIZE + x) * channels;
      return [data[i], data[i + 1], data[i + 2]];
    };

    const ring = [];
    const top = [];
    const bottom = [];

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1) {
          ring.push(px(x, y));
        }

        if (y < 2) top.push(px(x, y));
        if (y >= SIZE - 2) bottom.push(px(x, y));
      }
    }

    const mid = averageColor(ring);
    const topColor = averageColor(top);
    const bottomColor = averageColor(bottom);

    return {
      top: colorToHex(topColor),
      bottom: colorToHex(bottomColor),
      textDark: colorLuminance(mid) > 0.55
    };
  } catch {
    return null;
  }
}

async function createQuoteImage(content, authorName, avatarUrl) {
  const PADDING = 45;
  const FONT_SIZE = 32;
  const LINE_HEIGHT = 44;
  const AVATAR_SIZE = 120;

  const lines = wrapText(sanitize(content, 300), 70);

  lines[0] = '"' + lines[0];
  lines[lines.length - 1] = lines[lines.length - 1] + '"';

  const maxLineChars = Math.max(...lines.map(line => line.length));
  const WIDTH = Math.max(420, Math.min(1400, maxLineChars * 17 + PADDING * 2));

  const textBlockHeight = lines.length * LINE_HEIGHT;
  const quoteStart = PADDING + 40;
  const attributionY = quoteStart + textBlockHeight + 20;
  const avatarY = attributionY + 50;
  const HEIGHT = avatarY + AVATAR_SIZE + PADDING;

  const avatar = await circularAvatar(avatarUrl, AVATAR_SIZE, authorName);
  const colors = await avatarBorderColors(avatarUrl);

  const textColor = colors ? (colors.textDark ? '#222222' : '#ffffff') : '#222222';
  const attributionColor = colors ? (colors.textDark ? '#555555' : '#e8e8e8') : '#777777';

  const background = colors
    ? '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + colors.top + '"/>' +
      '<stop offset="1" stop-color="' + colors.bottom + '"/>' +
      '</linearGradient>' +
      '<rect width="' + WIDTH + '" height="' + HEIGHT + '" fill="url(#bg)" rx="16"/>'
    : '<rect width="' + WIDTH + '" height="' + HEIGHT + '" fill="#ffffff" rx="16"/>';

  const svg = svgDoc(WIDTH, HEIGHT,
    background +
    textBlock(lines, PADDING, quoteStart, FONT_SIZE, LINE_HEIGHT, textColor, 'Georgia, serif', 'normal', 'italic') +
    '<text x="' + PADDING + '" y="' + attributionY + '" font-family="Arial, sans-serif" font-size="26" fill="' + attributionColor + '">-' + escapeXml(authorName) + '</text>' +
    '<image x="' + PADDING + '" y="' + avatarY + '" width="' + AVATAR_SIZE + '" height="' + AVATAR_SIZE + '" xlink:href="data:image/png;base64,' + avatar + '"/>'
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function createSignatureImage(name, avatarUrl) {
  const W = 900;
  const AV = 130;
  const safe = sanitize(name, 40);
  const size = Math.max(48, Math.min(96, 140 - safe.length * 3));
  const lineHeight = Math.round(size * 1.4);
  const lines = wrapText(safe, 12);

  const nameY = 265;
  const underlineY = nameY + lines.length * lineHeight + 50;
  const captionY = underlineY + 70;
  const H = captionY + 80;

  const avatar = await circularAvatar(avatarUrl, AV, safe);

  const svg = svgDoc(W, H,
    '<rect width="' + W + '" height="' + H + '" fill="#fdfbf5"/>' +
    '<rect x="14" y="14" width="' + (W - 28) + '" height="' + (H - 28) + '" fill="none" stroke="#e3dccb" stroke-width="2"/>' +
    '<image x="' + (W - AV - 60) + '" y="40" width="' + AV + '" height="' + AV + '" xlink:href="data:image/png;base64,' + avatar + '"/>' +
    '<text x="' + (W / 2) + '" y="180" text-anchor="middle" font-family="Dancing Script" font-size="30" fill="#b9a97e" letter-spacing="4">FIRMA OFICIAL</text>' +
    textBlock(lines, W / 2, nameY, size, lineHeight, '#2c3e50', 'Dancing Script', 'normal', 'normal', 'middle') +
    '<line x1="' + (W / 2 - 150) + '" y1="' + underlineY + '" x2="' + (W / 2 + 150) + '" y2="' + underlineY + '" stroke="#e74c3c" stroke-width="4" stroke-linecap="round"/>' +
    '<text x="' + (W / 2) + '" y="' + captionY + '" text-anchor="middle" font-family="Dancing Script" font-size="26" fill="#8b8575">— firma de ' + escapeXml(safe) + '</text>'
  , true);

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function createPolaroidImage(photo, caption) {
  const PHOTO_SIZE = 440;
  const MARGIN = 35;
  const CAPTION_LINE_HEIGHT = 38;
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
    (captionLines.length ? textBlock(captionLines, W / 2, captionBaseline, 30, CAPTION_LINE_HEIGHT, '#444444', 'Caveat', 'normal', 'normal', 'middle') : '')
  , true);

  return sharp(Buffer.from(svg)).png().toBuffer();
}

const WANTED_FOOTERS = [
  "Por llevar globos a un aborto",
  "Por preguntar '¿y el invitado de honor?' en un velorio de bebé",
  "Por tocar 'Happy Birthday' en un hospital de oncología pediátrica",
  "Por llevar piñata a una cremación",
  "Por preguntar '¿a poco sí se murió?' en una funeraria",
  "Por hacer 'shot' con el formaldehído",
  "Por apostar quién se muere primero en un asilo",
  "Por llevar comida a un velorio... y comérsela frente al ataúd",
  "Por preguntar '¿y cuándo es el festejo?' en un suicidio",
  "Por hacer live del entierro de su suegro",
  "Por llevarle Viagra a un muerto",
  "Por vender boletos para el entierro de su mamá",
  "Por hacer unboxing del ataúd",
  "Por preguntar '¿trae algo adentro?' al ver un ataúd cerrado",
  "Por llevar mariachi a un aborto espontáneo",
  "Por decir 'por fin' cuando se murió el suegro",
  "Por hacer 'retos' en el panteón a las 3 am",
  "Por llevar pastel que diga 'Felicidades' a un divorcio",
  "Por preguntar '¿y el papá?' en un orfanato",
  "Por hacer 'review' del ataúd en YouTube",
  "Por llevar serenata con 'Volver, volver' a un viudo reciente",
  "Por decir 'qué bueno que ya se fue' en el funeral de su esposa",
  "Por hacer 'TikTok' bailando en el ataúd ajeno",
  "Por preguntar '¿y cuándo reparten la herencia?' en la misa de cuerpo presente",
  "Por llevar comida para 10 a un velorio donde solo hay 5",
  "Por decir 'se veía venir' en un funeral de suicida",
  "Por hacer 'predict' de quién se muere el siguiente en la familia",
  "Por llevar 'piñata' en forma de feto",
  "Por preguntar '¿y el que faltaba?' en una reunión familiar... y el que faltaba era el muerto",
  "Por hacer 'speedrun' de un velorio",
  "Por llevar 'kit de emergencia' a un hospicio",
  "Por decir 'a ver si es cierto' cuando alguien dice que se va a matar",
  "Por hacer 'unboxing' de las cenizas del abuelo",
  "Por preguntar '¿y el otro?' a una mamá de gemelos... cuando solo sobrevivió uno",
  "Por llevar 'regalo de bienvenida' a un aborto",
  "Por hacer 'ASMR' en un hospital de tuberculosis",
  "Por decir 'ya era hora' cuando se murió el vecino odioso",
  "Por llevar 'playlist' de éxitos a un velorio de niño",
  "Por preguntar '¿y cuántos faltan?' en un accidente colectivo",
  "Por hacer 'mukbang' en la sala de autopsias",
  "Por llevar 'cajita feliz' a un orfanato... con foto de familia incluida",
  "Por decir 'qué envidia' cuando alguien cuenta que tiene cáncer terminal",
  "Por hacer 'tutorial' de cómo hacer un ataúd casero",
  "Por preguntar '¿y el que se murió?' en una boda... y era el novio anterior",
  "Por llevar 'kit de primeros auxilios' a un asilo",
  "Por hacer 'rate' de ataúdes en el panteón",
  "Por decir 'por fin descansas' a un paralítico que se murió",
  "Por llevar 'piñata' de cáncer a una quimioterapia",
  "Por preguntar '¿y el invitado sorpresa?' en un funeral... y abrir el ataúd",
  "Por hacer 'bingo' con las causas de muerte en el hospital"
];

async function createWantedImage(avatarUrl, name, reward) {
  const W = 500;
  const AV = 190;
  const safeName = sanitize(name, 40);

  const gray = await squareAvatarGray(avatarUrl, AV, safeName);
  const nameLines = wrapText(safeName, 20).slice(0, 2);

  const footerText = WANTED_FOOTERS[Math.floor(Math.random() * WANTED_FOOTERS.length)];
  const footerLines = wrapText(footerText, 42);

  const FOOTER_SIZE = 16;
  const FOOTER_LINE_HEIGHT = 24;
  const nameBlockHeight = nameLines.length * 44;
  const footerStart = 480 + nameBlockHeight + 30;
  const H = footerStart + footerLines.length * FOOTER_LINE_HEIGHT + 40;

  const svg = svgDoc(W, H,
    '<rect width="' + W + '" height="' + H + '" fill="#efe0b8"/>' +
    '<rect x="12" y="12" width="' + (W - 24) + '" height="' + (H - 24) + '" fill="none" stroke="#1a1a1a" stroke-width="6"/>' +
    '<rect x="26" y="26" width="' + (W - 52) + '" height="' + (H - 52) + '" fill="none" stroke="#1a1a1a" stroke-width="2"/>' +
    '<text x="' + (W / 2) + '" y="100" text-anchor="middle" font-family="Rye" font-size="52" letter-spacing="4" fill="#7f1d1d">¡SE BUSCA!</text>' +
    '<line x1="' + (W / 2 - 170) + '" y1="122" x2="' + (W / 2 + 170) + '" y2="122" stroke="#1a1a1a" stroke-width="3"/>' +
    '<image x="' + (W / 2 - AV / 2) + '" y="145" width="' + AV + '" height="' + AV + '" xlink:href="data:image/png;base64,' + gray + '"/>' +
    '<rect x="' + (W / 2 - AV / 2 - 6) + '" y="139" width="' + (AV + 12) + '" height="' + (AV + 12) + '" fill="none" stroke="#1a1a1a" stroke-width="3"/>' +
    '<text x="' + (W / 2) + '" y="375" text-anchor="middle" font-family="Rye" font-size="22" letter-spacing="3" fill="#7f1d1d">MUERTO O VIVO</text>' +
    '<rect x="130" y="405" width="240" height="48" fill="#1a1a1a"/>' +
    '<text x="' + (W / 2) + '" y="437" text-anchor="middle" font-family="Special Elite" font-size="20" fill="#f5f0e1">RECOMPENSA: $' + reward + '</text>' +
    textBlock(nameLines, W / 2, 480, 34, 44, '#1a1a1a', 'Rye', 'normal', 'normal', 'middle') +
    textBlock(footerLines, W / 2, footerStart, FOOTER_SIZE, FOOTER_LINE_HEIGHT, '#5a4a1f', 'Special Elite', 'normal', 'normal', 'middle')
  , true);

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function createWelcomeImage(avatarUrl, username, serverName, memberCount) {
  const W = 800;
  const H = 470;
  const AV = 160;
  const cx = W / 2;
  const safeName = sanitize(username, 24);
  const safeServer = sanitize(serverName, 30);
  const avatarY = 180;

  const avatar = await circularAvatar(avatarUrl, AV, safeName);

  const svg = svgDoc(W, H,
    '<defs>' +
    '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#1b1b3a"/>' +
    '<stop offset="55%" stop-color="#2b1055"/>' +
    '<stop offset="100%" stop-color="#3a0ca3"/>' +
    '</linearGradient>' +
    '<linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0%" stop-color="#ffce54"/>' +
    '<stop offset="100%" stop-color="#ff9d3c"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#bg)"/>' +
    '<circle cx="' + (W * 0.12) + '" cy="' + (H * 0.2) + '" r="120" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="2"/>' +
    '<circle cx="' + (W * 0.9) + '" cy="' + (H * 0.78) + '" r="150" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="2"/>' +
    '<rect x="10" y="10" width="' + (W - 20) + '" height="' + (H - 20) + '" fill="none" stroke="#ffce54" stroke-width="2"/>' +
    '<rect x="18" y="18" width="' + (W - 36) + '" height="' + (H - 36) + '" fill="none" stroke="#ffce54" stroke-opacity="0.35" stroke-width="1"/>' +
    '<text x="' + cx + '" y="72" text-anchor="middle" font-family="Luckiest Guy" font-size="46" fill="url(#accent)">¡BIENVENIDO!</text>' +
    '<text x="' + cx + '" y="128" text-anchor="middle" font-family="Rye" font-size="38" fill="#ffffff" letter-spacing="2">' + escapeXml(safeServer) + '</text>' +
    '<circle cx="' + cx + '" cy="' + (avatarY + AV / 2) + '" r="' + (AV / 2 + 24) + '" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>' +
    '<circle cx="' + cx + '" cy="' + (avatarY + AV / 2) + '" r="' + (AV / 2 + 14) + '" fill="none" stroke="url(#accent)" stroke-width="6"/>' +
    '<image x="' + (cx - AV / 2) + '" y="' + avatarY + '" width="' + AV + '" height="' + AV + '" xlink:href="data:image/png;base64,' + avatar + '"/>' +
    '<text x="' + cx + '" y="' + (avatarY + AV + 50) + '" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#ffffff">' + escapeXml(safeName) + '</text>' +
    (memberCount
      ? '<text x="' + cx + '" y="' + (avatarY + AV + 92) + '" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" fill="#ffce54">¡Ya somos ' + memberCount + ' miembros!</text>'
      : '')
  , true);

  return sharp(Buffer.from(svg)).png().toBuffer();
}

function wavingHand(x, y, dir) {
  const flip = dir === -1 ? ' scale(-1 1)' : '';

  return '<g transform="translate(' + x + ' ' + y + ')' + flip + '">' +
    '<path d="M -58 30 A 34 34 0 0 1 -48 -18" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M -66 8 A 26 26 0 0 1 -56 -10" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="5" stroke-linecap="round"/>' +
    '<rect x="-9" y="38" width="18" height="34" rx="9" fill="#f8b878" stroke="#d9975a" stroke-width="2"/>' +
    '<ellipse cx="0" cy="20" rx="25" ry="29" fill="#ffd54d" stroke="#e0b530" stroke-width="3"/>' +
    '<rect x="-20" y="-34" width="13" height="46" rx="6.5" fill="#ffd54d" stroke="#e0b530" stroke-width="3"/>' +
    '<rect x="-7" y="-40" width="14" height="52" rx="7" fill="#ffd54d" stroke="#e0b530" stroke-width="3"/>' +
    '<rect x="6" y="-38" width="14" height="50" rx="7" fill="#ffd54d" stroke="#e0b530" stroke-width="3"/>' +
    '<rect x="19" y="-30" width="12" height="42" rx="6" fill="#ffd54d" stroke="#e0b530" stroke-width="3"/>' +
    '<rect x="-34" y="-2" width="17" height="30" rx="8.5" fill="#ffd54d" stroke="#e0b530" stroke-width="3" transform="rotate(-38 -25 13)"/>' +
    '</g>';
}

async function createGoodbyeImage(avatarUrl, username, serverName) {
  const W = 800;
  const H = 470;
  const AV = 150;
  const cx = W / 2;
  const safeName = sanitize(username, 24);
  const safeServer = sanitize(serverName, 30);
  const avatarY = 185;
  const handY = avatarY + AV / 2;

  const avatar = await circularAvatar(avatarUrl, AV, safeName);

  const svg = svgDoc(W, H,
    '<defs>' +
    '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#1b1b3a"/>' +
    '<stop offset="55%" stop-color="#2b1055"/>' +
    '<stop offset="100%" stop-color="#3a0ca3"/>' +
    '</linearGradient>' +
    '<linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0%" stop-color="#ffce54"/>' +
    '<stop offset="100%" stop-color="#ff9d3c"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#bg)"/>' +
    '<circle cx="' + (W * 0.12) + '" cy="' + (H * 0.2) + '" r="120" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="2"/>' +
    '<circle cx="' + (W * 0.9) + '" cy="' + (H * 0.78) + '" r="150" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="2"/>' +
    '<rect x="10" y="10" width="' + (W - 20) + '" height="' + (H - 20) + '" fill="none" stroke="#ffce54" stroke-width="2"/>' +
    '<rect x="18" y="18" width="' + (W - 36) + '" height="' + (H - 36) + '" fill="none" stroke="#ffce54" stroke-opacity="0.35" stroke-width="1"/>' +
    '<text x="' + cx + '" y="72" text-anchor="middle" font-family="Luckiest Guy" font-size="46" fill="url(#accent)">¡ADIÓS!</text>' +
    '<text x="' + cx + '" y="128" text-anchor="middle" font-family="Rye" font-size="34" fill="#ffffff" letter-spacing="2">' + escapeXml(safeServer) + '</text>' +
    '<circle cx="' + cx + '" cy="' + (avatarY + AV / 2) + '" r="' + (AV / 2 + 24) + '" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>' +
    '<circle cx="' + cx + '" cy="' + (avatarY + AV / 2) + '" r="' + (AV / 2 + 14) + '" fill="none" stroke="url(#accent)" stroke-width="6"/>' +
    '<image x="' + (cx - AV / 2) + '" y="' + avatarY + '" width="' + AV + '" height="' + AV + '" xlink:href="data:image/png;base64,' + avatar + '"/>' +
    wavingHand(cx - AV / 2 - 95, handY, 1) +
    wavingHand(cx + AV / 2 + 95, handY, -1) +
    '<text x="' + cx + '" y="' + (avatarY + AV + 44) + '" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#ffffff">' + escapeXml(safeName) + '</text>' +
    '<text x="' + cx + '" y="' + (avatarY + AV + 82) + '" text-anchor="middle" font-family="Luckiest Guy" font-size="24" fill="url(#accent)">¡Te irá mejor en el anexo!</text>'
  , true);

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function createStatsImage(username, level, xpIntoLevel, xpToNext, messages, coins, streak, vcMinutes, last7) {
  const W = 800;
  const H = 300;
  const cx = W / 2;
  const safe = sanitize(username, 24);
  const progress = xpToNext > 0 ? Math.min(1, xpIntoLevel / xpToNext) : 0;
  const barW = 420;
  const barH = 24;
  const barX = (W - barW) / 2;
  const barY = 120;

  const chartX = 60;
  const chartW = W - 120;
  const chartBottom = 250;
  const chartH = chartBottom - 165;
  const max = Math.max(1, ...(last7 || []).map(d => d.count || 0));
  const n = last7 ? last7.length : 7;
  const slot = chartW / n;
  const barMaxW = Math.round(slot * 0.6);

  const bars = (last7 || []).map((d, i) => {
    const h = Math.max(2, Math.round(((d.count || 0) / max) * chartH));
    const bx = chartX + slot * i + (slot - barMaxW) / 2;
    const by = chartBottom - h;

    return '<rect x="' + bx + '" y="' + by + '" width="' + barMaxW + '" height="' + h + '" fill="#ffce54" rx="4"/>' +
      '<text x="' + (bx + barMaxW / 2) + '" y="' + (by - 8) + '" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#ffffff">' + (d.count || 0) + '</text>' +
      '<text x="' + (bx + barMaxW / 2) + '" y="' + (chartBottom + 18) + '" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#aaaaaa">' + escapeXml(d.label || '') + '</text>';
  }).join('');

  const svg = svgDoc(W, H,
    '<rect width="' + W + '" height="' + H + '" fill="#1b1b3a"/>' +
    '<rect x="10" y="10" width="' + (W - 20) + '" height="' + (H - 20) + '" fill="none" stroke="#ffce54" stroke-width="2"/>' +
    '<text x="' + cx + '" y="52" text-anchor="middle" font-family="Luckiest Guy" font-size="34" fill="#ffce54">' + escapeXml(safe) + '</text>' +
    '<text x="' + cx + '" y="84" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#ffffff">Nivel ' + level + ' · ' + messages + ' mensajes · ' + coins + ' monedas · racha ' + streak + ' días · ' + vcMinutes + ' min en voz</text>' +
    '<rect x="' + barX + '" y="' + barY + '" width="' + barW + '" height="' + barH + '" rx="' + (barH / 2) + '" fill="#2b1055"/>' +
    '<rect x="' + barX + '" y="' + barY + '" width="' + Math.round(barW * progress) + '" height="' + barH + '" rx="' + (barH / 2) + '" fill="#ffce54"/>' +
    '<text x="' + cx + '" y="' + (barY + barH + 20) + '" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#dddddd">' + xpIntoLevel + ' / ' + xpToNext + ' XP</text>' +
    bars
  , true);

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function createAchievementImage(text) {
  const W = 640;
  const H = 320;
  const safe = sanitize(text, 120);
  const lines = wrapText(safe, 24).slice(0, 4);
  const startY = 120;
  const lineHeight = 34;
  const starY = Math.round(H / 2);

  const svg = svgDoc(W, H,
    '<rect width="' + W + '" height="' + H + '" fill="#1d1d1d"/>' +
    '<rect x="6" y="6" width="' + (W - 12) + '" height="' + (H - 12) + '" fill="none" stroke="#8a8a8a" stroke-width="3"/>' +
    '<rect x="45" y="' + (starY - 34) + '" width="68" height="68" rx="6" fill="#8b5a2b"/>' +
    '<rect x="50" y="' + (starY - 29) + '" width="58" height="58" rx="4" fill="#c49a4a"/>' +
    '<path d="M79 ' + (starY - 20) + ' L84 ' + (starY - 4) + ' L100 ' + (starY - 4) + ' L87 ' + (starY + 7) + ' L91 ' + (starY + 24) + ' L79 ' + (starY + 15) + ' L67 ' + (starY + 24) + ' L71 ' + (starY + 7) + ' L58 ' + (starY - 4) + ' L74 ' + (starY - 4) + ' Z" fill="#ffd700"/>' +
    '<text x="140" y="80" font-family="Luckiest Guy" font-size="24" fill="#ffce54">¡Logro desbloqueado!</text>' +
    textBlock(lines, 140, startY, 26, lineHeight, '#ffffff', 'Luckiest Guy', 'normal', 'normal') +
    '<text x="140" y="' + (startY + lines.length * lineHeight + 20) + '" font-family="Luckiest Guy" font-size="18" fill="#aaaaaa">Puntos: +50</text>'
  , true);

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function createAnnouncementImage(text, author) {
  const W = 1000;
  const safe = sanitize(text, 500);

  let fontSize = 92;
  let maxChars = 20;
  let lines = wrapText(safe, maxChars).slice(0, 8);

  while (lines.length > 6 && fontSize > 46) {
    fontSize -= 8;
    maxChars = Math.max(14, Math.round(W / (fontSize * 0.55)));
    lines = wrapText(safe, maxChars).slice(0, 8);
  }

  const lineHeight = Math.round(fontSize * 1.25);
  const titleY = 170;
  const startY = 280;
  const bodyH = lines.length * lineHeight;
  const footerY = startY + bodyH + 70;
  const H = footerY + 80;

  const svg = svgDoc(W, H,
    '<rect width="' + W + '" height="' + H + '" fill="#2c1144"/>' +
    '<rect x="20" y="20" width="' + (W - 40) + '" height="' + (H - 40) + '" fill="none" stroke="#9b59b6" stroke-width="4" rx="24"/>' +
    '<text x="' + (W / 2) + '" y="' + titleY + '" text-anchor="middle" font-family="Luckiest Guy" font-size="110" fill="#ffce54">ANUNCIO</text>' +
    '<line x1="180" y1="205" x2="' + (W - 180) + '" y2="205" stroke="#9b59b6" stroke-width="3"/>' +
    textBlock(lines, 60, startY, fontSize, lineHeight, '#ffffff', 'Luckiest Guy', 'normal', 'normal') +
    '<text x="' + (W / 2) + '" y="' + footerY + '" text-anchor="middle" font-family="Luckiest Guy" font-size="32" fill="#c39bd3">— ' + escapeXml(author) + ' —</text>'
  , true);

  return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = {
  downloadBuffer,
  createQuoteImage,
  createSignatureImage,
  createPolaroidImage,
  createWantedImage,
  createAchievementImage,
  createAnnouncementImage,
  createWelcomeImage,
  createGoodbyeImage,
  createStatsImage,
};
