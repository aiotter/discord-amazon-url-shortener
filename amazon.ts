import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.12-alpha/deno-dom-wasm.ts";

export const amazonUrlRegex = new RegExp(
  "https?://.*?amazon\\.co\\.jp.*/((gp(/product)?|dp|ASIN)|(customer-reviews|product-reviews))/([^/?]{10,})\\S*",
  "g",
);

export interface AmazonData {
  productTitle?: string;
  price?: string;
  imageUrl?: string;
  rating?: string;
}

export async function fetchAmazonData(url: string) {
  const res = await fetch(url);
  const html = await res.text();
  const document = new DOMParser().parseFromString(html, "text/html");

  const priceQuery = [
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    "#newBuyBoxPrice",
    "#kindle-price",
    "#price_inside_buybox",
    "#price",
    ".slot-price",
  ].find((query) => document?.querySelector(query));

  const price = priceQuery
    ? document?.querySelector(priceQuery)?.textContent
      .replace(/^\s*(.*)\s*$/, "$1")
    : undefined;

  return {
    productTitle: document?.querySelector("#productTitle")?.textContent.trim(),
    price: price,
    imageUrl:
      document?.querySelector("#landingImage,#imgBlkFront,#ebooksImgBlkFront")
        ?.getAttribute("src") ?? undefined,
    rating: document?.querySelector('span[data-hook="rating-out-of-text"]')
      ?.textContent,
  };
}

export function shortenUrl(url: string) {
  return url.replaceAll(
    amazonUrlRegex,
    (_0, _1, _2, _3, kind, id) =>
      `https://www.amazon.co.jp/gp/${kind ?? "product"}/${id}/`,
  );
}
