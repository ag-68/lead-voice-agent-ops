"use client";

import { useEffect, useState } from "react";
import { subscribeToast } from "@/lib/toast";

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return subscribeToast((next) => {
      setMessage(next);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 4200);
    });
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed left-1/2 top-1/2 z-[100] max-w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-zinc-950 px-5 py-3 text-center text-sm font-medium text-white shadow-lg"
    >
      {message}
    </div>
  );
}
