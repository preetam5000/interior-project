import { Component } from "react";

export default class AppErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (this.state.failed) return <main role="alert" className="grid min-h-screen place-items-center bg-background p-6 text-foreground"><section className="max-w-md space-y-3 rounded-2xl border border-border bg-card p-6 text-center shadow-xl"><h1 className="text-lg font-semibold">This view could not be loaded</h1><p className="text-sm text-muted-foreground">Reload the page to try again. The editor may not have saved your latest changes.</p><button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Reload page</button></section></main>;
    return this.props.children;
  }
}
