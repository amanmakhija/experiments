import React, { useState } from "react";
import axiosInstance from "../../api/axios";
import Loader from "../loader/Loader";
import "./UrlShortener.css";

const UrlShortener: React.FC = () => {
  const [originalUrl, setOriginalUrl] = useState("");
  const [shortUrl, setShortUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("Click to copy");
  const [loading, setLoading] = useState(false);

  const handleShorten = async () => {
    // Validate URL
    if (
      !originalUrl.startsWith("http://") &&
      !originalUrl.startsWith("https://")
    ) {
      setError("Please enter a URL that starts with 'http://' or 'https://'");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await axiosInstance.post("/shorten", { originalUrl });
      setShortUrl(response.data.shortUrl);
    } catch (error) {
      console.error("Error shortening URL:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    const fullShortUrl = `${window.location.href}${shortUrl}`;
    navigator.clipboard.writeText(fullShortUrl).then(
      () => {
        setCopyStatus("Copied!");
        setTimeout(() => setCopyStatus("Click to copy"), 2000);
      },
      (err) => {
        console.error("Failed to copy URL:", err);
      }
    );
  };

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="url-shortener-container">
      <div className="form-group">
        <input
          type="text"
          value={originalUrl}
          onChange={(e) => setOriginalUrl(e.target.value)}
          placeholder="Enter URL to shorten"
          className="url-input"
        />
        <button onClick={handleShorten} className="shorten-button">
          Shorten
        </button>
        {error && <div className="error-message">{error}</div>}
      </div>
      {shortUrl && (
        <div className="result">
          <p>
            Short URL:
            <span
              className="copy-text"
              onClick={handleCopy}
              data-tooltip={copyStatus}
            >
              {`${window.location.href}${shortUrl}`}
            </span>
          </p>
        </div>
      )}
    </div>
  );
};

export default UrlShortener;
