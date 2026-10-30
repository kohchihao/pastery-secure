import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-12">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            Page not found
          </CardTitle>
          <CardDescription>
            There&apos;s nothing at this address. Check the link and try again.
          </CardDescription>
        </CardHeader>
        <CardFooter className="border-t py-4">
          <Link href="/" className={cn(buttonVariants({ variant: "outline", className: "h-9" }))}>
            Create a new paste
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
