import express from "express";
import Url from "../models/Url";
import shortid from "shortid";

const router = express.Router();

router.post("/shorten", async (req, res) => {
  const { originalUrl } = req.body;

  const doesExist = await Url.findOne({ originalUrl: originalUrl });
  if (doesExist) {
    return res.json({ originalUrl, shortUrl: doesExist.shortUrl });
  }

  try {
    const shortUrl = shortid.generate();
    const newUrl = new Url({ originalUrl, shortUrl });
    await newUrl.save();
    res.json({ originalUrl, shortUrl });
  } catch (err) {
    res.status(500).json({ error: "Error creating short URL" });
  }
});

router.get("/:shortUrl", async (req, res) => {
  try {
    const url = await Url.findOne({ shortUrl: req.params.shortUrl });
    if (url) {
      res.status(200).json({ originalUrl: url.originalUrl });
    } else {
      res.status(404).json({ error: "URL not found" });
    }
  } catch (err) {
    res.status(500).json({ error: "Error finding URL" });
  }
});

router.get("/", (req, res) => {
  res.send("Server is running properly");
});

export default router;
