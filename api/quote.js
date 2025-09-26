export default async function handler(req, res) {
  try {
    const { qid } = req.query; // quote ID from URL

    if (!qid) {
      return res.status(400).json({ error: "Missing ?qid in request" });
    }

    // Step 1: Get Access Token using Refresh Token
    const tokenResp = await fetch(
      `${process.env.ZOHO_ACCOUNTS_URL}/oauth/v2/token?refresh_token=${process.env.ZOHO_REFRESH_TOKEN}&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}&grant_type=refresh_token`,
      { method: "POST" }
    );

    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) {
      return res.status(400).json({ error: "Failed to refresh access token", details: tokenData });
    }

    const accessToken = tokenData.access_token;

    // Step 2: Call Zoho CRM API
    const crmResp = await fetch(
      `${process.env.ZOHO_API_BASE}/crm/v2/Quotes/${qid}`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      }
    );

    const crmData = await crmResp.json();

    return res.status(200).json({ ok: true, data: crmData });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
