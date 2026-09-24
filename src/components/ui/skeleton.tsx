export function ConversationSkeleton() {
  return (
    <div className="conversation-skeleton" aria-label="Loading conversation" role="status">
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--subtitle" />
      {[1, 2, 3].map((index) => (
        <div className="skeleton-message" key={index}>
          <div className="skeleton skeleton--avatar" />
          <div className="skeleton-message__body">
            <div className="skeleton skeleton--name" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line short" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading conversation…</span>
    </div>
  );
}
