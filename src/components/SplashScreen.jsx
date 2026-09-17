export default function SplashScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white fixed inset-0 z-50">
      <div className="flex flex-col items-center">
        <h1 className="text-5xl font-black text-indigo-600 tracking-tight mb-6 animate-pulse">
          Ledgro
        </h1>
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    </div>
  );
}
