import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiDiscord } from "react-icons/si";

export default function Login() {
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
