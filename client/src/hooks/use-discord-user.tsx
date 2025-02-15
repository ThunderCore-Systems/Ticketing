import { useQuery } from "@tanstack/react-query";

export function useDiscordUser(userId: string | null) {
  return useQuery({
    queryKey: [`/api/users/${userId}`],
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

// Convert a Discord ID to username, with caching
export function useDiscordUsername(userId: string | null) {
  const { data: user } = useDiscordUser(userId);
  return user?.username || userId;
}
