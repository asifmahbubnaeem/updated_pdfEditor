// src/components/PageLayout.jsx
export default function PageLayout({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        justifyContent: "center",
        padding: "24px 16px 40px",
        backgroundColor: "#f3f4f6",
      }}
    >
      <div style={{ width: "100%", maxWidth: "900px" }}>{children}</div>
    </div>
  );
}
