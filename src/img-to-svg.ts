import { unified, type Processor } from "unified";
import rehypeParse from "rehype-parse";
import type { Root } from "hast";
import type { Parent } from "unist";
import { VFile } from "vfile";
import type { SvgCache } from "./cache";
import { type GroupedImageNodes, type SvgNode, isSvgNode } from "./image-node";

/**
 * Parses the specified SVG image to a HAST tree
 */
const parseSVG = (
  filePath: string,
  svgCache: SvgCache,
  processor: Processor<Root, undefined, undefined, undefined>
): SvgNode => {
  const file = new VFile({
    value: svgCache.get(filePath),
    path: filePath
  });

  // Parse the SVG content to a HAST tree
  const rootNode = processor.parse(file) as Parent;

  // Find the <svg> child node
  for (const child of rootNode.children) {
    if (isSvgNode(child)) {
      return child;
    }
  }

  throw new Error(`Error parsing SVG image: ${filePath}\nUnable to find the root <svg> element.`);
};

/**
 * Converts the given `<img>` nodes to `<svg>` nodes
 */
export const imgToSVG = (groupedNodes: GroupedImageNodes, svgCache: SvgCache): void => {
  // Create a Rehype processor to parse SVG content
  const processor = unified().use(rehypeParse, { fragment: true, space: "svg" });

  for (const [filePath, imgNodes] of groupedNodes) {
    // Parse the SVG content to a HAST tree
    const svgNode = parseSVG(filePath, svgCache, processor);

    for (const imgNode of imgNodes) {
      // Merge the <svg> properties with the <img> properties
      const properties = {
        ...svgNode.properties,
        ...imgNode.properties
      };

      // @ts-expect-error - Don't copy the "src" property
      delete properties.src;

      // Overwrite the <img> node with the <svg> node
      Object.assign(imgNode, svgNode, { properties });
    }
  }
};
