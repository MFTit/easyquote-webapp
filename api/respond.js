export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { qid, action, comment, name } = req.body;

    if (!qid || !action) {
      return res.status(400).json({ error: "Missing qid or action" });
    }

    // Step 1: Refresh access token
    const tokenResp = await fetch(
      `${process.env.ZOHO_ACCOUNTS_URL}/oauth/v2/token?refresh_token=${process.env.ZOHO_REFRESH_TOKEN}&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}&grant_type=refresh_token`,
      { method: "POST" }
    );
    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;

    // Step 2: Build update map
    let updateMap = {
      Acceptance_Status: action,
      Client_Response: comment || null,
      Acknowledged_By: name || null,
    };

    // Store timestamp in CRM
    const nowISO = new Date().toISOString(); 
    if (action === "Accepted") {
      updateMap.Acceptance_DateTime = nowISO;
      updateMap.Acceptance_Token_Expires = nowISO; // expire token
    }
    if (action === "Denied") {
      updateMap.Denied_DateTime = nowISO;
      updateMap.Acceptance_Token_Expires = nowISO; // expire token
    }

    // Step 3: Update Quote in CRM
    const crmResp = await fetch(
      `${process.env.ZOHO_API_BASE}/crm/v2/Quotes/${qid}`,
      {
        method: "PUT",
        headers: {
          "Authorization": `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: [updateMap] }),
      }
    );

    const crmData = await crmResp.json();

    if (!crmData.data || crmData.data[0].status === "error") {
      return res.status(400).json({ 
        ok: false, 
        message: "Zoho did not accept the update", 
        sent: updateMap, 
        crmRaw: crmData 
      });
    }

    return res.status(200).json({ ok: true, action, sent: updateMap, crmData });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
