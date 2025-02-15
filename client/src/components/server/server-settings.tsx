import { useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Server } from "@shared/schema";
import { Upload } from "lucide-react";

interface ServerSettingsProps {
  server: Server;
}

export default function ServerSettings({ server }: ServerSettingsProps) {
  const { toast } = useToast();

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<Server>) => {
      const res = await apiRequest("PATCH", `/api/servers/${server.id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/servers/${server.id}`],
      });
      toast({
        title: "Settings Updated",
        description: "Server settings have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update server settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert to base64
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      updateSettings.mutate({ webhookAvatar: base64 });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Server Settings</CardTitle>
          <CardDescription>
            Configure your server's ticket system settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>
                Anonymous Support Mode
              </Label>
              <p className="text-sm text-muted-foreground">
                When enabled, support team messages will appear as "Support Team" instead of individual usernames
              </p>
            </div>
            <Switch
              checked={server.anonymousMode || false}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ anonymousMode: checked })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Support Team Avatar</Label>
            <div className="flex items-center gap-4">
              {server.webhookAvatar && (
                <img
                  src={server.webhookAvatar}
                  alt="Webhook Avatar"
                  className="w-12 h-12 rounded-full"
                />
              )}
              <Input
                type="file"
                accept="image/*"
                id="avatar-upload"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById('avatar-upload')?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Avatar
              </Button>
              <p className="text-sm text-muted-foreground">
                Custom avatar for anonymous support messages. Your Discord avatar will be used in non-anonymous mode.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              Ticket Manager Role
            </Label>
            <Input
              placeholder="Enter Discord role ID for ticket managers"
              value={server.ticketManagerRoleId || ""}
              onChange={(e) =>
                updateSettings.mutate({ ticketManagerRoleId: e.target.value })
              }
            />
            <p className="text-sm text-muted-foreground">
              Members with this role can view all tickets and manage users
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>
                Automatic Ticket Archiving
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically archive tickets after they've been closed for 7 days
              </p>
            </div>
            <Switch />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>
                Ticket Activity Logs
              </Label>
              <p className="text-sm text-muted-foreground">
                Log all ticket-related actions (claims, closures, user management) for audit purposes
              </p>
            </div>
            <Switch />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>
                Server Statistics
              </Label>
              <p className="text-sm text-muted-foreground">
                Track overall server performance metrics
              </p>
            </div>
            <Switch />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>
                Support Team Statistics
              </Label>
              <p className="text-sm text-muted-foreground">
                Track and display individual support team member performance metrics
              </p>
            </div>
            <Switch />
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={() => updateSettings.mutate({})}
            disabled={updateSettings.isPending}
          >
            Save Changes
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}