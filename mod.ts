import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.12-alpha/deno-dom-wasm.ts";
import { startBot } from "https://deno.land/x/discordeno@11.2.0/mod.ts";
import * as helpers from "https://deno.land/x/discordeno@11.2.0/src/helpers/mod.ts";
import { DiscordenoMessage } from "https://deno.land/x/discordeno@11.2.0/src/structures/message.ts"
import { Message } from "https://deno.land/x/discordeno@11.2.0/src/types/messages/message.ts";
import { Embed } from "https://deno.land/x/discordeno@11.2.0/src/types/mod.ts";
import { camelize } from "https://deno.land/x/discordeno@11.2.0/src/util/utils.ts";
import { config } from "https://deno.land/x/dotenv@v2.0.0/mod.ts";


config();
const amazonRegex = new RegExp("https?://.*?amazon\\.co\\.jp.*/(gp(/product)?|dp|ASIN)/([^/?]{10,})\\S*", "g");
const webhookName = "Amazon-URL-Shortener"
const footer = "Powered by Amazon URL Shortener (@aiotter)"
let processingMessageIds: bigint[] = [];

interface AmazonData {
  price?: string;
  imageUrl?: string;
  rating?: string;
}

function isEmbedAlreadyProcessed(embed: Embed) {
  return embed.footer?.text === footer;
}

async function updateEmbeds(embeds: Embed[]) {
  const modifiedEmbeds = []
  for (const embed of embeds) {
    if (isEmbedAlreadyProcessed(embed) || !embed.url?.match(amazonRegex)) {
      modifiedEmbeds.push(embed);
      continue;
    }

    const amazon = await fetchAmazonData(embed.url as string);
    modifiedEmbeds.push(appendAmazonEmbed(embed, amazon));
  }
  return modifiedEmbeds
}

async function ensureWebhook(channelId: bigint) {
  const webhooks = await helpers.getChannelWebhooks(channelId);
  for (const webhook of webhooks.values()) {
    if (webhook.token) return webhook;
  }
  return await helpers.createWebhook(channelId, {name: webhookName});
}

function appendAmazonEmbed(embed: Embed, amazon: AmazonData) {
  embed.thumbnail = {url: amazon.imageUrl};
  embed.fields = [
    {name: "価格", value: amazon.price ?? "？？？"},
    {name: "評価", value: amazon.rating ?? "？？？"},
  ]
  embed.footer = {text: footer};
  return embed
}

async function fetchAmazonData(url: string) {
  const res = await fetch(url);
  const html = await res.text();
  const document = new DOMParser().parseFromString(html, 'text/html');
  return {
    price: document?.querySelector("#price,#newBuyBoxPrice,#priceblock_ourprice,#kindle-price,#price_inside_buybox,.slot-price>.a-color-price")?.textContent.replace(/^\s*(.*)\s*$/, '$1'),
    imageUrl: document?.querySelector("#landingImage,#imgBlkFront,#ebooksImgBlkFront")?.getAttribute('src') ?? undefined,
    rating: document?.querySelector('span[data-hook="rating-out-of-text"]')?.textContent,
  }
}

startBot({
  token: config().TOKEN as string,
  intents: ["Guilds", "GuildMessages"],
  eventHandlers: {
    ready() {
      console.log("Successfully connected to gateway");
    },

    async messageCreate(message) {
      if (!message.content.match(amazonRegex)) return;

      // 同期制御
      if (processingMessageIds.includes(message.id)) return;
      processingMessageIds.push(message.id);

      const webhook = await ensureWebhook(message.channelId);
      if (!webhook) {
        await message.send("Webhook を作成できません！");
        setTimeout(()=>message.delete(), 5);
        return;
      }

      if (message.embeds.length > 0 && message.webhookId) {
        const updatedEmbeds = await updateEmbeds(message.embeds);
        const webhook = await helpers.getWebhook(message.webhookId);
        // if (JSON.stringify(updatedEmbeds) === JSON.stringify(message.embeds)) return;
        helpers.editWebhookMessage(BigInt(webhook.id), webhook.token as string, {
          messageId: message.id,
          embeds: updatedEmbeds,
        })
        return;
      }

      processingMessageIds = processingMessageIds.filter(id => id !== message.id);
      // processingMessageIds = processingMessageIds.slice(0,50);

      // オリジナルメッセージを削除し，短縮リンクに置き換えて投稿する
      if (!message.webhookId) {
        const { username, discriminator, id, avatar } = message.toJSON().author;
        helpers.sendWebhook(BigInt(webhook.id), webhook.token as string, {
          content: message.content.replaceAll(amazonRegex, (_0, _1, _2, asin) =>
            `https://www.amazon.co.jp/gp/product/${asin}/`),
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

        // 同期制御
        if (processingMessageIds.includes(BigInt(partialMessage.id))) return;
        processingMessageIds.push(BigInt(partialMessage.id));

        // すでに messageCreate で削除済みのメッセージに関するイベントが発生した場合に対応
        let message: DiscordenoMessage;
        try {
          message = await helpers.getMessage(BigInt(partialMessage.channelId), BigInt(partialMessage.id));
        } catch (error) { console.log(error); return; }

        if (!message.webhookId || message.embeds.length === 0) return;

        const updatedEmbeds = await updateEmbeds(message.embeds);
        const webhook = await helpers.getWebhook(message.webhookId);
        // if (JSON.stringify(updatedEmbeds) === JSON.stringify(message.embeds)) return;
        helpers.editWebhookMessage(BigInt(webhook.id), webhook.token as string, {
          messageId: message.id,
          embeds: updatedEmbeds,
        })

        processingMessageIds = processingMessageIds.filter(id => id !== message.id);
        // processingMessageIds = processingMessageIds.slice(0,50);
      }
    }
  },
});
