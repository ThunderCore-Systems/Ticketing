// Add at the top of the file
const handleMessageSubmit = async (content: string) => {
  if (!content.trim()) return;

  try {
    const response = await apiRequest("POST", `/api/tickets/${ticketId}/messages`, {
      content,
      isSupport: true
    });

    if (!response.ok) {
      throw new Error("Failed to send message");
    }

    // If this is a support team member's response and AI is enabled
    if (isSupport && server?.enableAI) {
      // Save the response to knowledge base
      await apiRequest("POST", `/api/servers/${server.id}/knowledge`, {
        keyPhrase: ticket.messages[0].content, // Use the initial question as key phrase
        answer: content,
        serverId: server.id,
        automated: true // Flag that this was automatically added
      });
    }

    queryClient.invalidateQueries({ queryKey: [`/api/tickets/${ticketId}`] });
    form.reset();
  } catch (error) {
    toast({
      title: "Error",
      description: "Failed to send message. Please try again.",
      variant: "destructive",
    });
  }
};
