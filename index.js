require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  GuildVerificationLevel,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  Partials
} = require('discord.js');

const sharp = require('sharp');

const funImages = require('./fun');
const storage = require('./db');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember
  ]
});

const ADMIN_ROLE_NAME = process.env.ADMIN_ROLE_NAME || 'Admin';
const ADMIN_ROLE_IDS = new Set(
  (process.env.ADMIN_ROLE_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
);
const BANK_ADMIN_ROLE_ID = process.env.BANK_ADMIN_ROLE_ID || '1536973260896473109';
const MODLOG_CHANNEL_ID = process.env.MODLOG_CHANNEL_ID || '';
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID || '';
const SCAM_EXCLUDED_CHANNELS = new Set(
  (process.env.SCAM_EXCLUDED_CHANNELS || '').split(',').map(id => id.trim()).filter(Boolean)
);
const IMAGE_SPAM_THRESHOLD = 4;
const IMAGE_SPAM_WINDOW_MS = 60 * 1000;

const LEAVE_MESSAGE = process.env.LEAVE_MESSAGE || '👋 **{username}** abandonó el servidor.';
const LEAVE_CHANNEL_ID = process.env.LEAVE_CHANNEL_ID || '1536992463875735663';
let leaveMessageOverride = null;

const LEVEL_CHANNEL_ID = process.env.LEVEL_CHANNEL_ID || '1536991424032014428';
const LEVELS = new Map();

const BIRTHDAY_CHANNEL_ID = process.env.BIRTHDAY_CHANNEL_ID || '1537276322471088238';

const SHOP_ITEMS = (process.env.SHOP_ITEMS || '')
  .split('|')
  .map(item => {
    const [name, roleId, price] = item.split(':').map(part => part.trim());
    return name && roleId && /^\d+$/.test(price) ? { name, roleId, price: parseInt(price, 10) } : null;
  })
  .filter(Boolean);

const CUSTOM_ROLE_PRICE = parseInt(process.env.CUSTOM_ROLE_PRICE, 10) || 2000;

const SHOP_THEMES = [
  { id: 'ghost',   name: 'Fantasma',    color: 0x95a5a6, price: 300,  emoji: '👻' },
  { id: 'flower',  name: 'Florecita',   color: 0xfdcb6e, price: 350,  emoji: '🌸' },
  { id: 'mint',    name: 'Menta',       color: 0x1abc9c, price: 400,  emoji: '🍃' },
  { id: 'siren',   name: 'Sirena',      color: 0xff6b81, price: 450,  emoji: '🧜' },
  { id: 'unicorn', name: 'Unicornio',   color: 0xe91e63, price: 500,  emoji: '🦄' },
  { id: 'rainbow', name: 'Arcoíris',    color: 0xff9eaa, price: 600,  emoji: '🌈' },
  { id: 'vampire', name: 'Vampiro',     color: 0x992d22, price: 700,  emoji: '🧛' },
  { id: 'zombie',  name: 'Zombi',       color: 0x2ecc71, price: 700,  emoji: '🧟' },
  { id: 'ocean',   name: 'Océano',      color: 0x3498db, price: 800,  emoji: '🌊' },
  { id: 'royal',   name: 'Realeza',     color: 0xf1c40f, price: 1000, emoji: '👑' },
  { id: 'dragon',  name: 'Dragón',      color: 0xe74c3c, price: 1500, emoji: '🐉' },
  { id: 'gold',    name: 'Legendario',  color: 0xffd700, price: 2500, emoji: '✨' }
];

const ROLE_COLOR_NAMES = {
  rojo: 0xe74c3c,
  azul: 0x3498db,
  verde: 0x2ecc71,
  morado: 0x9b59b6,
  rosa: 0xe91e63,
  naranja: 0xe67e22,
  amarillo: 0xf1c40f,
  blanco: 0xffffff,
  negro: 0x2c3e50,
  cyan: 0x1abc9c,
  cian: 0x1abc9c,
  gris: 0x95a5a6,
  turquesa: 0x1abc9c,
  celeste: 0x87ceeb,
  lila: 0xc8a2c8,
  lavanda: 0xb57edc,
  coral: 0xff7f50,
  salmon: 0xfa8072,
  marron: 0x795548,
  cafe: 0x795548,
  vino: 0x722f37,
  burdeos: 0x800020,
  granate: 0x800000,
  dorado: 0xd4af37,
  oro: 0xd4af37,
  plata: 0xc0c0c0,
  fucsia: 0xff00ff,
  magenta: 0xff00ff,
  violeta: 0x8f00ff,
  indigo: 0x4b0082,
  esmeralda: 0x50c878,
  menta: 0x98ff98,
  pistacho: 0x93c572,
  mostaza: 0xffdb58,
  oliva: 0x808000,
  teal: 0x008080,
  aguamarina: 0x7fffd4,
  aqua: 0x00ffff,
  lima: 0x32cd32,
  beige: 0xf5f5dc,
  crema: 0xfffdd0,
  durazno: 0xffdab9,
  carmesi: 0xdc143c,
  caqui: 0xc3b091,
  terracota: 0xe2725b,
  cobre: 0xb87333,
  bronce: 0xcd7f32,
  fosforito: 0x39ff14,
  neon: 0x39ff14,
  'azul marino': 0x000080,
  'azul cielo': 0x87ceeb,
  'gris claro': 0xd3d3d3,
  'gris oscuro': 0x696969,
  'rosa pastel': 0xffb6c1,
  'rosa choque': 0xff69b4,
  red: 0xe74c3c,
  blue: 0x3498db,
  green: 0x2ecc71,
  purple: 0x9b59b6,
  pink: 0xe91e63,
  orange: 0xe67e22,
  yellow: 0xf1c40f,
  white: 0xffffff,
  black: 0x2c3e50,
  gray: 0x95a5a6,
  grey: 0x95a5a6,
  turquoise: 0x1abc9c,
  navy: 0x000080,
  skyblue: 0x87ceeb,
  lavender: 0xb57edc,
  gold: 0xd4af37,
  silver: 0xc0c0c0,
  brown: 0x795548,
  maroon: 0x800020,
  crimson: 0xdc143c,
  mint: 0x98ff98,
  emerald: 0x50c878,
  lime: 0x32cd32,
  olive: 0x808000,
  peach: 0xffdab9,
  aquamarine: 0x7fffd4,
  violet: 0x8f00ff,
  fuchsia: 0xff00ff,
  hotpink: 0xff69b4,
  mustard: 0xffdb58,
  khaki: 0xc3b091,
  bronze: 0xcd7f32,
  copper: 0xb87333
};

const LEVEL_ROLES = new Map([
  [20, '1537279245225566278'],
  [50, '1537279365065482272'],
  [75, '1537279459059830794'],
  [100, '1537279542132088963']
]);

for (const pair of (process.env.LEVEL_ROLES || '').split(',').map(p => p.trim()).filter(Boolean)) {
  const [level, roleId] = pair.split(':').map(part => part.trim());

  if (/^\d+$/.test(level) && /^\d+$/.test(roleId || '')) {
    LEVEL_ROLES.set(parseInt(level, 10), roleId);
  }
}

function createBucket(name) {
  const map = new Map();
  let timer = null;

  async function save() {
    try {
      await storage.saveJson(name, Object.fromEntries(map));
    } catch (error) {
      console.error(`No pude guardar ${name}:`, error);
    }
  }

  function debounce() {
    clearTimeout(timer);
    timer = setTimeout(save, 5000);
  }

  async function init() {
    try {
      const data = await storage.loadJson(name);

      map.clear();

      for (const [key, value] of Object.entries(data)) {
        map.set(key, value);
      }

      console.log(`📦 ${name} cargados: ${map.size}.`);
    } catch (error) {
      console.log(`📦 Sin datos previos de ${name}.`);
    }
  }

  return { map, save, debounce, init };
}

const economyBucket = createBucket('economy');
const statsBucket = createBucket('stats');
const afkBucket = createBucket('afk');
const birthdaysBucket = createBucket('birthdays');
const reactionRolesBucket = createBucket('reactionroles');
const customRolesBucket = createBucket('customroles');
const shopRolesBucket = createBucket('shoproles');
const warningsBucket = createBucket('warnings');

const voiceSessions = new Map();

const MEMBER_DENIED_ROLES = new Set([
  ...(process.env.MEMBER_DENIED_ROLES || '').split(',').map(id => id.trim()).filter(Boolean),
  '1536878763139276830',
  '1536886178094252112'
]);

const MEMBER_CHANNEL_ALLOW_BITS =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.ReadMessageHistory |
  PermissionFlagsBits.AddReactions;

const ALL_PERMISSION_BITS = Object.values(PermissionFlagsBits)
  .reduce((acc, bit) => acc | bit, 0n);

const MEMBER_CHANNEL_DENY_BITS = ALL_PERMISSION_BITS & ~MEMBER_CHANNEL_ALLOW_BITS;

function memberChannelOverwriteData() {
  const data = Object.fromEntries(
    Object.values(PermissionFlagsBits).map(bit => [bit, false])
  );

  data[PermissionFlagsBits.ViewChannel] = true;
  data[PermissionFlagsBits.ReadMessageHistory] = true;
  data[PermissionFlagsBits.AddReactions] = true;

  return data;
}

const PUBLIC_COMMANDS = new Set([
  'help', '8ball', 'dado', 'moneda', 'slap', 'quote', 'firma', 'polaroid', 'wanted', 'logro',
  'avatar', 'userinfo', 'serverinfo', 'ping',
  'poll', 'say', 'nivel', 'niveles',
  'afk', 'bal', 'daily', 'trabajar', 'shop', 'comprar', 'comprarrol', 'apostar',
  'robar', 'cazar', 'duelo', 'racha', 'cumple', 'stats',
  'banco', 'depositar', 'retirar', 'transferir'
]);

const ADMIN_UTILITY_KEYWORDS = new Set(['emoji', 'sticker', 'announce', 'despedida', 'canales', 'reactionroles']);

const NUKE_PASSWORD = process.env.NUKE_PASSWORD || '';

const ADMIN_ONLY_CHANNELS = new Set([
  ...(process.env.ADMIN_ONLY_CHANNELS || '').split(',').map(id => id.trim()).filter(Boolean),
  ...(MODLOG_CHANNEL_ID ? [MODLOG_CHANNEL_ID] : []),
  '1536881063580667934',
  '1536992463875735663',
  '1536991424032014428',
  '1537276322471088238'
]);

const RAID_JOIN_THRESHOLD = parseInt(process.env.RAID_JOIN_THRESHOLD, 10) || 5;
const RAID_JOIN_WINDOW_MS = 10 * 1000;
const RAID_COOLDOWN_MS = 60 * 60 * 1000;
const raidJoins = new Map();
const raidModeGuilds = new Set();

const INVITE_PATTERN = /discord\.(?:gg\/|com\/invite\/)[a-zA-Z0-9-]+/i;

const GIF_URL_PATTERN = /\.gif(?:\?|#|$)|tenor\.com|giphy\.com/i;

const SHORTENER_HOSTS = [
  'bit.ly', 'tinyurl.com', 't.co', 'is.gd', 'cutt.ly', 'rebrand.ly',
  'goo.gl', 'ow.ly', 'buff.ly', 's.id', 'tiny.cc', 'rb.gy', 'shorturl.at',
  't.ly', 'v.gd', 'shortest.link'
];

const SCAM_URL_PATTERNS = [
  /discordgift/i, /discord-nitro/i, /nitro-?gift/i, /disc[0o]+rd/i,
  /d1scord/i, /steamgift/i, /steam-gift/i, /free-nitro/i,
  /free-vbucks/i, /free-robux/i, /nitro-free/i, /claim-?(?:prize|reward|nitro|free)/i,
  /verify-?(?:your-)?account/i, /verify-(?:wallet|nitro|discord)/i,
  /airdrop-?claim/i, /wallet-?(?:verify|connect|claim)/i,
  /withdrawal/i, /free-?prize/i, /giveaway-?win/i
];

const STRONG_SCAM_KEYWORDS = [
  'free nitro', 'nitro gratis', 'nitro gift', 'nitro free',
  'you won', 'you have won', 'has ganado', 'has sido seleccionado',
  'you have been selected', 'free vbucks', 'free robux', 'free v-bucks',
  'claim your prize', 'claim your reward', 'verify your account',
  'verifica tu cuenta', 'airdrop', 'withdrawal', 'withdraw your',
  'discord nitro free', 'win a free'
];

const WEAK_SCAM_KEYWORDS = [
  'giveaway', 'sorteo', 'wallet', 'usdt', 'crypto', 'bitcoin',
  'bonus', 'reward', 'recompensa', 'congratulations', 'limited time',
  'tiempo limitado', 'last chance', 'ultima oportunidad',
  'btc', 'premio', 'prize'
];

const imagePosts = new Map();
const seenUsers = new Map();
const WARN_TIMEOUT_THRESHOLD = 3;
let warnedEmptyContent = false;

const commands = [
  new SlashCommandBuilder()
    .setName('emoji')
    .setDescription('Convierte una imagen en un emoji')
    .addAttachmentOption(option =>
      option
        .setName('imagen')
        .setDescription('Imagen que quieres convertir')
    )
    .addStringOption(option =>
      option
        .setName('mensaje_id')
        .setDescription('ID del mensaje (en este canal) que contiene la imagen')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('sticker')
    .setDescription('Convierte una imagen en un sticker')
    .addAttachmentOption(option =>
      option
        .setName('imagen')
        .setDescription('Imagen que quieres convertir')
    )
    .addStringOption(option =>
      option
        .setName('mensaje_id')
        .setDescription('ID del mensaje (en este canal) que contiene la imagen')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('Vacía el canal entero (se pierde todo el historial). Pide contraseña.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('erasechat')
    .setDescription('Elimina los últimos N mensajes del canal (máx 1000).')
    .addIntegerOption(option =>
      option
        .setName('cantidad')
        .setDescription('Número de mensajes a eliminar (1-1000)')
        .setMinValue(1)
        .setMaxValue(1000)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('purgeusuario')
    .setDescription('Elimina mensajes recientes de un usuario (máx 1000).')
    .addIntegerOption(option =>
      option
        .setName('cantidad')
        .setDescription('Número de mensajes a eliminar (1-1000)')
        .setMinValue(1)
        .setMaxValue(1000)
        .setRequired(true)
    )
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('Usuario cuyos mensajes se eliminarán')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new ContextMenuCommandBuilder()
    .setName('Convertir a emoji')
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new ContextMenuCommandBuilder()
    .setName('Convertir a sticker')
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(command => command.toJSON());

function isAdmin(member) {
  if (!member || !member.roles) return false;

  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  return member.roles.cache.some(
    role => role.name === ADMIN_ROLE_NAME || ADMIN_ROLE_IDS.has(role.id)
  );
}

function isBankAdmin(member) {
  if (!member || !member.roles) return false;
  return member.roles.cache.has(BANK_ADMIN_ROLE_ID);
}

function parseDuration(value) {
  const match = /^(\d+)([smhd])$/.exec((value || '').trim().toLowerCase());
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  const unitMs = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];

  if (amount <= 0) return null;

  const ms = amount * unitMs;

  if (ms < 60000) return null;

  return Math.min(ms, 28 * 86400000);
}

async function getGuildMember(guild, userId) {
  return guild.members.fetch(userId).catch(() => null);
}

async function downloadImage(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`No se pudo descargar la imagen (${response.status}).`);
  }

  const contentType = response.headers.get('content-type') || '';

  if (!contentType.startsWith('image/')) {
    throw new Error('El archivo seleccionado no parece ser una imagen.');
  }

  return Buffer.from(await response.arrayBuffer());
}

async function prepareEmoji(buffer) {
  let size = 128;
  let quality = 90;

  for (let attempt = 0; attempt < 8; attempt++) {
    const output = await sharp(buffer)
      .rotate()
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({
        compressionLevel: 9,
        quality,
        effort: 10
      })
      .toBuffer();

    if (output.length <= 256 * 1024) {
      return output;
    }

    if (size > 64) {
      size -= 16;
    } else {
      quality -= 10;
    }
  }

  throw new Error('No pude reducir la imagen al tamaño permitido para un emoji.');
}

async function prepareSticker(buffer) {
  let size = 320;

  for (let attempt = 0; attempt < 8; attempt++) {
    const output = await sharp(buffer)
      .rotate()
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({
        compressionLevel: 9,
        effort: 10
      })
      .toBuffer();

    if (output.length <= 512 * 1024) {
      return output;
    }

    size -= 32;
  }

  throw new Error('No pude reducir la imagen al tamaño permitido para un sticker.');
}

function isImageAttachment(file) {
  if (!file) return false;

  return (
    file.contentType?.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp)$/i.test(file.name || '')
  );
}

async function getImageFromMessage(message) {
  if (!message || !message.attachments || message.attachments.size === 0) {
    return null;
  }

  return message.attachments.find(isImageAttachment) || null;
}

async function findAttachmentById(channel, attachmentId) {
  let before;

  for (let batch = 0; batch < 5; batch++) {
    const options = { limit: 100 };

    if (before) options.before = before;

    const messages = await channel.messages.fetch(options);

    if (messages.size === 0) break;

    for (const msg of messages.values()) {
      if (msg.attachments.has(attachmentId)) {
        const attachment = msg.attachments.get(attachmentId);

        if (isImageAttachment(attachment)) return attachment;
      }
    }

    before = messages.last().id;
  }

  return null;
}

async function resolveImageFromOptions(interaction) {
  const attachment = interaction.options.getAttachment('imagen');
  const messageId = interaction.options.getString('mensaje_id');

  if (messageId) {
    if (attachment) {
      return { attachment: null, error: '❌ Proporciona una imagen O un ID de mensaje, no ambos.' };
    }

    if (!interaction.channel) {
      return { attachment: null, error: '❌ No puedo buscar mensajes en este canal.' };
    }

    const message = await interaction.channel.messages
      .fetch(messageId)
      .catch(() => null);

    let found = null;

    if (message) {
      found = await getImageFromMessage(message);
    } else {
      found = await findAttachmentById(interaction.channel, messageId);
    }

    if (!found) {
      return {
        attachment: null,
        error: `❌ No encontré un mensaje (o adjunto) con el ID \`${messageId}\` en este canal.`
      };
    }

    return { attachment: found, error: null };
  }

  return { attachment, error: null };
}

async function nextAvailableName(manager, prefix) {
  await manager.fetch();

  const used = new Set(manager.cache.map(item => item.name));

  let index = 1;

  while (used.has(`${prefix}_${index}`)) {
    index += 1;
  }

  return `${prefix}_${index}`;
}

async function createEmoji(guild, attachment) {
  const original = await downloadImage(attachment.url);
  const image = await prepareEmoji(original);

  const name = await nextAvailableName(guild.emojis, 'emoji');

  return guild.emojis.create({
    attachment: image,
    name
  });
}

async function createSticker(guild, attachment) {
  const original = await downloadImage(attachment.url);
  const image = await prepareSticker(original);

  const name = await nextAvailableName(guild.stickers, 'sticker');

  return guild.stickers.create({
    file: image,
    name: name.slice(0, 30),
    tags: '😀',
    description: `Sticker creado por ${attachment.name || 'imagen'}`
  });
}

function interactionCtx(interaction) {
  return {
    guild: interaction.guild,
    member: interaction.member,
    reply: content => interaction.reply({ content, ephemeral: true }),
    deferReply: () => interaction.deferReply(),
    editReply: content => interaction.editReply(content),
    preview: sticker => interaction.channel.send({ stickers: [sticker] })
  };
}

async function messageCtx(message) {
  let sent = null;

  return {
    guild: message.guild,
    member: message.member,
    reply: async content => {
      if (sent) return sent.edit(content);

      sent = await message.channel.send(content);
      return sent;
    },
    deferReply: async () => {
      if (!sent) sent = await message.channel.send('👀 Procesando...');

      return sent;
    },
    editReply: async content => {
      if (sent) return sent.edit(content);

      sent = await message.channel.send(content);
      return sent;
    },
    preview: sticker => message.channel.send({ stickers: [sticker] })
  };
}

async function processEmoji(ctx, attachment) {
  if (!ctx.guild) {
    return ctx.reply('❌ Este comando solo puede utilizarse dentro de un servidor.');
  }

  if (!isAdmin(ctx.member)) {
    return ctx.reply(`❌ Debes ser admin para usar este comando.`);
  }

  if (!attachment || !attachment.contentType?.startsWith('image/')) {
    return ctx.reply('❌ Necesitas proporcionar una imagen válida.');
  }

  await ctx.deferReply();

  try {
    const emoji = await createEmoji(ctx.guild, attachment);

    await ctx.editReply(`✅ Emoji creado correctamente: ${emoji}`);
  } catch (error) {
    console.error(error);

    await ctx.editReply(`❌ No pude crear el emoji.\n\`${error.message}\``);
  }
}

async function processSticker(ctx, attachment) {
  if (!ctx.guild) {
    return ctx.reply('❌ Este comando solo puede utilizarse dentro de un servidor.');
  }

  if (!isAdmin(ctx.member)) {
    return ctx.reply(`❌ Debes ser admin para usar este comando.`);
  }

  if (!attachment || !attachment.contentType?.startsWith('image/')) {
    return ctx.reply('❌ Necesitas proporcionar una imagen válida.');
  }

  await ctx.deferReply();

  try {
    const sticker = await createSticker(ctx.guild, attachment);

    await ctx.editReply(
      `✅ Sticker creado correctamente: **${sticker.name}** (ID: ${sticker.id})`
    );

    if (ctx.preview) {
      await ctx.preview(sticker);
    }
  } catch (error) {
    console.error(error);

    await ctx.editReply(`❌ No pude crear el sticker.\n\`${error.message}\``);
  }
}

function extractUrls(text) {
  return text.match(/https?:\/\/[^\s<>"']+/gi) || [];
}

function getUrlHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isShortener(url) {
  const host = getUrlHost(url);

  return SHORTENER_HOSTS.includes(host);
}

function isScamUrl(url) {
  const lower = url.toLowerCase();

  if (SCAM_URL_PATTERNS.some(pattern => pattern.test(lower))) {
    return true;
  }

  const host = getUrlHost(url);
  const hostAndPath = lower.replace(/^https?:\/\//, '');

  return ['discord', 'nitro', 'steam', 'gift'].some(
    brand => host.includes(brand) && (
      hostAndPath.includes('gift') ||
      hostAndPath.includes('nitro') ||
      hostAndPath.includes('free') ||
      hostAndPath.includes('claim') ||
      hostAndPath.includes('giveaway')
    )
  );
}

function isGifAttachment(attachment) {
  return attachment.contentType === 'image/gif' ||
    /\.gif$/i.test(attachment.name || '');
}

function containsGif(message) {
  if ([...message.attachments.values()].some(isGifAttachment)) return true;

  const urls = extractUrls(message.content || '');

  return urls.some(url => GIF_URL_PATTERN.test(url));
}

function recordImageSpam(message, imageCount) {
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();

  const posts = imagePosts.get(key) || [];

  for (let i = 0; i < imageCount; i++) {
    posts.push(now);
  }

  const recent = posts.filter(timestamp => now - timestamp <= IMAGE_SPAM_WINDOW_MS).slice(-60);

  imagePosts.set(key, recent);

  return recent.length >= IMAGE_SPAM_THRESHOLD;
}

function isFirstMessage(guildId, userId) {
  return !seenUsers.get(guildId)?.has(userId);
}

function markSeen(guildId, userId) {
  if (!seenUsers.has(guildId)) {
    seenUsers.set(guildId, new Set());
  }

  seenUsers.get(guildId).add(userId);
}

function shortenText(text, max) {
  if (text.length <= max) return text;

  return `${text.slice(0, max - 3)}...`;
}

async function runAntiScam(message) {
  if (!message.guild || !message.member) return null;

  if (SCAM_EXCLUDED_CHANNELS.has(message.channelId)) return null;

  if ((message.content || '').trim().startsWith('!!')) {
    markSeen(message.guild.id, message.author.id);
    return null;
  }

  try {
    if (isAdmin(message.member)) {
      markSeen(message.guild.id, message.author.id);
      return null;
    }

    if (containsGif(message)) {
      markSeen(message.guild.id, message.author.id);
      return null;
    }

    const content = message.content || '';
    const urls = extractUrls(content);

    for (const embed of message.embeds || []) {
      if (embed.url) urls.push(embed.url);
    }

    const attachments = [...message.attachments.values()];
    const imageCount = attachments.filter(
      attachment => attachment.contentType?.startsWith('image/') && !isGifAttachment(attachment)
    ).length;

    const reasons = [];

    for (const url of urls) {
      if (isScamUrl(url)) {
        reasons.push({ level: 'strong', text: `Link sospechoso: ${shortenText(url, 80)}` });
      } else if (isShortener(url)) {
        reasons.push({ level: 'weak', text: `Acortador de URL: ${shortenText(url, 80)}` });
      }
    }

    if (INVITE_PATTERN.test(content)) {
      reasons.push({ level: 'weak', text: 'Link de invitación a Discord' });
    }

    const lowerContent = content.toLowerCase();
    const strongKeywords = STRONG_SCAM_KEYWORDS.filter(keyword => lowerContent.includes(keyword));
    const weakKeywords = WEAK_SCAM_KEYWORDS.filter(keyword => lowerContent.includes(keyword));

    if (strongKeywords.length >= 2) {
      reasons.push({ level: 'strong', text: `Palabras clave de scam: ${strongKeywords.slice(0, 3).join(', ')}` });
    } else if (strongKeywords.length === 1 && (urls.length > 0 || attachments.length > 0)) {
      reasons.push({ level: 'strong', text: `Palabras clave de scam: ${strongKeywords[0]}` });
    } else if (strongKeywords.length === 1) {
      reasons.push({ level: 'weak', text: `Palabra clave sospechosa: ${strongKeywords[0]}` });
    } else if (weakKeywords.length >= 2) {
      reasons.push({ level: 'weak', text: `Palabras clave sospechosas: ${weakKeywords.slice(0, 3).join(', ')}` });
    } else if (weakKeywords.length === 1) {
      reasons.push({ level: 'weak', text: `Palabra clave sospechosa: ${weakKeywords[0]}` });
    }

    if (imageCount > 0 && recordImageSpam(message, imageCount)) {
      reasons.push({
        level: 'strong',
        text: `Spam de imágenes (${IMAGE_SPAM_THRESHOLD}+ en ${IMAGE_SPAM_WINDOW_MS / 1000}s)`
      });
    }

    if (isFirstMessage(message.guild.id, message.author.id)) {
      const hasLink = urls.length > 0 || INVITE_PATTERN.test(content);

      if (hasLink) {
        reasons.push({ level: 'weak', text: 'Primer mensaje con link' });
      } else if (attachments.some(attachment => !isGifAttachment(attachment))) {
        reasons.push({ level: 'weak', text: 'Primer mensaje con imagen' });
      }
    }

    markSeen(message.guild.id, message.author.id);

    if (reasons.length === 0) return null;

    const shouldDelete = reasons.some(reason => reason.level === 'strong');

    if (shouldDelete) {
      await message.delete().catch(() => {});

      await message.member
        .timeout(60 * 60 * 1000, 'Posible scam detectado')
        .catch(() => {});
    }

    const logChannel = MODLOG_CHANNEL_ID
      ? await client.channels.fetch(MODLOG_CHANNEL_ID).catch(() => null)
      : null;

    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle(shouldDelete ? '🚨 Posible scam → aislado 1h y borrado' : '⚠️ Posible scam (aviso)')
        .setColor(shouldDelete ? 0xe74c3c : 0xf1c40f)
        .setDescription(
          `**Usuario:** <@${message.author.id}> (${message.author.tag})\n` +
          `**Canal:** ${message.channel}`
        )
        .addFields([
          {
            name: 'Motivos',
            value: reasons.map(reason =>
              `${reason.level === 'strong' ? '🔴' : '🟡'} ${reason.text}`
            ).join('\n')
          },
          {
            name: 'Mensaje',
            value: content ? shortenText(content, 1024) : '*Sin texto*'
          }
        ])
        .setTimestamp();

      if (attachments.length > 0) {
        embed.addFields([
          {
            name: 'Adjuntos',
            value: shortenText(attachments.map(attachment => attachment.url).join('\n'), 1024)
          }
        ]);
      }

      await logChannel.send({ embeds: [embed] }).catch(console.error);
    } else {
      console.log(
        `[anti-scam] ${message.author.tag} (${message.author.id}) → ` +
        `${reasons.map(reason => reason.text).join(' | ')}` +
        (shouldDelete ? ' [BORRADO]' : ' [aviso]')
      );
    }

    return { deleted: shouldDelete };
  } catch (error) {
    console.error('Error en anti-scam:', error);

    return null;
  }
}

async function ensureMsgTarget(message, targetId, action, member) {
  if (targetId === message.author.id) {
    await message.reply(`❌ No puedes aplicarte **${action}** a ti mismo.`);
    return false;
  }

  if (targetId === client.user.id) {
    await message.reply(`❌ No puedes aplicarme **${action}**.`);
    return false;
  }

  if (member && isAdmin(member)) {
    await message.reply(`❌ No puedes aplicar **${action}** a un administrador.`);
    return false;
  }

  return true;
}

async function enforceAdminOnlyChannels(message) {
  if (!ADMIN_ONLY_CHANNELS.has(message.channelId)) return false;
  if (message.author.bot) return false;
  if (isAdmin(message.member)) return false;

  await message.delete().catch(() => {});

  const notice = await message.channel
    .send(`❌ Solo los admins pueden escribir en <#${message.channelId}>.`)
    .catch(() => null);

  if (notice) {
    setTimeout(() => notice.delete().catch(() => {}), 5000);
  }

  return true;
}

function adminRoleIdsIn(guild) {
  const ids = new Set(ADMIN_ROLE_IDS);

  for (const role of guild.roles.cache.values()) {
    if (role.name === ADMIN_ROLE_NAME) ids.add(role.id);
  }

  return ids;
}

async function applyChannelRestrictions(guild) {
  const channelIds = new Set(ADMIN_ONLY_CHANNELS);
  const adminRoleIds = adminRoleIdsIn(guild);

  for (const channelId of channelIds) {
    const channel = guild.channels.cache.get(channelId);

    if (!channel || !channel.isTextBased()) continue;

    // Nadie escribe salvo admins y el bot: así, quien tenga rol admin y rol
    // de miembro a la vez solo cuenta como admin (no se combinan los roles).
    await channel.permissionOverwrites
      .edit(guild.roles.everyone, { SendMessages: false })
      .catch(console.error);

    for (const roleId of adminRoleIds) {
      const role = guild.roles.cache.get(roleId);

      if (!role) continue;

      const overwrite = channel.permissionOverwrites.cache.get(roleId);
      const isCorrect = overwrite && overwrite.allow.has(PermissionFlagsBits.SendMessages);

      if (isCorrect) continue;

      await channel.permissionOverwrites
        .edit(role, { SendMessages: true })
        .catch(console.error);
    }

    const me = guild.members.me;

    if (me && !me.permissionsIn(channel).has(PermissionFlagsBits.SendMessages)) {
      await channel.permissionOverwrites
        .edit(me, { SendMessages: true })
        .catch(console.error);
    }

    // Los roles de miembro solo ven, reaccionan y leen el historial: nada más
    for (const roleId of MEMBER_DENIED_ROLES) {
      const role = guild.roles.cache.get(roleId);

      if (!role || adminRoleIds.has(roleId)) continue;

      const overwrite = channel.permissionOverwrites.cache.get(roleId);
      const isCorrect = overwrite &&
        overwrite.allow.bitfield === MEMBER_CHANNEL_ALLOW_BITS &&
        overwrite.deny.bitfield === MEMBER_CHANNEL_DENY_BITS;

      if (isCorrect) continue;

      await channel.permissionOverwrites
        .edit(role, memberChannelOverwriteData())
        .catch(console.error);
    }
  }
}

async function handleCanales(message) {
  await applyChannelRestrictions(message.guild);

  await message.channel.send(
    '✅ Canales restringidos. Los roles de miembros **no pueden escribir**, pero sí ver el canal, reaccionar y leer el historial.'
  );
}

function helpEmbeds(includeModeration) {
  const moderation = [
    ['`!!ban <@usuario> [razón]`', 'Banea a un usuario del servidor.'],
    ['`!!kick <@usuario> [razón]`', 'Expulsa a un usuario del servidor.'],
    ['`!!timeout <@usuario> <duración> [razón]`', 'Silencio temporal (1m, 5m, 1h, 1d, 7d).'],
    ['`!!mute <@usuario> [duración]`', 'Silencia por 1 hora si no se indica duración.'],
    ['`!!unmute <@usuario>`', 'Quita el silencio a un usuario.'],
    ['`!!unban <id> [razón]`', 'Desbanea a un usuario por su ID.'],
    ['`!!warn <@usuario> [razón]`', 'Advertencia; con 3 se silencia 1 hora automáticamente.'],
    ['`!!warns <@usuario>`', 'Muestra las advertencias de un usuario.'],
    ['`!!delwarn <@usuario>`', 'Borra las advertencias de un usuario.'],
    ['`/purgeusuario <cantidad> <usuario>`', 'Elimina mensajes recientes de un usuario (máx 1000). Confirma solo para ti.'],
    ['`/erasechat <cantidad>`', 'Elimina los últimos N mensajes del canal (máx 1000). Confirma solo para ti.'],
    ['`/nuke`', 'Vacía el canal entero. Pide contraseña oculta (se pierde todo el historial).'],
    ['`!!slowmode <segundos>`', 'Modo lento del canal (0 lo desactiva).'],
    ['`!!lock` / `!!unlock`', 'Bloquea o desbloquea el canal.'],
    ['`!!vc <@usuario> <#canal>`', 'Mueve a un usuario a un canal de voz.'],
    ['`!!antiraid` / `!!antiraid off`', 'Estado del anti-raid o lo desactiva.'],
    ['`!!setnivel <@usuario> <nivel>`', 'Fija el nivel de un usuario (asigna el rol en su próximo mensaje).'],
    ['`!!setcoins <@usuario> <cantidad> [banco]`', 'Fija las monedas de un usuario (agrega `banco` para el banco).']
  ];

  const utilities = [
    ['`!!emoji` (respondiendo) / `!!emoji <id>`', 'Convierte una imagen en emoji.'],
    ['`!!sticker` (respondiendo) / `!!sticker <id>`', 'Convierte una imagen en sticker.'],
    ['`!!avatar [@usuario]`', 'Muestra el avatar ampliado.'],
    ['`!!userinfo [@usuario]`', 'Información de un usuario.'],
    ['`!!serverinfo`', 'Información del servidor.'],
    ['`!!ping`', 'Latencia del bot.'],
    ['`!!poll <pregunta>`', 'Crea una encuesta con ✅ y ❌.'],
    ['`!!say <texto>`', 'El bot repite tu mensaje.'],
    ['`!!announce <texto>`', 'Envía un anuncio en formato embed.'],
    ['`!!nivel [@usuario]`', 'Nivel, XP y progreso.'],
    ['`!!niveles`', 'Top 10 de niveles del servidor.'],
    ['`!!stats [@usuario]`', 'Estadísticas completas con gráfica de actividad.'],
    ['`!!afk [motivo]`', 'Te pones AFK (se avisa a quien te mencione).'],
    ['`!!racha`', 'Tu racha de días seguidos hablando.'],
    ['`!!cumple <día/mes>`', 'Registra tu cumpleaños para que el bot te felicite.'],
    ['`!!despedida <mensaje>`', 'Personaliza el mensaje de despedida ({user}, {username}, {server}).'],
    ['`!!canales`', 'Reaplica la restricción de escritura en los canales.'],
    ['`!!reactionroles <mensajeID> <emoji>:<@Rol> ...`', 'Configura roles por reacción en un mensaje.'],
    ['`!!help`', 'Muestra esta ayuda.']
  ];

  const economy = [
    ['`!!bal [@usuario]`', 'Tu saldo de monedas (billetera + banco).'],
    ['`!!banco [@usuario]`', 'Tu dinero guardado en el banco (a salvo de robos).'],
    ['`!!depositar <cantidad | todo>`', 'Guarda monedas en el banco.'],
    ['`!!retirar <cantidad | todo>`', 'Saca monedas del banco.'],
    ['`!!transferir <@usuario> <cantidad>`', 'Envía monedas a otro usuario.'],
    ['`!!daily`', 'Recompensa diaria.'],
    ['`!!trabajar`', 'Gana monedas trabajando (cada hora).'],
    ['`!!cazar`', 'Sal de cacería y gana monedas (cada 30 min).'],
    ['`!!robar <@usuario>`', 'Intenta robar monedas a un usuario (cada hora).'],
    ['`!!apostar <cantidad>`', 'Apostar monedas a cara o cruz.'],
    ['`!!duelo <@usuario> <cantidad>`', 'Duelo: el que gane se lleva la apuesta.'],
    ['`!!shop`', 'Ver la tienda de roles de decoración.'],
    ['`!!comprar <número>`', 'Comprar un tema de la tienda.'],
    ['`!!comprarrol <nombre> [color]`', `Crear/renombrar tu rol personalizado (${CUSTOM_ROLE_PRICE} monedas).`]
  ];

  const fun = [
    ['`!!8ball <pregunta>`', 'Bola mágica: responde tu pregunta.'],
    ['`!!dado [caras]`', 'Lanza un dado (6 caras por defecto).'],
    ['`!!moneda`', 'Lanza una moneda: cara o cruz.'],
    ['`!!slap <@usuario>`', 'Le da una bofetada a un usuario.'],
    ['`!!quote` (respondiendo a un mensaje)', 'Cita el mensaje en una imagen con su autor y avatar.'],
    ['`!!firma [nombre]`', 'Genera tu firma oficial en una imagen.'],
    ['`!!polaroid [texto]`', 'Tu foto (o la del mensaje respondido) en una polaroid con título.'],
    ['`!!wanted [@usuario]`', 'Cartel de "Se busca" con el avatar y recompensa.'],
    ['`!!logro <texto>`', 'Logro desbloqueado estilo Minecraft.']
  ];

  const build = (title, color, rows) => new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(rows.map(([name, value]) => ({ name, value })));

  const visibleUtilities = utilities.filter(([name]) => {
    const match = /^`!!([a-z0-9]+)/i.exec(name);

    return includeModeration || !match || !ADMIN_UTILITY_KEYWORDS.has(match[1].toLowerCase());
  });

  const embeds = [];

  if (includeModeration) {
    embeds.push(build('🛡️ Moderación', 0xe74c3c, moderation));
  }

  embeds.push(build('⚙️ Utilidades', 0x3498db, visibleUtilities));
  embeds.push(build('🎉 Diversión', 0xf1c40f, fun));
  embeds.push(build('💰 Economía y juegos', 0x2ecc71, economy));

  return embeds;
}

async function handleHelp(message) {
  const isMod = isAdmin(message.member);
  const embeds = helpEmbeds(isMod);

  embeds.forEach(embed => embed.setFooter({
    text: `Bot de ${message.guild.name} — ${isMod
      ? 'moderación, utilidades y diversión a tu alcance'
      : 'utilidades y diversión públicas; los comandos de admin no se muestran aquí'}`
  }));

  await message.channel.send({ embeds });
}

function levelInfo(xp) {
  let level = 1;
  let remaining = xp;
  let needed = 50;

  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = 50 * level;
  }

  return { level, xpIntoLevel: remaining, xpToNext: needed };
}

let saveLevelsTimer = null;

async function saveLevels() {
  try {
    await storage.save(Object.fromEntries(LEVELS));
  } catch (error) {
    console.error('No pude guardar los niveles:', error);
  }
}

function saveLevelsDebounced() {
  clearTimeout(saveLevelsTimer);
  saveLevelsTimer = setTimeout(saveLevels, 5000);
}

async function loadLevels() {
  try {
    const data = await storage.load();

    LEVELS.clear();

    for (const [key, value] of Object.entries(data)) {
      LEVELS.set(key, value);
    }

    console.log(`📊 Niveles cargados: ${LEVELS.size} usuarios.`);
  } catch (error) {
    console.log('📊 Sin datos de niveles previos.');
  }
}

async function grantXp(message) {
  if (!message.guild) return;
  if (message.author.bot) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const data = LEVELS.get(key) || { xp: 0, level: 1 };

  data.xp += 5 + Math.floor(Math.random() * 10);

  const info = levelInfo(data.xp);

  if (info.level > data.level) {
    data.level = info.level;
    console.log(`📈 ${message.author.tag} subió al nivel ${info.level} en ${message.guild.name}`);

    await applyLevelRole(message.guild, message.member, info.level);

    const channel = await client.channels
      .fetch(LEVEL_CHANNEL_ID)
      .catch(error => {
        console.error('📊 No pude obtener el canal de niveles:', error.message);
        return null;
      });

    if (!channel) {
      console.error(`📊 Canal de niveles no disponible (ID: ${LEVEL_CHANNEL_ID})`);
    } else {
      await channel
        .send(`🎉 ¡${message.author} subió al **nivel ${info.level}**!`)
        .catch(error => console.error('📊 No pude enviar el mensaje de nivel:', error.message));
    }
  }

  LEVELS.set(key, data);
  saveLevelsDebounced();
}

async function handleNivel(message, rest) {
  const targetId = parseUserId(rest);
  const user = targetId
    ? await message.client.users.fetch(targetId).catch(() => null)
    : message.author;

  if (!user) return message.reply('❌ No encontré a ese usuario.');

  const key = `${message.guild.id}:${user.id}`;
  const data = LEVELS.get(key) || { xp: 0, level: 1 };
  const info = levelInfo(data.xp);
  const barLength = 10;
  const progress = Math.min(barLength, Math.round((info.xpIntoLevel / info.xpToNext) * barLength));
  const bar = '🟩'.repeat(progress) + '⬛'.repeat(barLength - progress);

  await message.reply(
    `**${user.tag}**\n` +
    `Nivel: **${info.level}**\n` +
    `XP: ${data.xp}\n` +
    `Progreso: ${bar} (${info.xpIntoLevel}/${info.xpToNext})`
  );
}

async function handleNiveles(message) {
  const entries = [...LEVELS.entries()]
    .filter(([key]) => key.startsWith(`${message.guild.id}:`))
    .sort((a, b) => b[1].xp - a[1].xp)
    .slice(0, 10);

  if (entries.length === 0) {
    return message.reply('Aún no hay datos de niveles en este servidor.');
  }

  const lines = [];

  for (let i = 0; i < entries.length; i++) {
    const userId = entries[i][0].split(':')[1];
    const user = await message.client.users.fetch(userId).catch(() => null);
    const info = levelInfo(entries[i][1].xp);

    lines.push(`${i + 1}. ${user ? user.tag : userId} — Nivel **${info.level}** (${entries[i][1].xp} XP)`);
  }

  await message.reply(`🏆 **Top niveles**\n${lines.join('\n')}`);
}

function dateKey(d) {
  const date = d || new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${day}`;
}

function addDaysKey(base, offset) {
  const date = new Date(base + 'T00:00:00Z');

  date.setUTCDate(date.getUTCDate() + offset);

  return dateKey(date);
}

function shortDayLabel(dayKey) {
  const names = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

  return names[new Date(dayKey + 'T00:00:00Z').getUTCDay()];
}

function ecoKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function getEco(guildId, userId) {
  return economyBucket.map.get(ecoKey(guildId, userId)) || { coins: 0 };
}

function addCoins(guildId, userId, amount) {
  const data = getEco(guildId, userId);

  data.coins = Math.max(0, (data.coins || 0) + amount);
  economyBucket.map.set(ecoKey(guildId, userId), data);
  economyBucket.debounce();

  return data.coins;
}

function hoursSince(ts) {
  return (Date.now() - (ts || 0)) / 3600000;
}

function getStat(guildId, userId) {
  return statsBucket.map.get(`${guildId}:${userId}`) || { messages: 0 };
}

function trackActivity(message) {
  const key = `${message.guild.id}:${message.author.id}`;
  const data = getStat(message.guild.id, message.author.id);
  const today = dateKey();
  const yesterday = addDaysKey(today, -1);

  data.messages = (data.messages || 0) + 1;

  if (data.lastActive !== today) {
    if (data.lastActive === yesterday) {
      data.streak = (data.streak || 0) + 1;
    } else {
      data.streak = 1;
    }

    data.bestStreak = Math.max(data.bestStreak || 0, data.streak);

    if (data.streak > 0 && data.streak % 7 === 0) {
      const bonus = data.streak * 10;

      addCoins(message.guild.id, message.author.id, bonus);
      message.channel
        .send(`🔥 **${message.author}** ¡${data.streak} días seguidos! +**${bonus}** monedas.`)
        .catch(() => {});
    }
  }

  data.lastActive = today;
  data['day:' + today] = (data['day:' + today] || 0) + 1;

  const oldestKey = addDaysKey(today, -14);

  for (const key of Object.keys(data)) {
    if (key.startsWith('day:') && key.slice(4) < oldestKey) {
      delete data[key];
    }
  }

  statsBucket.map.set(key, data);
  statsBucket.debounce();
}

function addVcTime(guildId, userId, seconds) {
  const data = getStat(guildId, userId);

  data.vcSeconds = (data.vcSeconds || 0) + seconds;

  statsBucket.map.set(`${guildId}:${userId}`, data);

  const ecoKeyValue = ecoKey(guildId, userId);
  const eco = getEco(guildId, userId);

  economyBucket.map.set(ecoKeyValue, eco);

  const batches = Math.floor((data.vcSeconds || 0) / 600);

  if (batches > (eco.vcBatches || 0)) {
    const bonus = (batches - (eco.vcBatches || 0)) * 10;

    eco.vcBatches = batches;
    addCoins(guildId, userId, bonus);
  }

  statsBucket.debounce();
}

function sanitizeReason(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function parseBirthday(input) {
  const match = /^(\d{1,2})[\/\-.](\d{1,2})$/.exec((input || '').trim());

  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { month, day };
}

function parseEmoji(str) {
  const match = /^(?:<a?)?:([^:]+):(\d{17,20})>?$/.exec(str);

  if (match) {
    return { isCustom: true, id: match[2], name: match[1] };
  }

  return { isCustom: false, name: str };
}

async function applyLevelRole(guild, member, level) {
  const roleId = LEVEL_ROLES.get(level);

  if (!roleId || !member) return;

  const role = guild.roles.cache.get(roleId);

  if (!role) return;

  await member.roles.add(role).catch(error => console.error('No pude asignar rol de nivel:', error.message));
}

async function handleBal(message, rest) {
  const targetId = parseUserId(rest);
  const user = targetId
    ? await message.client.users.fetch(targetId).catch(() => null)
    : message.author;

  if (!user) return message.reply('❌ No encontré a ese usuario.');

  const data = getEco(message.guild.id, user.id);

  await message.reply(
    `💰 **${user.tag}**\n` +
    `Billetera: **${data.coins || 0}** monedas\n` +
    `🏦 Banco: **${data.bank || 0}** monedas (a salvo de robos)`
  );
}

async function handleBanco(message, rest) {
  const targetId = parseUserId(rest);
  const user = targetId
    ? await message.client.users.fetch(targetId).catch(() => null)
    : message.author;

  if (!user) return message.reply('❌ No encontré a ese usuario.');

  const data = getEco(message.guild.id, user.id);

  await message.reply(
    `🏦 Banco de **${user.tag}**\n` +
    `Guardado: **${data.bank || 0}** monedas\n` +
    `Billetera: **${data.coins || 0}** monedas (aquí sí te las pueden robar)`
  );
}

function parseBankAmount(input, total) {
  const text = String(input || '').trim().toLowerCase();

  if (text === 'todo') return total;

  const amount = parseInt(text, 10);

  if (!amount || amount <= 0) return null;

  return amount;
}

async function handleDepositar(message, rest) {
  const data = getEco(message.guild.id, message.author.id);
  const wallet = data.coins || 0;
  const amount = parseBankAmount(rest, wallet);

  if (amount === null) {
    return message.reply('❌ Uso: `!!depositar <cantidad>` o `!!depositar todo`');
  }

  if (amount > wallet) {
    return message.reply(`❌ Solo tienes **${wallet}** monedas en tu billetera.`);
  }

  data.coins = wallet - amount;
  data.bank = (data.bank || 0) + amount;
  economyBucket.map.set(ecoKey(message.guild.id, message.author.id), data);
  economyBucket.debounce();

  await message.reply(
    `🏦 Depositaste **${amount}** monedas al banco.\n` +
    `Billetera: **${data.coins}** · Banco: **${data.bank}**`
  );
}

async function handleRetirar(message, rest) {
  const data = getEco(message.guild.id, message.author.id);
  const bank = data.bank || 0;
  const amount = parseBankAmount(rest, bank);

  if (amount === null) {
    return message.reply('❌ Uso: `!!retirar <cantidad>` o `!!retirar todo`');
  }

  if (amount > bank) {
    return message.reply(`❌ Solo tienes **${bank}** monedas en el banco.`);
  }

  data.bank = bank - amount;
  data.coins = (data.coins || 0) + amount;
  economyBucket.map.set(ecoKey(message.guild.id, message.author.id), data);
  economyBucket.debounce();

  await message.reply(
    `🏦 Retiraste **${amount}** monedas del banco.\n` +
    `Billetera: **${data.coins}** · Banco: **${data.bank}**`
  );
}

async function handleTransferir(message, rest) {
  const [rawTarget, rawAmount, ...extra] = rest.split(/\s+/);
  const targetId = parseUserId(rawTarget);
  const amount = parseInt(rawAmount, 10);

  if (!targetId || !amount || amount <= 0 || extra.length > 0) {
    return message.reply('❌ Uso: `!!transferir <@usuario> <cantidad>`');
  }

  if (targetId === message.author.id) {
    return message.reply('❌ No puedes transferirte monedas a ti mismo.');
  }

  const member = await getGuildMember(message.guild, targetId);

  if (!member) return message.reply('❌ No encontré a ese usuario.');

  const data = getEco(message.guild.id, message.author.id);
  const wallet = data.coins || 0;

  if (amount > wallet) {
    return message.reply(`❌ Solo tienes **${wallet}** monedas en tu billetera.`);
  }

  data.coins = wallet - amount;
  economyBucket.map.set(ecoKey(message.guild.id, message.author.id), data);
  addCoins(message.guild.id, targetId, amount);

  await message.reply(
    `💸 Transferiste **${amount}** monedas a **${member.user.tag}**.\n` +
    `Te quedan **${data.coins}** en tu billetera.`
  );
}

async function handleDaily(message) {
  const data = getEco(message.guild.id, message.author.id);

  if (data.lastDaily && hoursSince(data.lastDaily) < 24) {
    const wait = 24 - hoursSince(data.lastDaily);
    const h = Math.floor(wait);
    const m = Math.round((wait - h) * 60);

    return message.reply(`⏳ Ya cobraste hoy. Vuelve en **${h}h ${m}m**.`);
  }

  data.lastDaily = Date.now();
  economyBucket.map.set(ecoKey(message.guild.id, message.author.id), data);
  economyBucket.debounce();

  const amount = 100 + Math.floor(Math.random() * 151);

  addCoins(message.guild.id, message.author.id, amount);

  await message.reply(`🎁 ¡Recompensa diaria! +**${amount}** monedas. Ahora tienes **${getEco(message.guild.id, message.author.id).coins}**.`);
}

async function handleTrabajar(message) {
  const data = getEco(message.guild.id, message.author.id);

  if (data.lastWork && hoursSince(data.lastWork) < 1) {
    const wait = Math.ceil(60 - hoursSince(data.lastWork) * 60);

    return message.reply(`⏳ Descansa un poco... vuelve a trabajar en **${wait} min**.`);
  }

  data.lastWork = Date.now();
  economyBucket.map.set(ecoKey(message.guild.id, message.author.id), data);
  economyBucket.debounce();

  const amount = 20 + Math.floor(Math.random() * 41);

  addCoins(message.guild.id, message.author.id, amount);

  await message.reply(`💼 Trabajaste y ganaste **${amount}** monedas. Ahora tienes **${getEco(message.guild.id, message.author.id).coins}**.`);
}

function shopItems() {
  const items = SHOP_THEMES.map(theme => ({ kind: 'theme', ...theme }));

  for (const item of SHOP_ITEMS) {
    items.push({ kind: 'env', ...item });
  }

  return items;
}

async function handleShop(message) {
  const items = shopItems();

  if (items.length === 0) {
    return message.reply('🛒 La tienda está vacía.');
  }

  const lines = items.map((item, i) => {
    if (item.kind === 'theme') {
      return `${i + 1}. ${item.emoji} **${item.name}** — ${item.price} monedas`;
    }

    return `${i + 1}. **${item.name}** — ${item.price} monedas (rol <@&${item.roleId}>)`;
  });

  await message.reply(
    `🛒 **Tienda del servidor** (roles de decoración, sin permisos extra)\n` +
    `Usa \`!!comprar <número>\`\n\n${lines.join('\n')}`
  );
}

async function handleComprar(message, rest) {
  const items = shopItems();
  const index = parseInt(rest, 10);

  if (!index || index < 1 || index > items.length) {
    return message.reply('❌ Uso: `!!comprar <número>` (mira `!!shop`).');
  }

  const item = items[index - 1];
  const coins = getEco(message.guild.id, message.author.id).coins || 0;

  if (coins < item.price) {
    return message.reply(`❌ Te faltan **${item.price - coins}** monedas para **${item.name}**.`);
  }

  let role;

  if (item.kind === 'theme') {
    const key = `${message.guild.id}:${item.id}`;
    const existingId = shopRolesBucket.map.get(key);
    let existing = existingId ? message.guild.roles.cache.get(existingId) : null;

    if (!existing) {
      try {
        existing = await message.guild.roles.create({
          name: item.name,
          color: item.color,
          permissions: [],
          reason: `Tienda: ${item.name}`
        });

        await positionCustomRole(message.guild, existing);
      } catch (error) {
        console.error('Error creando rol de tienda:', error);
        return message.reply('❌ No pude crear el rol de la tienda. No se te cobró nada.');
      }

      shopRolesBucket.map.set(key, existing.id);
      shopRolesBucket.debounce();
    }

    role = existing;
  } else {
    role = message.guild.roles.cache.get(item.roleId);

    if (!role) {
      return message.reply('❌ El rol de la tienda no existe en este servidor.');
    }
  }

  if (message.member.roles.cache.has(role.id)) {
    return message.reply(`❌ Ya tienes el rol **${role.name}**.`);
  }

  const added = await message.member.roles.add(role)
    .then(() => true)
    .catch(() => false);

  if (!added) {
    return message.reply('❌ No pude asignar el rol (¿me faltan permisos?). No se te cobró nada.');
  }

  addCoins(message.guild.id, message.author.id, -item.price);

  const emoji = item.kind === 'theme' ? item.emoji : '🛒';

  await message.reply(`${emoji} ¡Compraste **${role.name}** por **${item.price}** monedas! Te quedan **${getEco(message.guild.id, message.author.id).coins}**.`);
}

function sanitizeRoleName(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 32);
}

const COLOR_MODIFIERS_DARK = new Set(['oscuro', 'marino', 'profundo', 'intenso', 'fuerte', 'bajo']);
const COLOR_MODIFIERS_LIGHT = new Set(['claro', 'pastel', 'suave', 'brillante', 'brilloso', 'neon', 'fosforito', 'choque']);
const COLOR_MODIFIERS_ALL = new Set([...COLOR_MODIFIERS_DARK, ...COLOR_MODIFIERS_LIGHT]);

function normalizeColorInput(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function colorLookup(name) {
  if (!name) return undefined;

  if (Object.prototype.hasOwnProperty.call(ROLE_COLOR_NAMES, name)) {
    return ROLE_COLOR_NAMES[name];
  }

  const stem = name.replace(/[oa]$/, '');

  if (stem && stem !== name && Object.prototype.hasOwnProperty.call(ROLE_COLOR_NAMES, stem)) {
    return ROLE_COLOR_NAMES[stem];
  }

  const diminutive = name.replace(/(ito|ita|illo|illa|ico|uca)$/, '');

  if (diminutive && diminutive !== name && Object.prototype.hasOwnProperty.call(ROLE_COLOR_NAMES, diminutive)) {
    return ROLE_COLOR_NAMES[diminutive];
  }

  return undefined;
}

function lightenColor(color, factor) {
  const r = Math.round(((color >> 16) & 0xff) + (255 - ((color >> 16) & 0xff)) * factor);
  const g = Math.round(((color >> 8) & 0xff) + (255 - ((color >> 8) & 0xff)) * factor);
  const b = Math.round((color & 0xff) + (255 - (color & 0xff)) * factor);
  return (r << 16) | (g << 8) | b;
}

function darkenColor(color, factor) {
  const r = Math.round(((color >> 16) & 0xff) * (1 - factor));
  const g = Math.round(((color >> 8) & 0xff) * (1 - factor));
  const b = Math.round((color & 0xff) * (1 - factor));
  return (r << 16) | (g << 8) | b;
}

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[m][n];
}

function parseRoleColor(input) {
  if (!input) return null;

  const t = String(input).trim();

  const hex = t.replace(/^#/, '').replace(/^0x/i, '');

  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return parseInt(hex, 16);
  }

  if (/^[0-9a-f]{8}$/i.test(hex)) {
    return parseInt(hex.slice(0, 6), 16);
  }

  if (/^[0-9a-f]{3}$/i.test(hex)) {
    const [r, g, b] = hex.split('').map(c => parseInt(c + c, 16));
    return (r << 16) | (g << 8) | b;
  }

  const norm = normalizeColorInput(t);

  const exact = colorLookup(norm);

  if (exact !== undefined) return exact;

  const words = norm.split(' ').filter(Boolean);
  const hasDark = words.some(w => COLOR_MODIFIERS_DARK.has(w));
  const hasLight = words.some(w => COLOR_MODIFIERS_LIGHT.has(w));
  const baseName = words.filter(w => !COLOR_MODIFIERS_ALL.has(w)).join(' ');

  if (baseName && baseName !== norm) {
    const base = colorLookup(baseName);

    if (base !== undefined) {
      let color = base;

      if (hasDark) color = darkenColor(color, 0.5);
      if (hasLight) color = lightenColor(color, 0.5);

      return color;
    }
  }

  if (words.length === 1) {
    let bestDist = Infinity;
    let best = null;
    let count = 0;

    for (const key of Object.keys(ROLE_COLOR_NAMES)) {
      if (key.includes(' ')) continue;

      const dist = editDistance(words[0], normalizeColorInput(key));

      if (dist < bestDist) {
        bestDist = dist;
        best = ROLE_COLOR_NAMES[key];
        count = 1;
      } else if (dist === bestDist) {
        count += 1;
      }
    }

    if (bestDist <= 1 && count === 1) return best;
  }

  return null;
}

function randomRoleColor() {
  const colors = Object.values(ROLE_COLOR_NAMES);
  return colors[Math.floor(Math.random() * colors.length)];
}

async function positionCustomRole(guild, role) {
  let anchor = null;

  for (const id of MEMBER_DENIED_ROLES) {
    const candidate = guild.roles.cache.get(id);

    if (candidate && (!anchor || candidate.position > anchor.position)) {
      anchor = candidate;
    }
  }

  const me = guild.members.me;
  const botHighest = me && me.roles.highest ? me.roles.highest.position : null;

  let target = anchor ? anchor.position + 1 : 1;

  if (typeof botHighest === 'number') {
    target = Math.min(target, botHighest - 1);
  }

  if (target > 0) {
    await role.setPosition(target).catch(() => {});
  }
}

async function handleComprarRol(message, rest) {
  if (!rest.trim()) {
    return message.reply(
      `❌ Uso: \`!!comprarrol <nombre> [color]\`\n` +
      `Ejemplos: \`!!comprarrol Mi Rolete azul\` o \`!!comprarrol Legendario #ff0000\`\n` +
      `Colores: rojo, azul, verde, morado, rosa, naranja, amarillo, blanco, negro, cyan, gris, turquesa, celeste, lila, coral, marrón, dorado, plata, violeta, esmeralda, fucsia... o un hex (#rrggbb).\n` +
      `También funcionan \`claro\`/\`oscuro\` (ej. "verde oscuro") y errores de tipeo.\n` +
      `Costo: **${CUSTOM_ROLE_PRICE}** monedas. Si ya tienes uno, lo actualiza sin volver a cobrar.`
    );
  }

  const words = rest.trim().split(/\s+/);
  let color = null;
  let colorStart = words.length;

  for (let i = 0; i < words.length; i++) {
    const parsed = parseRoleColor(words.slice(i).join(' '));

    if (parsed !== null) {
      color = parsed;
      colorStart = i;
      break;
    }
  }

  const rawName = (color !== null ? words.slice(0, colorStart).join(' ') : rest.trim()).trim() || rest.trim();

  if (!rawName) {
    return message.reply('❌ Escribe un nombre válido para tu rol.');
  }

  const name = sanitizeRoleName(rawName);

  const key = `${message.guild.id}:${message.author.id}`;
  const existingRoleId = customRolesBucket.map.get(key);
  const existingRole = existingRoleId ? message.guild.roles.cache.get(existingRoleId) : null;

  if (!existingRole) {
    const coins = getEco(message.guild.id, message.author.id).coins || 0;

    if (coins < CUSTOM_ROLE_PRICE) {
      return message.reply(`❌ Te faltan **${CUSTOM_ROLE_PRICE - coins}** monedas para tu rol personalizado.`);
    }
  }

  let role;

  try {
    if (existingRole) {
      await existingRole.setName(name);

      if (color !== null) {
        await existingRole.setColor(color);
      }

      role = existingRole;
    } else {
      role = await message.guild.roles.create({
        name,
        color: color !== null ? color : randomRoleColor(),
        permissions: [],
        reason: `Rol personalizado de ${message.author.tag}`
      });

      await positionCustomRole(message.guild, role);
    }
  } catch (error) {
    console.error('Error creando rol personalizado:', error);
    return message.reply('❌ No pude crear/actualizar el rol. No se te cobró nada.');
  }

  if (!existingRole) {
    await message.member.roles.add(role).catch(() => {});
  }

  customRolesBucket.map.set(key, role.id);
  customRolesBucket.debounce();

  if (!existingRole) {
    addCoins(message.guild.id, message.author.id, -CUSTOM_ROLE_PRICE);
  }

  const colorHex = '#' + (role.color || 0).toString(16).padStart(6, '0');

  await message.reply(
    `✅ Tu rol personalizado **${role.name}** (${colorHex}) está listo. ` +
    `Cambia nombre o color cuando quieras con \`!!comprarrol\`. Te quedan **${getEco(message.guild.id, message.author.id).coins}** monedas.`
  );
}

async function handleSetNivel(message, rest) {
  const [rawTarget, rawLevel] = rest.split(/\s+/);
  const targetId = parseUserId(rawTarget);
  const level = parseInt(rawLevel, 10);

  if (!targetId || !Number.isFinite(level) || level < 1) {
    return message.reply('❌ Uso: `!!setnivel <@usuario> <nivel>`');
  }

  const xp = 25 * level * (level - 1);

  LEVELS.set(`${message.guild.id}:${targetId}`, { xp, level: Math.max(1, level - 1) });
  saveLevelsDebounced();

  await message.reply(
    `🎚️ **<@${targetId}>** fijado al **nivel ${level}** (${xp} XP). ` +
    `Su rol de nivel se asignará en su próximo mensaje.`
  );

  await logModAction(
    message.guild,
    message.author,
    '🎚️ Nivel ajustado',
    `**Usuario:** <@${targetId}>\n**Nivel:** ${level}`
  );
}

async function handleSetCoins(message, rest) {
  const [rawTarget, rawAmount, where] = rest.split(/\s+/);
  const targetId = parseUserId(rawTarget);
  const amount = parseInt(rawAmount, 10);

  if (!targetId || !Number.isFinite(amount) || amount < 0) {
    return message.reply('❌ Uso: `!!setcoins <@usuario> <cantidad> [banco]`');
  }

  const data = getEco(message.guild.id, targetId);
  const toBank = (where || '').toLowerCase() === 'banco';

  if (toBank) {
    data.bank = amount;
  } else {
    data.coins = amount;
  }

  economyBucket.map.set(`${message.guild.id}:${targetId}`, data);
  economyBucket.debounce();

  await message.reply(
    `💰 **<@${targetId}>** ahora tiene **${amount}** monedas en ${toBank ? 'el banco' : 'su billetera'}.`
  );

  await logModAction(
    message.guild,
    message.author,
    '💰 Monedas ajustadas',
    `**Usuario:** <@${targetId}>\n**Monedas:** ${amount} (${toBank ? 'banco' : 'billetera'})`
  );
}

async function handleApostar(message, rest) {
  const amount = parseInt(rest, 10);

  if (!amount || amount <= 0) {
    return message.reply('❌ Uso: `!!apostar <cantidad>`');
  }

  const coins = getEco(message.guild.id, message.author.id).coins || 0;

  if (coins < amount) {
    return message.reply(`❌ No tienes suficientes monedas (tienes **${coins}**).`);
  }

  const win = Math.random() < 0.5;

  addCoins(message.guild.id, message.author.id, win ? amount : -amount);

  await message.reply(
    (win ? '🎰 ¡Ganaste! +' : '🎰 Perdiste −') +
    `**${amount}** monedas. Ahora tienes **${getEco(message.guild.id, message.author.id).coins}**.`
  );
}

async function handleCazar(message) {
  const data = getEco(message.guild.id, message.author.id);

  if (data.lastHunt && hoursSince(data.lastHunt) < 0.5) {
    const wait = Math.ceil(30 - hoursSince(data.lastHunt) * 60);

    return message.reply(`⏳ Espera **${wait} min** para cazar de nuevo.`);
  }

  data.lastHunt = Date.now();
  economyBucket.map.set(ecoKey(message.guild.id, message.author.id), data);
  economyBucket.debounce();

  const roll = Math.random();

  if (roll < 0.6) {
    const amount = 20 + Math.floor(Math.random() * 61);

    addCoins(message.guild.id, message.author.id, amount);

    return message.reply(`🎣 ¡Cazaste algo! +**${amount}** monedas.`);
  }

  if (roll < 0.85) {
    return message.reply('🌲 Se te escapó la presa... no ganaste nada.');
  }

  const jackpot = 150 + Math.floor(Math.random() * 151);

  addCoins(message.guild.id, message.author.id, jackpot);

  return message.reply(`🦌 ¡Cazaste al gran jefe del anexo! +**${jackpot}** monedas. ¡Jackpot!`);
}

async function handleRobar(message, rest) {
  const targetId = parseUserId(rest);

  if (!targetId) {
    return message.reply('❌ Uso: `!!robar <@usuario>`');
  }

  if (targetId === message.author.id) {
    return message.reply('❌ No puedes robarte a ti mismo.');
  }

  const member = await getGuildMember(message.guild, targetId);

  if (!member) {
    return message.reply('❌ No encontré a ese usuario.');
  }

  const data = getEco(message.guild.id, message.author.id);

  if (data.lastRob && hoursSince(data.lastRob) < 1) {
    const wait = Math.ceil(60 - hoursSince(data.lastRob) * 60);

    return message.reply(`⏳ Espera **${wait} min** para robar de nuevo.`);
  }

  data.lastRob = Date.now();
  economyBucket.map.set(ecoKey(message.guild.id, message.author.id), data);
  economyBucket.debounce();

  const targetData = getEco(message.guild.id, targetId);
  const targetCoins = targetData.coins || 0;

  if (targetCoins < 50) {
    const bank = targetData.bank || 0;

    if (bank >= 50) {
      return message.reply(`🕵️ Ese usuario tiene **${bank}** monedas guardadas en el banco... ahí no puedes robarlas.`);
    }

    return message.reply('🕵️ Ese usuario no tiene nada que robar (menos de 50 monedas).');
  }

  if (Math.random() < 0.5) {
    const steal = Math.max(10, Math.floor(targetCoins * (0.1 + Math.random() * 0.15)));

    addCoins(message.guild.id, targetId, -steal);
    addCoins(message.guild.id, message.author.id, steal);

    return message.reply(`🔪 ¡Robaste **${steal}** monedas de **${member.user.tag}**!`);
  }

  const fine = 30 + Math.floor(Math.random() * 41);

  addCoins(message.guild.id, message.author.id, -fine);

  return message.reply(`🚨 ¡Te atraparon robando! Pagaste una multa de **${fine}** monedas.`);
}

async function handleDuelo(message, rest) {
  const parts = rest.split(/\s+/);
  const targetId = parseUserId(parts[0]);
  const amount = parseInt(parts[1], 10);

  if (!targetId || !amount || amount <= 0) {
    return message.reply('❌ Uso: `!!duelo <@usuario> <cantidad>`');
  }

  if (targetId === message.author.id) {
    return message.reply('❌ No puedes duelarte a ti mismo.');
  }

  const member = await getGuildMember(message.guild, targetId);

  if (!member) {
    return message.reply('❌ No encontré a ese usuario.');
  }

  const myCoins = getEco(message.guild.id, message.author.id).coins || 0;
  const targetCoins = getEco(message.guild.id, targetId).coins || 0;

  if (myCoins < amount) {
    return message.reply(`❌ No tienes suficientes monedas (tienes **${myCoins}**).`);
  }

  if (targetCoins < amount) {
    return message.reply(`❌ **${member.user.tag}** no tiene suficientes monedas (tiene **${targetCoins}**).`);
  }

  const iWin = Math.random() < 0.5;

  if (iWin) {
    addCoins(message.guild.id, message.author.id, amount);
    addCoins(message.guild.id, targetId, -amount);

    return message.reply(`🤺 ¡Ganaste el duelo contra **${member.user.tag}**! +**${amount}** monedas.`);
  }

  addCoins(message.guild.id, message.author.id, -amount);
  addCoins(message.guild.id, targetId, amount);

  return message.reply(`🤺 Perdiste el duelo contra **${member.user.tag}**... −**${amount}** monedas.`);
}

async function handleRacha(message) {
  const data = getStat(message.guild.id, message.author.id);

  await message.reply(
    `🔥 **Tu racha**: **${data.streak || 0}** días seguidos.\n` +
    `🏆 **Récord**: ${data.bestStreak || 0} días\n` +
    `💬 **Mensajes**: ${data.messages || 0}`
  );
}

async function handleCumple(message, rest) {
  const birthday = parseBirthday(rest);

  if (!birthday) {
    return message.reply('❌ Uso: `!!cumple <día/mes>` (ej: `!!cumple 24/12`)');
  }

  const monthName = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][birthday.month - 1];

  birthdaysBucket.map.set(`${message.guild.id}:${message.author.id}`, birthday);
  birthdaysBucket.debounce();

  await message.reply(`🎂 ¡Registrado! Tu cumpleaños es el **${birthday.day} de ${monthName}**.`);
}

async function handleStats(message, rest) {
  const targetId = parseUserId(rest);
  const user = targetId
    ? await message.client.users.fetch(targetId).catch(() => null)
    : message.author;

  if (!user) return message.reply('❌ No encontré a ese usuario.');

  const key = `${message.guild.id}:${user.id}`;
  const levelData = LEVELS.get(key) || { xp: 0, level: 1 };
  const info = levelInfo(levelData.xp);
  const stat = getStat(message.guild.id, user.id);
  const eco = getEco(message.guild.id, user.id);
  const afkData = afkBucket.map.get(key);

  const last7 = [];

  for (let i = 6; i >= 0; i--) {
    const day = addDaysKey(dateKey(), -i);

    last7.push({ label: shortDayLabel(day), count: stat['day:' + day] || 0 });
  }

  const image = await funImages.createStatsImage(
    user.username,
    info.level,
    info.xpIntoLevel,
    info.xpToNext,
    stat.messages || 0,
    eco.coins || 0,
    stat.streak || 0,
    Math.floor((stat.vcSeconds || 0) / 60),
    last7
  );

  const embed = new EmbedBuilder()
    .setTitle(`📊 Estadísticas de ${user.tag}`)
    .setColor(0x3498db)
    .addFields(
      { name: 'Nivel', value: `${info.level} (${levelData.xp} XP)`, inline: true },
      { name: 'Mensajes', value: `${stat.messages || 0}`, inline: true },
      { name: 'Monedas', value: `${eco.coins || 0} 💰`, inline: true },
      { name: 'Racha', value: `${stat.streak || 0} días (récord ${stat.bestStreak || 0})`, inline: true },
      { name: 'Tiempo en voz', value: `${Math.floor((stat.vcSeconds || 0) / 60)} min`, inline: true },
      { name: 'Estado', value: afkData ? `AFK (${afkData.reason})` : 'Activo', inline: true }
    )
    .setImage('attachment://stats.png')
    .setFooter({ text: 'Mensajes de los últimos 7 días' });

  await message.reply({
    embeds: [embed],
    files: [{ attachment: image, name: 'stats.png' }]
  });
}

async function handleAfk(message, rest) {
  const reason = sanitizeReason(rest) || 'sin motivo';
  const key = `${message.guild.id}:${message.author.id}`;

  afkBucket.map.set(key, { reason, since: Date.now() });
  afkBucket.debounce();

  await message.reply(`😴 Estás AFK ahora. **Motivo:** ${reason}`);
}

async function handleReactionRoles(message, rest) {
  const parts = rest.split(/\s+/);

  if (parts.length < 2 || !/^\d{17,20}$/.test(parts[0])) {
    return message.reply('❌ Uso: `!!reactionroles <mensajeID> <emoji>:<@Rol> [emoji2:<@Rol2>...]`');
  }

  const messageId = parts[0];
  const config = [];

  for (const pair of parts.slice(1)) {
    const colon = pair.lastIndexOf(':');
    const emojiPart = colon === -1 ? '' : pair.slice(0, colon);
    const rolePart = pair.slice(colon + 1);
    const roleId = parseUserId(rolePart);

    if (!emojiPart || !roleId) {
      return message.reply(`❌ Par inválido: \`${pair}\`. Formato: \`emoji:<@Rol>\``);
    }

    if (!message.guild.roles.cache.get(roleId)) {
      return message.reply(`❌ No encontré el rol \`${rolePart}\` en este servidor.`);
    }

    config.push({ emoji: emojiPart, roleId });
  }

  const target = await message.channel.messages.fetch(messageId).catch(() => null);

  if (!target) {
    return message.reply(`❌ No encontré el mensaje \`${messageId}\` en este canal.`);
  }

  reactionRolesBucket.map.set(`${message.guild.id}:${message.channel.id}:${messageId}`, config);
  reactionRolesBucket.debounce();

  for (const pair of config) {
    const emoji = parseEmoji(pair.emoji);
    const resolved = emoji.isCustom
      ? message.guild.emojis.cache.get(emoji.id)
      : emoji.name;

    if (resolved) {
      await target.react(resolved).catch(() => {});
    }
  }

  await message.reply(`✅ Roles por reacción configurados en el mensaje <https://discord.com/channels/${message.guild.id}/${message.channel.id}/${messageId}>.`);
}

async function handleReactionChange(reaction, member, adding) {
  if (!reaction.message.guild) return;

  if (member.partial) {
    await member.fetch().catch(() => null);
  }

  if (!member) return;

  if (reaction.partial) {
    await reaction.fetch().catch(() => null);
  }

  if (reaction.message.partial) {
    await reaction.message.fetch().catch(() => null);
  }

  const key = `${reaction.message.guild.id}:${reaction.message.channelId}:${reaction.message.id}`;
  const config = reactionRolesBucket.map.get(key);

  if (!config) return;

  const emoji = reaction.emoji;

  for (const pair of config) {
    const matches = emoji.id ? pair.emoji.includes(emoji.id) : pair.emoji === emoji.name;

    if (!matches) continue;

    if (adding) {
      if (member.roles.cache.has(pair.roleId)) continue;

      await member.roles.add(pair.roleId).catch(() => {});
    } else {
      await member.roles.remove(pair.roleId).catch(() => {});
    }
  }
}

async function checkBirthdays() {
  if (!BIRTHDAY_CHANNEL_ID) return;

  const now = new Date();
  const today = `${now.getMonth() + 1}/${now.getDate()}`;

  for (const [key, value] of birthdaysBucket.map) {
    if (!value.month || !value.day) continue;

    if (`${value.month}/${value.day}` !== today) continue;

    const [guildId, userId] = key.split(':');
    const guild = client.guilds.cache.get(guildId);

    if (!guild) continue;

    const member = await getGuildMember(guild, userId);

    if (!member) continue;

    const announceKey = `announced:${key}:${today}`;

    if (birthdaysBucket.map.get(announceKey)) continue;

    const channel = await client.channels.fetch(BIRTHDAY_CHANNEL_ID).catch(() => null);

    if (!channel) continue;

    birthdaysBucket.map.set(announceKey, true);
    birthdaysBucket.debounce();

    await channel.send(`🎂 ¡Feliz cumpleaños **${member.user.tag}**! Que cumplas muchos más en el anexo 🥳`).catch(() => {});
  }
}

async function handleMsgBan(message, rest) {
  const [rawTarget, ...reasonParts] = rest.split(/\s+/);
  const targetId = parseUserId(rawTarget);

  if (!targetId) {
    return message.reply('❌ Uso: `!!ban <@usuario> [razón]`');
  }

  const reason = reasonParts.join(' ') || 'Sin razón especificada';
  const member = await getGuildMember(message.guild, targetId);

  if (!member) {
    return message.reply(`❌ No pude encontrar a \`${targetId}\` en este servidor.`);
  }

  if (!(await ensureMsgTarget(message, targetId, 'el baneo', member))) return;

  try {
    await message.guild.members.ban(targetId, { reason });
    await message.channel.send(`✅ **${member.user.tag}** fue baneado.\n**Motivo:** ${reason}`);

    await logModAction(
      message.guild,
      message.author,
      '🚫 Baneo',
      `**Usuario:** ${member}\n**Motivo:** ${reason}`
    );
  } catch (error) {
    console.error(error);
    await message.reply('❌ No pude banear al usuario. ¿Tengo permisos de **Banear miembros**?');
  }
}

async function handleMsgKick(message, rest) {
  const [rawTarget, ...reasonParts] = rest.split(/\s+/);
  const targetId = parseUserId(rawTarget);

  if (!targetId) {
    return message.reply('❌ Uso: `!!kick <@usuario> [razón]`');
  }

  const reason = reasonParts.join(' ') || 'Sin razón especificada';
  const member = await getGuildMember(message.guild, targetId);

  if (!member) {
    return message.reply(`❌ No pude encontrar a \`${targetId}\` en este servidor.`);
  }

  if (!(await ensureMsgTarget(message, targetId, 'la expulsión', member))) return;

  try {
    await member.kick(reason);
    await message.channel.send(`✅ **${member.user.tag}** fue expulsado.\n**Motivo:** ${reason}`);

    await logModAction(
      message.guild,
      message.author,
      '🥾 Expulsión',
      `**Usuario:** ${member}\n**Motivo:** ${reason}`
    );
  } catch (error) {
    console.error(error);
    await message.reply('❌ No pude expulsar al usuario. ¿Tengo permisos de **Expulsar miembros**?');
  }
}

async function handleMsgTimeout(message, rest) {
  const [rawTarget, rawDuration, ...reasonParts] = rest.split(/\s+/);
  const targetId = parseUserId(rawTarget);

  if (!targetId) {
    return message.reply('❌ Uso: `!!timeout <@usuario> <duración> [razón]`. Ej: `!!timeout @usuario 1h`');
  }

  const duration = rawDuration || '1h';
  const reason = reasonParts.join(' ') || 'Sin razón especificada';
  const ms = parseDuration(duration);

  if (!ms) {
    return message.reply(`❌ Duración no válida: \`${duration}\`. Usa valores como \`1m\`, \`5m\`, \`1h\`, \`1d\`.`);
  }

  const member = await getGuildMember(message.guild, targetId);

  if (!member) {
    return message.reply(`❌ No pude encontrar a \`${targetId}\` en este servidor.`);
  }

  if (!(await ensureMsgTarget(message, targetId, 'el timeout', member))) return;

  try {
    await member.timeout(ms, reason);
    await message.channel.send(`✅ **${member.user.tag}** recibió un timeout de ${duration}.\n**Motivo:** ${reason}`);

    await logModAction(
      message.guild,
      message.author,
      '🔇 Timeout',
      `**Usuario:** ${member}\n**Duración:** ${duration}\n**Motivo:** ${reason}`
    );
  } catch (error) {
    console.error(error);
    await message.reply('❌ No pude aplicar el timeout. ¿Tengo permisos de **Moderar miembros**?');
  }
}

async function purgeChannelMessages(channel, count) {
  let deleted = 0;
  let before;

  while (deleted < count) {
    const batch = await channel.messages
      .fetch({ limit: 100, before })
      .catch(() => null);

    if (!batch || batch.size === 0) break;

    const msgs = [...batch.values()].slice(0, count - deleted);

    const now = Date.now();
    const BULK_MAX_AGE = 14 * 24 * 60 * 60 * 1000;
    const bulkable = msgs.filter(msg => now - msg.createdTimestamp < BULK_MAX_AGE);
    const oldOnes = msgs.filter(msg => now - msg.createdTimestamp >= BULK_MAX_AGE);

    if (bulkable.length >= 2) {
      const result = await channel.bulkDelete(bulkable, true).catch(() => null);
      if (result) deleted += result.size;
    } else if (bulkable.length === 1) {
      await bulkable[0].delete().catch(() => {});
      deleted += 1;
    }

    for (const msg of oldOnes) {
      await msg.delete().catch(() => {});
      deleted += 1;
    }

    if (batch.size < 100) break;
    before = batch.last().id;
  }

  return deleted;
}

async function purgeUserMessages(channel, targetId, count) {
  let deleted = 0;
  let remaining = count;
  let before;

  while (remaining > 0) {
    const options = { limit: 100 };

    if (before) options.before = before;

    const batch = await channel.messages.fetch(options).catch(() => null);

    if (!batch || batch.size === 0) break;

    const matches = [...batch.values()]
      .filter(msg => msg.author.id === targetId)
      .slice(0, remaining);

    if (matches.length === 0) {
      if (batch.size < 100) break;
      before = batch.last().id;
      continue;
    }

    for (let i = 0; i < matches.length;) {
      const chunk = matches.slice(i, i + 100);

      if (chunk.length >= 2) {
        await channel.bulkDelete(chunk).catch(console.error);
      } else {
        await chunk[0].delete().catch(console.error);
      }

      deleted += chunk.length;
      remaining -= chunk.length;
      i += chunk.length;
    }

    if (batch.size < 100) break;
    before = batch.last().id;
  }

  return deleted;
}

async function handleSlashEraseChat(interaction) {
  const guild = interaction.guild;
  const channel = interaction.channel;

  if (!channel || !channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({
      content: '❌ Necesito el permiso de **Gestionar mensajes** para borrar.',
      ephemeral: true
    });
  }

  const count = interaction.options.getInteger('cantidad', true);

  await interaction.deferReply({ ephemeral: true });

  const deleted = await purgeChannelMessages(channel, count);

  await interaction.editReply(`✅ ${deleted} mensaje(s) eliminado(s).`);

  await logModAction(
    guild,
    interaction.user,
    '🧹 Limpieza de chat',
    `**Canal:** ${channel}\n**Mensajes eliminados:** ${deleted}`
  );
}

async function handleSlashPurgeUser(interaction) {
  const guild = interaction.guild;
  const channel = interaction.channel;

  if (!channel || !channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({
      content: '❌ Necesito el permiso de **Gestionar mensajes** para borrar.',
      ephemeral: true
    });
  }

  const count = interaction.options.getInteger('cantidad', true);
  const targetId = interaction.options.getUser('usuario', true).id;

  const member = await getGuildMember(guild, targetId);
  const name = member?.user.tag || targetId;

  const deleted = await purgeUserMessages(channel, targetId, count);

  await interaction.reply({
    content: `✅ Se eliminaron **${deleted}** mensaje(s) de **${name}**.`,
    ephemeral: true
  });

  await logModAction(
    guild,
    interaction.user,
    '🗑️ Purga de usuario',
    `**Usuario:** ${member || `\`${targetId}\``}\n**Mensajes eliminados:** ${deleted}`
  );
}

async function handleNukeModal(interaction) {
  const password = interaction.fields.getTextInputValue('nuke_password');

  if (password !== NUKE_PASSWORD) {
    return interaction.reply({
      content: '❌ Contraseña incorrecta. Nuke cancelado.',
      ephemeral: true
    });
  }

  const guild = interaction.guild;
  const channel = interaction.channel;

  if (!channel || !guild) {
    return interaction.reply({
      content: '❌ No encuentro ese canal.',
      ephemeral: true
    });
  }

  await interaction.reply({
    content: '💥 Nukeando el canal...',
    ephemeral: true
  });

  try {
    const newChannel = await channel.clone({
      name: channel.name,
      reason: `Nuke por ${interaction.user.tag}`
    });

    await newChannel.setPosition(channel.position);

    await channel.delete('Nuke');

    await newChannel.send(`💥 Canal nukeado por <@${interaction.user.id}>.`);

    await logModAction(
      guild,
      interaction.user,
      '💥 Nuke',
      `**Canal:** <#${newChannel.id}>`
    );

    await interaction
      .editReply({ content: '💥 Canal nukeado.', ephemeral: true })
      .catch(() => {});
  } catch (error) {
    console.error(error);

    await interaction
      .editReply({
        content: '❌ No pude nukear el canal. ¿Tengo permiso de **Gestionar canales**?',
        ephemeral: true
      })
      .catch(() => {});
  }
}

async function logModAction(guild, actor, title, description) {
  const channel = MODLOG_CHANNEL_ID
    ? await client.channels.fetch(MODLOG_CHANNEL_ID).catch(() => null)
    : null;

  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x3498db)
    .setDescription(`${description}\n**Admin:** ${actor}`)
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(console.error);
}

function parseUserId(input) {
  const trimmed = (input || '').trim();
  const match = /^(?:<@!?)?(\d{17,20})>?$/.exec(trimmed);

  return match ? match[1] : null;
}

function getWarns(guildId, userId) {
  return warningsBucket.map.get(`${guildId}:${userId}`) || [];
}

function addWarn(guildId, userId, reason, by) {
  const key = `${guildId}:${userId}`;
  const list = getWarns(guildId, userId);

  list.push({ reason, by, at: new Date() });
  warningsBucket.map.set(key, list);
  warningsBucket.debounce();

  return list;
}

function clearWarns(guildId, userId) {
  warningsBucket.map.delete(`${guildId}:${userId}`);
  warningsBucket.debounce();
}

async function handleUnban(message, rest) {
  const [rawId, ...reasonParts] = rest.split(/\s+/);
  const userId = parseUserId(rawId);

  if (!userId) {
    return message.reply('❌ Uso: `!!unban <id_usuario> [razón]`');
  }

  const reason = reasonParts.join(' ') || 'Sin razón especificada';

  try {
    await message.guild.bans.remove(userId, reason);

    await message.channel.send(`✅ Usuario \`${userId}\` desbaneado.`);

    await logModAction(
      message.guild,
      message.author,
      '🔓 Desbaneo',
      `**Usuario:** \`${userId}\`\n**Motivo:** ${reason}`
    );
  } catch (error) {
    console.error(error);
    await message.reply(
      `❌ No pude desbanear a \`${userId}\`. ¿Está baneado? ¿Tengo permiso de **Banear miembros**?`
    );
  }
}

async function handleWarn(message, rest) {
  const [rawTarget, ...reasonParts] = rest.split(/\s+/);
  const targetId = parseUserId(rawTarget);

  if (!targetId) {
    return message.reply('❌ Uso: `!!warn <@usuario> [razón]`');
  }

  const reason = reasonParts.join(' ') || 'Sin razón especificada';
  const member = await getGuildMember(message.guild, targetId);

  if (!member) {
    return message.reply(`❌ No pude encontrar a \`${targetId}\` en este servidor.`);
  }

  if (targetId === message.author.id) {
    return message.reply('❌ No puedes advertirte a ti mismo.');
  }

  if (targetId === client.user.id) {
    return message.reply('❌ No puedes advertirme a mí.');
  }

  if (isAdmin(member)) {
    return message.reply('❌ No puedes advertir a un administrador.');
  }

  const warns = addWarn(message.guild.id, targetId, reason, message.author.tag);

  let response = `⚠️ **${member.user.tag}** recibió una advertencia (**${warns.length}** en total).\n**Motivo:** ${reason}`;

  if (warns.length >= WARN_TIMEOUT_THRESHOLD) {
    try {
      await member.timeout(60 * 60 * 1000, `${WARN_TIMEOUT_THRESHOLD} advertencias acumuladas`);
      clearWarns(message.guild.id, targetId);
      response += `\n🔇 **${member.user.tag}** superó ${WARN_TIMEOUT_THRESHOLD} advertencias y fue silenciado 1 hora.`;
    } catch (error) {
      console.error(error);
    }
  }

  await message.channel.send(response);

  await logModAction(
    message.guild,
    message.author,
    '⚠️ Advertencia',
    `**Usuario:** ${member}\n**Total:** ${warns.length}\n**Motivo:** ${reason}`
  );
}

async function handleWarns(message, rest) {
  const targetId = parseUserId(rest);

  if (!targetId) {
    return message.reply('❌ Uso: `!!warns <@usuario>`');
  }

  const warns = getWarns(message.guild.id, targetId);
  const member = await getGuildMember(message.guild, targetId);
  const name = member?.user.tag || targetId;

  if (warns.length === 0) {
    return message.reply(`✅ **${name}** no tiene advertencias.`);
  }

  const lines = warns.map((w, i) =>
    `${i + 1}. ${w.reason} — ${new Date(w.at).toLocaleString()} (por ${w.by})`
  );

  await message.reply(`**Advertencias de ${name}:**\n${lines.join('\n')}`);
}

async function handleDelWarn(message, rest) {
  const targetId = parseUserId(rest);

  if (!targetId) {
    return message.reply('❌ Uso: `!!delwarn <@usuario>`');
  }

  clearWarns(message.guild.id, targetId);

  await message.reply(`✅ Se eliminaron las advertencias de \`${targetId}\`.`);

  await logModAction(
    message.guild,
    message.author,
    '🧾 Advertencias limpiadas',
    `**Usuario:** \`${targetId}\``
  );
}

async function handleSlowmode(message, rest) {
  const count = parseInt(rest, 10);

  if (isNaN(count)) {
    return message.reply('❌ Uso: `!!slowmode <segundos>` (0 para desactivar). Máximo 21600.');
  }

  const seconds = Math.max(0, Math.min(21600, count));

  try {
    await message.channel.setRateLimitPerUser(seconds);

    await message.channel.send(
      seconds === 0
        ? '✅ Modo lento desactivado.'
        : `✅ Modo lento configurado a **${seconds} segundos**.`
    );

    await logModAction(
      message.guild,
      message.author,
      '🐢 Modo lento',
      `**Canal:** ${message.channel}\n**Segundos:** ${seconds}`
    );
  } catch (error) {
    console.error(error);
    await message.reply('❌ No pude cambiar el modo lento. ¿Tengo permiso de **Gestionar canales**?');
  }
}

async function handleLockState(message, locked) {
  try {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      SendMessages: !locked
    });

    await message.channel.send(locked ? '🔒 Canal bloqueado.' : '🔓 Canal desbloqueado.');

    await logModAction(
      message.guild,
      message.author,
      locked ? '🔒 Canal bloqueado' : '🔓 Canal desbloqueado',
      `**Canal:** ${message.channel}`
    );
  } catch (error) {
    console.error(error);
    await message.reply('❌ No pude modificar el canal. ¿Tengo permiso de **Gestionar canales**?');
  }
}

async function handleAnnounce(message, rest) {
  const text = rest.trim();

  if (!text) {
    return message.reply('❌ Uso: `!!announce <texto>`');
  }

  const embed = new EmbedBuilder()
    .setTitle('📢 Anuncio')
    .setDescription(text)
    .setColor(0x9b59b6)
    .setFooter({ text: `Por ${message.author.tag}` })
    .setTimestamp();

  await message.channel.send({ embeds: [embed] });

  await logModAction(
    message.guild,
    message.author,
    '📢 Anuncio',
    `**Canal:** ${message.channel}\n**Texto:** ${shortenText(text, 1024)}`
  );
}

async function handleAvatar(message, rest) {
  const targetId = parseUserId(rest);
  const user = targetId
    ? await message.client.users.fetch(targetId).catch(() => null)
    : message.author;

  if (!user) return message.reply('❌ No encontré a ese usuario.');

  const embed = new EmbedBuilder()
    .setTitle(`Avatar de ${user.tag}`)
    .setImage(user.displayAvatarURL({ size: 1024, extension: 'png' }))
    .setColor(0x3498db);

  await message.channel.send({ embeds: [embed] });
}

async function handleUserinfo(message, rest) {
  const targetId = parseUserId(rest);
  const user = targetId
    ? await message.client.users.fetch(targetId).catch(() => null)
    : message.author;

  if (!user) return message.reply('❌ No encontré a ese usuario.');

  const member = await getGuildMember(message.guild, user.id);
  const memberRoles = member
    ? member.roles.cache.filter(role => role.id !== message.guild.id)
    : null;

  const embed = new EmbedBuilder()
    .setTitle(user.tag)
    .setThumbnail(user.displayAvatarURL())
    .setColor(0x3498db)
    .addFields([
      { name: 'ID', value: user.id },
      { name: 'Cuenta creada', value: user.createdAt.toLocaleDateString() },
      { name: 'Entró al servidor', value: member ? member.joinedAt.toLocaleDateString() : '—' },
      { name: 'Bot', value: user.bot ? 'Sí' : 'No' },
      {
        name: `Roles (${memberRoles ? memberRoles.size : 0})`,
        value: memberRoles && memberRoles.size > 0
          ? memberRoles.map(role => role.toString()).join(' ').slice(0, 1024)
          : '—'
      }
    ]);

  await message.channel.send({ embeds: [embed] });
}

async function handleServerinfo(message) {
  const guild = message.guild;

  const members = await guild.members.fetch().catch(() => null);
  const total = members ? members.size : guild.memberCount;
  const bots = members ? members.filter(member => member.user.bot).size : 0;
  const textChannels = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildText).size;
  const voiceChannels = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildVoice).size;
  const owner = await guild.fetchOwner().catch(() => null);

  const embed = new EmbedBuilder()
    .setTitle(guild.name)
    .setThumbnail(guild.iconURL())
    .setColor(0x9b59b6)
    .addFields([
      { name: 'ID', value: guild.id },
      { name: 'Dueño', value: owner ? owner.user.tag : '—' },
      { name: 'Miembros', value: `${total} (${bots} bots)` },
      { name: 'Canales', value: `💬 ${textChannels} | 🔊 ${voiceChannels}` },
      { name: 'Roles', value: String(guild.roles.cache.size) },
      { name: 'Nivel de boost', value: String(guild.premiumTier) },
      { name: 'Creado', value: guild.createdAt.toLocaleDateString() }
    ]);

  await message.channel.send({ embeds: [embed] });
}

