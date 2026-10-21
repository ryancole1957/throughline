import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import type { AuthUser, SessionInfo } from '@throughline/shared';

import {
  api,
  fetchSession,
  SESSION_EXPIRED_EVENT,
  setCsrfToken,
  type LoginInput,
  type RegisterInput,
} from './api';
import { useI18n } from './i18n';
import { useToast } from './toast';

interface AuthContextValue {
  session: SessionInfo | null;
  user: AuthUser | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refetchSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const SESSION_QUERY_KEY = ['session'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const sessionQuery = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const session = sessionQuery.data ?? null;

  useEffect(() => {
    setCsrfToken(session?.csrfToken ?? '');
  }, [session]);

  useEffect(() => {
    const handleExpired = () => {
      const current = queryClient.getQueryData<SessionInfo | null>(SESSION_QUERY_KEY);
      setCsrfToken('');
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== 'session',
      });
      if (current) toast.warning(t('Your session has expired. Sign in again.'));
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
  }, [queryClient, toast, t]);

  const login = useCallback(
    async (input: LoginInput) => {
      const nextSession = await api.auth.login(input);
      setCsrfToken(nextSession.csrfToken);
      queryClient.setQueryData(SESSION_QUERY_KEY, nextSession);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== 'session',
      });
    },
    [queryClient],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const nextSession = await api.auth.register(input);
      setCsrfToken(nextSession.csrfToken);
      queryClient.setQueryData(SESSION_QUERY_KEY, nextSession);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== 'session',
      });
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setCsrfToken('');
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== 'session',
      });
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading: sessionQuery.isPending,
      isError: sessionQuery.isError,
      error: sessionQuery.error,
      login,
      register,
      logout,
      refetchSession: () => {
        void sessionQuery.refetch();
      },
    }),
    [session, sessionQuery, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
