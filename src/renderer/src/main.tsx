import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TabsRoot } from './tabs/TabsRoot'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } }
})

// Cada aba tem seu próprio MemoryRouter (ver tabs/TabHost.tsx); o QueryClient é único e compartilhado.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TabsRoot />
    </QueryClientProvider>
  </StrictMode>
)
