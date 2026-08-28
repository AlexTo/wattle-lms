/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Link, useLocation, useMatchRoute } from '@tanstack/react-router';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@wattle/common-shadcn/components/ui/breadcrumb';
import { Input } from '@wattle/common-shadcn/components/ui/input';
import { Separator } from '@wattle/common-shadcn/components/ui/separator';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@wattle/common-shadcn/components/ui/sidebar';
import { Search } from 'lucide-react';
import * as React from 'react';
import Config from '../../config';
import { AppSidebar } from '../app-sidebar';
import { UserMenu } from '../UserMenu';

const getBreadcrumbs = (
  matchRoute: ReturnType<typeof useMatchRoute>,
  pathName: string,
  search: string,
  defaultBreadcrumb: string,
  availableRoutes?: string[],
) => {
  const segments = [
    defaultBreadcrumb,
    ...pathName.split('/').filter((segment) => segment !== ''),
  ];

  return segments.map((segment, i) => {
    const href =
      i === 0
        ? '/'
        : `/${segments
            .slice(1, i + 1)
            .join('/')
            .replace('//', '/')}`;

    const matched =
      !availableRoutes || availableRoutes.find((r) => matchRoute({ to: href }));

    return {
      href: matched ? `${href}${search}` : '#',
      text: segment,
    };
  });
};

const AuthenticatedLayout = ({ children }: { children: React.ReactNode }) => {
  const [activeBreadcrumbs, setActiveBreadcrumbs] = React.useState<
    { href: string; text: string }[]
  >([{ text: '/', href: '/' }]);
  const matchRoute = useMatchRoute();
  const { pathname, search } = useLocation();

  React.useEffect(() => {
    const breadcrumbs = getBreadcrumbs(
      matchRoute,
      pathname,
      Object.entries(search).reduce((p, [k, v]) => p + `${k}=${v}`, ''),
      '/',
    );
    setActiveBreadcrumbs(breadcrumbs);
  }, [matchRoute, pathname, search]);

  return (
    <SidebarProvider
      style={{ '--sidebar-width': '13rem' } as React.CSSProperties}
    >
      <AppSidebar />
      <SidebarInset>
        <header className="supports-backdrop-blur:bg-background/60 sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <img
                alt={`${Config.applicationName} logo`}
                className="size-10 rounded-lg border border-border/60 bg-background object-cover shadow-sm"
                src={Config.logo}
              />
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold">
                  {Config.applicationName}
                </span>
              </div>
            </div>
          </div>
          <form
            className="relative ml-auto hidden w-full max-w-md sm:block"
            role="search"
            onSubmit={(event) => event.preventDefault()}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search courses and activities"
              placeholder="Search courses and activities"
              className="bg-background/80 pl-9"
            />
          </form>
          <div className="flex items-center gap-3">
            <UserMenu />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-6 pt-4">
          <Breadcrumb>
            <BreadcrumbList>
              {activeBreadcrumbs.map((crumb, index) => (
                <React.Fragment key={crumb.href || index}>
                  <BreadcrumbItem>
                    {index === activeBreadcrumbs.length - 1 ? (
                      <BreadcrumbPage>{crumb.text}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link to={crumb.href}>{crumb.text}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {index < activeBreadcrumbs.length - 1 && (
                    <BreadcrumbSeparator />
                  )}
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default AuthenticatedLayout;
