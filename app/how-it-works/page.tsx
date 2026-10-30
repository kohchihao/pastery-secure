import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "How it works · Pastery Secure",
  description: "How Pastery Secure encrypts your paste and what the server can see.",
};

const sections = [
  {
    title: "Encrypted in your browser",
    body: (
      <>
        When you create a paste, your browser generates a fresh random 256-bit key and
        encrypts the text with AES-GCM using the Web Crypto API. Only the ciphertext and a
        random nonce (IV) are uploaded. The plaintext never leaves your device.
      </>
    ),
  },
  {
    title: "The key lives in the link fragment",
    body: (
      <>
        The key is placed after the <code className="font-mono">#</code> in the link.
        Browsers never send the fragment to the server in requests, and this site sets{" "}
        <code className="font-mono">Referrer-Policy: no-referrer</code>, so the key
        isn&apos;t leaked to other sites either. Whoever holds the full link can read the
        paste; whoever doesn&apos;t, can&apos;t.
      </>
    ),
  },
  {
    title: "One read, 24 hours max",
    body: (
      <>
        A paste is deleted from the server the moment it is opened. Unopened pastes are
        deleted automatically after 24 hours. There is no way to view a paste twice, and
        no way for us to restore one.
      </>
    ),
  },
  {
    title: "What the server sees",
    body: (
      <>
        The server stores the ciphertext, the IV, a format version, a random ID, and the
        expiry time. It can see roughly how long the paste is and when it was created and
        opened. It never sees the key or the text. There are no accounts and no analytics.
      </>
    ),
  },
  {
    title: "Limitations",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Anyone who gets the full link before the recipient can open it, and the recipient
          will see it&apos;s gone. Share links over a channel you trust.
        </li>
        <li>
          Links may persist in chat logs, browser history, or link previews. Some apps
          fetch links to build previews; the key isn&apos;t sent, but treat links as
          secrets.
        </li>
        <li>
          You have to trust the code this site serves. A compromised server could ship
          code that leaks keys.
        </li>
        <li>
          Once revealed, the recipient can copy or screenshot the text. Deletion only
          applies to our copy.
        </li>
        <li>A compromised device on either end defeats the encryption.</li>
      </ul>
    ),
  },
];

export default function HowItWorksPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-12">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">How it works</CardTitle>
          <CardDescription>
            End-to-end encrypted, one-time pastes. Here&apos;s exactly what that means.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 text-sm">
          {sections.map((section) => (
            <section key={section.title} className="flex flex-col gap-1.5">
              <h2 className="font-medium">{section.title}</h2>
              <div className="leading-relaxed text-muted-foreground">{section.body}</div>
            </section>
          ))}
        </CardContent>
        <CardFooter className="border-t py-4">
          <Link href="/" className={cn(buttonVariants({ variant: "outline", className: "h-9" }))}>
            Create a paste
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
