import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: number;
  username: string;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (username: string, password: string, email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);

  const {
    data: userData,
    error,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ["/api/user"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/user");
        if (response.ok) {
          return await response.json();
        }
        // If not OK but it's a 401, we return null without error
        if (response.status === 401) {
          return null;
        }
        // For other errors, throw to trigger the onError handler
        throw new Error(`Server returned ${response.status}`);
      } catch (e) {
        console.error("Error fetching user:", e);
        // Return null instead of throwing - don't break the UI on auth errors
        return null;
      }
    },
    retry: false,
    // Add staleTime to prevent excessive refetching
    staleTime: 1000 * 60 * 5, // 5 minutes
    // Disable refetch on window focus to reduce API calls
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (userData) {
      setUser(userData);
    }
  }, [userData]);

  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const response = await apiRequest("POST", "/api/login", credentials);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Login failed");
      }
      return await response.json();
    },
    onSuccess: (data) => {
      setUser(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      // toast call replaced
  // Original: toast({
        title: "Login successful",
        description: `Welcome back, ${data.username}!`,
      })
  console.log('Toast would show:', {
        title: "Login successful",
        description: `Welcome back, ${data.username}!`,
      });
    },
    onError: (error: Error) => {
      // toast call replaced
  // Original: toast({
        title: "Login failed",
        description: error.message || "Please check your credentials and try again",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Login failed",
        description: error.message || "Please check your credentials and try again",
        variant: "destructive",
      });
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/logout");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Logout failed");
      }
    },
    onSuccess: () => {
      setUser(null);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      // toast call replaced
  // Original: toast({
        title: "Logged out",
        description: "You have been successfully logged out",
      })
  console.log('Toast would show:', {
        title: "Logged out",
        description: "You have been successfully logged out",
      });
    },
    onError: (error: Error) => {
      // toast call replaced
  // Original: toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const registerMutation = useMutation({
    mutationFn: async (userData: { username: string; password: string; email: string }) => {
      const response = await apiRequest("POST", "/api/register", userData);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Registration failed");
      }
      return await response.json();
    },
    onSuccess: (data) => {
      setUser(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      // toast call replaced
  // Original: toast({
        title: "Registration successful",
        description: `Welcome to TrialSage, ${data.username}!`,
      })
  console.log('Toast would show:', {
        title: "Registration successful",
        description: `Welcome to TrialSage, ${data.username}!`,
      });
    },
    onError: (error: Error) => {
      // toast call replaced
  // Original: toast({
        title: "Registration failed",
        description: error.message || "Please try again with different credentials",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Registration failed",
        description: error.message || "Please try again with different credentials",
        variant: "destructive",
      });
    }
  });

  const login = async (username: string, password: string) => {
    await loginMutation.mutateAsync({ username, password });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  const register = async (username: string, password: string, email: string) => {
    await registerMutation.mutateAsync({ username, password, email });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error: error as Error,
        login,
        logout,
        register
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}