async function handlePing(message) {
  const sent = await message.channel.send('🏓 Pong...');

  const latency = sent.createdTimestamp - message.createdTimestamp;
  const api = Math.round(message.client.ws.ping);

  await sent.edit(`🏓 Pong! Latencia: **${latency}ms** | API: **${api}ms**`);
}

async function handlePoll(message, rest) {
  const text = rest.trim();

  if (!text) return message.reply('❌ Uso: `!!poll <pregunta>`');

  const embed = new EmbedBuilder()
    .setTitle('📊 Encuesta')
    .setDescription(text)
    .setColor(0x3498db)
    .setFooter({ text: `Por ${message.author.tag}` })
    .setTimestamp();

  const sent = await message.channel.send({ embeds: [embed] });

  await sent.react('✅');
  await sent.react('❌');

  await message.delete().catch(() => {});
}

async function handleSay(message, rest) {
  const text = rest.trim();

  if (!text) return message.reply('❌ Uso: `!!say <texto>`');

  await message.channel.send(text);

  await message.delete().catch(() => {});
}

const BALL_ANSWERS = [
  'Sí.', 'No.', 'Tal vez.', 'Sin duda alguna.', 'No cuentes con ello.',
  'Claro que sí.', 'Mejor no te lo digo.', 'Las señales dicen que sí.',
  'Pregunta de nuevo más tarde.', 'Desde luego.', 'Definitivamente no.',
  'No lo veo claro.'
];

