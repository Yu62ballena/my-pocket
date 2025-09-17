// "use server";

// import { JSDOM } from "jsdom";

// export interface ArticleData {
//   url: string;
//   siteName: string;
//   title: string;
//   description: string;
//   publishedAt: string;
//   thumbnail: string;
//   content: string;
//   isLiked?: boolean;
//   isArchived?: boolean;
// }

// export async function extractUrlData(formData: FormData): Promise<ArticleData> {
//   const url = formData.get("url") as string;

//   //! あとのセクションで書く
//   if (!url) {
//     throw new Error("URLが指定されていません");
//   }


  
//   try {
//     // ブラウザとしてリクエストを送って、レスポンスを受け取る
//     // ボットを避けるため
//     const response = await fetch(url, {
//       headers: {
//         "User-Agent":
//           "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
//       },
//     });

//     if (!response.ok) {
//       throw new Error(`HTTP ${response.status}: ${response.statusText}`);
//     }

//     // 受け取ったレスポンスの本文部分（html）を取得
//     const html = await response.text();
//     // ブラウザと同じDOMの構造に変換
//     // これによりdocument.querySelectorなどが使えるようになる
//     const dom = new JSDOM(html);
//     // ドキュメントオブジェクトを取り出し
//     const document = dom.window.document;

//     // サイトのデータ（headタグ内に書いているメタデータ）を取得
//     const getMetaContent = (property: string): string => {
//       const selectors = [
//         `meta[property="${property}"]`,
//         `meta[name="${property}"]`,
//         `meta[property="og:${property}"]`,
//         `meta[name="og:${property}"]`,
//         `meta[property="twitter:${property}"]`,
//         `meta[name="twitter:${property}"]`,
//       ];

//       for (const selector of selectors) {
//         const element = document.querySelector(selector);
//         if (element) {
//           return element.getAttribute("content") || "";
//         }
//       }
//       return "";
//     };

//     // 記事情報を取得
//     const getContent = (): string => {
//       const contentSelectors = [
//         "article",
//         ".post-content",
//         ".entry-content",
//         ".content",
//         ".post",
//         "main",
//         ".article-body",
//       ];

//       for (const selector of contentSelectors) {
//         const element = document.querySelector(selector);
//         if (element) {
//           // スクリプトタグとスタイルタグを削除
//           const scripts = element.querySelectorAll(
//             "script, style, nav, header, footer, aside"
//           );
//           scripts.forEach((el) => el.remove());

//           return element.textContent?.trim().slice(0, 300) || ""; // 最初の300文字
//         }
//       }

//       // フォールバック: body全体から取得
//       const body = document.querySelector("body");
//       if (body) {
//         const scripts = body.querySelectorAll(
//           "script, style, nav, header, footer, aside"
//         );
//         scripts.forEach((el) => el.remove());
//         return body.textContent?.trim().slice(0, 1000) || "";
//       }

//       return "";
//     };

//     // getMetaContentとgetContentを使って、url、siteName等を取得
//     const articleData: ArticleData = {
//       url,
//       siteName:
//         getMetaContent("site_name") ||
//         getMetaContent("og:site_name") ||
//         document.querySelector("title")?.textContent?.split(" | ")[1] ||
//         new URL(url).hostname,
//       title:
//         getMetaContent("title") ||
//         getMetaContent("og:title") ||
//         document.querySelector("h1")?.textContent ||
//         document.querySelector("title")?.textContent ||
//         "タイトルなし",
//       description:
//         getMetaContent("description") ||
//         getMetaContent("og:description") ||
//         getMetaContent("twitter:description") ||
//         "",
//       publishedAt:
//         getMetaContent("article:modified_time") ||
//         getMetaContent("article:published_time") ||
//         document.querySelector("time")?.getAttribute("datetime") ||
//         new Date().toISOString(),
//       thumbnail:
//         getMetaContent("image") ||
//         getMetaContent("og:image") ||
//         getMetaContent("twitter:image") ||
//         "",
//       content: getContent(),
//     };

//     // 取得したメタデータ・本文データをリターン
//     return articleData;
//   } catch (error) {
//     console.error("URL解析エラー:", error);
//     throw new Error(
//       `URL解析に失敗しました: ${
//         error instanceof Error ? error.message : "不明なエラー"
//       }`
//     );
//   }
// }



"use server";

import { JSDOM } from "jsdom";
import puppeteer from "puppeteer";

export interface ArticleData {
  url: string;
  siteName: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnail: string;
  content: string;
  isLiked?: boolean;
  isArchived?: boolean;
}

