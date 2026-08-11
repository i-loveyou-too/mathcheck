"use client";

import katex from "katex";

type MathTextProps = {
  text: string;
  className?: string;
};

// Supports the four common math-delimiter styles so content can be authored
// with whichever is most natural: \( ... \) and $ ... $ render inline,
// \[ ... \] and $$ ... $$ render as a block.
function renderSegment(segment: string, index: number) {
  const inlineParenMatch = segment.match(/^\\\(([\s\S]*)\\\)$/);
  const blockBracketMatch = segment.match(/^\\\[([\s\S]*)\\\]$/);
  const blockDollarMatch = segment.match(/^\$\$([\s\S]*)\$\$$/);
  const inlineDollarMatch = segment.match(/^\$([\s\S]*)\$$/);
  const source = inlineParenMatch?.[1] ?? blockBracketMatch?.[1] ?? blockDollarMatch?.[1] ?? inlineDollarMatch?.[1];
  const displayMode = Boolean(blockBracketMatch || blockDollarMatch);

  if (source === undefined) {
    return <span key={index}>{segment}</span>;
  }
  try {
    const html = katex.renderToString(source, { throwOnError: false, displayMode });
    if (displayMode) {
      return (
        <span key={index} className="block overflow-x-auto py-1">
          <span dangerouslySetInnerHTML={{ __html: html }} />
        </span>
      );
    }
    return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return <span key={index}>{segment}</span>;
  }
}

const MATH_SEGMENT_PATTERN = /(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g;

export function MathText({ text, className = "" }: MathTextProps) {
  const parts = text.split(MATH_SEGMENT_PATTERN).filter(Boolean);
  return <span className={`katex-safe break-keep ${className}`}>{parts.map(renderSegment)}</span>;
}
