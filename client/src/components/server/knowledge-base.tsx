import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2 } from "lucide-react";

interface KnowledgeBaseProps {
  serverId: number;
}

export default function KnowledgeBase({ serverId }: KnowledgeBaseProps) {
  const { toast } = useToast();
  const [newEntry, setNewEntry] = useState({
    title: "",
    content: "",
    category: "",
    url: "",
  });

  const { data: knowledgeBase } = useQuery({
    queryKey: [`/api/servers/${serverId}/knowledge`],
  });

  const addEntry = useMutation({
    mutationFn: async (data: typeof newEntry) => {
      const res = await apiRequest("POST", `/api/servers/${serverId}/knowledge`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/knowledge`] });
      setNewEntry({ title: "", content: "", category: "", url: "" });
      toast({
        title: "Entry Added",
        description: "Knowledge base entry has been added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add entry. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add Knowledge Base Entry</CardTitle>
          <CardDescription>
            Add information that the AI can use to respond to tickets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Input
                placeholder="Title"
                value={newEntry.title}
                onChange={(e) =>
                  setNewEntry((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Textarea
                placeholder="Content"
                value={newEntry.content}
                onChange={(e) =>
                  setNewEntry((prev) => ({
                    ...prev,
                    content: e.target.value,
                  }))
                }
              />
            </div>
            <div className="flex gap-4">
              <Input
                placeholder="Category"
                value={newEntry.category}
                onChange={(e) =>
                  setNewEntry((prev) => ({
                    ...prev,
                    category: e.target.value,
                  }))
                }
              />
              <Input
                placeholder="URL (optional)"
                value={newEntry.url}
                onChange={(e) =>
                  setNewEntry((prev) => ({
                    ...prev,
                    url: e.target.value,
                  }))
                }
              />
            </div>
            <Button
              onClick={() => addEntry.mutate(newEntry)}
              disabled={addEntry.isPending}
            >
              Add Entry
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Knowledge Base Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {knowledgeBase?.map((entry: any) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">
                    {entry.title}
                  </TableCell>
                  <TableCell>{entry.category}</TableCell>
                  <TableCell>
                    {entry.url && (
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        {entry.url}
                      </a>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
