"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { canHandlePageEscape, escapeParent, safeNovaPrevious } from "./escape-route";

let currentPath: string | null = null;
let previousPath: string | null = null;

export function EscapeNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (currentPath !== pathname) {
      previousPath = currentPath;
      currentPath = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!canHandlePageEscape(event, !!document.querySelector('[role="dialog"][aria-modal="true"]'))) return;
      const url = new URL(window.location.href);
      if (url.searchParams.has("thread")) {
        event.preventDefault();
        url.searchParams.delete("thread");
        url.searchParams.delete("message");
        router.replace(url.pathname + url.search, { scroll: false });
        return;
      }
      const parent = escapeParent(pathname);
      if (!parent) return;
      event.preventDefault();
      const destination = safeNovaPrevious(previousPath) && previousPath !== pathname ? previousPath : parent;
      previousPath = null;
      router.replace(destination);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pathname, router]);

  return null;
}
