"use client";

import { useEffect, useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DemoStatus,
  fetchDemoStatus,
  getStoredAdminKey,
  setStoredAdminKey,
} from "@/lib/api";

export function DemoLockControls() {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setUnlocked(Boolean(getStoredAdminKey()));
    fetchDemoStatus()
      .then((next) => setStatus(next))
      .catch(() => {
        const hosted =
          typeof window !== "undefined" &&
          !["localhost", "127.0.0.1"].includes(window.location.hostname);
        setStatus({
          locked: hosted,
          repo_url: "https://github.com/ag-68/lead-voice-agent-ops",
        });
      });
  }, []);

  const hosted =
    typeof window !== "undefined" &&
    !["localhost", "127.0.0.1"].includes(window.location.hostname);
  const locked = status?.locked ?? hosted;

  if (!locked) return null;

  const unlock = () => {
    if (!key.trim()) return;
    setStoredAdminKey(key.trim());
    setUnlocked(true);
    setKey("");
    setNote("Operator unlocked for this browser tab.");
    setOpen(false);
  };

  const lock = () => {
    setStoredAdminKey(null);
    setUnlocked(false);
    setNote("Demo locked again.");
  };

  return (
    <>
      <div className="flex flex-col items-stretch gap-1.5">
        {!unlocked ? (
          <Button type="button" size="sm" variant="outline" className="w-full justify-start" onClick={() => setOpen(true)}>
            <Unlock className="size-3.5" aria-hidden />
            Unlock
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" className="w-full justify-start" onClick={lock}>
            <Lock className="size-3.5" aria-hidden />
            Lock
          </Button>
        )}
        {!unlocked && (
          <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-300">
            View-only demo. Test Lead / calls need operator unlock.
          </p>
        )}
        {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Operator unlock</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This public instance is view-only. Paste the admin key to run Test Lead, calls, and other write actions in this browser tab. Visitors should open the GitHub repo and run their own copy instead.
          </p>
          <label className="block text-sm">
            Admin key
            <Input
              type="password"
              autoComplete="off"
              className="mt-1"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") unlock();
              }}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={unlock} disabled={!key.trim()}>
              Unlock
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
