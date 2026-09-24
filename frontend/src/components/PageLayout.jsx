// src/components/PageLayout.jsx
export default function PageLayout({ children }) {
  return (
    <div className="min-h-screen w-full flex justify-center px-4 py-8">
      <div className="w-full max-w-[1100px]">{children}</div>
    </div>
  );
}
