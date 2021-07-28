import { AmazonData, fetchAmazonData, shortenUrl } from "./mod.ts";
import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.103.0/testing/asserts.ts";

enum TestItems {
  None = 0,
  All = ~0,
  ProductTitle = 1 << 1,
  Price = 1 << 2,
  Image = 1 << 3,
  Rating = 1 << 4,
}

function isValidPrice(str: string) {
  return /^￥[0-9,]+$/.test(str);
}
function isValidRating(str: string) {
  return /^星5つ中の[0-9.]+$/.test(str);
}

function verifyAmazonData(data: AmazonData, testItem: number = TestItems.All) {
  if (testItem & TestItems.ProductTitle) assert(data?.productTitle);
  if (testItem & TestItems.Price) assert(isValidPrice(data.price as string));
  if (testItem & TestItems.Image) assert(data?.imageUrl);
  if (testItem & TestItems.Rating) assert(isValidRating(data.rating as string));
}

Deno.test("Kindle book #1", async () => {
  const url =
    "https://www.amazon.co.jp/%E3%81%BE%E3%81%9F%E3%81%9E%E3%82%8D%E3%80%82-%EF%BC%91%E5%B7%BB-%E3%81%BE%E3%82%93%E3%81%8C%E3%82%BF%E3%82%A4%E3%83%A0%EF%BC%AB%EF%BC%B2%E3%82%B3%E3%83%9F%E3%83%83%E3%82%AF%E3%82%B9-%E5%B9%8C%E7%94%B0-ebook/dp/B08ZXMJCFR/ref=sr_1_1?__mk_ja_JP=%E3%82%AB%E3%82%BF%E3%82%AB%E3%83%8A&dchild=1&keywords=%E3%81%BE%E3%81%9F%E3%81%9E%E3%82%8D&qid=1627492287&s=digital-text&sr=1-1";

  const shortenedUrl = shortenUrl(url);
  assertEquals(shortenedUrl, "https://www.amazon.co.jp/gp/product/B08ZXMJCFR/");

  const data = await fetchAmazonData(url);
  verifyAmazonData(data, TestItems.All);
  assertEquals(data.productTitle, "またぞろ。　１巻 (まんがタイムＫＲコミックス)");
});

Deno.test("book #1", async () => {
  const url =
    "https://www.amazon.co.jp/プログラム意味論の基礎-ライブラリ情報学コア・テキスト-11-小林-直樹/dp/4781914837/ref=sr_1_2?dchild=1&qid=1627492953&s=books&sr=1-2&text=住井+英二郎";
  const shortenedUrl = shortenUrl(url);
  assertEquals(shortenedUrl, "https://www.amazon.co.jp/gp/product/4781914837/");

  const data = await fetchAmazonData(url);
  verifyAmazonData(data, TestItems.All);
  assertEquals(data.productTitle, "プログラム意味論の基礎 (ライブラリ情報学コア・テキスト 11)");
});

Deno.test("book #2", async () => {
  const url = "https://www.amazon.co.jp/gp/product/4320124502/";
  const data = await fetchAmazonData(url);
  verifyAmazonData(data, TestItems.All);
  assertEquals(data.productTitle, "新装版 プログラミング言語の基礎理論");
});

Deno.test("book #3 (not for sale)", async () => {
  const url = "https://www.amazon.co.jp/gp/product/4798113468/";
  const data = await fetchAmazonData(url);
  verifyAmazonData(data, ~TestItems.Price);
  assertThrows(() => verifyAmazonData(data, TestItems.Price)); // not for sale
  assertEquals(
    data.productTitle,
    "コンピュータプログラミングの概念・技法・モデル (IT Architects' Archiveクラシックモダン・コンピューティング)",
  );
});

Deno.test("home electonic #1", async () => {
  const url = "https://www.amazon.co.jp/gp/product/B07XLQ9J2G/";
  const data = await fetchAmazonData(url);
  verifyAmazonData(data, TestItems.All);
  assertEquals(
    data.productTitle,
    "シャープ 1TB 2番組同時録画 AQUOS ブルーレイレコーダー 連続ドラマ自動録画 声でラクラク予約 ブラック 2B-C10CW1",
  );
});

// on sale when added this test
Deno.test("health care product #1", async () => {
  const url = "https://www.amazon.co.jp/gp/product/B08LG418TM/";
  const data = await fetchAmazonData(url);
  verifyAmazonData(data, TestItems.All);
  assertEquals(
    data.productTitle,
    "フィリップス ブリーズマスク ブラック 電動ファン 高機能 花粉対応 スポーツマスク acm066/01",
  );
});

// Copied from https://github.com/discordeno/discordeno/blob/main/tests/local.ts
// Final cleanup
import { cache, delay } from "https://deno.land/x/discordeno@11.2.0/mod.ts";
if (import.meta.main) {
  // clear all the sweeper intervals
  for (const c of Object.values(cache)) {
    if (!(c instanceof Map)) continue;
    c.stopSweeper();
  }
  await delay(3000);
}
