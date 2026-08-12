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
  TextInputStyle
} = require('discord.js');

const sharp = require('sharp');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    ...(process.env.WELCOME_CHANNEL_ID ? [GatewayIntentBits.GuildMembers] : [])
  ]
});

const ADMIN_ROLE_NAME = process.env.ADMIN_ROLE_NAME || 'Admin';
const ADMIN_ROLE_IDS = new Set(
  (process.env.ADMIN_ROLE_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
);
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
const LEVELS_FILE = path.join(__dirname, 'levels.json');
const LEVELS = new Map();

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
  'help', '8ball', 'dado', 'moneda', 'slap',
  'emoji', 'sticker', 'avatar', 'userinfo', 'serverinfo', 'ping',
  'poll', 'say', 'nivel', 'niveles'
]);

const NUKE_PASSWORD = process.env.NUKE_PASSWORD || '';

const ADMIN_ONLY_CHANNELS = new Set([
  ...(process.env.ADMIN_ONLY_CHANNELS || '').split(',').map(id => id.trim()).filter(Boolean),
  ...(MODLOG_CHANNEL_ID ? [MODLOG_CHANNEL_ID] : []),
  '1536881063580667934',
  '1536992463875735663',
  '1536991424032014428'
]);

const RAID_JOIN_THRESHOLD = parseInt(process.env.RAID_JOIN_THRESHOLD, 10) || 5;
const RAID_JOIN_WINDOW_MS = 10 * 1000;
const RAID_COOLDOWN_MS = 60 * 60 * 1000;
const raidJoins = new Map();
const raidModeGuilds = new Set();

const INVITE_PATTERN = /discord\.(?:gg\/|com\/invite\/)[a-zA-Z0-9-]+/i;

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
  'tiempo limitado', 'last chance', 'ultima oportunidad', 'deposit',
  'btc', 'premio', 'prize'
];

const imagePosts = new Map();
const seenUsers = new Map();
const warnings = new Map();
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

