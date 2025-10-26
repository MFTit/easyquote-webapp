import { getZohoAccessToken, invalidateZohoToken } from "../lib/zohoAuth.js";
import { PDFDocument, StandardFonts } from "pdf-lib";

// --- helper ---
async function updateQuote(qid, data, accessToken) {
  const resp = await fetch(`${process.env.ZOHO_API_BASE}/crm/v6/Quotes/${qid}`, {
    method: "PUT",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data: [data] }),
  });
  return resp.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const { qid, action, comment, name } = req.body;
    if (!qid || !action) return res.status(400).json({ error: "Missing qid or action" });

    // normalize status
    const s = action.toLowerCase();
    const status = s.startsWith("accept") ? "Accepted" : s.startsWith("deny") ? "Denied" : "Negotiated";

    let accessToken = await getZohoAccessToken();

    // update the quote first
    const updateMap = {
      Acceptance_Status: status,
      Client_Response: comment || null,
      Acknowledged_By: name || null,
      ...(status === "Accepted" || status === "Denied"
        ? { Acceptance_Token_Expires: new Date().toISOString() }
        : {}),
    };

    let crmUpdate = await updateQuote(qid, updateMap, accessToken);
    if (crmUpdate?.code === "INVALID_TOKEN") {
      invalidateZohoToken();
      accessToken = await getZohoAccessToken();
      crmUpdate = await updateQuote(qid, updateMap, accessToken);
    }

    // ----- PDF only when Accepted -----
    if (status === "Accepted") {
      const quoteResp = await fetch(`${process.env.ZOHO_API_BASE}/crm/v6/Quotes/${qid}`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      });
      const qData = await quoteResp.json();
      const q = qData.data?.[0];

      if (q) {
        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const page = pdf.addPage([595, 842]);
        const { height } = page.getSize();
        const draw = (t, y, x = 50, size = 12) =>
          page.drawText(t, { x, y: height - y, size, font });

        // header
        draw("COTAÇÃO ACEITA", 50, 200, 18);
        draw(`Número: ${q.Quote_Number}`, 90);
        draw(`Cliente: ${q.Account_Name?.name || ""}`, 120);
        draw(`Valor total: ${q.Grand_Total || ""}`, 150);
        draw(`Aceito por: ${name}`, 180);
        draw(`Comentário: ${comment || ""}`, 210);
        draw(`Data: ${new Date().toLocaleString("pt-BR")}`, 240);

        const pdfBytes = await pdf.save();

        // upload as attachment to quote
        const form = new FormData();
        form.append(
          "file",
          new Blob([pdfBytes], { type: "application/pdf" }),
          `Quote_${qid}.pdf`
        );

        const upload = await fetch(`${process.env.ZOHO_API_BASE}/crm/v6/Quotes/${qid}/Attachments`, {
          method: "POST",
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
          body: form,
        });
        console.log("PDF attached:", await upload.text());
      }
    }

    return res.status(200).json({ ok: true, action: status });
  } catch (err) {
    console.error("Respond error:", err);
    return res.status(500).json({ error: err.message });
  }
}
