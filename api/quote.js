export default async function handler(req, res) {
  const { qid, token } = req.query;

  if (!qid || !token) {
    return res.status(400).json({ ok: false, error: "Missing qid or token" });
  }

  try {
    const tokenResp = await fetch(
      `${process.env.ZOHO_ACCOUNTS_URL}/oauth/v2/token?refresh_token=${process.env.ZOHO_REFRESH_TOKEN}&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}&grant_type=refresh_token`,
      { method: "POST" }
    );
    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;

    const crmResp = await fetch(
      `${process.env.ZOHO_API_BASE}/crm/v2/Quotes/${qid}`,
      {
        method: "GET",
        headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` },
      }
    );
    const crmData = await crmResp.json();

    if (!crmData.data || !crmData.data[0]) {
      return res.status(404).json({ ok: false, error: "Quote not found", crmRaw: crmData });
    }

    const q = crmData.data[0];

    if (q.Acceptance_Token && q.Acceptance_Token !== token) {
      return res.status(403).json({ ok: false, error: "Invalid token" });
    }

    let status = q.Acceptance_Status || "Pending";
    const now = new Date();
    const validTill = q.Valid_Till ? new Date(q.Valid_Till) : null;

    if (q.Acceptance_Status === "Discarded") {
      status = "Discarded";
    } else if (q.Acceptance_Status === "Accepted") {
      status = "Accepted";
    } else if (q.Acceptance_Status === "Denied") {
      status = "Denied";
    } else if (validTill && validTill < now && (status === "Pending" || status === "Negotiated")) {
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
      grand_total: q.Grand_Total,
      terms: q.Terms_and_Conditions,
      products: (q.Product_Details || []).map(p => ({
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