async function handle8ball(message, rest) {
  if (!rest.trim()) return message.reply('❌ Uso: `!!8ball <pregunta>`');

  const answer = BALL_ANSWERS[Math.floor(Math.random() * BALL_ANSWERS.length)];

  await message.reply(`🎱 ${answer}`);
}

async function handleDice(message, rest) {
  let faces = parseInt(rest.trim(), 10) || 6;

  faces = Math.max(2, Math.min(100, faces));

  const result = Math.floor(Math.random() * faces) + 1;

  await message.reply(`🎲 Sacaste un **${result}** (dado de ${faces} caras).`);
}

async function handleCoin(message) {
  const result = Math.random() < 0.5 ? 'Cara' : 'Cruz';

  await message.reply(`🪙 **${result}**`);
}

const SLAP_PHRASES = [
  '{a} le dio una bofetada a {b}.',
  '{a} lanzó una torta a {b}.',
  '{a} tiró a {b} al lago. 🏊',
  '{a} le pegó con una almohada a {b}.'
];

async function handleSlap(message, rest) {
  const targetId = parseUserId(rest);

  if (!targetId) return message.reply('❌ Uso: `!!slap <@usuario>`');

  const member = await getGuildMember(message.guild, targetId);

  if (!member) return message.reply('❌ No pude encontrar a ese usuario.');

  const phrase = SLAP_PHRASES[Math.floor(Math.random() * SLAP_PHRASES.length)]
    .replace(/\{a\}/g, message.member.toString())
    .replace(/\{b\}/g, member.toString());

  await message.channel.send(phrase);
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

async function sendImage(message, buffer, filename) {
  try {
    await message.channel.send({ files: [{ attachment: buffer, name: filename }] });
  } catch (error) {
    console.error(error);
    await message.reply('❌ No pude generar la imagen. Inténtalo de nuevo.');
  }
}

async function handleQuote(message) {
  if (!message.reference) {
    return message.reply('❌ Responde a un mensaje de texto para citarlo. Ej: `!!quote`');
  }

  const target = await message.fetchReference().catch(() => null);

  if (!target) {
    return message.reply('❌ No pude obtener el mensaje al que respondiste.');
  }

  const content = (target.content || '').trim();

  if (!content) {
    return message.reply('❌ Ese mensaje no tiene texto para citar.');
  }

  if (target.author.bot) {
    return message.reply('❌ Solo puedo citar mensajes de personas.');
  }

  try {
    const image = await funImages.createQuoteImage(
      content,
      target.author.username,
      target.author.displayAvatarURL({ size: 256, extension: 'png' })
    );

    await sendImage(message, image, 'quote.png');
  } catch (error) {
    console.error(error);
    await message.reply('❌ No pude crear la cita.').catch(() => {});
  }
}

async function handleFirma(message, rest) {
  const name = (rest || '').trim().slice(0, 40) || message.member.displayName || message.author.username;

  try {
    const image = await funImages.createSignatureImage(
      name,
      message.author.displayAvatarURL({ size: 256, extension: 'png' })
    );

    await sendImage(message, image, 'firma.png');
  } catch (error) {
    console.error(error);
    await message.reply('❌ No pude crear la firma.').catch(() => {});
  }
}

async function handlePolaroid(message, rest) {
  let photo = null;

  if (message.reference) {
    const target = await message.fetchReference().catch(() => null);

    if (target) {
      const attachment = getImageFromMessage(target);

      if (attachment) {
        photo = await funImages.downloadBuffer(attachment.url);
      }
    }
  }

  if (!photo) {
    photo = await funImages.downloadBuffer(
      message.author.displayAvatarURL({ size: 512, extension: 'png' })
    );
  }

  try {
    const image = await funImages.createPolaroidImage(photo, rest);

    await sendImage(message, image, 'polaroid.png');
  } catch (error) {
    console.error(error);
    await message.reply('❌ No pude crear la polaroid.').catch(() => {});
  }
}

async function handleWanted(message, rest) {
  let user = null;

  if (message.reference) {
    const target = await message.fetchReference().catch(() => null);

    if (target) {
      user = target.author;
    }
  }

  if (!user) {
    const targetId = parseUserId(rest);

    user = targetId
      ? await message.client.users.fetch(targetId).catch(() => null)
      : message.author;
  }

  const member = user ? await getGuildMember(message.guild, user.id) : null;
  const name = (member?.displayName || user?.username || '???').slice(0, 40);
  const reward = Math.floor(Math.random() * 9000) + 1000;

  try {
    const image = await funImages.createWantedImage(
      user ? user.displayAvatarURL({ size: 256, extension: 'png' }) : null,
      name,
      reward
    );

    await sendImage(message, image, 'wanted.png');
  } catch (error) {
    console.error(error);
    await message.reply('❌ No pude crear el cartel.').catch(() => {});
  }
}

async function handleLogro(message, rest) {
  const text = (rest || '').trim();

  if (!text) {
    return message.reply('❌ Uso: `!!logro <texto>`');
  }

  try {
    const image = await funImages.createAchievementImage(text);

    await sendImage(message, image, 'logro.png');
  } catch (error) {
    console.error(error);
    await message.reply('❌ No pude crear el logro.').catch(() => {});
  }
}

async function handleMute(message, rest) {
  const [rawTarget, rawDuration, ...reasonParts] = rest.split(/\s+/);
  const targetId = parseUserId(rawTarget);

  if (!targetId) {
    return message.reply('❌ Uso: `!!mute <@usuario> [duración] [razón]`. Ej: `!!mute @usuario 1h`');
  }

  const duration = rawDuration || '1h';
  const reason = reasonParts.join(' ') || 'Sin razón especificada';
  const ms = parseDuration(duration);

  if (!ms) {
    return message.reply(`❌ Duración no válida: \`${duration}\`. Usa valores como \`1m\`, \`1h\`, \`1d\`.`);
  }

  const member = await getGuildMember(message.guild, targetId);

  if (!member) return message.reply(`❌ No pude encontrar a \`${targetId}\` en este servidor.`);

  if (!(await ensureMsgTarget(message, targetId, 'el mute', member))) return;

  try {
    await member.timeout(ms, reason);
    await message.channel.send(`🔇 **${member.user.tag}** fue muteado por ${duration}.\n**Motivo:** ${reason}`);

    await logModAction(
      message.guild,
      message.author,
      '🔇 Mute',
      `**Usuario:** ${member}\n**Duración:** ${duration}\n**Motivo:** ${reason}`
    );
  } catch (error) {
    console.error(error);
    await message.reply('❌ No pude mutear al usuario. ¿Tengo permisos de **Moderar miembros**?');
  }
}

async function handleUnmute(message, rest) {
  const targetId = parseUserId(rest);

  if (!targetId) return message.reply('❌ Uso: `!!unmute <@usuario>`');

  const member = await getGuildMember(message.guild, targetId);

  if (!member) return message.reply(`❌ No pude encontrar a \`${targetId}\` en este servidor.`);

  try {
    await member.timeout(null);
    await message.channel.send(`🔊 **${member.user.tag}** fue desmuteado.`);

    await logModAction(
      message.guild,
      message.author,
      '🔊 Unmute',
      `**Usuario:** ${member}`
    );
  } catch (error) {
    console.error(error);
    await message.reply('❌ No pude desmutear al usuario. ¿Tengo permisos de **Moderar miembros**?');
  }
}

async function handleVc(message, rest) {
  const [rawTarget, rawChannel, ...extra] = rest.split(/\s+/);
  const targetId = parseUserId(rawTarget);

  if (!targetId || !rawChannel || extra.length > 0) {
    return message.reply('❌ Uso: `!!vc <@usuario> <#canal o id>`');
  }

  const channelId = rawChannel.replace(/[<#>]/g, '');
  const channel = message.guild.channels.cache.get(channelId)
    || message.guild.channels.cache.find(ch => ch.name === rawChannel && ch.type === ChannelType.GuildVoice);

  if (!channel || channel.type !== ChannelType.GuildVoice) {
    return message.reply('❌ No encontré ese canal de voz.');
  }

  const member = await getGuildMember(message.guild, targetId);

  if (!member) return message.reply(`❌ No pude encontrar a \`${targetId}\` en este servidor.`);

  try {
    await member.voice.setChannel(channel.id);
    await message.channel.send(`🔁 **${member.user.tag}** fue movido a **${channel.name}**.`);
  } catch (error) {
    console.error(error);
    await message.reply('❌ No pude mover al usuario. ¿Está en un canal de voz?');
  }
}

async function handleDespedida(message, rest) {
  const text = rest.trim();

  if (!text) {
    return message.reply(
      '❌ Uso: `!!despedida <mensaje>`\n' +
      'Marcadores: `{user}` (mención), `{username}` (nombre), `{server}` (servidor).\n' +
      `Mensaje actual: ${leaveMessageOverride || LEAVE_MESSAGE}`
    );
  }

  leaveMessageOverride = text;

  await message.channel.send('✅ Mensaje de despedida configurado.');

  await logModAction(
    message.guild,
    message.author,
    '👋 Despedida configurada',
    `**Mensaje:** ${shortenText(text, 1024)}`
  );
}

async function disableRaidMode(guild) {
  raidModeGuilds.delete(guild.id);
  raidJoins.delete(guild.id);

  await guild.setVerificationLevel(GuildVerificationLevel.None).catch(() => {});

  for (const channel of guild.channels.cache.values()) {
    if (channel.isTextBased()) {
      await channel.permissionOverwrites
        .edit(guild.roles.everyone, { SendMessages: true })
        .catch(() => {});
    }
  }

  await applyChannelRestrictions(guild);
}

async function triggerRaidMode(guild) {
  raidModeGuilds.add(guild.id);

  await guild.setVerificationLevel(GuildVerificationLevel.High).catch(console.error);

  for (const channel of guild.channels.cache.values()) {
    if (channel.isTextBased()) {
      await channel.permissionOverwrites
        .edit(guild.roles.everyone, { SendMessages: false })
        .catch(() => {});
    }
  }

  await logModAction(
    guild,
    guild.client.user,
    '🚨 Anti-raid activado',
    `Se detectaron muchas entradas en poco tiempo (${RAID_JOIN_THRESHOLD}+ en ${RAID_JOIN_WINDOW_MS / 1000}s).\n` +
    'Verificación en **Alta** y canales bloqueados. Usa `!!antiraid off` para desactivar.'
  );

  setTimeout(() => disableRaidMode(guild), RAID_COOLDOWN_MS);
}

async function handleAntiRaid(message, rest) {
  const arg = rest.trim().toLowerCase();

  if (arg === 'off') {
    await disableRaidMode(message.guild);

    await message.channel.send('✅ Anti-raid desactivado y canales restaurados.');

    await logModAction(message.guild, message.author, '✅ Anti-raid desactivado', '');

    return;
  }

  await message.channel.send(
    raidModeGuilds.has(message.guild.id)
      ? '🚨 Anti-raid **activo**. Usa `!!antiraid off` para desactivarlo.'
      : `🛡️ Anti-raid **inactivo**. Umbral: ${RAID_JOIN_THRESHOLD} entradas en ${RAID_JOIN_WINDOW_MS / 1000}s.`
  );
}

client.once('clientReady', async () => {
  console.log(`✅ Conectado como ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    await applyChannelRestrictions(guild);
  }

  console.log('🔒 Restricciones de canales aplicadas.');

  await checkBirthdays();
  setInterval(checkBirthdays, 3600000);
});

client.on('guildMemberAdd', async member => {
  try {
    if (member.user.bot) return;

    const channel = WELCOME_CHANNEL_ID
      ? await client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null)
      : null;

    if (!channel) return;

    const image = await funImages.createWelcomeImage(
      member.user.displayAvatarURL({ size: 512, extension: 'png' }),
      member.user.username,
      member.guild.name,
      member.guild.memberCount
    );

    await channel.send({ files: [{ attachment: image, name: 'bienvenida.png' }] });
  } catch (error) {
    console.error('Error en bienvenida:', error);
  }
});

client.on('messageCreate', async message => {
  try {
    if (message.author.bot) return;

    const guildId = message.guild?.id;

    if (guildId) {
      const afkKey = `${guildId}:${message.author.id}`;

      if (afkBucket.map.has(afkKey)) {
        afkBucket.map.delete(afkKey);
        afkBucket.debounce();
        await message.reply('👋 ¡Bienvenido de vuelta! Ya no estás AFK.').catch(() => {});
      }

      trackActivity(message);

      const rawContent = message.content.trim();

      if (!rawContent.startsWith('!!') && message.mentions.users.size > 0) {
        for (const [userId, user] of message.mentions.users) {
          if (userId === message.author.id) continue;

          const afkData = afkBucket.map.get(`${guildId}:${userId}`);

          if (afkData) {
            await message.channel
              .send(`😴 **${user.tag}** está AFK: **${afkData.reason}**`)
              .catch(() => {});
          }
        }
      }
    }

    if (await enforceAdminOnlyChannels(message)) return;

    await grantXp(message);

    const antiScam = await runAntiScam(message);

    if (antiScam?.deleted) return;

    const content = message.content.trim();

    if (content === '') {
      if (!warnedEmptyContent) {
        console.log('[debug] mensaje con contenido VACÍO (¿Message Content Intent desactivado?)');
        warnedEmptyContent = true;
      }
      return;
    }

    if (!content.startsWith('!!')) return;

    const commandMatch = /^!!(emoji|sticker|ban|kick|timeout|unban|warn|warns|delwarn|slowmode|lock|unlock|announce|avatar|userinfo|serverinfo|ping|poll|say|8ball|dado|moneda|slap|quote|firma|polaroid|wanted|logro|mute|unmute|vc|antiraid|despedida|nivel|niveles|help|canales|afk|bal|daily|trabajar|shop|comprar|comprarrol|apostar|robar|cazar|duelo|racha|cumple|stats|reactionroles|setnivel|setcoins|banco|depositar|retirar|transferir|pene)\b/i.exec(content);

    if (!commandMatch) return;

    const commandName = commandMatch[1].toLowerCase();
    const rest = content.slice(commandMatch[0].length).trim();

    if (!message.guild) return;

    if (commandName === 'pene') {
      await message.reply('comes').catch(() => {});
      await message.member.timeout(10 * 1000, 'Dijo !!pene').catch(() => {});
      return;
    }

    if (commandName === 'setcoins') {
      if (!isBankAdmin(message.member)) {
        return message.reply('❌ Solo el rol de administrador del banco puede modificar monedas.');
      }
    } else if (!PUBLIC_COMMANDS.has(commandName) && !isAdmin(message.member)) {
      return message.reply(
        `❌ Debes ser admin para usar este comando.`
      );
    }

    if (commandName === 'unban') {
      await handleUnban(message, rest);
      return;
    }

    if (commandName === 'warn') {
      await handleWarn(message, rest);
      return;
    }

    if (commandName === 'warns') {
      await handleWarns(message, rest);
      return;
    }

    if (commandName === 'delwarn') {
      await handleDelWarn(message, rest);
      return;
    }

    if (commandName === 'slowmode') {
      await handleSlowmode(message, rest);
      return;
    }

    if (commandName === 'lock') {
      await handleLockState(message, true);
      return;
    }

    if (commandName === 'unlock') {
      await handleLockState(message, false);
      return;
    }

    if (commandName === 'announce') {
      await handleAnnounce(message, rest);
      return;
    }

    if (commandName === 'ban') {
      await handleMsgBan(message, rest);
      return;
    }

    if (commandName === 'kick') {
      await handleMsgKick(message, rest);
      return;
    }

    if (commandName === 'timeout') {
      await handleMsgTimeout(message, rest);
      return;
    }

    if (commandName === 'avatar') {
      await handleAvatar(message, rest);
      return;
    }

    if (commandName === 'userinfo') {
      await handleUserinfo(message, rest);
      return;
    }

    if (commandName === 'serverinfo') {
      await handleServerinfo(message);
      return;
    }

    if (commandName === 'ping') {
      await handlePing(message);
      return;
    }

    if (commandName === 'poll') {
      await handlePoll(message, rest);
      return;
    }

    if (commandName === 'say') {
      await handleSay(message, rest);
      return;
    }

    if (commandName === '8ball') {
      await handle8ball(message, rest);
      return;
    }

    if (commandName === 'dado') {
      await handleDice(message, rest);
      return;
    }

    if (commandName === 'moneda') {
      await handleCoin(message);
      return;
    }

    if (commandName === 'slap') {
      await handleSlap(message, rest);
      return;
    }

    if (commandName === 'quote') {
      await handleQuote(message);
      return;
    }

    if (commandName === 'firma') {
      await handleFirma(message, rest);
      return;
    }

    if (commandName === 'polaroid') {
      await handlePolaroid(message, rest);
      return;
    }

    if (commandName === 'wanted') {
      await handleWanted(message, rest);
      return;
    }

    if (commandName === 'logro') {
      await handleLogro(message, rest);
      return;
    }

    if (commandName === 'mute') {
      await handleMute(message, rest);
      return;
    }

    if (commandName === 'unmute') {
      await handleUnmute(message, rest);
      return;
    }

    if (commandName === 'vc') {
      await handleVc(message, rest);
      return;
    }

    if (commandName === 'antiraid') {
      await handleAntiRaid(message, rest);
      return;
    }

    if (commandName === 'despedida') {
      await handleDespedida(message, rest);
      return;
    }

    if (commandName === 'nivel') {
      await handleNivel(message, rest);
      return;
    }

    if (commandName === 'niveles') {
      await handleNiveles(message);
      return;
    }

    if (commandName === 'help') {
      await handleHelp(message);
      return;
    }

    if (commandName === 'canales') {
      await handleCanales(message);
      return;
    }

    if (commandName === 'afk') {
      await handleAfk(message, rest);
      return;
    }

    if (commandName === 'bal') {
      await handleBal(message, rest);
      return;
    }

    if (commandName === 'banco') {
      await handleBanco(message, rest);
      return;
    }

    if (commandName === 'depositar') {
      await handleDepositar(message, rest);
      return;
    }

    if (commandName === 'retirar') {
      await handleRetirar(message, rest);
      return;
    }

    if (commandName === 'transferir') {
      await handleTransferir(message, rest);
      return;
    }

    if (commandName === 'daily') {
      await handleDaily(message);
      return;
    }

    if (commandName === 'trabajar') {
      await handleTrabajar(message);
      return;
    }

    if (commandName === 'shop') {
      await handleShop(message);
      return;
    }

    if (commandName === 'comprar') {
      await handleComprar(message, rest);
      return;
    }

    if (commandName === 'comprarrol') {
      await handleComprarRol(message, rest);
      return;
    }

    if (commandName === 'apostar') {
      await handleApostar(message, rest);
      return;
    }

    if (commandName === 'robar') {
      await handleRobar(message, rest);
      return;
    }

    if (commandName === 'cazar') {
      await handleCazar(message);
      return;
    }

    if (commandName === 'duelo') {
      await handleDuelo(message, rest);
      return;
    }

    if (commandName === 'racha') {
      await handleRacha(message);
      return;
    }

    if (commandName === 'cumple') {
      await handleCumple(message, rest);
      return;
    }

    if (commandName === 'stats') {
      await handleStats(message, rest);
      return;
    }

    if (commandName === 'reactionroles') {
      await handleReactionRoles(message, rest);
      return;
    }

    if (commandName === 'setnivel') {
      await handleSetNivel(message, rest);
      return;
    }

    if (commandName === 'setcoins') {
      await handleSetCoins(message, rest);
      return;
    }

    if (commandName !== 'emoji' && commandName !== 'sticker') return;

    let messageId = null;

    if (rest !== '') {
      const idMatch = /^(\d{17,20})$/.exec(rest);

      if (!idMatch) {
        return message.reply(
          `❌ ID no válido: \`${rest}\`. Debe ser el ID de un mensaje (solo números).`
        );
      }

      messageId = idMatch[1];
    }

    let attachment = null;

    if (messageId) {
      const byMessage = await message.channel.messages
        .fetch(messageId)
        .catch(() => null);

      if (byMessage) {
        attachment = await getImageFromMessage(byMessage);
      } else {
        attachment = await findAttachmentById(message.channel, messageId);
      }

      if (!attachment) {
        return message.reply(
          `❌ No encontré un mensaje (o adjunto) con el ID \`${messageId}\` en este canal.`
        );
      }
    } else if (message.reference) {
      const target = await message.fetchReference().catch(() => null);

      if (!target) {
        return message.reply('❌ No pude obtener el mensaje al que respondiste.');
      }

      attachment = await getImageFromMessage(target);
    } else {
      return message.reply(
        '❌ Responde a un mensaje o pasa el ID del mensaje. Ej: `!!emoji 123456789012345678`'
      );
    }

    if (!attachment) {
      return message.reply('❌ Ese mensaje no contiene una imagen.');
    }

    const ctx = await messageCtx(message);

    if (commandName === 'emoji') {
      await processEmoji(ctx, attachment);
    } else {
      await processSticker(ctx, attachment);
    }
  } catch (error) {
    console.error(error);

    message.reply('❌ Ocurrió un error inesperado.')
      .catch(() => {});
  }
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'emoji') {
        const { attachment, error } = await resolveImageFromOptions(interaction);

        if (error) {
          return interaction.reply({ content: error, ephemeral: true });
        }

        await processEmoji(interactionCtx(interaction), attachment);
        return;
      }

      if (interaction.commandName === 'sticker') {
        const { attachment, error } = await resolveImageFromOptions(interaction);

        if (error) {
          return interaction.reply({ content: error, ephemeral: true });
        }

        await processSticker(interactionCtx(interaction), attachment);
        return;
      }

      if (interaction.commandName === 'erasechat') {
        await handleSlashEraseChat(interaction);
        return;
      }

      if (interaction.commandName === 'purgeusuario') {
        await handleSlashPurgeUser(interaction);
        return;
      }

      if (interaction.commandName === 'nuke') {
        if (!NUKE_PASSWORD) {
          return interaction.reply({
            content: '❌ La contraseña de nuke no está configurada (variable NUKE_PASSWORD).',
            ephemeral: true
          });
        }

        await interaction.showModal(
          new ModalBuilder()
            .setCustomId('nuke_password_modal')
            .setTitle('Confirmar nuke')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('nuke_password')
                  .setLabel('Contraseña')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('Escribe la contraseña aquí (nadie la ve)')
                  .setRequired(true)
              )
            )
        );
        return;
      }

      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'nuke_password_modal') {
        await handleNukeModal(interaction);
      }

      return;
    }

    if (interaction.isMessageContextMenuCommand()) {
      if (!interaction.guild) {
        return interaction.reply({
          content: '❌ Esto solo funciona dentro de un servidor.',
          ephemeral: true
        });
      }

      if (!isAdmin(interaction.member)) {
        return interaction.reply({
          content: `❌ Debes ser admin para usar este comando.`,
          ephemeral: true
        });
      }

      const message = interaction.targetMessage;
      const attachment = await getImageFromMessage(message);

      if (!attachment) {
        return interaction.reply({
          content: '❌ Ese mensaje no contiene una imagen.',
          ephemeral: true
        });
      }

      if (interaction.commandName === 'Convertir a emoji') {
        await processEmoji(interactionCtx(interaction), attachment);
      }

      if (interaction.commandName === 'Convertir a sticker') {
        await processSticker(interactionCtx(interaction), attachment);
      }
    }
  } catch (error) {
    console.error(error);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(
        '❌ Ocurrió un error inesperado al procesar la imagen.'
      ).catch(() => {});
    } else {
      await interaction.reply({
        content: '❌ Ocurrió un error inesperado.',
        ephemeral: true
      }).catch(() => {});
    }
  }
});

