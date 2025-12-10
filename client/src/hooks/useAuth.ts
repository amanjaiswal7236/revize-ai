import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    retry: 1,
    retryDelay: 500,
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/user", {
          credentials: "include",
        });
        if (res.status === 401) {
          return null;
        }
        if (!res.ok) {
          console.warn("Auth request failed:", res.status, res.statusText);
          return null;
        }
        const userData = await res.json();
        return userData;
      } catch (error) {
        console.error("Auth query error:", error);
        // If it's a network error or 401, return null (not authenticated)
        return null;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    user: user || undefined,
    isLoading,
    isAuthenticated: !!user,
  };
}
