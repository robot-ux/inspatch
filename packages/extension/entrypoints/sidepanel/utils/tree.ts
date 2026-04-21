import type { AncestorInfo, ElementSelection } from "@inspatch/shared";

// Unified shape for a row in the snapshot tree (anchor + ancestors +
// descendants). Lets UI / retarget logic treat them interchangeably.
export type TreeNode = AncestorInfo;

function anchorAsNode(anchor: ElementSelection): TreeNode {
  const classes = anchor.className
    ? anchor.className.split(/\s+/).filter(Boolean).slice(0, 3)
    : undefined;
  return {
    xpath: anchor.xpath,
    tagName: anchor.tagName.toLowerCase(),
    id: anchor.id,
    classes,
    componentName: anchor.componentName,
    sourceFile: anchor.sourceFile,
    sourceLine: anchor.sourceLine,
  };
}

// Look up a row in the anchor's snapshot tree. Falls back to the anchor when
// the xpath doesn't match anything — guards against stale targetedXpath after
// a new inspect swaps the anchor.
export function resolveTargetedNode(
  anchor: ElementSelection,
  targetedXpath: string | null,
): TreeNode {
  const anchorNode = anchorAsNode(anchor);
  if (!targetedXpath || targetedXpath === anchor.xpath) return anchorNode;
  const a = anchor.ancestors?.find((x) => x.xpath === targetedXpath);
  if (a) return a;
  const d = anchor.descendants?.find((x) => x.xpath === targetedXpath);
  if (d) return d;
  return anchorNode;
}

export function anchorNode(anchor: ElementSelection): TreeNode {
  return anchorAsNode(anchor);
}
