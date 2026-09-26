export function ConversationSkeleton() {
  return (
    <section className="conversation-skeleton" aria-label="Loading conversation" role="status">
      <div className="conversation-skeleton__header"><div className="skeleton skeleton--avatar" /><div className="conversation-skeleton__heading"><div className="skeleton skeleton--title" /><div className="skeleton skeleton--subtitle" /></div></div>
      <div className="conversation-skeleton__messages">
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
      </div>
      <div className="conversation-skeleton__composer skeleton" />
      <span className="sr-only">Loading conversation…</span>
    </section>
  );
}
