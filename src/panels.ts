import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";
import { config } from "./config.js";

export function verificationPanel(): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const embed = new EmbedBuilder()
    .setColor(0xc98b8e)
    .setTitle("🔗 Hubungkan Akun Roblox")
    .setDescription(
      [
        "Hubungkan akun Discord kamu ke akun Roblox agar channel komunitas dan saldo cashback dapat diakses.",
        "",
        "Kamu hanya perlu memasukkan **username Roblox**—bot tidak pernah meminta password.",
        "",
        "⚠️ Pastikan akunnya benar. Satu Roblox ID hanya dapat terhubung ke satu akun Discord dan pergantian akun harus melalui admin."
      ].join("\n")
    )
    .setFooter({ text: "Saldo dan payout selalu terkunci ke Roblox User ID yang terhubung." });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("verify:start")
      .setLabel("Hubungkan Akun")
      .setEmoji("🔗")
      .setStyle(ButtonStyle.Primary)
  );
  return { embeds: [embed], components: [row] };
}

export function cashbackPanel(): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const embed = new EmbedBuilder()
    .setColor(0x6f9f82)
    .setTitle("💰 Saldo & Claim Cashback")
    .setDescription(
      [
        `Cashback **${config.cashbackPercent}%** dari item minimal **${config.minimumItemPrice} Robux** akan digabung menjadi satu saldo.`,
        "",
        `Syarat pencairan: tetap menjadi anggota komunitas Roblox selama **${config.communityWaitDays} hari** dan dana pembelian sudah melewati masa tunggu **${config.fundsHoldDays} hari**.`,
        "",
        "Claim akan membuka ticket privat. Kirim bukti pembelian di sana, lalu admin akan memeriksa dan membayar secara manual."
      ].join("\n")
    );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cashback:balance")
      .setLabel("Cek Saldo")
      .setEmoji("💳")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("cashback:claim")
      .setLabel("Buat Ticket Claim")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Success)
  );
  return { embeds: [embed], components: [row] };
}
