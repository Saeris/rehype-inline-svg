import { resolve } from "node:path";
import type { Transformer } from "unified";
import type { Node, Parent } from "unist";
import type { Root } from "hast";
import type { VFile } from "vfile";
import { SvgCache } from "./cache";
import { type GroupedImageNodes, type ImageNode, isImageNode } from "./image-node";
import { imgToSVG } from "./img-to-svg";
import { applyDefaults, type Options } from "./options";

/**
 * Recursively crawls the HAST tree and finds all SVG `<img>` elements
 */
const findSvgNodes = (node: Node | Parent): ImageNode[] => {
  let imgNodes: ImageNode[] = [];

  if (isImageNode(node) && node.properties.src.endsWith(`.svg`)) {
    imgNodes.push(node);
  }

  if (`children` in node) {
    const parent = node;
    for (const child of parent.children) {
      imgNodes.push(...findSvgNodes(child));
    }
  }

  return imgNodes;
};

/**
 * Reads the contents of all unique SVG images and returns a map of file paths
 */
const groupSvgNodes = (imgNodes: ImageNode[], htmlFile: VFile): GroupedImageNodes => {
  const groupedNodes: GroupedImageNodes = new Map();

  for (const imgNode of imgNodes) {
    // Resolve the SVG file path from the HTML file path
    const imagePath = resolve(htmlFile.dirname!, imgNode.properties.src);

    const group = groupedNodes.get(imagePath);
    if (!group) {
      // We found a new SVG file, so create a new group
      groupedNodes.set(imagePath, [imgNode]);
    } else {
      // Add this <img> node to the existing group for this file
      group.push(imgNode);
    }
  }

  return groupedNodes;
};

/**
 * Returns only the SVG nodes that meet the filter critera.
 */
const filterSvgNodes = (groupedNodes: GroupedImageNodes, svgCache: SvgCache, options: Options): GroupedImageNodes => {
  const filteredNodes: GroupedImageNodes = new Map();

  for (const [filePath, imgNodes] of groupedNodes) {
    if (imgNodes.length > options.maxOccurrences) {
      // This SVG image occurs too many times in the same file, so don't inline it
      continue;
    }

    const fileSize = svgCache.get(filePath)!.length;
    if (fileSize > options.maxImageSize) {
      // This SVG image is too large, so don't inline it
      continue;
    }

    const totalSize = imgNodes.length * fileSize;
    if (totalSize > options.maxTotalSize) {
      // The total size of all occurrences of the SVG image is too large, so don't inline it
      continue;
    }

    // This SVG meets all the criteria, so inline it
    filteredNodes.set(filePath, imgNodes);
  }

  return filteredNodes;
};

/**
 * This is a Rehype plugin that finds SVG `<img>` elements and replaces them with inlined `<svg>` elements.
 * It also minimizes the SVG to avoid adding too much size to the page.
 */
export const inlineSVG = (config?: Partial<Options>): Transformer<Root, Root> => {
  const options = applyDefaults(config);
  const svgCache = new SvgCache();
  let hits = 0,
    misses = 0;

  return async (tree: Root, file: VFile): Promise<Root> => {
    if (!file.path) {
      throw new Error(`Cannot inline SVG images because the path of the HTML file is unknown`);
    }

    // Find all SVG <img> nodes
    const imgNodes = findSvgNodes(tree);

    // Group the nodes by file path
    let groupedNodes = groupSvgNodes(imgNodes, file);

    // Read (and optimize) the SVG files
    await svgCache.read(groupedNodes, options.optimize);

    // Filter out any images that don't match the options
    groupedNodes = filterSvgNodes(groupedNodes, svgCache, options);

    // Replace the <img> nodes as <svg> nodes
    imgToSVG(groupedNodes, svgCache);

    // Log any changes in cache efficiency data
    if (svgCache.hits !== hits || svgCache.misses !== misses) {
      hits = svgCache.hits;
      misses = svgCache.misses;
      options.cacheEfficiency({
        hits,
        misses
      });
    }

    return tree;
  };
};
