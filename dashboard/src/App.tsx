import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { Layout } from '@/components/layout'
import { useApiData } from '@/lib/api'
import { OverviewPage } from '@/pages/overview'
import { BoardPage } from '@/pages/board'
import { DecisionsPage } from '@/pages/decisions'
import { ObservationsPage } from '@/pages/observations'
import { SignalsPage } from '@/pages/signals'
import { PlansPage } from '@/pages/plans'

function ConnectedLayout() {
  const { data, error, connected } = useApiData()

  return (
    <Routes>
      <Route element={<Layout data={data} connected={connected} />}>
        <Route
          index
          element={
            data ? <OverviewPage data={data} /> : <LoadingState error={error} />
          }
        />
        <Route
          path="/board"
          element={
            data ? <BoardPage data={data} /> : <LoadingState error={error} />
          }
        />
        <Route
          path="/decisions"
          element={
            data ? <DecisionsPage data={data} /> : <LoadingState error={error} />
          }
        />
        <Route
          path="/observations"
          element={
            data ? <ObservationsPage data={data} /> : <LoadingState error={error} />
          }
        />
        <Route
          path="/signals"
          element={
            data ? <SignalsPage data={data} /> : <LoadingState error={error} />
          }
        />
        <Route
          path="/plans"
          element={
            data ? <PlansPage data={data} /> : <LoadingState error={error} />
          }
        />

      </Route>
    </Routes>
  )
}

function LoadingState({ error }: { error: string | null }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-2">
        {error ? (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-xs text-muted-foreground">
              Make sure <code className="font-mono bg-muted px-1 py-0.5 rounded">kontinue web</code> is running
            </p>
          </>
        ) : (
          <>
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Connecting to Kontinue...</p>
          </>
        )}
      </div>
    </div>
  )
}

export function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <BrowserRouter>
        <ConnectedLayout />
      </BrowserRouter>
    </ThemeProvider>
  )
}
