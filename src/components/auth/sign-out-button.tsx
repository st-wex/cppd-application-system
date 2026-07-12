import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Sign-out control. Renders a form that POSTs to the /auth/signout route
 * handler (POST-only, so it can't be triggered by a stray GET/prefetch). No
 * client JS required.
 */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post" className={cn(className)}>
      <Button type="submit" variant="outline" size="sm">
        Sign out
      </Button>
    </form>
  );
}
