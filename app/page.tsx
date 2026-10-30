"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { Check, Copy, Flame, Loader2, Lock, Timer } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { encryptText } from "@/lib/crypto";
import { base64UrlDecode } from "@/lib/encoding";
import { computeKeyCheck } from "@/lib/linkKey";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const MAX_CHARS = 4000;
const CREATED_KEY = "pastery:created";

function toArrayBuffer(bytes: Uint8Array<ArrayBuffer>): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function rememberCreated(slug: string) {
  try {
    const raw = sessionStorage.getItem(CREATED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const slugs = Array.isArray(parsed) ? parsed : [];
    sessionStorage.setItem(CREATED_KEY, JSON.stringify([...slugs, slug]));
  } catch {
    // sessionStorage may be unavailable (e.g. privacy mode); not critical.
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return "Something went wrong. Please try again.";
}

export default function Home() {
  const createPaste = useMutation(api.pastes.createPaste);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text || loading) return;
    setLoading(true);
    try {
      const { ciphertext, iv, key, version } = await encryptText(text);
      const keyCheck = await computeKeyCheck(base64UrlDecode(key));
      const { slug } = await createPaste({
        ciphertext: toArrayBuffer(ciphertext),
        iv: toArrayBuffer(iv),
        version,
        keyCheck: toArrayBuffer(keyCheck),
      });
      rememberCreated(slug);
      setLink(`${location.origin}/p/${slug}#${key}`);
      setText("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it manually.");
    }
  }

  function reset() {
    setLink(null);
    setCopied(false);
    setText("");
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-12">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            Pastery Secure
          </CardTitle>
          <CardDescription>
            Share a secret once. It&apos;s end-to-end encrypted, expires in 24 hours,
            and self-destructs after it&apos;s read.
          </CardDescription>
        </CardHeader>

        {link ? (
          <>
            <CardContent className="flex flex-col gap-4">
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={link}
                  aria-label="Shareable link"
                  data-testid="share-link"
                  className="h-9 font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button className="h-9" onClick={handleCopy}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  <Timer />
                  Expires in 24h
                </Badge>
                <Badge variant="secondary">
                  <Flame />
                  Burns after first open
                </Badge>
              </div>
            </CardContent>
            <CardFooter className="border-t py-4">
              <Button variant="outline" onClick={reset}>
                Create another
              </Button>
            </CardFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <CardContent className="flex flex-col gap-2">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={MAX_CHARS}
                rows={12}
                placeholder="Paste your secret here…"
                aria-label="Secret text"
                data-testid="create-textarea"
                className="min-h-72 resize-y font-mono text-sm"
                disabled={loading}
              />
              <p className="self-end text-xs tabular-nums text-muted-foreground">
                {text.length.toLocaleString("en-US")} / {MAX_CHARS.toLocaleString("en-US")}
              </p>
            </CardContent>
            <CardFooter className="flex flex-col items-stretch gap-3 border-t py-4">
              <Button
                type="submit"
                className="h-9"
                disabled={!text || loading}
                data-testid="create-button"
              >
                {loading && <Loader2 className="animate-spin" />}
                {loading ? "Encrypting…" : "Create encrypted link"}
              </Button>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Lock className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Encrypted in your browser. The key never leaves this device; only
                  you and the recipient can read it.{" "}
                  <Link
                    href="/how-it-works"
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    How it works
                  </Link>
                </span>
              </p>
            </CardFooter>
          </form>
        )}
      </Card>
    </main>
  );
}
