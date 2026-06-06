"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/errors";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const message = friendlyError(this.state.error);

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <span className="text-2xl">😕</span>
          </div>
          <h2 className="text-lg font-semibold">Hmm, that didn&apos;t work</h2>
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            {message}
          </p>
          <Button onClick={this.reset} variant="outline">
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
