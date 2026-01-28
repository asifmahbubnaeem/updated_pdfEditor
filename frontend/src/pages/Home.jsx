import PageLayout from "../components/PageLayout";
import { Link } from "react-router-dom";

const features = [
  { name: "lock pdf", path: "/create-password" },
  { name: "unlock pdf", path: "/remove-password" },
  { name: "doc to pdf", path: "/convert-doc" },
  { name: "merge pdf files", path: "/merge-pdf" },
  { name: "image to pdf", path: "/convert-image" },
  { name: "rearrange pdf pages", path: "/rearrange-pages" },
  { name: "delete pdf pages", path: "/delete-pages" },
  { name: "rotate/delete pdf pages", path: "/rotate-pages" },
  { name: "compress pdf files", path: "/compress-pdf" },
  { name: "extract images from pdf file", path: "/extract-images" },
  { name: "convert pdf to docx", path: "/pdf-2-docx" },
  { name: "extract tables from pdf", path: "/extract-tables" },
  { name: "csv to pdf", path: "/csv-to-pdf" },
  { name: "table data extraction from image", path: "/img-to-tbl" },
  { name: "text extraction from image", path: "/img-to-txt" },
];

export default function Home() {
  return (
    <PageLayout>
      <header style={{ textAlign: "center", marginBottom: "24px" }}>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            marginBottom: "8px",
          }}
        >
          Choose a Tool
        </h1>
        <p style={{ color: "#4b5563", fontSize: "14px" }}>
          Secure, convert, and organize your PDFs with a single click.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gap: "12px",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        }}
      >
        {features.map((f) => (
          <Link
            key={f.path}
            to={f.path}
            style={{
              padding: "16px",
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              textAlign: "center",
              textDecoration: "none",
              color: "#111827",
              fontWeight: 500,
              fontSize: "15px",
            }}
          >
            {f.name}
          </Link>
        ))}
      </div>
    </PageLayout>
  );
}
