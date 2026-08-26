import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="text-center">
      <header>
        <h1>Welcome</h1>
        <p>Welcome to your new React website!</p>
      </header>
    </div>
  );
}
