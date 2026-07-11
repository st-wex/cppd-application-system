import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Public site header: institute logo + name on the left, Login on the right.
 * The logo lives at `public/logo.png` (placeholder for now).
 */
export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="CPPD Pakistan logo"
            width={40}
            height={40}
            className="rounded-md"
            priority
          />
          <span className="text-lg font-semibold tracking-tight">
            CPPD Pakistan
          </span>
        </Link>

        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">Login</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
