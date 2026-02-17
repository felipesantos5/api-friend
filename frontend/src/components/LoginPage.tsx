import { auth, googleProvider } from "@/lib/firebase";
import { signInWithPopup } from "firebase/auth";
import { LogIn } from "lucide-react";

export function LoginPage() {
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Erro ao fazer login:", error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0b] text-white p-4">
      <div className="max-w-md w-full space-y-8 bg-[#161618] p-10 rounded-2xl border border-white/5 shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        <div className="relative text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <LogIn size={32} className="text-white" />
          </div>

          <h1 className="text-3xl font-bold tracking-tight">API Friend</h1>
          <p className="text-gray-400">
            A sentinela de elite para seus serviços.
            Faça login para gerenciar seu monitoramento.
          </p>
        </div>

        <button
          onClick={handleLogin}
          className="relative w-full py-4 px-6 bg-white text-black font-semibold rounded-xl flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] hover:shadow-xl hover:shadow-white/10"
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            className="w-5 h-5"
          />
          Entrar com Google
        </button>

        <div className="relative text-center">
          <p className="text-xs text-gray-500">
            Ao entrar, você concorda com nossos termos de resiliência total.
          </p>
        </div>
      </div>
    </div>
  );
}
