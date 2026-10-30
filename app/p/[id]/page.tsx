"use client";

import { Suspense, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  Check,
  Copy,
  Eye,
  Flame,
  KeyRound,
  Loader2,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { CRYPTO_VERSION, decryptText } from "@/lib/crypto";
import { parseLinkKey } from "@/lib/linkKey";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ViewState =
  | { kind: "gate" }
  | { kind: "gone" }
  // burned: whether the server deleted the paste before we found out the link was bad.
  | { kind: "damaged"; burned: boolean }
  | { kind: "revealed"; content: string };

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getHash() {
  return location.hash.slice(1);
}

function getServerHash() {
  return null;
}

const CREATED_KEY = "pastery:created";

function isOwnLink(slug: string): boolean {
  try {
    const raw = sessionStorage.getItem(CREATED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) && parsed.includes(slug);
  } catch {
    return false;
  }
}

function toArrayBuffer(bytes: Uint8Array<ArrayBuffer>): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function errorMessage(err: unknown): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return "Something went wrong. Please try again.";
}

function Shell({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-12">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children}
      </Card>
    </main>
  );
}

function CreateLink({ label = "Create a new paste" }: { label?: string }) {
  return (
    <Link href="/" className={cn(buttonVariants({ variant: "outline", className: "h-9" }))}>
      {label}
    </Link>
  );
}

function GoneScreen() {
  return (
    <Shell
      title="This paste is gone"
      description="It may have been opened already, expired, or never existed."
    >
      <CardFooter className="border-t py-4">
        <CreateLink />
      </CardFooter>
    </Shell>
  );
}

function ViewPaste() {
  const { id: slug } = useParams<{ id: string }>();
  const key = useSyncExternalStore(subscribeHash, getHash, getServerHash);
  const openPaste = useMutation(api.pastes.openPaste);
  const [state, setState] = useState<ViewState>({ kind: "gate" });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Reactive and ciphertext-free: lets the gate say "gone" up front (and flip to
  // it if someone else opens the paste meanwhile) without burning anything.
  // Skipped without a key so the missing-key screen wins, and once we've left
  // the gate so our own reveal doesn't re-render as "gone".
  const peek = useQuery(
    api.pastes.peekPaste,
    key && state.kind === "gate" ? { slug } : "skip",
  );

  function handleRevealClick() {
    if (isOwnLink(slug)) {
      setConfirmOpen(true);
      return;
    }
    void handleReveal();
  }

  async function handleReveal() {
    if (!key || loading) return;
    setConfirmOpen(false);
    setLoading(true);
    try {
      // Check the fragment locally first: a truncated or mangled key can never
      // decrypt, so don't ask the server to burn the paste for it.
      const parsed = await parseLinkKey(key);
      if (!parsed) {
        setState({ kind: "damaged", burned: false });
        return;
      }
      const paste = await openPaste({ slug, keyCheck: toArrayBuffer(parsed.keyCheck) });
      if (paste.status === "gone") {
        setState({ kind: "gone" });
        return;
      }
      if (paste.status === "badKey") {
        // Well-formed key that doesn't match the paste's key commitment; the
        // server left the paste in place.
        setState({ kind: "damaged", burned: false });
        return;
      }
      try {
        if (paste.version !== CRYPTO_VERSION) throw new Error("Unsupported version");
        const content = await decryptText(
          new Uint8Array(paste.ciphertext),
          new Uint8Array(paste.iv),
          key,
        );
        setState({ kind: "revealed", content });
      } catch {
        // Only reachable for pastes without a key commitment, or tampered data.
        setState({ kind: "damaged", burned: true });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (state.kind !== "revealed") return;
    try {
      await navigator.clipboard.writeText(state.content);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it manually.");
    }
  }

  // Not hydrated yet: the hash is only available in the browser.
  if (key === null) return null;

  if (!key) {
    return (
      <Shell
        title="Missing key in the link"
        description="This link is incomplete, so the paste can't be decrypted."
      >
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p className="flex items-start gap-2">
            <KeyRound className="mt-0.5 size-4 shrink-0" />
            <span>
              The part of the link after the <code className="font-mono">#</code> is the
              decryption key. It never reaches our server, so we can&apos;t recover it.
            </span>
          </p>
          <p>Ask the sender for the full link, including everything after the #.</p>
        </CardContent>
        <CardFooter className="border-t py-4">
          <CreateLink />
        </CardFooter>
      </Shell>
    );
  }

  switch (state.kind) {
    case "gone":
      return <GoneScreen />;

    case "damaged":
      return (
        <Shell
          title="This link looks damaged"
          description="The paste couldn't be decrypted with the key in this link."
        >
          <CardContent className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            {state.burned ? (
              <span>
                The link may have been cut off or altered when it was shared. The paste has
                been deleted from the server, so ask the sender to create a new one.
              </span>
            ) : (
              <span>
                The link may have been cut off or altered when it was shared. The paste
                hasn&apos;t been opened, so ask the sender to send you the full link again.
              </span>
            )}
          </CardContent>
          <CardFooter className="border-t py-4">
            <CreateLink />
          </CardFooter>
        </Shell>
      );

    case "revealed":
      return (
        <Shell title="Your paste" description="Copy it now. It won't be available again.">
          <CardContent className="flex flex-col gap-4">
            <pre
              data-testid="revealed-content"
              className="max-h-[32rem] min-h-40 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-sm whitespace-pre-wrap break-words"
            >
              {state.content}
            </pre>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="h-9" onClick={handleCopy}>
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Badge variant="secondary">
                <Trash2 />
                Deleted from the server
              </Badge>
            </div>
          </CardContent>
          <CardFooter className="border-t py-4">
            <CreateLink label="Create your own paste" />
          </CardFooter>
        </Shell>
      );

    case "gate":
      // While peekPaste loads we show the gate; once it says the paste is gone
      // (opened, expired or never existed) show that instead of a dead button.
      if (peek && !peek.exists) return <GoneScreen />;
      return (
        <Shell
          title="Someone sent you an encrypted paste"
          description="It can be opened only once. After you reveal it, it is deleted from the server."
        >
          <CardContent>
            <Badge variant="secondary">
              <Flame />
              Burns after reading
            </Badge>
          </CardContent>
          <CardFooter className="border-t py-4">
            <Button
              className="h-9"
              onClick={handleRevealClick}
              disabled={loading}
              data-testid="reveal-button"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Eye />}
              {loading ? "Revealing…" : "Reveal paste"}
            </Button>
          </CardFooter>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Open your own link?</AlertDialogTitle>
                <AlertDialogDescription>
                  This is your own link. Opening it will delete it, and the recipient will
                  not be able to read it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleReveal}>
                  Open anyway
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Shell>
      );
  }
}

export default function ViewPastePage() {
  return (
    <Suspense fallback={null}>
      <ViewPaste />
    </Suspense>
  );
}
