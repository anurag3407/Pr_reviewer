import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="authpage">
      <SignUp signInUrl="/sign-in" forceRedirectUrl="/dashboard" />
    </main>
  );
}
