import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export default function Navbar() {
  const [location] = useLocation();
  const { data: user } = useQuery<User>({ 
    queryKey: ["/api/auth/user"],
    retry: false
  });

  const isActive = (path: string) => location === path;

  if (!user) {
    return null;
  }

  return (
    <nav className="border-b">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Link href="/dashboard">
              <a className="text-xl font-bold">Discord Tickets</a>
            </Link>
            <div className="ml-10 flex items-center space-x-4">
              <Link href="/dashboard">
                <Button
                  variant={isActive("/dashboard") ? "default" : "ghost"}
                >
                  Dashboard
                </Button>
              </Link>
              <Link href="/servers">
                <Button
                  variant={isActive("/servers") ? "default" : "ghost"}
                >
                  Servers
                </Button>
              </Link>
              <Link href="/billing">
                <Button
                  variant={isActive("/billing") ? "default" : "ghost"}
                >
                  Billing
                </Button>
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span>{user.username}</span>
            {user.avatarUrl && (
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="h-8 w-8 rounded-full"
              />
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
