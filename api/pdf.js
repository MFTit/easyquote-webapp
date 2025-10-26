import chromium from "chrome-aws-lambda";
import puppeteer from "puppeteer-core";
import { getZohoAccessToken } from "../lib/zohoAuth.js";

export default async function handler(req, res) {
  try {
    const { qid } = req.query;
    if (!qid) return res.status(400).json({ error: "Missing qid" });

    const accessToken = await getZohoAccessToken();

    // 1️⃣ Fetch quote from Zoho
    const quoteResp = await fetch(`${process.env.ZOHO_API_BASE}/crm/v6/Quotes/${qid}`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    const quoteData = await quoteResp.json();
    const q = quoteData.data?.[0];

    if (!q) return res.status(404).json({ error: "Quote not found" });

    const status = q.Acceptance_Status || q.Status || "Pending";

    // 🚫 Only generate PDF if quote is Accepted
    if (status !== "Accepted") {
      return res.status(200).json({ ok: false, message: `Quote status is '${status}', skipping PDF generation.` });
    }

    // 2️⃣ Generate PDF from the public HTML page
    const url = `https://easyquote-pearl.vercel.app/?qid=${qid}&token=${q.Acceptance_Token}`;
    const browser = await puppeteer.launch(
      await chromium.puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath,
        headless: true,
      })
    );

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForTimeout(1500);

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
    });

    await browser.close();

    // 3️⃣ Upload to Zoho as attachment
    const formData = new FormData();
    formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), `Quote_${qid}.pdf`);

    const upload = await fetch(`${process.env.ZOHO_API_BASE}/crm/v6/Quotes/${qid}/Attachments`, {
      method: "POST",
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      body: formData,
    });

    const uploadText = await upload.text();

    return res.status(200).json({
      ok: true,
      uploaded: uploadText.substring(0, 200),
    });
  } catch (err) {
    console.error("PDF Error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
