import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/public-env';

// Create a simple client-side Supabase client
const supabaseClient = {
  auth: {
    getSession: async () => {
      // Get the session from localStorage
      const sessionStr = localStorage.getItem('supabase_session');
      return { data: { session: sessionStr ? JSON.parse(sessionStr) : null } };
    },

    onAuthStateChange: callback => {
      // Simple event system using storage events
      const listener = e => {
        if (e.key === 'supabase_session') {
          const session = e.newValue ? JSON.parse(e.newValue) : null;
          callback('SIGNED_IN', { user: session?.user || null });
        }
      };
      window.addEventListener('storage', listener);
      return {
        data: {
          subscription: {
            unsubscribe: () => window.removeEventListener('storage', listener),
          },
        },
      };
    },

    signInWithPassword: async ({ email, password }) => {
      try {
        // In a real implementation, this would call the Supabase API
        // For now we'll create a simulated user
        const mockUser = {
          id: `user_${email.split('@')[0]}`,
          email,
          user_metadata: { username: email.split('@')[0] },
        };

        // Store in localStorage for persistence
        localStorage.setItem('supabase_session', JSON.stringify({ user: mockUser }));
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'supabase_session',
            newValue: JSON.stringify({ user: mockUser }),
          })
        );

        return { data: { user: mockUser }, error: null };
      } catch (error) {
        return { data: { user: null }, error: error };
      }
    },

    signUp: async ({ email, password, options }) => {
      try {
        // In a real implementation, this would call the Supabase API
        const mockUser = {
          id: `user_${email.split('@')[0]}`,
          email,
          user_metadata: {
            username: options?.data?.username || email.split('@')[0],
          },
        };

        // Store in localStorage for persistence
        localStorage.setItem('supabase_session', JSON.stringify({ user: mockUser }));
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'supabase_session',
            newValue: JSON.stringify({ user: mockUser }),
          })
        );

        return { data: { user: mockUser }, error: null };
      } catch (error) {
        return { data: { user: null }, error: error };
      }
    },

    signOut: async () => {
      try {
        localStorage.removeItem('supabase_session');
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'supabase_session',
            newValue: null,
          })
        );
        return { error: null };
      } catch (error) {
        return { error: error };
      }
    },
  },
};

export const supabase = supabaseClient;
