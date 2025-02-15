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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PlusCircle } from "lucide-react";

interface TicketPanelsProps {
  serverId: number;
}

interface TicketPanel {
  id: number;
  title: string;
  description: string;
  channelId: string;
  categoryId: string;
  supportRoleId: string;
  prefix: string;
}

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
}

export default function TicketPanels({ serverId }: TicketPanelsProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [channelId, setChannelId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supportRoleId, setSupportRoleId] = useState("");
  const [prefix, setPrefix] = useState("");

  const { data: panels } = useQuery<TicketPanel[]>({
    queryKey: [`/api/servers/${serverId}/panels`],
  });

  const { data: channels } = useQuery<DiscordChannel[]>({
    queryKey: [`/api/servers/${serverId}/channels`],
  });

  const { data: categories } = useQuery<DiscordChannel[]>({
    queryKey: [`/api/servers/${serverId}/categories`],
  });

  const { data: roles } = useQuery<{ id: string; name: string }[]>({
    queryKey: [`/api/servers/${serverId}/roles`],
  });

  const createPanel = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/servers/${serverId}/panels`, {
        title,
        description,
        channelId,
        categoryId,
        supportRoleId,
        prefix: prefix.toUpperCase(),
      });
      return res.json();
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setChannelId("");
      setCategoryId("");
      setSupportRoleId("");
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
                {channels?.filter(c => c.type === 0).map((channel) => (
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
                {categories?.filter(c => c.type === 4).map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Support Role
            </label>
            <Select value={supportRoleId} onValueChange={setSupportRoleId}>
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
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={() => createPanel.mutate()}
            disabled={!title || !description || !channelId || !categoryId || !supportRoleId || !prefix || createPanel.isPending}
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
                <p>Support Role: @{roles?.find(r => r.id === panel.supportRoleId)?.name}</p>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full">
                View Details
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}