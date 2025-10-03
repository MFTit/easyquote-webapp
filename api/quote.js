export default async function handler(req, res) {
  const { qid, token } = req.query;

  if (!qid || !token) {
    return res.status(400).json({ ok: false, error: "Missing qid or token" });
  }

  try {
    // Step 1: Refresh access token
    const tokenResp = await fetch(
      `${process.env.ZOHO_ACCOUNTS_URL}/oauth/v2/token?refresh_token=${process.env.ZOHO_REFRESH_TOKEN}&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}&grant_type=refresh_token`,
      { method: "POST" }
    );
    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;

    // Step 2: Fetch Quote
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

    // Step 3: Token validation
    if (q.Acceptance_Token !== token) {
      return res.status(403).json({ ok: false, error: "Invalid token" });
    }

    // Step 4: Expiry & discard logic
    let status = q.Acceptance_Status || "Pending";
    const now = new Date();
    const expiry = q.Acceptance_Token_Expires ? new Date(q.Acceptance_Token_Expires) : null;
    const validTill = q.Valid_Till ? new Date(q.Valid_Till) : null;

    if ((expiry && expiry < now) || (validTill && validTill < now)) {
      status = "Expired";
    }

    if (q.Acceptance_Status === "Discarded") {
      status = "Discarded";
    }

    // Step 5: Build formatted response
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
