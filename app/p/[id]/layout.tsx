import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PasteLayout({ children }: LayoutProps<"/p/[id]">) {
  return children;
}
