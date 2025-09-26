export default async function handler(req, res) {
  try {
    const { qid } = req.query;

    if (!qid) {
      return res.status(400).json({ error: "Missing ?qid" });
    }

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
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      }
    );
    const crmData = await crmResp.json();
    const quote = crmData.data[0];

    // Step 3: Build clean response
    const result = {
      id: quote.id,
      quote_number: quote.Quote_Number,
      subject: quote.Subject,
      deal_name: quote.Deal_Name?.name,
      contact_name: quote.Contact_Name?.name,
      owner: quote.Owner?.name,
      valid_till: quote.Valid_Till,
      status: quote.Quote_Stage,
      grand_total: quote.Grand_Total,
      sub_total: quote.Sub_Total,
      terms: quote.Terms_and_Conditions,
      products: (quote.Product_Details || []).map(item => ({
        id: item.id,
        product_name: item.product?.name,
        description: item.product_description,
        quantity: item.quantity,
        list_price: item.list_price,
        discount: item.Discount,
        tax: item.Tax,
        net_total: item.net_total,
        total: item.total
      }))
    };

    status: rec.Acceptance_Status,

    return res.status(200).json({ ok: true, data: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
