export default function SplashScreen() {
  return (
    <div className="h-[100dvh] flex items-center justify-center bg-white fixed inset-0 z-50">
      <div className="flex flex-col items-center">
        <h1 className="text-5xl font-black text-blue-600 tracking-tight mb-6 animate-pulse font-bruno">
          Ledgro
        </h1>
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    </div>
  );
}
