import { auth, googleProvider } from "@/lib/firebase";
import { signInWithPopup } from "firebase/auth";
import { RainbowButton } from "@/components/ui/rainbow-button"
import logo from "@/assets/logo.png";

export function LoginPage() {
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Erro ao fazer login:", error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-4 font-sans selection:bg-[#217ECE]/30">
      {/* Background subtle glow */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#217ECE]/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-sm w-full space-y-12 relative z-10">
        <div className="flex flex-col items-center space-y-6">
          <div className="relative group">
            <div className="absolute -inset-1 bg-[#217ECE] rounded-full blur opacity-15 group-hover:opacity-35 transition duration-1000 group-hover:duration-200"></div>
            <img
              src={logo}
              alt="API Friend Logo"
              className="relative w-44 h-44 object-contain"
            />
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-4xl font-light tracking-tight text-white uppercase italic">
              API <span className="font-bold text-[#217ECE]">Friend</span>
            </h1>
            <p className="text-zinc-500 text-sm tracking-widest uppercase">
              Sentinela de Elite
            </p>
          </div>
        </div>

        <RainbowButton
          variant="outline"
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 py-6"
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            className="w-5 h-5 transition-all"
          />
          <span className="uppercase tracking-[0.2em] text-xs font-bold">Acessar Sistema</span>
        </RainbowButton>
      </div>
    </div>
  );
}

