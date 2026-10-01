import { lazy, Suspense, useEffect, useState } from 'react';
import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from '@/components/sidebar';
import { CommandPalette } from '@/components/command-palette';
import { NewEntryDialog } from '@/components/new-entry';
import { ConfirmProvider } from '@/components/confirm';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useProject } from '@/lib/hooks';

const Dashboard = lazy(() => import('@/pages/dashboard'));
const PostList = lazy(() => import('@/pages/post-list'));
const Editor = lazy(() => import('@/pages/editor'));
const Taxonomy = lazy(() => import('@/pages/taxonomy'));
const PageList = lazy(() => import('@/pages/page-list'));
const NavEditor = lazy(() => import('@/pages/nav-editor'));
const Friends = lazy(() => import('@/pages/friends'));
const Files = lazy(() => import('@/pages/files'));
const Comments = lazy(() => import('@/pages/comments'));
const Publish = lazy(() => import('@/pages/publish'));
const Settings = lazy(() => import('@/pages/settings'));

function Shell() {
  const { data: project, error, isPending } = useProject();
  const [compose, setCompose] = useState(false);
  const [palette, setPalette] = useState(false);

  // 站点自己的主题色也是 Studio 的强调色
  useEffect(() => { if (project?.config.accent) document.documentElement.style.setProperty('--brand-base', project.config.accent); }, [project?.config.accent]);

  if (error) return <div className="grid h-full place-items-center px-6 text-center text-muted-foreground">{(error as Error).message}</div>;
  if (isPending) return <div className="grid h-full place-items-center text-muted-foreground">读取项目……</div>;
  return (
    <div className="flex h-full gap-1 p-2">
      <Sidebar onCompose={() => setCompose(true)} onSearch={() => setPalette(true)} />
      <main className="min-w-0 flex-1 overflow-y-auto rounded-2xl bg-card shadow-panel">
        <Suspense fallback={null}><Outlet context={{ compose: () => setCompose(true) }} /></Suspense>
      </main>
      <NewEntryDialog open={compose} onOpenChange={setCompose} />
      <CommandPalette open={palette} onOpenChange={setPalette} onCompose={() => setCompose(true)} />
      <ScrollRestoration />
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/posts', element: <PostList view="all" /> },
      { path: '/drafts', element: <PostList view="draft" /> },
      { path: '/posts/:id', element: <Editor kind="post" /> },
      { path: '/taxonomy', element: <Taxonomy /> },
      { path: '/pages', element: <PageList /> },
      { path: '/pages/:id', element: <Editor kind="page" /> },
      { path: '/nav', element: <NavEditor /> },
      { path: '/friends', element: <Friends /> },
      { path: '/files', element: <Files /> },
      { path: '/comments', element: <Comments /> },
      { path: '/publish', element: <Publish /> },
      { path: '/settings', element: <Settings /> },
      { path: '*', element: <div className="grid h-full place-items-center text-muted-foreground">没有这个页面。</div> },
    ],
  },
]);

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

export function App() {
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
          <Toaster />
        </ConfirmProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
