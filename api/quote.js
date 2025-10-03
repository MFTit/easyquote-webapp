export default async function handler(req, res) {
  const { qid, token } = req.query;

  if (!qid || !token) {
    return res.status(400).json({ ok: false, error: "Missing qid or token" });
  }

  try {
    // Step 1: refresh access token
    const tokenResp = await fetch(
      `${process.env.ZOHO_ACCOUNTS_URL}/oauth/v2/token?refresh_token=${process.env.ZOHO_REFRESH_TOKEN}&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}&grant_type=refresh_token`,
      { method: "POST" }
    );
    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;

    // Step 2: fetch Quote
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

    // Step 3: token validation
    if (["Accepted", "Denied"].includes(q.Acceptance_Status)) {
      // allow readonly
    } else if (q.Acceptance_Token && q.Acceptance_Token !== token) {
      return res.status(403).json({ ok: false, error: "Invalid or expired token" });
    }

    // Step 4: build formatted response
    const formatted = {
      id: q.id,
      quote_number: q.Quote_Number,
      subject: q.Subject,
      deal_name: q.Deal_Name?.name,
      contact_name: q.Contact_Name?.name,
      company: q.Account_Name?.name || "",   // ✅ Company added here
      owner: q.Owner?.name,
      valid_till: q.Valid_Till,
      status: q.Acceptance_Status || "Pending",
      accepted_on: q.Acceptance_Token_Expires || null,
      grand_total: q.Grand_Total,
      sub_total: q.Sub_Total,
      terms: q.Terms_and_Conditions,
      products: (q.Product_Details || []).map(p => ({
        id: p.id,
        product_name: p.product?.name,
        description: p.product_description,
        quantity: p.quantity,
        list_price: p.list_price,
        discount: p.Discount,
        tax: p.Tax,
        net_total: p.net_total,
        total: p.total,
      })),
    };

    return res.status(200).json({ ok: true, data: formatted });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
