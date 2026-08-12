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

  const lines = wrapText(sanitize(content, 300), 40);

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
  'Por violar a su hija discapacitada hasta dejarla vegetal. Dijo que "así no cuenta como testigo, y el brócoli tampoco habla".',
  'Por vender videos de snuff infantil donde él mismo protagoniza el final. "Autocrítica extrema", según su agente.',
  'Por hacer un collar con los prepucios de sus víctimas. "Colección completa", dice. "Falta la hebilla", dice su terapeuta.',
  'Por enterrar a su esposa viva con su amante muerto. "Que se entretengan juntos". Economía doméstica.',
  'Por canibalismo de fetos. Los compraba, los cocinaba, los fotografiaba para su blog. "Cero waste, todo sostenible".',
  'Por castrar a vagabundos con una cuchara oxidada. Colección de 23 escrotos en formol. "Mi bolsa de pelotas", la llama.',
  'Por violar el cuerpo de su madre durante tres días después del infarto. "Último abrazo. Ella no se quejó, cosa rara en ella".',
  'Por traficar niños para granjas de órganos. "Pedidos por piezas o al peso. Envío gratis en compras mayores a un hígado".',
  'Por hacer experimentos de eutanasia forzada en ancianos del asilo. "Investigación privada. Resultados: la muerte sí es el final".',
  'Por vender agua bendita mezclada con semen de enfermos terminales. "Bendición contagiosa. Dos en uno: fe y fiebre".',
  'Por torturar a su hijo hasta que se cagaba encima, luego lo obligaba a comerlo. "Reciclaje familiar. Somos ecológicos".',
  'Por filmar violaciones de cadáveres con música de caja de música de fondo. "Romántico hasta el final, aunque sea unilateral".',
  'Por coser los labios de prostitutas mientras las violaba. "Silencio dorado. Clientes satisfechos, cero quejas formales".',
  'Por mantener un sótano con gemelos siameses secuestrados desde 1998. "Mascotas humanas. Comen poco, ladran doble".',
  'Por hacer sopa con fetos de aborto clandestino. "Caldo de vida", lo llamaba. "Sopa de letras", decían los clientes.',
  'Por arrancarle los ojos a su esposa con un sacacorchos. "Para que no me viera con otras. Ahora ve todo borroso, problema resuelto".',
  'Por vender piel humana curtida hecha lámparas. "Iluminación orgánica. Enciende la piel de tu ex".',
  'Por violar a su abuela con demencia y grabarlo para su canal privado. "Contenido vintage. Ella no recordaba, yo no olvidaba, el algoritmo recomendaba".',
  'Por traficar bebés recién nacidos a pedófilos con SIDA. "Entrega inmunológica. Regala enfermedades, recibe trauma".',
  'Por hacer un traje de piel humana de mujeres embarazadas. "Doble capa. Abrigo de dos por uno, oferta imperdible".',
  'Por enterrar a sus hijos hasta el cuello y orinarles encima. "Ducha dorada forzada. Aprenden hidráulica temprano".',
  'Por vender videos de niños siendo descuartizados vivos. Contenido premium. "ASMR extremo", según los comentarios.',
  'Por mantener un harem de cadáveres de suicidas en su congelador. "Compañía fría. No hablan, no juzgan, no se descomponen rápido".',
  'Por arrancarle los dientes a su hijo con alicates. "Para que no hable mal de mí. Ahora escribe mejor, padre del año".',
  'Por hacer abortos con un taladro y vender los restos a restaurantes chinos. "Fusión culinaria. De la clinica al plato en 30 minutos".',
  'Por violar a su hermana menor hasta dejarla estéril y luego vender su matriz. "Emprendedor serial. Nada se desperdicia".',
  'Por hacer una colección de cabezas de fetos en tarros de vidrio. "Bebés eternos. Decoración minimalista para el baño".',
  'Por torturar animales hasta que mueren y luego violar sus cadáveres. "Segunda ronda. Amor incondicional, incluso post-mortem".',
  'Por mantener secuestrada a su propia hija como esclava sexual durante 15 años. "Trabajo desde casa antes de que fuera mainstream".',
  'Por vender riñones de niños de la calle. "Casi nuevos, un solo dueño. Garantía de fábrica, si tuvieran papeles".',
  'Por hacer un traje de boda con piel de vírgenes violadas. "Blanco inmaculado. Hasta que se mancha con la realidad".',
  'Por enterrar a su familia en el jardín y plantar rosas encima. "Abono familiar. Finalmente aportan algo al hogar".',
  'Por filmar cómo desangra a vagabundos para hacer vino de sangre humana. "Cosecha propia. Terroir urbano, notas a hierro y desesperación".',
  'Por violar cadáveres en el depósito del hospital y dejarlos llenos de semen podrido. "Donación anónima. Ellos no pueden rechazarla".',
  'Por hacer una marioneta con huesos de su exesposa. "Ahora baila cuando yo digo. Relación mejorada, diría yo".',
  'Por traficar niños discapacitados para peleas clandestinas hasta la muerte. "Inclusión forzada. Todos pelean, nadie gana".',
  'Por arrancarle la lengua a su madre y cosérsela en el ano. "Boca abajo. Finalmente dice lo que pienso".',
  'Por vender agujas infectadas con VIH a adictos. "Promoción de lealtad. Clientes de por vida, literalmente".',
  'Por hacer un altar con partes íntimas de 40 mujeres. "Santuario de carne. Airbnb para almas perdidas".',
  'Por violar a su hija mientras la obligaba a mirar fotos de su madre muerta. "Noche de padre e hija. Memoria familiar viva".',
  'Por hacer jabón con grasa de cadáveres de indigentes. "Limpieza profunda. De la calle a tu piel, cero residuos".',
  'Por mantener un criadero de niños para venderlos a productores de snuff. "Granja de talentos. Descubrimos estrellas, las matamos".',
  'Por coser los ojos de su esposa mientras dormía. "Para que no me deje. Spoiler: se fue igual, pero a ciegas".',
  'Por hacer una colección de fetos momificados que usa como muñecos sexuales. "Juguetes antiguos. Coleccionable, no juguete. Bueno, un poco sí".',
  'Por traficar órganos de bebés recién nacidos a millonarios enfermos. "Piezas frescas. Delivery express, aún latiendo".',
  'Por violar a su hijo autista hasta que dejó de hablar para siempre. "Terapia de silencio. Caro, pero efectivo".',
  'Por hacer un piano con huesos de niños desaparecidos. "Música de la inocencia. Cada tecla un llanto, cada concierto un funeral".',
  'Por mantener un harem de cadáveres infantiles en descomposición en su sótano húmedo. "Guardería nocturna. Cuidamos tus pesadillas".',
  'Por arrancarle el corazón a su novia con las manos desnudas. "Literalmente me robaste el corazón, cariño. Devolví el favor".',
  'Por hacer una colección de 200 prepucios secos que lleva como amuleto en un collar. "Collar de la virilidad. Cada pieza un fracaso, cada fracaso una victoria".'
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
