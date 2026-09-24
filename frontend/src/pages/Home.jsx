import PageLayout from "../components/PageLayout";
import { Link } from "react-router-dom";

const categories = [
  {
    name: "Organize",
    tools: [
      { name: "Merge PDF files", path: "/merge-pdf" },
      { name: "Rearrange pages", path: "/rearrange-pages" },
      { name: "Delete pages", path: "/delete-pages" },
      { name: "Rotate / delete pages", path: "/rotate-pages" },
    ],
  },
  {
    name: "Convert",
    tools: [
      { name: "DOC to PDF", path: "/convert-doc" },
      { name: "PDF to DOCX", path: "/pdf-2-docx" },
      { name: "Image to PDF", path: "/convert-image" },
      { name: "CSV to PDF", path: "/csv-to-pdf" },
    ],
  },
  {
    name: "Extract",
    tools: [
      { name: "Extract images from PDF", path: "/extract-images" },
      { name: "Extract tables from PDF", path: "/extract-tables" },
      { name: "Table data from image", path: "/img-to-tbl" },
      { name: "Text from image", path: "/img-to-txt" },
    ],
  },
  {
    name: "Protect & optimize",
    tools: [
      { name: "Lock PDF", path: "/create-password" },
      { name: "Unlock PDF", path: "/remove-password" },
      { name: "Compress PDF", path: "/compress-pdf" },
    ],
  },
];

export default function Home() {
  return (
    <PageLayout>
      <header className="text-center mb-10">
        <h1 className="text-3xl font-bold text-stone-900 tracking-tight">
          Choose a tool
        </h1>
        <p className="mt-2 text-stone-500">
          Secure, convert, and organize your PDFs with a single click.
        </p>
      </header>

      <div className="space-y-8">
        {categories.map((category) => (
          <section key={category.name}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">
              {category.name}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {category.tools.map((tool) => (
                <Link
                  key={tool.path}
                  to={tool.path}
                  className="flex items-center justify-center text-center px-4 py-5 bg-white rounded-xl border border-stone-200 shadow-sm text-sm font-medium text-stone-800 hover:border-stone-300 hover:shadow-md transition-all"
                >
                  {tool.name}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageLayout>
  );
}
