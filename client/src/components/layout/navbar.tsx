import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { User } from "@shared/schema";

export default function Navbar() {
  const [location] = useLocation();
  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const isAdmin = user?.ISADMIN; //Added this line as per changes provided

  const isActive = (path: string) => location === path;

  if (!user) {
    return null;
  }

  return (
    <nav className="border-b">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <a
              href="https://discord.gg/5dZke6WKHu"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xl font-bold hover:text-primary transition-colors"
            >
              Flaming Ticketing
            </a>
            <div className="ml-10 flex items-center space-x-4">
              <Link href="/dashboard">
                <Button variant={isActive("/dashboard") ? "default" : "ghost"}>
                  Dashboard
                </Button>
              </Link>
              <Link href="/servers">
                <Button variant="ghost">Servers</Button>
              </Link>
              {isAdmin && (
                <Link href="/admin">
                  <Button variant="ghost">Admin</Button>
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Popover>
              <PopoverTrigger>
                <div className="flex items-center gap-2 cursor-pointer">
                  <span>{user.username}</span>
                  {user.avatarUrl && (
                    <img
                      src={user.avatarUrl}
                      alt={user.username}
                      className="h-8 w-8 rounded-full"
                    />
                  )}
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">Subscription Status</h4>
                    <div className="flex items-center justify-between text-sm">
                      <span>Available Server Claims:</span>
                      <Badge variant="secondary">
                        {user.serverTokens} servers
                      </Badge>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Need more servers? Create a support ticket to request
                    additional access.
                  </div>
                  {user.isAdmin && (
                    <div className="pt-2 border-t">
                      <Badge variant="destructive">Admin</Badge>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </nav>
  );
}
