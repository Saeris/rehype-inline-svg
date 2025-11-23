import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Processor, CompileResults } from "unified";
import { unified } from "unified";
import parse from "rehype-parse";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeFormat from "rehype-format";
import rehypeStringify from "rehype-stringify";
import { read, write } from "to-vfile";
import type { Value, VFile } from "vfile";
import dedent from "dedent";
import * as prettier from "prettier";
import type { Node } from "unist";
import type { Options, CacheEfficiency } from "..";
import rehypeInlineSvg from "..";

describe(`rehypeInlineSvg`, () => {
  const tmpDir = join(import.meta.dirname, `./__fixtures__/.tmp`);

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
    }
  });

  /**
   * Processes one or more HTML files using Rehype and the Inline SVG plugin
   */
  const processFiles = async (fileNames: string | string[], options?: Partial<Options>): Promise<VFile[]> => {
    const processFile = async <
      A extends Node | undefined,
      B extends Node | undefined,
      C extends Node | undefined,
      D extends Node | undefined,
      E extends CompileResults | undefined
    >(
      fileName: string,
      processor: Processor<A, B, C, D, E>
    ) => {
      const file = await processor.process(
        await read(join(import.meta.dirname, `./__fixtures__/originals/${fileName}`))
      );

      await write({
        path: join(tmpDir, fileName),
        value: file.value
      });

      return file;
    };

    const processor = unified().use(parse).use(rehypeInlineSvg, options).use(rehypeStringify);

    if (Array.isArray(fileNames)) {
      const files: VFile[] = [];

      for (let fileName of fileNames) {
        const file = await processFile(fileName, processor);
        files.push(file);
      }

      return files;
    } else {
      return [await processFile(fileNames, processor)];
    }
  };

  const format = async (code: string, filepath: string) => {
    const config = await prettier.resolveConfig(filepath);
    if (!config) {
      console.warn(`No Prettier config found for`, filepath, `. Using default options.`);
    }
    const formattedCode = await prettier.format(code, {
      filepath,
      ...config
    });
    return formattedCode;
  };

  const getFixture = (fileName: string) => join(import.meta.dirname, `./__fixtures__/modified/${fileName}`);

  const compareContents = async ({ value, history }: VFile, fixturePath: string) => {
    const actual = await format(value.toString(), history[0]);
    const expected = getFixture(fixturePath);
    await expect(actual).toMatchFileSnapshot(expected);
  };

  describe(`default behavior`, () => {
    it(`should do nothing if there are no images`, async () => {
      const [file] = await processFiles(`no-images.html`);
      await compareContents(file, `no-images-unchanged.html`);
    });

    it(`should do nothing if there are no SVGs`, async () => {
      const [file] = await processFiles(`no-svgs.html`);
      await compareContents(file, `no-svgs-unchanged.html`);
    });

    it(`should inline and optimize SVGs under 3kb`, async () => {
      const [file] = await processFiles(`png-and-svg.html`);
      await compareContents(file, `png-and-svg-inlined-optimized-3kb-limit.html`);
    });

    it(`should not inline SVGs with a total size over 10kb`, async () => {
      const [file] = await processFiles(`many-svgs.html`);
      await compareContents(file, `many-svgs-inlined-optimized-10kb-total-limit.html`);
    });
  });

  describe(`markdown compatibility`, () => {
    const processMarkdown = async (contents: Value): Promise<Value> => {
      const compiler = unified()
        .use(remarkParse)
        .use(remarkRehype)
        .use(rehypeInlineSvg)
        .use(rehypeFormat)
        .use(rehypeStringify);

      const file = await compiler.process({
        value: contents,
        path: fileURLToPath(import.meta.url)
      });

      return file.value;
    };

    it(`minimal`, async () => {
      const input = dedent`
        ![](./__fixtures__/img/circle.inline.svg)
      `;

      expect(await processMarkdown(input)).toMatchInlineSnapshot(`
        "
        <p>
          <svg xmlns="http://www.w3.org/2000/svg" width="250" height="250" viewBox="0 0 250 250" alt="">
            <circle cx="125" cy="125" r="100" fill="#ba5b5b" fill-opacity="0.5"></circle>
          </svg>
        </p>
        "
      `);
    });

    it(`typical example`, async () => {
      const input = dedent`
        # Hello

        This is a test markdown document.

        ![Inline SVG](./__fixtures__/img/circle.inline.svg)

        Cheers
      `;

      expect(await processMarkdown(input)).toMatchInlineSnapshot(`
        "
        <h1>Hello</h1>
        <p>This is a test markdown document.</p>
        <p>
          <svg xmlns="http://www.w3.org/2000/svg" width="250" height="250" viewBox="0 0 250 250" alt="Inline SVG">
            <circle cx="125" cy="125" r="100" fill="#ba5b5b" fill-opacity="0.5"></circle>
          </svg>
        </p>
        <p>Cheers</p>
        "
      `);
    });
  });

  describe(`options.cacheEfficiency`, () => {
    let efficiencyData: CacheEfficiency[] = [];

    const cacheEfficiency = (data: CacheEfficiency) => {
      efficiencyData.push(data);
    };

    beforeEach(() => {
      efficiencyData = [];
    });

    it(`should not report any cache efficiency if there are no images`, async () => {
      const [file] = await processFiles(`no-images.html`, { cacheEfficiency });

      expect(efficiencyData).toStrictEqual([]);
      await compareContents(file, `no-images-unchanged.html`);
    });

    it(`should not report any cache efficiency if there are no SVGs`, async () => {
      const [file] = await processFiles(`no-svgs.html`, { cacheEfficiency });

      expect(efficiencyData).toStrictEqual([]);
      await compareContents(file, `no-svgs-unchanged.html`);
    });

    it(`should report no hits and all misses if SVGs only occur once`, async () => {
      const [file] = await processFiles(`png-and-svg.html`, { cacheEfficiency });

      expect(efficiencyData).toStrictEqual([
        {
          hits: 0,
          misses: 5
        }
      ]);
      await compareContents(file, `png-and-svg-inlined-optimized-3kb-limit.html`);
    });

    it(`should report many hits and few misses if SVGs occurs many times`, async () => {
      const [file] = await processFiles(`many-svgs.html`, { cacheEfficiency });

      expect(efficiencyData).toStrictEqual([
        {
          hits: 95,
          misses: 5
        }
      ]);
      await compareContents(file, `many-svgs-inlined-optimized-10kb-total-limit.html`);
    });

    it(`should re-use the cache when processing multiple files with the same instance of the Inline SVG plugin`, async () => {
      const files = await processFiles([`many-svgs.html`, `png-and-svg.html`, `many-svgs.html`], { cacheEfficiency });

      expect(efficiencyData).toStrictEqual([
        {
          hits: 95,
          misses: 5
        },
        {
          hits: 100,
          misses: 5
        },
        {
          hits: 200,
          misses: 5
        }
      ]);
      await compareContents(files[0], `many-svgs-inlined-optimized-10kb-total-limit.html`);
      await compareContents(files[1], `png-and-svg-inlined-optimized-3kb-limit.html`);
      await compareContents(files[2], `many-svgs-inlined-optimized-10kb-total-limit.html`);
    });

    it(`should not re-use the cache for separate instances of the Inline SVG plugin`, async () => {
      const [file1] = await processFiles(`many-svgs.html`, { cacheEfficiency });
      const [file2] = await processFiles(`many-svgs.html`, { cacheEfficiency });

      expect(efficiencyData).toStrictEqual([
        {
          hits: 95,
          misses: 5
        },
        {
          hits: 95,
          misses: 5
        }
      ]);
      await compareContents(file1, `many-svgs-inlined-optimized-10kb-total-limit.html`);
      await compareContents(file2, `many-svgs-inlined-optimized-10kb-total-limit.html`);
    });
  });

  describe(`options.maxImageSize`, () => {
    it(`should do nothing if maxImageSize is zero`, async () => {
      const [file] = await processFiles(`png-and-svg.html`, { maxImageSize: 0 });

      await compareContents(file, `png-and-svg-unchanged.html`);
    });

    it(`should do nothing if all SVGs exceed the maxImageSize`, async () => {
      const [file] = await processFiles(`png-and-svg.html`, { maxImageSize: 200 });

      await compareContents(file, `png-and-svg-unchanged.html`);
    });

    it(`should inline and optimize all SVGs if maxImageSize is Infinity`, async () => {
      const [file] = await processFiles(`png-and-svg.html`, { maxImageSize: Infinity });

      await compareContents(file, `png-and-svg-inlined-optimized-all.html`);
    });
  });

  describe(`options.maxOccurrences`, () => {
    it(`should do nothing if maxOccurrences is zero`, async () => {
      const [file] = await processFiles(`png-and-svg.html`, { maxOccurrences: 0 });

      await compareContents(file, `png-and-svg-unchanged.html`);
    });

    it(`should do nothing if every SVG occurs more than maxOccurrences`, async () => {
      const [file] = await processFiles(`many-svgs.html`, { maxOccurrences: 10 });

      await compareContents(file, `many-svgs-unchanged.html`);
    });
  });

  describe(`options.maxTotalSize`, () => {
    it(`should do nothing if maxTotalSize is zero`, async () => {
      const [file] = await processFiles(`png-and-svg.html`, { maxTotalSize: 0 });

      await compareContents(file, `png-and-svg-unchanged.html`);
    });

    it(`should inline all small SVGs if maxTotalSize is Infinity`, async () => {
      const [file] = await processFiles(`many-svgs.html`, { maxTotalSize: Infinity });

      await compareContents(file, `many-svgs-inlined-optimized-no-max-total-size.html`);
    });

    it(`should inline all SVGs if maxTotalSize and maxImageSize are both Infinity`, async () => {
      const [file] = await processFiles(`many-svgs.html`, {
        maxImageSize: Infinity,
        maxTotalSize: Infinity
      });

      await compareContents(file, `many-svgs-inlined-optimized-all.html`);
    });
  });

  describe(`options.optimize`, () => {
    it(`should not optimize SVGs if set to false`, async () => {
      const [file] = await processFiles(`png-and-svg.html`, { optimize: false });

      await compareContents(file, `png-and-svg-inlined-3kb-limit.html`);
    });

    it(`should not optimize even large SVGs if set to false`, async () => {
      const [file] = await processFiles(`png-and-svg.html`, {
        optimize: false,
        maxImageSize: Infinity
      });

      await compareContents(file, `png-and-svg-inlined-all.html`);
    });

    it(`should optimize SVGs with custom options`, async () => {
      const [file] = await processFiles(`png-and-svg.html`, {
        optimize: {
          plugins: [
            `convertStyleToAttrs`,
            `preset-default`,
            {
              name: `removeAttrs`,
              params: {
                attrs: `(stroke|fill)`
              }
            }
          ]
        }
      });

      await compareContents(file, `png-and-svg-inlined-customized-3kb-limit.html`);
    });
  });
});
