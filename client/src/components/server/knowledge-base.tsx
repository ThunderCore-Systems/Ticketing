import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Link as LinkIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface KnowledgeBaseProps {
  serverId: number;
}

export default function KnowledgeBase({ serverId }: KnowledgeBaseProps) {
  const { toast } = useToast();
  const [newPhrase, setNewPhrase] = useState({
    keyPhrase: "",
    answer: "",
  });
  const [newLink, setNewLink] = useState({
    title: "",
    url: "",
    description: "",
  });

  const { data: server } = useQuery({
    queryKey: [`/api/servers/${serverId}`],
  });

  const { data: knowledgeBase } = useQuery({
    queryKey: [`/api/servers/${serverId}/knowledge`],
  });

  const { data: helpfulLinks } = useQuery({
    queryKey: [`/api/servers/${serverId}/links`],
  });

  const addPhrase = useMutation({
    mutationFn: async (data: typeof newPhrase) => {
      try {
        const res = await apiRequest("POST", `/api/servers/${serverId}/knowledge`, {
          ...data,
          serverId,
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || 'Failed to add knowledge base entry');
        }

        return res.json();
      } catch (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/knowledge`] });
      setNewPhrase({ keyPhrase: "", answer: "" });
      toast({
        title: "Phrase Added",
        description: "Knowledge base has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add phrase. Please try again.",
        variant: "destructive",
      });
    },
  });

  const addLink = useMutation({
    mutationFn: async (data: typeof newLink) => {
      try {
        const res = await apiRequest("POST", `/api/servers/${serverId}/links`, {
          ...data,
          serverId,
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || 'Failed to add helpful link');
        }

        return res.json();
      } catch (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/links`] });
      setNewLink({ title: "", url: "", description: "" });
      toast({
        title: "Link Added",
        description: "Helpful link has been added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add link. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Don't render if AI is not enabled
  if (!server?.enableAI) {
    return null;
  }

  const handlePhraseSubmit = async () => {
    if (!newPhrase.keyPhrase || !newPhrase.answer) {
      toast({
        title: "Validation Error",
        description: "Both key phrase and answer are required.",
        variant: "destructive",
      });
      return;
    }

    await addPhrase.mutateAsync(newPhrase);
  };

  const handleLinkSubmit = async () => {
    if (!newLink.title || !newLink.url) {
      toast({
        title: "Validation Error",
        description: "Title and URL are required.",
        variant: "destructive",
      });
      return;
    }

    if (!newLink.url.startsWith('http://') && !newLink.url.startsWith('https://')) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid URL starting with http:// or https://",
        variant: "destructive",
      });
      return;
    }

    await addLink.mutateAsync(newLink);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="phrases" className="w-full">
        <TabsList>
          <TabsTrigger value="phrases">Key Phrases & Answers</TabsTrigger>
          <TabsTrigger value="links">Helpful Links</TabsTrigger>
        </TabsList>

        <TabsContent value="phrases" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add New Key Phrase</CardTitle>
              <CardDescription>
                Add common questions or issues with their responses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Input
                    placeholder="Key Phrase or Question"
                    value={newPhrase.keyPhrase}
                    onChange={(e) =>
                      setNewPhrase((prev) => ({
                        ...prev,
                        keyPhrase: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Textarea
                    placeholder="Answer or Response"
                    value={newPhrase.answer}
                    onChange={(e) =>
                      setNewPhrase((prev) => ({
                        ...prev,
                        answer: e.target.value,
                      }))
                    }
                  />
                </div>
                <Button
                  onClick={handlePhraseSubmit}
                  disabled={addPhrase.isPending}
                >
                  Add Phrase
                </Button>
              </div>
            </CardContent>
          </Card>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key Phrase</TableHead>
                <TableHead>Answer</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {knowledgeBase?.map((entry: any) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">
                    {entry.keyPhrase}
                  </TableCell>
                  <TableCell>{entry.answer}</TableCell>
                  <TableCell>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="links" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Helpful Link</CardTitle>
              <CardDescription>
                Add links to documentation, FAQs, or other helpful resources
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Input
                    placeholder="Title"
                    value={newLink.title}
                    onChange={(e) =>
                      setNewLink((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Input
                    placeholder="URL"
                    type="url"
                    value={newLink.url}
                    onChange={(e) =>
                      setNewLink((prev) => ({
                        ...prev,
                        url: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Input
                    placeholder="Description (optional)"
                    value={newLink.description}
                    onChange={(e) =>
                      setNewLink((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                  />
                </div>
                <Button
                  onClick={handleLinkSubmit}
                  disabled={addLink.isPending}
                >
                  Add Link
                </Button>
              </div>
            </CardContent>
          </Card>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {helpfulLinks?.map((link: any) => (
                <TableRow key={link.id}>
                  <TableCell className="font-medium">
                    {link.title}
                  </TableCell>
                  <TableCell>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline flex items-center gap-1"
                    >
                      <LinkIcon className="h-4 w-4" />
                      {link.url}
                    </a>
                  </TableCell>
                  <TableCell>{link.description}</TableCell>
                  <TableCell>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}