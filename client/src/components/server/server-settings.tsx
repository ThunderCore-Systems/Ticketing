import { useMutation } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Server } from "@shared/schema";

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
              <label className="text-sm font-medium">
                Anonymous Support Mode
              </label>
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

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">
                Automatic Ticket Archiving
              </label>
              <p className="text-sm text-muted-foreground">
                Automatically archive tickets after they've been closed for 7 days
              </p>
            </div>
            <Switch />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Advanced Settings</CardTitle>
          <CardDescription>
            Configure advanced server settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Support Team Role ID
            </label>
            <Input
              placeholder="Enter Discord role ID for support team"
              value={server.supportRoleId || ""}
              onChange={(e) => 
                updateSettings.mutate({ supportRoleId: e.target.value })
              }
            />
            <p className="text-sm text-muted-foreground">
              Members with this role will have access to all tickets
            </p>
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