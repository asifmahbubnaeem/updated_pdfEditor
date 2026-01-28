import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { SubscriptionProvider } from "./context/SubscriptionContext.jsx";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdBanner from "./components/AdBanner.jsx";
import Home from "./pages/Home";
import CreatePassword from "./pages/CreatePassword";
import RemovePassword from "./pages/RemovePassword";
import ConvertDoc from "./pages/ConvertDoc";
import Pricing from "./pages/Pricing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import PaymentSuccess from "./pages/PaymentSuccess";
import MergePdf from "./pages/MergePdf"
import ConvertImage from "./pages/ConvertImage";
import RearrangePages from "./pages/RearrangePages";
import DeletePages from "./pages/DeletePages";
import ExtractImages from "./pages/ExtractImages";
import RotatePages from "./pages/Rotation";
import CompressPdf from "./pages/CompressPdf";
import PdfToDocConvertion from "./pages/PdfToDoc";
import ExtractTable from "./pages/ExtractTableFromPdf";
import CsvToPdf from "./pages/CsvToPdf";
import ExtractTableFromImage from "./pages/ExtractTableFromImage";
import ExtractTextFromImage from "./pages/ExtractTextFromImage";
import DemoApp from "./pages/DemoApp";

function App() {
  return (
    <Router>
      <AuthProvider>
        <SubscriptionProvider>
          <div style={{ minHeight: "100vh", backgroundColor: "#f3f4f6" }}>
            <Navbar />

            {/* Main layout: side ads + routed content */}
            <div
              style={{
                maxWidth: "1200px",
                margin: "0 auto",
                padding: "16px",
                display: "flex",
                gap: "16px",
              }}
            >
              {/* Left sidebar ad (hidden on small screens via CSS) */}
              <div className="ad-sidebar-left">
                <AdBanner position="left" />
              </div>

              {/* Main routed content */}
              <main style={{ flex: 1 }}>
                <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/payment/success" element={<PaymentSuccess />} />
              
              {/* Protected routes - require authentication */}
              <Route
                path="/create-password"
                element={
                  <ProtectedRoute>
                    <CreatePassword />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/remove-password"
                element={
                  <ProtectedRoute>
                    <RemovePassword />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/convert-doc"
                element={
                  <ProtectedRoute>
                    <ConvertDoc />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/merge-pdf"
                element={
                  <ProtectedRoute>
                    <MergePdf />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/convert-image"
                element={
                  <ProtectedRoute>
                    <ConvertImage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rearrange-pages"
                element={
                  <ProtectedRoute>
                    <RearrangePages />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/delete-pages"
                element={
                  <ProtectedRoute>
                    <DeletePages />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/rotate-pages"
                element={
                  <ProtectedRoute>
                    <RotatePages />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/compress-pdf"
                element={
                  <ProtectedRoute>
                    <CompressPdf />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/extract-images"
                element={
                  <ProtectedRoute>
                    <ExtractImages />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pdf-2-docx"
                element={
                  <ProtectedRoute>
                    <PdfToDocConvertion />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/extract-tables"
                element={
                  <ProtectedRoute>
                    <ExtractTable />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/csv-to-pdf"
                element={
                  <ProtectedRoute>
                    <CsvToPdf />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/img-to-tbl"
                element={
                  <ProtectedRoute>
                    <ExtractTableFromImage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/img-to-txt"
                element={
                  <ProtectedRoute>
                    <ExtractTextFromImage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/demo-app"
                element={
                  <ProtectedRoute>
                    <DemoApp />
                  </ProtectedRoute>
                }
              />
                </Routes>
              </main>

              {/* Right sidebar ad (hidden on small/medium screens via CSS) */}
              <div className="ad-sidebar-right">
                <AdBanner position="right" />
              </div>
            </div>
          </div>
        </SubscriptionProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