client.on('guildMemberAdd', async member => {
  try {
    const guildId = member.guild.id;

    if (raidModeGuilds.has(guildId)) {
      await member.timeout(RAID_COOLDOWN_MS, 'Anti-raid activo').catch(() => {});
      return;
    }

    const now = Date.now();
    const joins = raidJoins.get(guildId) || [];

    joins.push(now);

    const recent = joins.filter(timestamp => now - timestamp <= RAID_JOIN_WINDOW_MS);

    raidJoins.set(guildId, recent);

    if (recent.length >= RAID_JOIN_THRESHOLD) {
      await triggerRaidMode(member.guild);
    }
  } catch (error) {
    console.error('Error en anti-raid:', error);
  }
});

client.on('guildMemberRemove', async member => {
  try {
    const channelId = LEAVE_CHANNEL_ID || member.guild.systemChannelId;

    if (!channelId) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel) return;

    const template = leaveMessageOverride || LEAVE_MESSAGE;

    const text = template
      .replace(/\{user\}/g, `${member.user}`)
      .replace(/\{username\}/g, member.user.tag)
      .replace(/\{server\}/g, member.guild.name);

    const image = await funImages.createGoodbyeImage(
      member.user.displayAvatarURL({ size: 512, extension: 'png' }),
      member.user.username,
      member.guild.name
    );

    await channel.send({
      content: text,
      files: [{ attachment: image, name: 'despedida.png' }]
    }).catch(console.error);
  } catch (error) {
    console.error('Error en despedida:', error);
  }
});