function adminRoleLabel() {
  const firstId = ADMIN_ROLE_IDS.values().next().value;

  if (firstId) return `<@&${firstId}>`;

  return `**${ADMIN_ROLE_NAME}**`;
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
    return ctx.reply(`❌ Necesitas tener el rol ${adminRoleLabel()} para usar esto.`);
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
    return ctx.reply(`❌ Necesitas tener el rol ${adminRoleLabel()} para usar esto.`);
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

  try {
    if (isAdmin(message.member)) {
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
      attachment => attachment.contentType?.startsWith('image/')
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
      } else if (attachments.length > 0) {
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
    ['`!!antiraid` / `!!antiraid off`', 'Estado del anti-raid o lo desactiva.']
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
    ['`!!despedida <mensaje>`', 'Personaliza el mensaje de despedida ({user}, {username}, {server}).'],
    ['`!!canales`', 'Reaplica la restricción de escritura en los canales.'],
    ['`!!help`', 'Muestra esta ayuda.']
  ];

  const fun = [
    ['`!!8ball <pregunta>`', 'Bola mágica: responde tu pregunta.'],
    ['`!!dado [caras]`', 'Lanza un dado (6 caras por defecto).'],
    ['`!!moneda`', 'Lanza una moneda: cara o cruz.'],
    ['`!!slap <@usuario>`', 'Le da una bofetada a un usuario.']
  ];

  const build = (title, color, rows) => new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(rows.map(([name, value]) => ({ name, value })));

  const embeds = [];

  if (includeModeration) {
    embeds.push(build('🛡️ Moderación', 0xe74c3c, moderation));
  }

  embeds.push(build('⚙️ Utilidades', 0x3498db, utilities));
  embeds.push(build('🎉 Diversión', 0xf1c40f, fun));

  return embeds;
}

async function handleHelp(message) {
  const isMod = isAdmin(message.member);
  const embeds = helpEmbeds(isMod);

  embeds.forEach(embed => embed.setFooter({
    text: `Bot de ${message.guild.name} — ${isMod
      ? 'moderación, utilidades y diversión a tu alcance'
      : 'utilidades y diversión públicas; la moderación solo la ven los admins'}`
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

function saveLevels() {
  try {
    fs.writeFileSync(LEVELS_FILE, JSON.stringify(Object.fromEntries(LEVELS)));
  } catch (error) {
    console.error('No pude guardar los niveles:', error);
  }
}

function saveLevelsDebounced() {
  clearTimeout(saveLevelsTimer);
  saveLevelsTimer = setTimeout(saveLevels, 5000);
}

function loadLevels() {
  try {
    const raw = fs.readFileSync(LEVELS_FILE, 'utf8');
    const data = JSON.parse(raw);

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

    const channel = await client.channels.fetch(LEVEL_CHANNEL_ID).catch(() => null);

    if (channel) {
      await channel
        .send(`🎉 ¡${message.author} subió al **nivel ${info.level}**!`)
        .catch(console.error);
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
  let remaining = count;

  while (remaining > 0) {
    const batch = Math.min(remaining, 100);

    const result = await channel
      .bulkDelete(batch, { filterOld: true })
      .catch(error => {
        console.error(error);
        return null;
      });

    if (!result || result.size === 0) break;

    deleted += result.size;
    remaining -= result.size;
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

  const deleted = await purgeChannelMessages(channel, count);

  await interaction.reply({
    content: `✅ ${deleted} mensaje(s) eliminado(s).`,
    ephemeral: true
  });

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
  return warnings.get(`${guildId}:${userId}`) || [];
}

function addWarn(guildId, userId, reason, by) {
  const key = `${guildId}:${userId}`;
  const list = getWarns(guildId, userId);

  list.push({ reason, by, at: new Date() });
  warnings.set(key, list);

  return list;
}

function clearWarns(guildId, userId) {
  warnings.delete(`${guildId}:${userId}`);
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
    `${i + 1}. ${w.reason} — ${w.at.toLocaleString()} (por ${w.by})`
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

  setTimeout(() => raidModeGuilds.delete(guild.id), RAID_COOLDOWN_MS);
}

async function handleAntiRaid(message, rest) {
  const arg = rest.trim().toLowerCase();

  if (arg === 'off') {
    raidModeGuilds.delete(message.guild.id);
    raidJoins.delete(message.guild.id);

    await message.guild.setVerificationLevel(GuildVerificationLevel.None).catch(() => {});

    for (const channel of message.guild.channels.cache.values()) {
      if (channel.isTextBased()) {
        await channel.permissionOverwrites
          .edit(message.guild.roles.everyone, { SendMessages: true })
          .catch(() => {});
      }
    }

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
});

client.on('guildMemberAdd', async member => {
  try {
    if (member.user.bot) return;

    const channel = WELCOME_CHANNEL_ID
      ? await client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null)
      : null;

    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🎉 ¡Bienvenido!')
      .setDescription(
        `¡Hola <@${member.user.id}>! Bienvenido/a a **${member.guild.name}**.`
      )
      .setColor(0x57f287)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error en bienvenida:', error);
  }
});

client.on('messageCreate', async message => {
  try {
    if (message.author.bot) return;

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

    const commandMatch = /^!!(emoji|sticker|ban|kick|timeout|unban|warn|warns|delwarn|slowmode|lock|unlock|announce|avatar|userinfo|serverinfo|ping|poll|say|8ball|dado|moneda|slap|mute|unmute|vc|antiraid|despedida|nivel|niveles|help|canales)\b/i.exec(content);

    if (!commandMatch) return;

    const commandName = commandMatch[1].toLowerCase();
    const rest = content.slice(commandMatch[0].length).trim();

    if (!message.guild) return;

    if (!PUBLIC_COMMANDS.has(commandName) && !isAdmin(message.member)) {
      return message.reply(
        `❌ Necesitas tener el rol ${adminRoleLabel()} para usar esto.`
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

    message.reply('❌ Ocurrió un error inesperado al procesar la imagen.')
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
          content: `❌ Necesitas tener el rol ${adminRoleLabel()} para usar esto.`,
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

    await channel.send(text).catch(console.error);
  } catch (error) {
    console.error('Error en despedida:', error);
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
    loadLevels();

    await registerCommands();
    await client.login(process.env.TOKEN);
  } catch (error) {
    console.error('❌ Error al iniciar el bot:');
    console.error(error);
  }
})();

process.on('SIGTERM', () => {
  saveLevels();
  process.exit(0);
});

process.on('SIGINT', () => {
  saveLevels();
  process.exit(0);
});
