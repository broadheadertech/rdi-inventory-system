"use client";

import React from "react";
import { Button } from "@/components/ui/button";

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

      // Extract user-friendly message from ConvexError if available
      const errorData = (this.state.error as Record<string, unknown> | null)
        ?.data as Record<string, unknown> | undefined;
      const message =
        (errorData?.message as string) ??
        "Something went wrong. Please try again.";

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8">
          <h2 className="text-lg font-semibold text-destructive">Error</h2>
          <p className="text-center text-muted-foreground">{message}</p>
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
