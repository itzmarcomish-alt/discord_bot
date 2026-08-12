require('dotenv').config();

const http = require('http');

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');

const sharp = require('sharp');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const ADMIN_ROLE_NAME = process.env.ADMIN_ROLE_NAME || 'Admin';
const MODLOG_CHANNEL_ID = process.env.MODLOG_CHANNEL_ID || '';
const SCAM_EXCLUDED_CHANNELS = new Set(
  (process.env.SCAM_EXCLUDED_CHANNELS || '').split(',').map(id => id.trim()).filter(Boolean)
);
const IMAGE_SPAM_THRESHOLD = 4;
const IMAGE_SPAM_WINDOW_MS = 60 * 1000;

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
let warnedEmptyContent = false;

const commands = [
  new SlashCommandBuilder()
    .setName('emoji')
    .setDescription('Convierte una imagen en un emoji')
    .addAttachmentOption(option =>
      option
        .setName('imagen')
        .setDescription('Imagen que quieres convertir')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('sticker')
    .setDescription('Convierte una imagen en un sticker')
    .addAttachmentOption(option =>
      option
        .setName('imagen')
        .setDescription('Imagen que quieres convertir')
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

  return member.roles.cache.some(role => role.name === ADMIN_ROLE_NAME);
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

async function getImageFromMessage(message) {
  if (!message || !message.attachments || message.attachments.size === 0) {
    return null;
  }

  const attachment = message.attachments.find(file =>
    file.contentType?.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp)$/i.test(file.name || '')
  );

  return attachment || null;
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
    return ctx.reply(`❌ Necesitas tener el rol **${ADMIN_ROLE_NAME}** para usar esto.`);
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
    return ctx.reply(`❌ Necesitas tener el rol **${ADMIN_ROLE_NAME}** para usar esto.`);
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

client.once('clientReady', () => {
  console.log(`✅ Conectado como ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  try {
    if (message.author.bot) return;

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

    if (content !== '!!emoji' && content !== '!!sticker') return;

    if (!message.guild) return;

    if (!isAdmin(message.member)) {
      return message.reply(
        `❌ Necesitas tener el rol **${ADMIN_ROLE_NAME}** para usar esto.`
      );
    }

    if (!message.reference) {
      return message.reply('❌ Responde a un mensaje que contenga una imagen.');
    }

    const target = await message.fetchReference();
    const attachment = await getImageFromMessage(target);

    if (!attachment) {
      return message.reply('❌ Ese mensaje no contiene una imagen.');
    }

    const ctx = await messageCtx(message);

    if (content === '!!emoji') {
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
        const attachment = interaction.options.getAttachment('imagen');
        await processEmoji(interactionCtx(interaction), attachment);
      }

      if (interaction.commandName === 'sticker') {
        const attachment = interaction.options.getAttachment('imagen');
        await processSticker(interactionCtx(interaction), attachment);
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
          content: `❌ Necesitas tener el rol **${ADMIN_ROLE_NAME}** para usar esto.`,
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
    await registerCommands();
    await client.login(process.env.TOKEN);
  } catch (error) {
    console.error('❌ Error al iniciar el bot:');
    console.error(error);
  }
})();
