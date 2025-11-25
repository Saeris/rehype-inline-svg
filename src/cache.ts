import { readFile } from "node:fs/promises";
import { type Config, optimize as svgOptimize } from "svgo";
import type { GroupedImageNodes, ImageNodeGroup } from "./image-node";

/**
 * A cache of the contents of of SVG files. This saves us from reading the same files
 * many times when the file occurs multiple times on one page, or across multiple pages.
 */
export class SvgCache extends Map<string, string> {
  #hits = 0;
  #misses = 0;
  #queue: Array<Promise<void>> = [];

  get hits(): number {
    return this.#hits;
  }

  get misses(): number {
    return this.#misses;
  }

  /**
   * Reads the contents of any SVG files that aren't already in the cache,
   * and adds them to the cache.
   */
  read = async (groupedNodes: GroupedImageNodes, optimize: boolean | Config): Promise<void> => {
    // Queue-up any files that aren't already in the cache
    const promises = [...groupedNodes].map(async (group) => this.#readFile(group, optimize));
    const queued = this.#queue.push(...promises);

    // Wait for all queued files to be read
    await Promise.all(this.#queue);

    // Remove the fulfilled items from the queue
    this.#queue = this.#queue.slice(queued);
  };

  /**
   * Reads the specified SVG file and returns its contents
   */
  #readFile = async (group: ImageNodeGroup, optimize: boolean | Config): Promise<void> => {
    const [path, nodes] = group;

    if (this.has(path)) {
      // Woot!  We just saved unnecessary file reads!
      this.#hits += nodes.length;
      return;
    }

    // Immediately add this path to the cache, to avoid multiple reads of the same file
    this.set(path, ``);
    this.#misses++;
    this.#hits += nodes.length - 1;

    // Read the SVG file
    let content = await readFile(path, `utf-8`);

    // Optimize the contents, if enabled
    if (optimize) {
      const optimizeConfig = typeof optimize === `boolean` ? {} : optimize;
      let optimized = svgOptimize(content, {
        path,
        ...optimizeConfig
      });
      content = optimized.data;
    }

    // Ensure that we didn't accidentally read the same file multiple times
    if (this.get(path)!.length > 0) {
      throw new Error(`SvgCache encountered a race conditmion. ${path} was read multiple times.`);
    }

    // Cache the SVG content
    this.set(path, content);
  };
}