client.on('voiceStateUpdate', (oldState, newState) => {
  const id = newState.id;

  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    const session = voiceSessions.get(id);

    if (session) {
      addVcTime(session.guildId, id, Math.max(0, (Date.now() - session.since) / 1000));
      voiceSessions.delete(id);
    }
  }

  if (newState.channelId && oldState.channelId !== newState.channelId) {
    voiceSessions.set(id, { since: Date.now(), guildId: newState.guild.id });
  }
});

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch {
    return;
  }

  const member = reaction.message.guild
    ? await getGuildMember(reaction.message.guild, user.id)
    : null;

  if (member) {
    await handleReactionChange(reaction, member, true);
  }
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch {
    return;
  }

  const member = reaction.message.guild
    ? await getGuildMember(reaction.message.guild, user.id)
    : null;

  if (member) {
    await handleReactionChange(reaction, member, false);
  }
});

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot activo');
}).listen(process.env.PORT || 3000, () => {
  console.log(`✅ Servidor de salud en el puerto ${process.env.PORT || 3000}`);
});

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  console.log('Registrando comandos...');

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );

  console.log('Comandos registrados correctamente.');
}

(async () => {
  try {
    await loadLevels();

    await Promise.all([
      economyBucket.init(),
      statsBucket.init(),
      afkBucket.init(),
      birthdaysBucket.init(),
      reactionRolesBucket.init(),
      customRolesBucket.init(),
      shopRolesBucket.init(),
      warningsBucket.init()
    ]);

    await registerCommands();
    await client.login(process.env.TOKEN);
  } catch (error) {
    console.error('❌ Error al iniciar el bot:');
    console.error(error);
  }
})();

async function saveAllBuckets() {
  await saveLevels();
  await Promise.all([
    economyBucket.save(),
    statsBucket.save(),
    afkBucket.save(),
    birthdaysBucket.save(),
    reactionRolesBucket.save(),
    customRolesBucket.save(),
    shopRolesBucket.save(),
    warningsBucket.save()
  ]);
}

process.on('SIGTERM', async () => {
  await saveAllBuckets();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await saveAllBuckets();
  process.exit(0);
});
