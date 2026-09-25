import sharp from "sharp";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type Client,
  type MessageContextMenuCommandInteraction,
  type ModalSubmitInteraction
} from "discord.js";
import { config } from "./config.js";
import { getBalance, getLinkByDiscord } from "./db.js";
import { getAvatarThumbnail } from "./roblox.js";

const REJECT_MODAL_PREFIX = "reject-claim-evidence";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function isImageAttachment(attachment: {
  contentType: string | null;
  name: string | null;
}): boolean {
  if (attachment.contentType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp)$/i.test(attachment.name ?? "");
}

async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    throw new Error(`Gagal mengambil screenshot (HTTP ${response.status}).`);
  }

  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_IMAGE_BYTES) {
    throw new Error("Ukuran screenshot melebihi batas 20 MB.");
  }

  const image = Buffer.from(await response.arrayBuffer());
  if (image.length > MAX_IMAGE_BYTES) {
    throw new Error("Ukuran screenshot melebihi batas 20 MB.");
  }

  return image;
}

async function stampRejectedEvidence(source: Buffer): Promise<Buffer> {
  const normalized = await sharp(source)
    .rotate()
    .resize({
      width: 1600,
      height: 2000,
      fit: "inside",
      withoutEnlargement: true
    })
    .png()
    .toBuffer();

  const metadata = await sharp(normalized).metadata();
  const width = metadata.width ?? 1000;
  const height = metadata.height ?? 1000;
  const border = Math.max(8, Math.round(width * 0.012));
  const titleSize = Math.max(30, Math.round(width * 0.055));
  const subtitleSize = Math.max(18, Math.round(width * 0.025));
  const bannerWidth = Math.round(width * 0.76);
  const bannerHeight = Math.max(100, Math.round(height * 0.12));
  const bannerX = Math.round((width - bannerWidth) / 2);
  const bannerY = Math.round((height - bannerHeight) / 2);

  const overlay = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="rejectLines" width="170" height="170"
          patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
          <rect width="170" height="170" fill="none"/>
          <text x="8" y="88" font-family="Arial, sans-serif"
            font-size="25" font-weight="800" fill="#d72b35"
            fill-opacity="0.28">DITOLAK</text>
        </pattern>
        <filter id="shadow" x="-30%" y="-50%" width="160%" height="200%">
          <feDropShadow dx="0" dy="5" stdDeviation="7"
            flood-color="#000000" flood-opacity="0.75"/>
        </filter>
      </defs>

      <rect width="100%" height="100%" fill="url(#rejectLines)"/>
      <rect x="${border / 2}" y="${border / 2}"
        width="${width - border}" height="${height - border}"
        fill="none" stroke="#e3343f" stroke-width="${border}"/>

      <g filter="url(#shadow)">
        <rect x="${bannerX}" y="${bannerY}"
          width="${bannerWidth}" height="${bannerHeight}"
          rx="18" fill="#151518" fill-opacity="0.94"
          stroke="#ef3e49" stroke-width="6"/>
        <text x="${width / 2}" y="${bannerY + bannerHeight * 0.48}"
          text-anchor="middle" dominant-baseline="middle"
          font-family="Arial, sans-serif" font-size="${titleSize}"
          font-weight="900" fill="#ff4552">KLAIM DITOLAK</text>
        <text x="${width / 2}" y="${bannerY + bannerHeight * 0.77}"
          text-anchor="middle" dominant-baseline="middle"
          font-family="Arial, sans-serif" font-size="${subtitleSize}"
          font-weight="700" fill="#ffffff">BUKTI TIDAK VALID</text>
      </g>
    </svg>
  `);

  return sharp(normalized)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

export async function openRejectClaimModal(
  interaction: MessageContextMenuCommandInteraction
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: "Command ini hanya dapat digunakan di dalam server.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (
    !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) &&
    !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    await interaction.reply({
      content: "Command ini khusus admin.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const target = interaction.targetMessage;
  if (target.author.bot) {
    await interaction.reply({
      content: "Pilih screenshot yang dikirim oleh user, bukan pesan bot.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const image = target.attachments.find(isImageAttachment);
  if (!image) {
    await interaction.reply({
      content: "Pesan yang dipilih tidak memiliki attachment gambar.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const reasonInput = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Alasan penolakan")
    .setPlaceholder("Contoh: Bukti transaksi tidak sesuai atau sudah pernah dicairkan.")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(5)
    .setMaxLength(500)
    .setRequired(true);

  const modal = new ModalBuilder()
    .setCustomId(
      `${REJECT_MODAL_PREFIX}:${interaction.channelId}:${target.id}`
    )
    .setTitle("Tolak Bukti Claim")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
    );

  await interaction.showModal(modal);
}

export async function handleRejectClaimModal(
  interaction: ModalSubmitInteraction,
  client: Client
): Promise<void> {
  if (!interaction.customId.startsWith(`${REJECT_MODAL_PREFIX}:`)) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const [, channelId, messageId] = interaction.customId.split(":");
  const reason = interaction.fields.getTextInputValue("reason").trim();

  if (!channelId || !messageId || !interaction.guild) {
    await interaction.editReply("Data pesan bukti tidak valid.");
    return;
  }

  if (
    !interaction.inCachedGuild() ||
    (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) &&
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator))
  ) {
    await interaction.editReply("Command ini khusus admin.");
    return;
  }

  const sourceChannel = await interaction.guild.channels.fetch(channelId);
  if (!sourceChannel?.isTextBased()) {
    await interaction.editReply("Channel asal bukti tidak ditemukan.");
    return;
  }

  const sourceMessage = await sourceChannel.messages.fetch(messageId);
  if (sourceMessage.author.bot) {
    await interaction.editReply("Pesan bot tidak dapat dijadikan bukti claim.");
    return;
  }

  const evidence = sourceMessage.attachments.find(isImageAttachment);
  if (!evidence) {
    await interaction.editReply("Screenshot pada pesan tersebut sudah tidak tersedia.");
    return;
  }

  const logChannel = await client.channels.fetch(config.failedClaimChannelId);
  if (!logChannel?.isSendable()) {
    await interaction.editReply(
      "Channel gagal-claim tidak ditemukan atau bot tidak dapat mengirim pesan."
    );
    return;
  }

  const claimant = sourceMessage.author;
  const link = await getLinkByDiscord(claimant.id);
  const balance = link
    ? await getBalance(link.robloxUserId).catch(() => null)
    : null;
  const robloxAvatar = link
    ? await getAvatarThumbnail(link.robloxUserId).catch(() => null)
    : null;

  const recentMessages = await sourceChannel.messages.fetch({ limit: 100 });
  const originalClaimMessage =
    [...recentMessages.values()]
      .filter((message) => message.author.id === claimant.id)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)[0] ??
    sourceMessage;

  const screenshot = await downloadImage(evidence.url);
  const stampedScreenshot = await stampRejectedEvidence(screenshot);
  const cashbackText = balance
    ? `${balance.available.toLocaleString("id-ID")} Robux`
    : "Tidak tersedia";
  const spentText = balance
    ? `${balance.totalSpent.toLocaleString("id-ID")} Robux`
    : "Tidak tersedia";
  const robloxText = link
    ? `@${link.robloxUsername}\nID ${link.robloxUserId}`
    : "Akun Roblox belum terhubung";

  const embed = new EmbedBuilder()
    .setColor(0xe3343f)
    .setTitle("\u274C KLAIM DITOLAK (GAGAL CLAIM)")
    .setDescription(
      `${claimant} \u2022 <#${sourceChannel.id}>`
    )
    .addFields(
      {
        name: "\uD83D\uDC64 Pengklaim (Discord)",
        value: `${claimant}\n\`${claimant.id}\``,
        inline: true
      },
      {
        name: "Username Roblox",
        value: robloxText,
        inline: true
      },
      {
        name: "Cashback",
        value: `**${cashbackText}**\nSpent: ${spentText}`,
        inline: true
      },
      {
        name: "\uD83D\uDEE0\uFE0F Ditolak Oleh",
        value: `${interaction.user}\n\`${interaction.user.username}\``,
        inline: false
      },
      {
        name: "\uD83D\uDCDD Alasan Penolakan",
        value: reason,
        inline: false
      },
      {
        name: "\uD83D\uDD17 Bukti Claim Ditolak",
        value: `[Klik di sini untuk melihat bukti asli](${sourceMessage.url})`,
        inline: false
      },
      {
        name: "Pesan Claim Awal",
        value: `[Klik di sini untuk melihat pesan claim](${originalClaimMessage.url})`,
        inline: false
      }
    )
    .setImage("attachment://claim-ditolak.png")
    .setFooter({
      text: `Log Penolakan Claim \u2022 Pesan ${sourceMessage.id}`
    })
    .setTimestamp();

  if (robloxAvatar) {
    embed.setThumbnail(robloxAvatar);
  }

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Lihat Bukti Asli")
      .setStyle(ButtonStyle.Link)
      .setURL(sourceMessage.url),
    new ButtonBuilder()
      .setLabel("Lihat Claim Awal")
      .setStyle(ButtonStyle.Link)
      .setURL(originalClaimMessage.url)
  );

  await logChannel.send({
    content: [
      "## \u274C LOG PENOLAKAN CLAIM",
      `${claimant} \u2022 <#${sourceChannel.id}>`
    ].join("\n"),
    embeds: [embed],
    files: [
      new AttachmentBuilder(stampedScreenshot, {
        name: "claim-ditolak.png"
      })
    ],
    components: [buttons],
    allowedMentions: { parse: [] }
  });

  await sourceMessage.react("\u274C").catch(() => undefined);
  await sourceMessage
    .reply({
      content: [
        `## \u274C BUKTI CLAIM DITOLAK`,
        `<@${claimant.id}>, bukti claim ini dinyatakan tidak valid.`,
        `**Alasan:** ${reason}`,
        `**Ditolak oleh:** <@${interaction.user.id}>`
      ].join("\n"),
      allowedMentions: { users: [claimant.id] }
    })
    .catch(() => undefined);

  await interaction.editReply(
    `\u2705 Bukti berhasil ditandai dan log dikirim ke <#${config.failedClaimChannelId}>. Tidak ada saldo yang diubah.`
  );
}
