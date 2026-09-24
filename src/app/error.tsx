"use client";

import { StateView } from "@/components/ui/state-view";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <main className="route-error"><StateView variant="error" title="Something went wrong" description="The workspace preview could not load. Try again to return to the app." action={<button className="primary-button" type="button" onClick={reset}>Try again</button>} /></main>;
}
