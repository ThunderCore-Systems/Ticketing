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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PlusCircle, X, Edit, Trash2, RefreshCw } from "lucide-react";

interface TicketPanelsProps {
  serverId: number;
}

export default function TicketPanels({ serverId }: TicketPanelsProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [channelId, setChannelId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [transcriptChannelId, setTranscriptChannelId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [supportRoleIds, setSupportRoleIds] = useState<string[]>([]);
  const [prefix, setPrefix] = useState("");
  const [editingPanel, setEditingPanel] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [panelToDelete, setPanelToDelete] = useState<number | null>(null);

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

  const updatePanel = useMutation({
    mutationFn: async (panelId: number) => {
      const res = await apiRequest(
        "PATCH",
        `/api/servers/${serverId}/panels/${panelId}`,
        {
          title,
          description,
          channelId,
          categoryId,
          supportRoleIds,
          prefix: prefix.toUpperCase(),
          transcriptChannelId,
        }
      );
      return res.json();
    },
    onSuccess: () => {
      setEditingPanel(null);
      resetForm();
      queryClient.invalidateQueries({
        queryKey: [`/api/servers/${serverId}/panels`],
      });
      toast({
        title: "Panel Updated",
        description: "Ticket panel has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update ticket panel. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deletePanel = useMutation({
    mutationFn: async (panelId: number) => {
      const res = await apiRequest(
        "DELETE",
        `/api/servers/${serverId}/panels/${panelId}`
      );
      return res.json();
    },
    onSuccess: () => {
      setDeleteConfirmOpen(false);
      setPanelToDelete(null);
      queryClient.invalidateQueries({
        queryKey: [`/api/servers/${serverId}/panels`],
      });
      toast({
        title: "Panel Deleted",
        description: "Ticket panel has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete ticket panel. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resendPanel = useMutation({
    mutationFn: async (panelId: number) => {
      const res = await apiRequest(
        "POST",
        `/api/servers/${serverId}/panels/${panelId}/resend`
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Panel Resent",
        description: "Ticket panel has been resent to Discord.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to resend ticket panel. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createPanel = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/servers/${serverId}/panels`, {
        title,
        description,
        channelId,
        categoryId,
        supportRoleIds,
        prefix: prefix.toUpperCase(),
        transcriptChannelId,
      });
      return res.json();
    },
    onSuccess: () => {
      resetForm();
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

  const handleEditClick = (panel: any) => {
    setTitle(panel.title);
    setDescription(panel.description);
    setChannelId(panel.channelId);
    setCategoryId(panel.categoryId);
    setSupportRoleIds(panel.supportRoleIds);
    setPrefix(panel.prefix);
    setTranscriptChannelId(panel.transcriptChannelId || "");
    setEditingPanel(panel.id);
  };

  const handleDeleteClick = (panelId: number) => {
    setPanelToDelete(panelId);
    setDeleteConfirmOpen(true);
  };

  const handleAddRole = () => {
    if (selectedRoleId && !supportRoleIds.includes(selectedRoleId)) {
      setSupportRoleIds([...supportRoleIds, selectedRoleId]);
      setSelectedRoleId("");
    }
  };

  const handleRemoveRole = (roleId: string) => {
    setSupportRoleIds(supportRoleIds.filter((id) => id !== roleId));
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setChannelId("");
    setCategoryId("");
    setSupportRoleIds([]);
    setPrefix("");
    setTranscriptChannelId("");
    setEditingPanel(null);
  };

  const handleSubmit = () => {
    const panelData = {
      title,
      description,
      channelId,
      categoryId,
      supportRoleIds,
      prefix: prefix.toUpperCase(),
      transcriptChannelId: transcriptChannelId || null,
    };

    if (editingPanel) {
      updatePanel.mutate(editingPanel);
    } else {
      createPanel.mutate(panelData);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {editingPanel ? "Edit Ticket Panel" : "Create Ticket Panel"}
          </CardTitle>
          <CardDescription>
            {editingPanel
              ? "Edit an existing ticket panel"
              : "Create a new ticket panel that will be displayed in your Discord server"}
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
              This will be used to generate ticket numbers like{" "}
              {prefix ? `${prefix}-001` : "PREFIX-001"}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Transcript Channel
            </label>
            <Select value={transcriptChannelId} onValueChange={setTranscriptChannelId}>
              <SelectTrigger>
                <SelectValue placeholder="Select channel for ticket transcripts" />
              </SelectTrigger>
              <SelectContent>
                {channels?.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    #{channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Channel where ticket transcripts will be saved when a ticket is closed
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
              {supportRoleIds.map((roleId) => {
                const role = roles?.find((r) => r.id === roleId);
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
        <CardFooter className="flex gap-2">
          <Button
            onClick={handleSubmit}
            disabled={
              !title ||
              !description ||
              !channelId ||
              !categoryId ||
              supportRoleIds.length === 0 ||
              !prefix ||
              createPanel.isPending ||
              updatePanel.isPending ||
              !transcriptChannelId
            }
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            {editingPanel ? "Update Panel" : "Create Panel"}
          </Button>
          {editingPanel && (
            <Button variant="outline" onClick={resetForm}>
              Cancel
            </Button>
          )}
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
                <p>Channel: #{channels?.find((c) => c.id === panel.channelId)?.name}</p>
                <p>Category: {categories?.find((c) => c.id === panel.categoryId)?.name}</p>
                {panel.transcriptChannelId && (
                  <p>
                    Transcript Channel:{" "}
                    #{channels?.find((c) => c.id === panel.transcriptChannelId)?.name}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <span>Support Roles:</span>
                  {panel.supportRoleIds.map((roleId) => (
                    <Badge key={roleId} variant="secondary">
                      @{roles?.find((r) => r.id === roleId)?.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEditClick(panel)}
              >
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => resendPanel.mutate(panel.id)}
                disabled={resendPanel.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Resend
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteClick(panel.id)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the ticket panel
              and remove it from your Discord server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => panelToDelete && deletePanel.mutate(panelToDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}