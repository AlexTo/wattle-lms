import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@wattle/common-shadcn/components/ui/button';
import Config from '../../config';

export const Route = createFileRoute('/_public/')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <img
            alt={`${Config.applicationName} logo`}
            className="size-10 rounded-lg border border-border/60 bg-background object-cover shadow-sm"
            src={Config.logo}
          />
          <span className="text-sm font-semibold">
            {Config.applicationName}
          </span>
        </div>
        <Button asChild>
          <Link to="/signin">Sign In</Link>
        </Button>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p className="text-muted-foreground">
          Welcome to your new React website!
        </p>
      </main>
    </div>
  );
}
