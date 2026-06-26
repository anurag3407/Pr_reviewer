import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="authpage">
      <SignIn signUpUrl="/sign-up" forceRedirectUrl="/dashboard" />
    </main>
  );
}
