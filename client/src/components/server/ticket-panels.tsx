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
}

export default function TicketPanels({ serverId }: TicketPanelsProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const { data: panels } = useQuery<TicketPanel[]>({
    queryKey: [`/api/servers/${serverId}/panels`],
  });

  const createPanel = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/servers/${serverId}/panels`, {
        title,
        description,
      });
      return res.json();
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      queryClient.invalidateQueries({
        queryKey: [`/api/servers/${serverId}/panels`],
      });
      toast({
        title: "Panel Created",
        description: "Ticket panel has been created successfully.",
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
        </CardContent>
        <CardFooter>
          <Button
            onClick={() => createPanel.mutate()}
            disabled={!title || !description || createPanel.isPending}
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
              {/* Panel statistics will go here */}
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
