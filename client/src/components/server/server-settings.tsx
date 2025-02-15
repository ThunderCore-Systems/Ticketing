import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Server } from "@shared/schema";
import { Upload, X } from "lucide-react";

interface ServerSettingsProps {
  server: Server;
}

export default function ServerSettings({ server }: ServerSettingsProps) {
  const { toast } = useToast();

  // Fetch Discord roles for this server
  const { data: roles } = useQuery({
    queryKey: [`/api/servers/${server.discordId}/roles`],
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<Server>) => {
      const res = await apiRequest("PATCH", `/api/servers/${server.id}`, updates);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update settings');
      }
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
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update server settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Max size 1MB
    if (file.size > 1024 * 1024) {
      toast({
        title: "Error",
        description: "Avatar must be less than 1MB",
        variant: "destructive",
      });
      return;
    }

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        updateSettings.mutate({ webhookAvatar: base64 });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload avatar. Please try again.",
        variant: "destructive",
      });
    }
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
                disabled={updateSettings.isPending}
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
              Ticket Manager Roles
            </Label>
            <Select
              value={server.ticketManagerRoleId || ""}
              onValueChange={(value) => 
                updateSettings.mutate({ ticketManagerRoleId: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select roles that can manage tickets" />
              </SelectTrigger>
              <SelectContent>
                {roles?.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Members with these roles can view all tickets and manage users
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
            <Switch
              checked={server.autoArchive || false}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ autoArchive: checked })
              }
              disabled={updateSettings.isPending}
            />
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
            <Switch
              checked={server.activityLogs || false}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ activityLogs: checked })
              }
              disabled={updateSettings.isPending}
            />
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
            <Switch
              checked={server.enableStats || false}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ enableStats: checked })
              }
              disabled={updateSettings.isPending}
            />
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
            <Switch
              checked={server.enableTeamStats || false}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ enableTeamStats: checked })
              }
              disabled={updateSettings.isPending}
            />
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