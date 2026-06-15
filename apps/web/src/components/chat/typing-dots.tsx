/** Three bouncing dots shown while the assistant is replying. */
export function TypingDots() {
  return (
    <>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-1.5 h-1.5 rounded-full bg-[color:var(--moby-500)] animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </>
  );
}
