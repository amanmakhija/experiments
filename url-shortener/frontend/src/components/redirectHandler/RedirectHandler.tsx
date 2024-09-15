import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axiosInstance from "../../api/axios";
import Loader from "../loader/Loader";
import NotFound from "../notFound/NotFound";

const RedirectHandler: React.FC = () => {
  const { shortUrl } = useParams<{ shortUrl: string }>();
  const [notFound, setNotFound] = useState<boolean>(false);

  useEffect(() => {
    const fetchRedirectUrl = async () => {
      try {
        const { data } = await axiosInstance.get(`/${shortUrl}`);
        if (data.originalUrl) {
          window.location.replace(data.originalUrl);
        }
      } catch (err) {
        setNotFound(true);
        console.error("Error fetching original URL:", err);
      }
    };

    fetchRedirectUrl();
  }, [shortUrl]);

  if (notFound) {
    return <NotFound />;
  }

  return <Loader />;
};

export default RedirectHandler;
