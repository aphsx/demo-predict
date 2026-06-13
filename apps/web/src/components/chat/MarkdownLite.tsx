/**
 * MarkdownLite — full-featured Markdown renderer for chat.
 *
 * Handles: headings, **bold**, *italic*, `inline code`, tables,
 * fenced code blocks, ordered/unordered lists, blockquotes, horizontal rules.
 *
 * Zero dependencies. Renders from a string to React elements.
 */

import React from "react";

// ── Inline renderer ────────────────────────────────────────────────────────────

type InlineProps = { text: string; className?: string };

function Inline({ text, className }: InlineProps) {
  // Tokenise: **bold**, *italic*, `code`, plain
  const tokens: React.ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      tokens.push(<span key={key++}>{text.slice(last, match.index)}</span>);
    }
    const m = match[0];
    if (m.startsWith("**")) {
      tokens.push(<strong key={key++} className={className}>{m.slice(2, -2)}</strong>);
    } else if (m.startsWith("`")) {
      tokens.push(
        <code key={key++} className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[12px] text-[color:var(--ink-1)]">
          {m.slice(1, -1)}
        </code>
      );
    } else {
      tokens.push(<em key={key++}>{m.slice(1, -1)}</em>);
    }
    last = match.index + m.length;
  }
  if (last < text.length) tokens.push(<span key={key++}>{text.slice(last)}</span>);
  return <>{tokens}</>;
}

// ── Block types ────────────────────────────────────────────────────────────────

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; lang: string; lines: string[] }
  | { type: "table"; header: string[]; align: string[]; rows: string[][] }
  | { type: "ul"; items: string[][] }   // items are sub-lines (nested not supported)
  | { type: "ol"; items: string[][] }
  | { type: "blockquote"; lines: string[] }
  | { type: "hr" }
  | { type: "blank" };

// ── Parser ─────────────────────────────────────────────────────────────────────

function parseTableRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === "") { blocks.push({ type: "blank" }); i++; continue; }

    // HR
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { blocks.push({ type: "hr" }); i++; continue; }

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing ```
      blocks.push({ type: "code", lang, lines: codeLines });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.*)/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2] });
      i++; continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const qlines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        qlines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: "blockquote", lines: qlines });
      continue;
    }

    // Unordered list
    if (/^[-*•]\s/.test(line)) {
      const items: string[][] = [];
      let current: string[] = [];
      while (i < lines.length && (/^[-*•]\s/.test(lines[i]) || (lines[i].startsWith("  ") && current.length > 0))) {
        if (/^[-*•]\s/.test(lines[i])) {
          if (current.length) items.push(current);
          current = [lines[i].replace(/^[-*•]\s/, "")];
        } else {
          current.push(lines[i].trim());
        }
        i++;
      }
      if (current.length) items.push(current);
      blocks.push({ type: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[][] = [];
      let current: string[] = [];
      while (i < lines.length && (/^\d+\.\s/.test(lines[i]) || (lines[i].startsWith("  ") && current.length > 0))) {
        if (/^\d+\.\s/.test(lines[i])) {
          if (current.length) items.push(current);
          current = [lines[i].replace(/^\d+\.\s/, "")];
        } else {
          current.push(lines[i].trim());
        }
        i++;
      }
      if (current.length) items.push(current);
      blocks.push({ type: "ol", items });
      continue;
    }

    // Table (lines starting with |)
    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        const header = parseTableRow(tableLines[0]);
        const sep = parseTableRow(tableLines[1]);
        if (isSeparatorRow(sep)) {
          const align = sep.map((c) => {
            if (c.startsWith(":") && c.endsWith(":")) return "center";
            if (c.endsWith(":")) return "right";
            return "left";
          });
          const rows = tableLines.slice(2).map(parseTableRow);
          blocks.push({ type: "table", header, align, rows });
          continue;
        }
      }
      // Not a valid table → treat as paragraphs
      for (const tl of tableLines) {
        blocks.push({ type: "paragraph", text: tl });
      }
      continue;
    }

    // Paragraph (collect until blank or block-start)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("> ") &&
      !/^[-*•]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !lines[i].startsWith("|") &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      blocks.push({ type: "paragraph", text: paraLines.join("\n") });
    }
  }

  return blocks;
}

// ── Block renderers ────────────────────────────────────────────────────────────

function renderBlock(block: Block, idx: number, strongClass?: string): React.ReactNode {
  switch (block.type) {
    case "blank":
      return <div key={idx} className="h-2" aria-hidden />;

    case "hr":
      return <hr key={idx} className="my-3 border-gray-200" />;

    case "heading": {
      const hClass = [
        "font-semibold text-[color:var(--ink-1)]",
        block.level === 1 ? "mt-4 text-[15px]" :
        block.level === 2 ? "mt-3 text-[14px]" :
        block.level === 3 ? "mt-2.5 text-[13px]" :
                            "mt-2 text-[12px]",
      ].join(" ");
      const inner = <Inline text={block.text} className={strongClass} />;
      if (block.level === 1) return <h1 key={idx} className={hClass}>{inner}</h1>;
      if (block.level === 2) return <h2 key={idx} className={hClass}>{inner}</h2>;
      if (block.level === 3) return <h3 key={idx} className={hClass}>{inner}</h3>;
      return <h4 key={idx} className={hClass}>{inner}</h4>;
    }

    case "paragraph":
      return (
        <p key={idx} className="leading-relaxed">
          {block.text.split("\n").map((line, li) => (
            <React.Fragment key={li}>
              {li > 0 && <br />}
              <Inline text={line} className={strongClass} />
            </React.Fragment>
          ))}
        </p>
      );

    case "code":
      return (
        <div key={idx} className="my-2 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50">
          {block.lang && (
            <div className="border-b border-gray-200 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[color:var(--ink-5)]">
              {block.lang}
            </div>
          )}
          <pre className="overflow-x-auto p-3 text-[12px] leading-relaxed text-[color:var(--ink-2)]">
            <code>{block.lines.join("\n")}</code>
          </pre>
        </div>
      );

    case "blockquote":
      return (
        <blockquote key={idx} className="my-2 border-l-4 border-[color:var(--moby-400)] pl-3 text-[color:var(--ink-3)]">
          {block.lines.map((line, li) => (
            <p key={li} className="leading-relaxed">
              <Inline text={line} className={strongClass} />
            </p>
          ))}
        </blockquote>
      );

    case "ul":
      return (
        <ul key={idx} className="my-1 space-y-0.5 pl-4">
          {block.items.map((item, ii) => (
            <li key={ii} className="flex gap-2 leading-relaxed">
              <span className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--moby-500)]" />
              <span>
                {item.map((line, li) => (
                  <React.Fragment key={li}>
                    {li > 0 && <br />}
                    <Inline text={line} className={strongClass} />
                  </React.Fragment>
                ))}
              </span>
            </li>
          ))}
        </ul>
      );

    case "ol":
      return (
        <ol key={idx} className="my-1 space-y-0.5 pl-4">
          {block.items.map((item, ii) => (
            <li key={ii} className="flex gap-2 leading-relaxed">
              <span className="shrink-0 font-semibold text-[color:var(--moby-600)]">{ii + 1}.</span>
              <span>
                {item.map((line, li) => (
                  <React.Fragment key={li}>
                    {li > 0 && <br />}
                    <Inline text={line} className={strongClass} />
                  </React.Fragment>
                ))}
              </span>
            </li>
          ))}
        </ol>
      );

    case "table":
      return (
        <div key={idx} className="my-2 overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-[12px]">
            <thead className="bg-gray-50">
              <tr>
                {block.header.map((h, hi) => (
                  <th
                    key={hi}
                    className={`border-b border-gray-200 px-3 py-2 font-semibold text-[color:var(--ink-2)] text-${block.align[hi] ?? "left"}`}
                  >
                    <Inline text={h} className={strongClass} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {block.rows.map((row, ri) => (
                <tr key={ri} className="hover:bg-gray-50 transition-colors">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`px-3 py-2 text-[color:var(--ink-3)] text-${block.align[ci] ?? "left"}`}
                    >
                      <Inline text={cell} className={strongClass} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

export type MarkdownLiteProps = {
  text: string;
  /** Optional className for <strong> tags (e.g., for user messages on coloured bg). */
  strongClassName?: string;
  className?: string;
};

export function MarkdownLite({ text, strongClassName, className }: MarkdownLiteProps) {
  const blocks = parseBlocks(text);
  return (
    <div className={["space-y-1 min-w-0", className].filter(Boolean).join(" ")}>
      {blocks.map((block, i) => renderBlock(block, i, strongClassName))}
    </div>
  );
}
