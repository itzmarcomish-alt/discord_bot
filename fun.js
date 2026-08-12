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

async function blurredBackground(url, width, height) {
  const buffer = await downloadBuffer(url);

  if (!buffer) return null;

  try {
    const output = await sharp(buffer)
      .resize(width, height, { fit: 'cover' })
      .blur(24)
      .modulate({ brightness: 1.15, saturation: 1.1 })
      .png()
      .toBuffer();

    return output.toString('base64');
  } catch {
    return null;
  }
}

async function createQuoteImage(content, authorName, avatarUrl) {
  const PADDING = 45;
  const FONT_SIZE = 32;
  const LINE_HEIGHT = 44;
  const AVATAR_SIZE = 120;

  const lines = wrapText(sanitize(content, 300), 26);

  lines[0] = '"' + lines[0];
  lines[lines.length - 1] = lines[lines.length - 1] + '"';

  const maxLineChars = Math.max(...lines.map(line => line.length));
  const WIDTH = Math.max(420, Math.min(760, maxLineChars * 17 + PADDING * 2));

  const textBlockHeight = lines.length * LINE_HEIGHT;
  const quoteStart = PADDING + 40;
  const attributionY = quoteStart + textBlockHeight + 20;
  const avatarY = attributionY + 50;
  const HEIGHT = avatarY + AVATAR_SIZE + PADDING;

  const avatar = await circularAvatar(avatarUrl, AVATAR_SIZE, authorName);
  const background = await blurredBackground(avatarUrl, WIDTH, HEIGHT);

  const svg = svgDoc(WIDTH, HEIGHT,
    (background
      ? '<image x="0" y="0" width="' + WIDTH + '" height="' + HEIGHT + '" xlink:href="data:image/png;base64,' + background + '"/>'
      : '<rect width="' + WIDTH + '" height="' + HEIGHT + '" fill="#ffffff"/>') +
    '<rect width="' + WIDTH + '" height="' + HEIGHT + '" fill="#ffffff" opacity="0.6"/>' +
    '<rect x="14" y="14" width="' + (WIDTH - 28) + '" height="' + (HEIGHT - 28) + '" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.85" rx="12"/>' +
    textBlock(lines, PADDING, quoteStart, FONT_SIZE, LINE_HEIGHT, '#1f1f1f', 'Playfair Display', 'normal', 'italic') +
    '<text x="' + PADDING + '" y="' + attributionY + '" font-family="Playfair Display" font-size="26" fill="#3a3a3a">-' + escapeXml(authorName) + '</text>' +
    '<image x="' + PADDING + '" y="' + avatarY + '" width="' + AVATAR_SIZE + '" height="' + AVATAR_SIZE + '" xlink:href="data:image/png;base64,' + avatar + '"/>'
  , true);

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
  ['WANTED: Por violar cadáveres. Decía que "al menos no se quejaban".', 'SE BUSCA: Por vender heroína cortada con cenizas de su madre. "Ella hubiera querido que la consuman".', 'RECOMPENSA: $50,000. Vivo para interrogarlo. Muerto para alimentar a los cerdos.'],
  ['WANTED: Por enterrar a sus hijos vivos. Dijo que "necesitaban madurar bajo tierra".', 'SE BUSCA: Por hacer abortos con una escopeta. Eficiente pero desordenado.', 'RECOMPENSA: Por su lengua. Arrancada. Ya ha dicho suficiente.'],
  ['WANTED: Por canibalismo. Dijo que "quería sentirse dentro de alguien de verdad".', 'SE BUSCA: Por vender órganos de niños. "Casi nuevos, poco uso".', 'RECOMPENSA: $100,000 o lo equivalente en partes de su cuerpo en el mercado negro.'],
  ['WANTED: Por violar a su abuela enferma. Ella no se enteró, pero Dios sí.', 'SE BUSCA: Por hacer snuff films caseros. Calidad amateur, contenido profesional.', 'RECOMPENSA: Mortal. Como su última víctima, pero más lento.'],
  ['WANTED: Por necrofilia y zoofilia. A veces combinadas. "Necesito ayuda", dijo nadie.', 'SE BUSCA: Por vender bebés a traficantes. "Envío gratis, devoluciones no aceptadas".', 'RECOMPENSA: Su cabeza en una pica. Decorativo y ejemplarizante.'],
  ['WANTED: Por torturar gatos hasta la muerte. Ahora busca compañía humana.', 'SE BUSCA: Por incesto forzado. "La familia que viola unida, permanece unida".', 'RECOMPENSA: $5,000 por cada dedo. Traigan la caja completa.'],
  ['WANTED: Por prostituir a su hija discapacitada. Dijo que "al menos trabaja desde casa".', 'SE BUSCA: Por hacer experimentos médicos en vagabundos. Resultados: 100% letales.', 'RECOMPENSA: Su piel. Viva. Para el sótano del sheriff.'],
  ['WANTED: Por pederastia. Prefiere muertos porque "no crecen para contarlo".', 'SE BUSCA: Por tráfico de órganos de fetos. "Material de construcción barato".', 'RECOMPENSA: Lo suficiente para pagar el tratamiento de quienes lo encuentren primero.'],
  ['WANTED: Por violar cadáveres de niños. Nivel de enfermo: insondable.', 'SE BUSCA: Por hacer bollos con carne humana. "Receta secreta de la abuela".', 'RECOMPENSA: Su corazón. Todavía latiendo, preferiblemente.'],
  ['WANTED: Por secuestrar bebés para venderlos a pedófilos. Cadena de suministro completa.', 'SE BUSCA: Por filmar snuff de indigentes. "Arte callejero", lo llamaba.', 'RECOMPENSA: $200,000. O su cabeza. El dinero es más fácil de gastar.'],
  ['WANTED: Por castración forzada con herramientas de jardín. "Podando la sociedad".', 'SE BUSCA: Por vender videos de tortura animal como pornografía. Clientela selecta.', 'RECOMPENSA: Su sangre. Cinco litros, en botellas, para análisis forense.'],
  ['WANTED: Por abusar de su hija post-mortem. "Hasta que la muerte nos separe" fue sugerencia.', 'SE BUSCA: Por tráfico de niños para sacrificios rituales. "Pedidos especiales para satanás".', 'RECOMPENSA: Eternidad en el infierno. Y $10,000 de este lado.'],
  ['WANTED: Por hacer abortos clandestinos con un gancho de carne. Sin anestesia, sin luz.', 'SE BUSCA: Por canibalismo infantil. "La carne más tierna", según su diario.', 'RECOMPENSA: Sus ojos. Para que deje de mirar así.'],
  ['WANTED: Por violación sistemática de cadáveres en el depósito del pueblo. Turno nocturno.', 'SE BUSCA: Por vender fetos encurtidos como "delicatessen". Sabor a amniótico.', 'RECOMPENSA: Su columna vertebral. Para hacer una flauta o algo peor.'],
  ['WANTED: Por incesto con gemelos siameses. "Dos por uno", decía el muy hijo de puta.', 'SE BUSCA: Por experimentar con ácido en vagabundos. Caras borradas, identidades también.', 'RECOMPENSA: Su piel desollada. Para tapizar algo bonito.'],
  ['WANTED: Por pornografía infantil extrema. Coleccionista de almas rotas.', 'SE BUSCA: Por asesinar prostitutas y hacer collares con sus dientes. "Joyería íntima".', 'RECOMPENSA: Su lengua bifurcada. Para que hable con la serpiente que lleva dentro.'],
  ['WANTED: Por violar a su madre senil. "Ella no recordaba, yo no olvidaba".', 'SE BUSCA: Por tráfico de bebés congelados. "Entrega a domicilio, conservar a -18°C".']
];

async function createWantedImage(avatarUrl, name, reward) {
  const W = 500;
  const AV = 190;
  const safeName = sanitize(name, 40);

  const gray = await squareAvatarGray(avatarUrl, AV, safeName);
  const nameLines = wrapText(safeName, 20).slice(0, 2);

  const footer = WANTED_FOOTERS[Math.floor(Math.random() * WANTED_FOOTERS.length)];
  const footerLines = [];

  for (const part of footer) {
    for (const line of wrapText(part, 42)) {
      footerLines.push(line);
    }
  }

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

module.exports = {
  downloadBuffer,
  createQuoteImage,
  createSignatureImage,
  createPolaroidImage,
  createWantedImage,
  createAchievementImage
};
