import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

export default async function handler(req, res) {
  try {
    const { html, filename } = await req.json();

    if (!html) {
      return res.status(400).json({ error: "Missing HTML content." });
    }

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "10mm", bottom: "20mm", left: "10mm" },
    });

    await browser.close();

    const base64PDF = pdfBuffer.toString("base64");

    res.status(200).json({
      status: "success",
      filename: filename || "Proposal.pdf",
      base64: base64PDF,
    });
  } catch (err) {
    console.error("PDF Generation Error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}
