import { getZohoAccessToken, invalidateZohoToken } from "../lib/zohoAuth.js";

export default async function handler(req, res) {
  const { qid, token } = req.query;

  if (!qid || !token) {
    return res.status(400).json({ ok: false, error: "Missing qid or token" });
  }

  try {
    let accessToken = await getZohoAccessToken();

    const fetchQuote = async () => {
      const crmResp = await fetch(
        `${process.env.ZOHO_API_BASE}/crm/v6/Quotes/${qid}`,
        {
          method: "GET",
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        }
      );
      const data = await crmResp.json();
      return { status: crmResp.status, data };
    };

    // First attempt
    let { data: crmData } = await fetchQuote();

    // If Zoho says token invalid, clear cache and retry once
    if (
      (crmData?.code === "INVALID_TOKEN" ||
        crmData?.message === "invalid oauth token") &&
      !req._retried
    ) {
      invalidateZohoToken();
      accessToken = await getZohoAccessToken();
      const second = await fetchQuote();
      crmData = second.data;
    }

    if (!crmData.data || !crmData.data[0]) {
      return res
        .status(404)
        .json({ ok: false, error: "Quote not found (Zoho response issue)", crmRaw: crmData });
    }

    const q = crmData.data[0];

    // Token check: if CRM stored token exists and doesn't match URL token
    if (q.Acceptance_Token && q.Acceptance_Token !== token) {
      return res
        .status(403)
        .json({ ok: false, error: "Invalid token for this Quote", crmRaw: crmData });
    }

    // Status logic
    let status = q.Acceptance_Status || "Pending";
    const now = new Date();
    const validTill = q.Valid_Till ? new Date(q.Valid_Till) : null;

    if (q.Acceptance_Status === "Discarded") status = "Discarded";
    else if (q.Acceptance_Status === "Accepted") status = "Accepted";
    else if (q.Acceptance_Status === "Denied") status = "Denied";
    else if (validTill && validTill < now && (status === "Pending" || status === "Negotiated")) {
      status = "Expired";
    }

    const formatted = {
      id: q.id,
      quote_number: q.Quote_Number,
      subject: q.Subject,
      contact_name: q.Contact_Name?.name,
      company: q.Account_Name?.name || "",
      valid_till: q.Valid_Till,
      status,
      ack_by: q.Acknowledged_By || q.Ack_By || q.Acceptance_Ack_By || "",
      grand_total: q.Grand_Total,
      terms: q.Terms_and_Conditions,
       client_response: q.Client_Response || "",
      products: (q.Product_Details || []).map((p) => ({
        id: p.id,
        product_name: p.product?.name,
        quantity: p.quantity,
      })),
    };

    return res.status(200).json({ ok: true, data: formatted });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
