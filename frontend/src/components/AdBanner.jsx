import { useEffect } from "react";
import { useSubscription } from "../context/SubscriptionContext.jsx";

export default function AdBanner({ position = "top", className = "" }) {
  const { isProUser } = useSubscription();

  useEffect(() => {
    if (!isProUser && typeof window !== "undefined") {
      // Load Google AdSense script if not already loaded
      if (!window.adsbygoogle) {
        const script = document.createElement("script");
        script.src =
          "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXX";
        script.async = true;
        script.crossOrigin = "anonymous";
        document.head.appendChild(script);
      }

      // Push ad to adsbygoogle array
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.error("AdSense error:", e);
      }
    }
  }, [isProUser]);

  // Don't show ads for Pro/Enterprise users
  if (isProUser) {
    return null;
  }

  const slotMap = {
    top: "1234567890",
    bottom: "0987654321",
    left: "1111111111",
    right: "2222222222",
  };

  return (
    <div className={`ad-banner ad-${position} ${className}`}>
      <ins
        className="adsbygoogle"
        style={{
          display: "block",
          width: "100%",
          minHeight: position === "top" || position === "bottom" ? 90 : 250,
        }}
        data-ad-client={
          import.meta.env.VITE_GOOGLE_ADSENSE_CLIENT_ID || "ca-pub-XXXXXXXXXX"
        }
        data-ad-slot={slotMap[position] || slotMap.top}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
