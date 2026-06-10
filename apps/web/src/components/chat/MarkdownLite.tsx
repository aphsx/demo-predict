/** Markdown-lite renderer shared by the chat surfaces (**bold** + newlines only). */
export function MarkdownLite({
  text,
  strongClassName,
}: {
  text: string;
  strongClassName?: string;
}) {
  return (
    <>
      {text.split("\n").map((line, li) => (
        <span key={li} className={li > 0 ? "mt-1 block" : "block"}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, pi) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={pi} className={strongClassName}>{part.slice(2, -2)}</strong>
            ) : (
              <span key={pi}>{part}</span>
            ),
          )}
        </span>
      ))}
    </>
  );
}
