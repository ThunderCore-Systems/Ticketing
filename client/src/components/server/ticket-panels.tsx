import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
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
import { PlusCircle, X } from "lucide-react";

interface TicketPanelsProps {
  serverId: number;
}

export default function TicketPanels({ serverId }: TicketPanelsProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [channelId, setChannelId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [supportRoleIds, setSupportRoleIds] = useState<string[]>([]);
  const [prefix, setPrefix] = useState("");

  // Fetch Discord server data
  const { data: channels } = useQuery({
    queryKey: [`/api/servers/${serverId}/channels`],
  });

  const { data: categories } = useQuery({
    queryKey: [`/api/servers/${serverId}/categories`],
  });

  const { data: roles } = useQuery({
    queryKey: [`/api/servers/${serverId}/roles`],
  });

  const { data: panels } = useQuery({
    queryKey: [`/api/servers/${serverId}/panels`],
  });

  const createPanel = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/servers/${serverId}/panels`, {
        title,
        description,
        channelId,
        categoryId,
        supportRoleIds, // Now sending array of role IDs
        prefix: prefix.toUpperCase(),
      });
      return res.json();
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setChannelId("");
      setCategoryId("");
      setSupportRoleIds([]);
      setPrefix("");
      queryClient.invalidateQueries({
        queryKey: [`/api/servers/${serverId}/panels`],
      });
      toast({
        title: "Panel Created",
        description: "Ticket panel has been created and sent to Discord.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create ticket panel. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddRole = () => {
    if (selectedRoleId && !supportRoleIds.includes(selectedRoleId)) {
      setSupportRoleIds([...supportRoleIds, selectedRoleId]);
      setSelectedRoleId("");
    }
  };

  const handleRemoveRole = (roleId: string) => {
    setSupportRoleIds(supportRoleIds.filter(id => id !== roleId));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Ticket Panel</CardTitle>
          <CardDescription>
            Create a new ticket panel that will be displayed in your Discord server
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium">
              Panel Title
            </label>
            <Input
              id="title"
              placeholder="e.g., Support Tickets"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              Panel Description
            </label>
            <Textarea
              id="description"
              placeholder="Explain what this ticket panel is for..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="prefix" className="text-sm font-medium">
              Ticket Prefix
            </label>
            <Input
              id="prefix"
              placeholder="e.g., SUPPORT"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              className="uppercase"
            />
            <p className="text-sm text-muted-foreground">
              This will be used to generate ticket numbers like {prefix ? `${prefix}-001` : "PREFIX-001"}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Panel Channel
            </label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger>
                <SelectValue placeholder="Select channel for the panel" />
              </SelectTrigger>
              <SelectContent>
                {channels?.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    #{channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Tickets Category
            </label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select category for new tickets" />
              </SelectTrigger>
              <SelectContent>
                {categories?.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Support Roles
            </label>
            <div className="flex gap-2">
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select support team role" />
                </SelectTrigger>
                <SelectContent>
                  {roles?.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      @{role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="icon"
                onClick={handleAddRole}
                disabled={!selectedRoleId}
              >
                <PlusCircle className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {supportRoleIds.map(roleId => {
                const role = roles?.find(r => r.id === roleId);
                return (
                  <Badge key={roleId} variant="secondary" className="flex items-center gap-1">
                    @{role?.name}
                    <button
                      onClick={() => handleRemoveRole(roleId)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={() => createPanel.mutate()}
            disabled={
              !title || 
              !description || 
              !channelId || 
              !categoryId || 
              supportRoleIds.length === 0 || 
              !prefix || 
              createPanel.isPending
            }
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Panel
          </Button>
        </CardFooter>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {panels?.map((panel) => (
          <Card key={panel.id}>
            <CardHeader>
              <CardTitle>{panel.title}</CardTitle>
              <CardDescription>{panel.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <p>Prefix: {panel.prefix}</p>
                <p>Channel: #{channels?.find(c => c.id === panel.channelId)?.name}</p>
                <p>Category: {categories?.find(c => c.id === panel.categoryId)?.name}</p>
                <div className="flex flex-wrap gap-2">
                  <span>Support Roles:</span>
                  {panel.supportRoleIds.map(roleId => (
                    <Badge key={roleId} variant="secondary">
                      @{roles?.find(r => r.id === roleId)?.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}