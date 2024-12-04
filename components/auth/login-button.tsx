"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "./auth-provider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function LoginButton() {
  const { user, signIn, signUp, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent, isSignUp: boolean) => {
    e.preventDefault();

    // Prevent rapid repeated attempts
    if (status === "loading") return;

    setStatus("loading");
    setError(null);

    try {
      if (isSignUp) {
        await signUp(email, password);
        setStatus("success");
        setError(
          "Check your email to confirm your account! If you don't see it, check your spam folder."
        );
      } else {
        await signIn(email, password);
        setOpen(false);
        setStatus("idle");
      }
    } catch (err) {
      console.error("Auth error:", err);
      setStatus("error");

      // Handle specific error cases
      if (err instanceof Error) {
        if (err.message.includes("rate limit")) {
          setError(
            "Too many attempts. Please wait a few minutes and try again."
          );
        } else if (err.message.includes("Email already registered")) {
          setError("This email is already registered. Please sign in instead.");
        } else if (err.message.includes("sending confirmation email")) {
          setError(
            "There was an issue sending the confirmation email. Please try again in a few minutes."
          );
        } else {
          setError(err.message);
        }
      } else {
        setError("Authentication failed. Please try again.");
      }

      // Add delay before allowing next attempt
      setTimeout(() => setStatus("idle"), 5000);
    }
  };

  if (user) {
    return (
      <Button variant="outline" onClick={() => signOut()}>
        Sign Out
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Sign In
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Authentication</DialogTitle>
            <DialogDescription>
              Sign in or create an account to continue
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form
                onSubmit={(e) => handleAuth(e, false)}
                className="space-y-4"
              >
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={status === "loading"}
                >
                  {status === "loading" ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={(e) => handleAuth(e, true)} className="space-y-4">
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                {error && (
                  <Alert
                    variant={
                      error.includes("Check your email")
                        ? "default"
                        : "destructive"
                    }
                  >
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={status === "loading" || status === "success"}
                >
                  {status === "loading" ? "Signing up..." : "Sign Up"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
