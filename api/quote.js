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

    // Step 2: fetch Quote record
    const crmResp = await fetch(
      `${process.env.ZOHO_API_BASE}/crm/v2/Quotes/${qid}`,
      {
        method: "GET",
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      }
    );

    const crmData = await crmResp.json();
    const rec = crmData?.data?.[0];
    if (!rec) {
      return res.status(404).json({ ok: false, error: "Quote not found", crmRaw: crmData });
    }

    // Step 3: verify token
    if (rec.Acceptance_Token !== token) {
      return res.status(403).json({ ok: false, error: "Invalid or expired token" });
    }

    // Step 4: transform response
    res.status(200).json({
      ok: true,
      data: {
        id: rec.id,
        quote_number: rec.Quote_Number,
        subject: rec.Subject,
        deal_name: rec.Deal_Name?.name,
        contact_name: rec.Contact_Name?.name,
        owner: rec.Owner?.name,
        valid_till: rec.Valid_Till,
        status: rec.Acceptance_Status,
        grand_total: rec.Grand_Total,
        sub_total: rec.Sub_Total,
        terms: rec.Terms_and_Conditions,
        products: (rec.Product_Details || []).map((p) => ({
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
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
