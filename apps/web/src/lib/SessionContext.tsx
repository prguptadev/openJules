import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Session, sessionApi } from './session';

interface SessionContextValue {
  session: Session | null;
  sessionId: string | null;
  isLoading: boolean;
  error: string | null;
  refreshSession: () => Promise<void>;
  clearSession: () => void;
  setSessionId: (id: string | null) => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

const SESSION_STORAGE_KEY = 'openjules_session_id';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionIdState] = useState<string | null>(() => {
    // Check URL params first (from OAuth callback)
    const params = new URLSearchParams(window.location.search);
    const urlSessionId = params.get('sessionId');
    if (urlSessionId) {
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
      localStorage.setItem(SESSION_STORAGE_KEY, urlSessionId);
      return urlSessionId;
    }
    // Fall back to localStorage
    return localStorage.getItem(SESSION_STORAGE_KEY);
  });

  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSessionId = useCallback((id: string | null) => {
    setSessionIdState(id);
    if (id) {
      localStorage.setItem(SESSION_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (!sessionId) {
      setSession(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const sessionData = await sessionApi.getSession(sessionId);
      setSession(sessionData);
    } catch (err: any) {
      console.error('Failed to fetch session:', err);
      if (err.response?.status === 404) {
        // Session not found, clear it
        setSessionId(null);
        setSession(null);
      }
      setError(err.message || 'Failed to load session');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, setSessionId]);

  const clearSession = useCallback(() => {
    if (sessionId) {
      sessionApi.deleteSession(sessionId).catch(console.error);
    }
    setSessionId(null);
    setSession(null);
  }, [sessionId, setSessionId]);

  // Fetch session on mount and when sessionId changes
  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Poll for session status while cloning
  useEffect(() => {
    if (session?.status === 'cloning') {
      const interval = setInterval(refreshSession, 2000);
      return () => clearInterval(interval);
    }
  }, [session?.status, refreshSession]);

  return (
    <SessionContext.Provider
      value={{
        session,
        sessionId,
        isLoading,
        error,
        refreshSession,
        clearSession,
        setSessionId,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