export async function extractUrlData(formData: FormData): Promise<ArticleData> {
  const url = formData.get("url") as string;

  if (!url) {
    throw new Error("URLが指定されていません");
  }

  try {
    // まず通常のfetchを試す
    let html: string = '';
    let shouldUsePuppeteer = false;

    try {
      // AbortControllerでタイムアウト実装
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      html = await response.text();

      // JavaScriptが必要そうなサイトかチェック
      const isJSRequired = checkIfJavaScriptRequired(html, url);
      if (isJSRequired) {
        shouldUsePuppeteer = true;
      }
    } catch (error) {
      // 通常のfetchが失敗した場合はPuppeteerを使用
      console.log(error);
      shouldUsePuppeteer = true;
    }

    // Puppeteerが必要な場合
    if (shouldUsePuppeteer) {
      html = await fetchWithPuppeteer(url);
    }

    // DOMに変換して解析
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // サイトのデータ（headタグ内に書いているメタデータ）を取得
    const getMetaContent = (property: string): string => {
      const selectors = [
        `meta[property="${property}"]`,
        `meta[name="${property}"]`,
        `meta[property="og:${property}"]`,
        `meta[name="og:${property}"]`,
        `meta[property="twitter:${property}"]`,
        `meta[name="twitter:${property}"]`,
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          return element.getAttribute("content") || "";
        }
      }
      return "";
    };

    // 記事情報を取得
    const getContent = (): string => {
      const contentSelectors = [
        "article",
        ".post-content",
        ".entry-content",
        ".content",
        ".post",
        "main",
        ".article-body",
        ".markdown-section", // Qiita用
        ".it-MdContent", // Qiita用
      ];

      for (const selector of contentSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          // スクリプトタグとスタイルタグを削除
          const scripts = element.querySelectorAll(
            "script, style, nav, header, footer, aside"
          );
          scripts.forEach((el) => el.remove());

          return element.textContent?.trim().slice(0, 300) || ""; // 最初の300文字
        }
      }

      // フォールバック: body全体から取得
      const body = document.querySelector("body");
      if (body) {
        const scripts = body.querySelectorAll(
          "script, style, nav, header, footer, aside"
        );
        scripts.forEach((el) => el.remove());
        return body.textContent?.trim().slice(0, 1000) || "";
      }

      return "";
    };

    // getMetaContentとgetContentを使って、url、siteName等を取得
    const articleData: ArticleData = {
      url,
      siteName:
        getMetaContent("site_name") ||
        getMetaContent("og:site_name") ||
        document.querySelector("title")?.textContent?.split(" | ")[1] ||
        new URL(url).hostname,
      title:
        getMetaContent("title") ||
        getMetaContent("og:title") ||
        document.querySelector("h1")?.textContent ||
        document.querySelector("title")?.textContent ||
        "タイトルなし",
      description:
        getMetaContent("description") ||
        getMetaContent("og:description") ||
        getMetaContent("twitter:description") ||
        "",
      publishedAt:
        getMetaContent("article:modified_time") ||
        getMetaContent("article:published_time") ||
        document.querySelector("time")?.getAttribute("datetime") ||
        new Date().toISOString(),
      thumbnail:
        getMetaContent("image") ||
        getMetaContent("og:image") ||
        getMetaContent("twitter:image") ||
        "",
      content: getContent(),
    };

    // 取得したメタデータ・本文データをリターン
    return articleData;
  } catch (error) {
    console.error("URL解析エラー:", error);
    throw new Error(
      `URL解析に失敗しました: ${
        error instanceof Error ? error.message : "不明なエラー"
      }`
    );
  }
}

// JavaScriptが必要なサイトかどうかをチェック
function checkIfJavaScriptRequired(html: string, url: string): boolean {
  // 特定のドメインをチェック
  const jsRequiredDomains = [
    'qiita.com',
    'zenn.dev',
    'note.com',
    'medium.com',
  ];

  const hostname = new URL(url).hostname;
  if (jsRequiredDomains.some(domain => hostname.includes(domain))) {
    return true;
  }

  // HTMLの内容をチェック
  const jsIndicators = [
    'id="__next"', // Next.js
    'id="root"', // React
    'id="app"', // Vue
    'data-reactroot', // React
    '__NUXT__', // Nuxt.js
  ];

  return jsIndicators.some(indicator => html.includes(indicator));
}

// Puppeteerでページを取得
async function fetchWithPuppeteer(url: string): Promise<string> {
  let browser;
  
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    
    // ユーザーエージェントを設定
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // ページにアクセス
    await page.goto(url, {
      waitUntil: 'networkidle2', // ネットワークが静かになるまで待つ
      timeout: 30000, // 30秒でタイムアウト
    });

    // 少し待ってJavaScriptの実行を確実にする
    await new Promise(resolve => setTimeout(resolve, 2000));

    // HTMLを取得
    const html = await page.content();
    
    return html;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}