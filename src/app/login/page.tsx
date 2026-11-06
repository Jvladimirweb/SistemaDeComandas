
import { login } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const { error } = await searchParams;

  const errorMessage = error
    ? error === "missing"
      ? "Preencha o e-mail e a senha."
      : "Não foi possível entrar. Confira seu e-mail e sua senha."
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-700 text-xl font-bold text-white">
            VC
          </div>

          <h1 className="mt-5 text-2xl font-bold text-slate-900">
            Vivati Comandas
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Entre para acessar seu sistema
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-bold text-slate-900">
            Acessar minha conta
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Informe seus dados de acesso.
          </p>

          {errorMessage && (
            <div
              role="alert"
              className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700"
            >
              {errorMessage}
            </div>
          )}

          <form action={login} className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                E-mail
              </label>

              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Senha
              </label>

              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                placeholder="Digite sua senha"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              Entrar no sistema
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
            Acesso restrito a usuários cadastrados.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Vivati Soluções · Sistema de comandas
        </p>
      </div>
    </main>
  );
}