import {
  camelize,
  createWebhook,
  DiscordenoMessage,
  editWebhookMessage,
  Embed,
  getChannelWebhooks,
  getMessage,
  getWebhook,
  Message,
  sendWebhook,
  startBot,
} from "https://deno.land/x/discordeno@11.2.0/mod.ts";
import {
  AmazonData,
  amazonUrlRegex,
  fetchAmazonData,
  shortenUrl,
} from "./amazon.ts";

const webhookName = "Amazon-URL-Shortener";
const footer = "Powered by Amazon URL Shortener (@aiotter)";

function isEmbedAlreadyProcessed(embed: Embed) {
  return embed.footer?.text === footer;
}

async function updateEmbeds(embeds: Embed[]) {
  const modifiedEmbeds = [];
  for (const embed of embeds) {
    if (isEmbedAlreadyProcessed(embed) || !embed.url?.match(amazonUrlRegex)) {
      modifiedEmbeds.push(embed);
      continue;
    }

    const amazon = await fetchAmazonData(embed.url as string);
    modifiedEmbeds.push(appendAmazonEmbed(embed, amazon));
  }
  return modifiedEmbeds;
}

async function ensureWebhook(channelId: bigint) {
  const webhooks = await getChannelWebhooks(channelId);
  for (const webhook of webhooks.values()) {
    if (webhook.token) return webhook;
  }
  return await createWebhook(channelId, { name: webhookName });
}

function appendAmazonEmbed(embed: Embed, amazon: AmazonData) {
  if (amazon.imageUrl) {
    embed.thumbnail = { url: amazon.imageUrl };
  }

  embed.fields = [];
  if (amazon.productTitle) {
    embed.description = amazon.productTitle;
  }
  if (amazon.price) {
    embed.fields.push({ name: "価格", value: amazon.price, inline: true });
  }
  if (amazon.rating) {
    embed.fields.push({ name: "評価", value: amazon.rating, inline: true });
  }

  embed.footer = { text: footer };
  return embed;
}

if (import.meta.main) {
  startBot({
    token: Deno.env.get("TOKEN") as string,
    intents: ["Guilds", "GuildMessages"],
    eventHandlers: {
      ready() {
        console.log("Successfully connected to gateway");
      },

      async messageCreate(message) {
        if (!message.content.match(amazonUrlRegex)) return;

        let webhook;
        try {
          webhook = await ensureWebhook(message.channelId);
        } catch (error) {
          console.error(error);
          return;
        }

        if (message.embeds.length > 0 && message.webhookId) {
          const updatedEmbeds = await updateEmbeds(message.embeds);
          const webhook = await getWebhook(message.webhookId);
          // if (JSON.stringify(updatedEmbeds) === JSON.stringify(message.embeds)) return;
          editWebhookMessage(
            BigInt(webhook.id),
            webhook.token as string,
            {
              messageId: message.id,
              embeds: updatedEmbeds,
            },
          ).catch(console.error);
          return;
        }

        // オリジナルメッセージを削除し，短縮リンクに置き換えて投稿する
        if (!message.webhookId) {
          const { username, discriminator, id, avatar } =
            message.toJSON().author;
          sendWebhook(BigInt(webhook.id), webhook.token as string, {
            content: shortenUrl(message.content),
            username: `${username}#${discriminator}`,
            avatarUrl: `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`,
          })
            .then(() => message.delete("Shortening Amazon URL"))
            .catch((error) => console.log(error));
        }
      },

      async raw(data) {
        // embed が追加されたらそこに情報を足す
        // 最初からユーザーが送ったメッセージに embed が追加されていることもある
        if (data.t === "MESSAGE_UPDATE") {
          data = camelize(data);

          // discord が追加した embed は編集日時が存在しない
          const partialMessage = data.d as Message;
          if (partialMessage.editedTimestamp) return;

          // すでに messageCreate で削除済みのメッセージに関するイベントが発生した場合に対応
          let message: DiscordenoMessage;
          try {
            message = await getMessage(
              BigInt(partialMessage.channelId),
              BigInt(partialMessage.id),
            );
          } catch (error) {
            console.log(error);
            return;
          }

          if (!message.webhookId || message.embeds.length === 0) return;

          const updatedEmbeds = await updateEmbeds(message.embeds);
          const webhook = await getWebhook(message.webhookId);
          // if (JSON.stringify(updatedEmbeds) === JSON.stringify(message.embeds)) return;
          editWebhookMessage(
            BigInt(webhook.id),
            webhook.token as string,
            {
              messageId: message.id,
              embeds: updatedEmbeds,
            },
          ).catch(console.error);
        }
      },
    },
  });
}
