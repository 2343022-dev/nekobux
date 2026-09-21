import {
  AttachmentBuilder,
  Client,
  EmbedBuilder,
  type APIEmbedField
} from "discord.js";
import { renderAdminAuditCard } from "./adminAuditCard.js";
import { config } from "./config.js";
import { errorMessage } from "./utils.js";

export interface AdminAuditInput {
  title: string;
  command: string;
  adminDiscordId: string;
  color?: number;
  fields?: APIEmbedField[];
}

function safeField(field: APIEmbedField): APIEmbedField {
  return {
    ...field,
    name: field.name.slice(0, 256),
    value: field.value.slice(0, 1024)
  };
}

export async function sendAdminAuditLog(
  client: Client,
  input: AdminAuditInput
): Promise<boolean> {
  if (!config.payoutLogChannelId) {
    console.warn(`[admin-audit] /${input.command} tidak dicatat: PAYOUT_LOG_CHANNEL_ID kosong.`);
    return false;
  }

  try {
    const channel = await client.channels.fetch(config.payoutLogChannelId);
    if (!channel?.isSendable()) {
      console.error("[admin-audit] Channel audit tidak ditemukan atau tidak dapat dikirimi pesan.");
      return false;
    }

    const createdAt = new Date();
    const admin = await client.users.fetch(input.adminDiscordId).catch(() => null);
    try {
      const card = await renderAdminAuditCard({
        title: input.title,
        command: input.command,
        adminName: admin?.displayName ?? admin?.username ?? "Admin",
        adminDiscordId: input.adminDiscordId,
        adminAvatarUrl: admin?.displayAvatarURL({ extension: "png", size: 256 }) ?? null,
        color: input.color ?? 0xb79aa0,
        fields: input.fields ?? [],
        createdAt
      });
      await channel.send({
        content: `💸 **PAYOUT LOG • ${input.title}**`,
        files: [
          new AttachmentBuilder(card, {
            name: `payout-log-${input.command}-${createdAt.getTime()}.png`
          })
        ],
        allowedMentions: { parse: [] }
      });
      return true;
    } catch (cardError) {
      console.error(`[admin-audit-card] /${input.command}: ${errorMessage(cardError)}`);
    }

    const embed = new EmbedBuilder()
      .setColor(input.color ?? 0xb79aa0)
      .setTitle(input.title)
      .addFields(
        {
          name: "Admin",
          value: `<@${input.adminDiscordId}> (\`${input.adminDiscordId}\`)`
        },
        {
          name: "Command",
          value: `\`/${input.command}\``
        },
        ...(input.fields ?? []).map(safeField)
      )
      .setFooter({ text: "Nekobux Payout Log • Jangan hapus pesan ini" })
      .setTimestamp(createdAt);

    await channel.send({
      embeds: [embed],
      allowedMentions: { parse: [] }
    });
    return true;
  } catch (error) {
    console.error(`[admin-audit] /${input.command}: ${errorMessage(error)}`);
    return false;
  }
}
