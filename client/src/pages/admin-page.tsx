import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Users, Server, Coins, Shield, Edit, RefreshCw, Trash2, Plus, Ban, UserCog, BookOpen, Brain } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export default function AdminPage() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("users");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const [newKnowledgeEntry, setNewKnowledgeEntry] = useState({
    title: "",
    content: "",
    category: "",
    url: "",
  });

  // Fetch users data
  const { data: users } = useQuery({
    queryKey: ["/api/admin/users"],
  });

  // Fetch servers data
  const { data: servers } = useQuery({
    queryKey: ["/api/admin/servers"],
  });

  // Fetch knowledge base data
  const { data: knowledgeBase } = useQuery({
    queryKey: ["/api/servers", selectedServer, "knowledge"],
    enabled: !!selectedServer,
  });

  // Mutations for user management
  const updateUser = useMutation({
    mutationFn: async ({ userId, data }: { userId: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "User Updated",
        description: "User details have been updated successfully.",
      });
    },
  });

  // Add tokens mutation
  const addTokens = useMutation({
    mutationFn: async ({ userId, amount }: { userId: number; amount: number }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/tokens`, {
        amount,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Tokens Added",
        description: "Server tokens have been added successfully.",
      });
    },
  });

  // Ban user mutation
  const banUser = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/ban`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "User Ban Status Updated",
        description: "User ban status has been updated successfully.",
      });
    },
  });

  // Toggle server manager status
  const toggleServerManager = useMutation({
    mutationFn: async ({ userId, isServerManager }: { userId: number; isServerManager: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}`, {
        isServerManager,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Server Manager Status Updated",
        description: "User's server management privileges have been updated.",
      });
    },
  });

  // Sync server mutation
  const syncServer = useMutation({
    mutationFn: async (serverId: number) => {
      const res = await apiRequest("POST", `/api/admin/servers/${serverId}/sync`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/servers"] });
      toast({
        title: "Server Synced",
        description: "Server has been synchronized successfully.",
      });
    },
  });

  // Add knowledge base entry mutation
  const addKnowledgeEntry = useMutation({
    mutationFn: async (data: typeof newKnowledgeEntry & { serverId: number }) => {
      const res = await apiRequest("POST", `/api/servers/${data.serverId}/knowledge`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers", selectedServer, "knowledge"] });
      setNewKnowledgeEntry({ title: "", content: "", category: "", url: "" });
      toast({
        title: "Knowledge Base Updated",
        description: "New entry has been added successfully.",
      });
    },
  });

  const filteredUsers = users?.filter((user: any) =>
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <div className="flex items-center gap-4">
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="servers" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            Servers
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Knowledge Base
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                Manage user accounts, roles, and permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Server Tokens</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Server Manager</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers?.map((user: any) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.serverTokens}</TableCell>
                      <TableCell>
                        <Badge
                          variant={user.isBanned ? "destructive" : "secondary"}
                        >
                          {user.isBanned ? "Banned" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          defaultValue={user.role}
                          onValueChange={(value) =>
                            updateUser.mutate({
                              userId: user.id,
                              data: { role: value },
                            })
                          }
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <Switch
                            checked={user.isServerManager}
                            onCheckedChange={(checked) =>
                              toggleServerManager.mutate({
                                userId: user.id,
                                isServerManager: checked,
                              })
                            }
                          />
                          <UserCog className="h-4 w-4 ml-2" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              addTokens.mutate({ userId: user.id, amount: 1 })
                            }
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Token
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => banUser.mutate(user.id)}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="servers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Server Management</CardTitle>
              <CardDescription>
                Overview and management of all Discord servers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Server Name</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Tickets</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {servers?.map((server: any) => (
                    <TableRow key={server.id}>
                      <TableCell className="font-medium">
                        {server.name}
                      </TableCell>
                      <TableCell>
                        {users?.find((u: any) => u.id === server.ownerId)
                          ?.username || "Unknown"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {server.subscriptionStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>{server.memberCount || "N/A"}</TableCell>
                      <TableCell>{server.ticketCount || 0}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Link href={`/servers/${server.id}`}>
                            <Button variant="outline" size="sm">
                              <Edit className="h-4 w-4 mr-1" />
                              Manage
                            </Button>
                          </Link>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => syncServer.mutate(server.id)}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Sync
                          </Button>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Knowledge Base Management</CardTitle>
              <CardDescription>
                Manage AI knowledge base for automatic ticket responses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Select onValueChange={(value) => setSelectedServer(parseInt(value))}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select Server" />
                  </SelectTrigger>
                  <SelectContent>
                    {servers?.map((server: any) => (
                      <SelectItem key={server.id} value={server.id.toString()}>
                        {server.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedServer && (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Add New Entry</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <Input
                            placeholder="Title"
                            value={newKnowledgeEntry.title}
                            onChange={(e) =>
                              setNewKnowledgeEntry(prev => ({
                                ...prev,
                                title: e.target.value
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Textarea
                            placeholder="Content"
                            value={newKnowledgeEntry.content}
                            onChange={(e) =>
                              setNewKnowledgeEntry(prev => ({
                                ...prev,
                                content: e.target.value
                              }))
                            }
                          />
                        </div>
                        <div className="flex gap-4">
                          <Input
                            placeholder="Category"
                            value={newKnowledgeEntry.category}
                            onChange={(e) =>
                              setNewKnowledgeEntry(prev => ({
                                ...prev,
                                category: e.target.value
                              }))
                            }
                          />
                          <Input
                            placeholder="URL (optional)"
                            value={newKnowledgeEntry.url}
                            onChange={(e) =>
                              setNewKnowledgeEntry(prev => ({
                                ...prev,
                                url: e.target.value
                              }))
                            }
                          />
                        </div>
                        <Button
                          onClick={() =>
                            addKnowledgeEntry.mutate({
                              ...newKnowledgeEntry,
                              serverId: selectedServer
                            })
                          }
                        >
                          Add Entry
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

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
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Configuration</CardTitle>
              <CardDescription>
                Configure AI behavior and response settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Auto-Response Confidence Threshold</h3>
                    <p className="text-sm text-muted-foreground">
                      Minimum confidence level required for automatic responses
                    </p>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    className="w-24"
                    defaultValue="0.7"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Enable AI First Response</h3>
                    <p className="text-sm text-muted-foreground">
                      Let AI attempt to respond to tickets before human support
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}