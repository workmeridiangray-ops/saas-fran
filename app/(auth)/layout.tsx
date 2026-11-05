export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-form flex-col justify-center p-3">
      <p className="mb-3 text-sm font-semibold text-brand">Network Manager</p>
      {children}
    </main>
  );
}
