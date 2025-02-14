import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiDiscord } from "react-icons/si";
import { useLocation } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

export default function Login() {
  const [location] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    // Show error toast if auth failed
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'auth_failed') {
      toast({
        title: "Authentication Failed",
        description: "Failed to authenticate with Discord. Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">
            Sign in to Discord Tickets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <a href="/api/auth/discord" className="block w-full">
            <Button className="w-full" size="lg">
              <SiDiscord className="mr-2 h-5 w-5" />
              Continue with Discord
            </Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}