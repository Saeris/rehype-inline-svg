# 💠 rehype-inline-svg [![Build Status][ci-badge]][ci] [![npm][npm-badge]][npm]

A [unified][unified] / [rehype][rehype] plugin that inlines and optimizes SVG images.

## 📦 Installation

> [!Note]
>
> This library is distributed only as an ESM module.

```bash
npm install @saeris/rehype-inline-svg
```

or

```bash
yarn add @saeris/rehype-inline-svg
```

## ✨ Features

- Replaces SVG `<img>` tags with inlined `<svg>` tags
  - Reduces extra HTTP requests to fetch tiny SVG files
  - Gives you fine-grained control of images using CSS
- Optimizes SVGs using svgo
  - Minimizes download size
  - Removes extra metadata that is added by image editors
- Caches file reads
  - Each .svg file is only read from disk once and optimized once
  - Improves processing speed when images occur multiple times on a page
  - Improves processing speed when processing multiple HTML pages

## 🔧 Usage

Using this library will depend on your particular application or framework. Below is a bare-bones example to test it in Node.

**Node:**

```ts
import unified from "unified";
import rehypeParse from "rehype-parse";
import rehypeInlineSVG from "@saeris/rehype-inline-svg";
import rehypeStringify from "rehype-stringify";
import vfile from "to-vfile";

const result = await unified()
  .use(rehypeParse)
  .use(rehypeInlineSVG)
  .use(rehypeStringify)
  .process(await vfile.read("index.html"));

console.log(result.value.tostring());
// <html>
//   <body>
//     <svg alt="some icon" viewBox="0 0 48 48"><path d="M5 24c0..."
//   </body>
// </html>
```

### ⚙ Options

Rehype Inline SVG supports the following options:

| Option | Type | Default | Description |
|-|-|-|-|
| `maxImageSize` | `number` | `3000` | The maximum image size (in bytes) to inline. Images that are larger than this (after optimization) will not be inlined.<br/><br/>Defaults to ~3 kilobytes. |
| `maxOccurrences` | `number` | `Infinity` | The maximum number of times that the same image can appear on a page and still be inlined. Images that occur more than this number of times will not be inlined. |
| `maxTotalSize` | `number` | `10000` | The maximum total size (in bytes) of all occurrences of a single image. If maxTotalSize is 10kb and a 2kb image occurs 5 times on a page, then all five occurrences will be inlined. But if the image accurs 6 or more times, then none of them will be inlined.<br/><br/>Defaults to ~10 kilobytes. |
| `optimize` | `boolean` or `object` | `true` | SVG optimization options. If false, then SVGs will not be optimized. If true, then the default optimization options will be used. |

## 📣 Acknowledgements

This is a separately maintained fork of [rehype-inline-svg][rehype-inline-svg].

## 🥂 License

Released under the [MIT][license] © [Drake Costa][personal-website]

<!-- Definitions -->

[ci]: https://github.com/Saeris/remark-del/actions/workflows/ci.yml
[ci-badge]: https://github.com/Saeris/remark-del/actions/workflows/ci.yml/badge.svg
[npm]: https://www.npmjs.org/package/@saeris/remark-del
[npm-badge]: https://img.shields.io/npm/v/@saeris/remark-del.svg?style=flat
[unified]: https://github.com/unifiedjs/unified
[rehype]: https://github.com/rehypejs/rehype
[rehype-inline-svg]: https://github.com/JS-DevTools/rehype-inline-svg
[license]: ./LICENSE.md
[personal-website]: https://saeris.gg
